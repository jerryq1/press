---
title: LangGraph高级工作流控制机制(Send、Command)
date: 2026-04-20
abstract: 高级工作流控制机制描述
tags:
- Ai
- LangGraph
---


# LangGraph高级工作流控制机制(Send、Command)

## 一、开篇：核心问题

**工作流中遇到这两个问题怎么办？**

1. 不知道下一步要去哪个节点（运行时才能决定）
2. 需要同时处理多个独立任务（数量还不固定）

LangGraph 提供了 **Send** 和 **Command** 来解决这两类问题。

---

## 二、Send：批量并行分发

### 官方描述
> Send 允许从条件边返回一个或多个 Send 对象，每个对象指定一个目标节点和该节点专用的状态。用于在运行时动态创建并行任务，任务数量无法预先确定。

### 生活比喻
**餐厅点餐系统**：你（分发节点）拿着10张订单，不知道后厨有几个厨师。你只需要把每张订单（Send）放到出餐口，每个订单独立处理，谁做完谁出餐。

### 何时使用 Send

```
✅ 适合场景（同一类垂直问题，细节不同）
├── 10个用户消息需要分别处理
├── 5个数据源需要并行查询
├── 100个文件需要批量分析
└── 订单列表需要逐单处理

❌ 不适合场景
└── 任务类型完全不同（登录 ≠ 支付）
```

### 核心代码示例

```python
from langgraph.graph import StateGraph, END
from langgraph.types import Send
from typing import TypedDict, Annotated, List
import operator

# 1. 整体状态（用 operator.add 自动聚合并行结果）
class OverallState(TypedDict):
    subjects: List[str]                       # 待处理列表
    jokes: Annotated[List[str], operator.add] # 结果自动合并

# 2. 分发器：为每个任务创建 Send
def dispatcher(state: OverallState) -> List[Send]:
    # 为 subjects 列表中的每一项创建一个独立任务
    return [Send("generate_joke", {"subject": s}) for s in state['subjects']]

# 3. 工作器节点：处理单个任务
def generate_joke(state: dict) -> dict:
    return {"jokes": [f"Joke about {state['subject']}"]}

# 4. 构建图
builder = StateGraph(OverallState)
builder.add_node("generate_joke", generate_joke)
builder.add_conditional_edges(START, dispatcher)  # 从入口动态分发
builder.add_edge("generate_joke", END)

graph = builder.compile()

# 执行
result = graph.invoke({"subjects": ["cats", "dogs", "birds"]})
print(result)  # jokes 自动包含3个结果
```

### 关键要点

| 要点 | 说明 |
|------|------|
| 返回类型 | `List[Send]`，可以返回多个 |
| 节点复用 | 所有 Send 调用**同一个节点** |
| 状态隔离 | 每个 Send 携带独立的状态副本 |
| 结果聚合 | 配合 `operator.add` 自动合并 |

---

## 三、Command：动态路由 + 状态更新

### 官方描述
> Command 允许节点在返回时同时指定下一个节点和要执行的状态更新。与条件边不同，Command 将路由决策和状态变更封装在一个原子操作中。

### 生活比喻
**智能导航**：你在开车（当前节点），发现前面堵车。导航（Command）同时做两件事：1）重新规划路线（路由到新节点）；2）记录绕路信息、更新预计到达时间（状态更新）。

### Command vs 条件边

| 维度 | 条件边 | Command |
|------|--------|---------|
| 能做什么 | 只选择下一个节点 | 选择节点 + 更新状态 |
| 定义位置 | 单独的路由函数 | 节点内部直接返回 |
| 复杂度 | 简单决策 | 复杂业务逻辑 |

```python
# 条件边：只能路由
def simple_router(state):
    return "success_node" if state["ok"] else "fail_node"

# Command：路由 + 更新状态
def smart_node(state):
    if state["payment"] == "success":
        return Command(
            goto="shipping",
            update={
                "order_status": "paid",
                "payment_time": datetime.now()
            }
        )
    else:
        return Command(
            goto="retry",
            update={"retry_count": state.get("retry_count", 0) + 1}
        )
```

### 何时用 Command

```
✅ 需要同时做两件事
├── 路由到不同分支 + 记录决策日志
├── 错误处理 + 更新重试计数
├── 条件循环 + 更新迭代变量
└── 权限检查 + 记录审计信息

❌ 只用条件边就够了
└── 状态已准备就绪，只需要选一条路走
```

---

## 四、边（Edges）体系概览

LangGraph 提供了完整的边类型体系：

| 类型 | 用途 | 示例 |
|------|------|------|
| **普通边（Normal Edge）** | 固定路径 A→B | `add_edge("A", "B")` |
| **条件边（Conditional Edge）** | 运行时选择下一个节点 | `add_conditional_edges("A", router)` |
| **入口点（Entry Point）** | 图的起点 | `add_edge(START, "first_node")` |
| **条件入口点** | 动态决定第一个节点 | `add_conditional_edges(START, router)` |

### 核心关系图

```
普通边：A ──────→ B（固定路线）

条件边：A ──┬──→ B（根据状态选路）
           └──→ C

Send：  分发器 ──┬──→ Worker（为每个任务创建一个分支）
                ├──→ Worker
                └──→ Worker（分支数量动态）

Command：节点内部决定下一步 + 更新状态
```

---

## 五、Send + Command 组合实战

### 场景：批量订单处理系统

```python
from langgraph.graph import StateGraph, END
from langgraph.types import Send, Command
from typing import TypedDict, Annotated, List
import operator
from datetime import datetime

class OrderState(TypedDict):
    order_id: str
    amount: float
    status: str
    retry_count: int

class OverallState(TypedDict):
    orders: List[dict]
    results: Annotated[List[dict], operator.add]

# 分发器：为每个订单创建任务
def dispatch_orders(state: OverallState) -> List[Send]:
    return [Send("process_order", order) for order in state['orders']]

# 处理节点：使用 Command 处理各种情况
def process_order(state: OrderState) -> Command:
    # 模拟支付处理
    payment_success = mock_payment(state["amount"])
    
    if payment_success:
        return Command(
            goto="success_handler",
            update={
                "status": "paid",
                "payment_time": datetime.now().isoformat()
            }
        )
    elif state["retry_count"] < 3:
        return Command(
            goto="process_order",  # 回到自己，重试
            update={"retry_count": state["retry_count"] + 1}
        )
    else:
        return Command(
            goto="fail_handler",
            update={"status": "failed", "reason": "max retries exceeded"}
        )

def success_handler(state: OrderState) -> dict:
    return {"results": [{**state, "final_status": "success"}]}

def fail_handler(state: OrderState) -> dict:
    return {"results": [{**state, "final_status": "failed"}]}

# 构建图
builder = StateGraph(OverallState)
builder.add_node("process_order", process_order)
builder.add_node("success_handler", success_handler)
builder.add_node("fail_handler", fail_handler)

builder.add_conditional_edges(START, dispatch_orders)
builder.add_edge("success_handler", END)
builder.add_edge("fail_handler", END)

graph = builder.compile()
```

---

## 六、Runtime Context：运行时上下文

### 什么是 Context

**官方描述**：运行时上下文是在图执行期间传递的附加对象，用于提供跨节点的共享资源（如数据库连接、配置、日志器），但不参与状态持久化和检查点机制。

**生活比喻**：公司里的**茶水间**（Context）—— 所有员工（节点）都可以使用，但茶水间本身不会被记录到每个人的工作日志（State）里。

### Context vs State

| 特性 | State | Context |
|------|-------|---------|
| 存储内容 | 业务数据、流程状态 | 数据库连接、API客户端、配置 |
| 持久化 | ✅ 自动持久化 | ❌ 不持久化 |
| 序列化要求 | ✅ 必须可序列化 | ❌ 可以不可序列化 |
| 版本追踪 | ✅ 记录所有变更 | ❌ 不记录 |
| 更新方式 | 节点返回新值 | 只读，不应修改 |

### 代码示例

```python
from langgraph.graph import StateGraph
from typing import TypedDict

# 定义 State（会变化的业务数据）
class MyState(TypedDict):
    user_id: str
    query_result: str

# 定义 Context（基础设施）
class MyContext(TypedDict):
    db_pool: object      # 数据库连接池（不可序列化）
    logger: object       # 日志器
    config: dict         # 配置

def query_user(state: MyState, context: MyContext):
    # 使用 context 中的资源
    context["logger"].info(f"Querying user {state['user_id']}")
    
    # 注意：context 只读，不应修改
    # 返回的只会更新 State
    return {"query_result": "user data"}

# 创建图时指定 context_schema
builder = StateGraph(MyState, context_schema=MyContext)
```

---

## 七、Python 参数机制补充（必备基础）

LangGraph 大量使用了 Python 的参数机制，理解它们很重要：

### `*args` 和 `**kwargs`

| 参数 | 含义 | 类型 |
|------|------|------|
| `*args` | 接收所有位置参数 | 元组 `(1, 2, 3)` |
| `**kwargs` | 接收所有关键字参数 | 字典 `{"a": 1, "b": 2}` |

**记忆口诀**：一个星号拆序列，两个星号拆字典

### 在 LangGraph 中的应用

```python
# Send 使用 **kwargs 风格传参
Send("node_name", {"key": "value"})  # 实际上内部使用 **kwargs

# Command 支持动态参数
Command(goto="node", update={"status": "ok"})
```

---

## 八、快速决策指南

### 问题1：需要并行处理多个独立任务？

```
是 → 使用 Send
否 → 继续判断
```

### 问题2：下一步节点无法预先确定？

```
是 → 需要动态路由
    ├── 只需要选路 → 条件边
    └── 选路 + 更新状态 → Command
否 → 普通边
```

### 问题3：需要共享资源但不持久化？

```
是 → 使用 ContextSchema
否 → 放 State 里
```

---

## 九、总结速查表

| 机制 | 一句话解释 | 典型场景 |
|------|-----------|----------|
| **Send** | 动态创建多个并行任务 | Map-Reduce、批量处理 |
| **Command** | 运行时决定路径 + 更新状态 | 错误重试、条件分支 |
| **条件边** | 运行时决定路径（不更新状态） | 简单路由 |
| **Context** | 只读的共享资源容器 | 数据库连接、配置 |

---

## 十、参考资源

- 官方文档：https://docs.langchain.com/oss/python/langraph/graph-api#send
- LangGraph Python API：以最新版本为准
