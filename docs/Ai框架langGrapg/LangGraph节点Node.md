---
title: LangGraph 节点(Node)
date: 2026-04-20
abstract: LangGraph 节点(Node)描述
tags:
- Ai
- LangGraph
---

# LangGraph 节点Node


## 1. 什么是节点

**官方定义：**
节点是 LangGraph 中的一个基本处理单元，代表工作流中的一个操作步骤。它可以是一个 Agent、一次 LLM 调用、一个工具调用，或者是一个普通的 Python 函数。

**生活比喻：**
想象一条汽车装配流水线。每个工位就是一个**节点**。有的工位负责安装发动机（LLM 调用），有的负责拧螺丝（工具调用），有的负责质检（函数计算）。每个工位只做自己专精的事，然后把半成品传给下一个工位。

```python
# 最简单的节点就是一个 Python 函数
def my_node(state: dict) -> dict:
    # 接收当前状态，返回更新后的状态
    result = do_something(state["input"])
    return {"output": result}
```

---

## 2. 核心设计原则

### 2.1 单一职责原则

**官方定义：** 一个节点只负责一个明确的功能，不要在一个节点里塞入过多逻辑。

**生活比喻：** 就像餐厅后厨，切菜的只负责切菜，炒菜的只负责炒菜。如果让一个人又切又炒又洗碗，不仅容易出错，而且很难优化效率。

**错误示范：**
```python
def bad_node(state):
    # ❌ 一个节点做了太多事
    response = llm.invoke(state["query"])
    parsed = parse_response(response)
    db.save(parsed)
    email.send(parsed)
    return {"result": parsed}
```

**正确做法：**
```python
# ✅ 拆分成4个独立节点
def llm_call_node(state):
    return {"response": llm.invoke(state["query"])}

def parse_node(state):
    return {"parsed": parse_response(state["response"])}

def save_node(state):
    db.save(state["parsed"])
    return {}

def notify_node(state):
    email.send(state["parsed"])
    return {}
```

### 2.2 纯函数优先

**官方定义：** 节点函数最好是纯函数——相同的输入永远产生相同的输出，不依赖外部状态，不产生副作用。

**为什么重要？** 纯函数让缓存、重试、测试变得极其简单可靠。

```python
# ✅ 纯函数 - 可缓存、易测试
def add_numbers(state):
    return {"sum": state["a"] + state["b"]}

# ❌ 非纯函数 - 相同输入可能返回不同结果
def get_current_time(state):
    return {"time": datetime.now()}  # 每次调用结果都不同
```

---

## 3. 重试策略

当节点执行失败时，LangGraph 可以自动重试。这在调用不稳定的外部 API 时特别有用。

### 3.1 参数详解

| 参数 | 类型 | 说明 |
|------|------|------|
| `max_attempts` | int | 最大尝试次数（包含第一次） |
| `initial_interval` | float | 首次重试前的等待时间（秒） |
| `backoff_factor` | float | 每次重试间隔的倍增系数 |
| `jitter` | bool | 是否添加随机抖动，避免"重试风暴" |
| `retry_on` | List[Exception] | 触发重试的异常类型列表 |

### 3.2 代码示例

```python
from langgraph.graph import StateGraph
from langgraph.types import RetryPolicy
from requests.exceptions import RequestException, Timeout

# 自定义重试策略
retry_policy = RetryPolicy(
    max_attempts=3,        # 最多试3次
    initial_interval=1.0,  # 第1次重试等1秒
    backoff_factor=2.0,    # 间隔翻倍：1秒 → 2秒 → 4秒
    jitter=True,           # 加随机抖动，避免风暴
    retry_on=[RequestException, Timeout]  # 只重试网络类异常
)

# 应用到节点
graph.add_node("unstable_api", call_external_api, retry=retry_policy)
```

### 3.3 默认行为说明

如果不指定 `retry_policy`，LangGraph 会使用默认策略：
- `max_attempts = 5`
- 对 `Exception` 重试（即几乎任何异常都会重试）
- 但 `ValueError`、`TypeError` 等**程序逻辑错误**不会重试（因为重试也解决不了）

**生活比喻：**
重试就像打电话给客服。第一次打不通，等1秒再打；还不行，等2秒；还不行，等4秒。每次等待时间翻倍，同时加一点随机抖动（避免所有人都挤在同一秒重拨）。最多尝试3次，如果还是不通，就放弃并报错。

---

## 4. 节点缓存

### 4.1 核心概念

**官方定义：**
LangGraph 支持基于节点输入对任务/节点进行缓存。当相同输入再次到达同一节点时，直接返回缓存结果，跳过实际执行。

**生活比喻（游戏保存点）：**
节点缓存就像游戏中的**关卡保存点**。

想象你在玩《超级马里奥》：
- **通过一个关卡后** → 自动保存 → 节点执行成功，缓存结果
- **下次玩到同一关卡** → 直接读取存档，不用再打一遍 → 缓存命中，跳过执行
- **存档太久没更新** → 可能数据过时 → TTL 过期，重新执行

```python
from langgraph.types import CachePolicy

# 配置缓存策略
cache_policy = CachePolicy(
    key_func=lambda state: state["user_id"],  # 用user_id作为缓存键
    ttl=3600  # 缓存1小时（单位：秒）
)

graph.add_node("profile_lookup", fetch_user_profile, cache=cache_policy)
```

### 4.2 缓存命中流程

```
节点执行前
    ↓
用 key_func 生成缓存键
    ↓
检查缓存中是否存在该键？
    ├── 存在（命中）→ 直接返回缓存结果 → 跳过节点执行
    └── 不存在（未命中）→ 正常执行节点 → 将结果存入缓存
```

### 4.3 TTL 设置建议

| 场景 | 推荐 TTL | 原因 |
|------|----------|------|
| 实时天气查询 | 60 秒 | 数据变化快 |
| 用户基本信息 | 3600 秒（1小时） | 变化不频繁 |
| 静态配置数据 | `None`（永不过期） | 几乎不变 |

### 4.4 游戏保存点 vs 节点缓存（重要对比）

| 场景 | 游戏保存点 | 节点缓存 |
|------|-----------|----------|
| 正常通关 | 保存进度，下次继续 | 保存结果，下次复用 |
| 角色死亡/节点失败 | 回到保存点重新挑战 | 只重试失败的节点，之前节点的缓存直接复用 |
| 已经通关的关卡 | 不需要再打一遍 | 相同输入直接返回缓存结果 |

**关键区别：**
- 游戏保存点：死亡后回到**上一个保存点**，丢失后续进度
- 节点缓存：失败后只重试**失败的节点本身**，之前节点的缓存结果可以直接复用

---

## 5. 进阶：Agent Pipeline

当工作流变得复杂时，将多个专业 Agent 串联成 Pipeline。每个 Agent 内部可能是一个完整的 LangGraph 子图，但对外暴露为单个节点。

### 架构示意

```
用户输入 → [扫描 Agent] → [攻击 Agent] → [报告生成] → 最终结果
              ↓               ↓              ↓
         只负责扫描      只负责攻击      只负责生成报告
```

### 实现方式

```python
# 子图 Agent（内部可能很复杂）
class ScanAgentNode:
    def __init__(self):
        self.scan_graph = create_scan_graph()  # 内部复杂逻辑
    
    async def __call__(self, state: ParentState) -> dict:
        # 将父状态转换为子图需要的输入
        child_state = {"target": state["target"]}
        # 执行子图
        result = await self.scan_graph.ainvoke(child_state)
        # 返回结果更新父状态
        return {"scan_summary": result["summary"]}

# 构建主 Pipeline
builder = StateGraph(ParentState)
builder.add_node("scan", ScanAgentNode())
builder.add_node("attack", AttackAgentNode())
builder.add_node("report", ReportNode())

builder.add_edge(START, "scan")
builder.add_edge("scan", "attack")
builder.add_edge("attack", "report")
builder.add_edge("report", END)
```

### 为什么这样做？

| 优势 | 说明 |
|------|------|
| **可测试性** | 每个 Agent 可以独立测试 |
| **可维护性** | 修改攻击逻辑不影响扫描逻辑 |
| **可复用性** | 同一个 Agent 可以在不同 Pipeline 中使用 |
| **关注点分离** | 每个团队可以独立开发不同的 Agent |

---

## 6. 总结速查表

| 概念 | 核心要点 | 代码示例 |
|------|----------|----------|
| **节点** | 工作流中的一个步骤 | `graph.add_node("name", function)` |
| **单一职责** | 一个节点只做一件事 | 不要在一个函数里既调 LLM 又存数据库 |
| **纯函数** | 相同输入 → 相同输出 | 避免使用 `random()`、`datetime.now()` |
| **重试策略** | 失败后自动重试 | `RetryPolicy(max_attempts=3, retry_on=[Timeout])` |
| **缓存策略** | 相同输入跳过执行 | `CachePolicy(key_func=lambda s: s["id"], ttl=3600)` |
| **Agent Pipeline** | 多个专业 Agent 串联 | 复杂 Agent 封装为节点，组装成主图 |

---

## 7. 常见陷阱

| 陷阱 | 说明 | 解决方案 |
|------|------|----------|
| **修改全局状态** | 节点间相互影响 | 通过返回值更新 State |
| **忽略异常处理** | 可预见的失败没有重试 | 明确指定 `retry_on` |
| **过度拆分** | 节点粒度过细 | 如果没有复用价值，可以合并 |
| **生产环境用内存缓存** | 进程重启缓存丢失 | 使用 Redis 等外部缓存后端 |
| **忘记设置 TTL** | 永久缓存导致数据过期 | 根据业务场景设置合理的 TTL |

---

## 快速入门代码模板

```python
from langgraph.graph import StateGraph
from langgraph.types import RetryPolicy, CachePolicy

# 定义状态
class MyState(TypedDict):
    query: str
    result: str

# 定义节点函数（纯函数 + 单一职责）
def process_node(state: MyState) -> dict:
    # 只做一件事
    return {"result": process(state["query"])}

# 构建图
builder = StateGraph(MyState)

# 配置策略
retry = RetryPolicy(max_attempts=3, retry_on=[TimeoutError])
cache = CachePolicy(key_func=lambda s: s["query"], ttl=300)

# 添加节点
builder.add_node("process", process_node, retry=retry, cache=cache)

# 设置边
builder.add_edge("process", END)
builder.set_entry_point("process")

# 编译运行
graph = builder.compile()
result = graph.invoke({"query": "hello world"})
```


