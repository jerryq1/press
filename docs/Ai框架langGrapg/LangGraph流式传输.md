---
title: LangGraph 流式传输（Streaming）
date: 2026-04-21
abstract: LangGraph 流式传输（Streaming)描述
tags:
- Ai
- LangGraph
---


# LangGraph 流式传输（Streaming）

> 基于 Excel 表格比喻，深入理解五种流模式

---

## 一、什么是流式传输？

**官方描述**：在图、Agent或工作流执行过程中，边执行边产出中间结果，而不是等整个执行结束再一次性返回全部结果。

**生活比喻**：就像看直播和看录播的区别——
- **无流式（录播）**：等整场比赛结束才能看到回放
- **有流式（直播）**：进球的那一刻马上就能看到，不用等终场哨响

---

## 二、核心比喻：Excel 员工信息表

假设你有一张 Excel 表格，记录员工信息：

| 姓名 | 年龄 | 部门 | 工资 |
|------|------|------|------|
| 张三 | 25 | 技术部 | 10000 |

这个表格就是 **State（状态）**。每一次修改表格，就是图的一步（Step）。

---

## 三、五种流模式速查表

| Mode | 输出内容 | Excel 比喻 | 数据量 | 使用频率 |
|------|----------|-----------|--------|----------|
| **values** | 每步后的**完整表格** | 每次修改后都截一张屏，保存整个表格 | 大 | ⭐⭐ |
| **updates** | 每步后的**修改记录** | 只记"谁变了、变成什么"，不记没变的 | 小 | ⭐⭐⭐⭐ |
| **messages** | LLM 逐字输出 | 听写员逐字记录 LLM 说的话 | 极小 | ⭐⭐⭐⭐⭐ |
| **custom** | 你自定义的数据 | 你自己举牌喊话，想说什么说什么 | 可控 | ⭐⭐⭐ |
| **debug** | 所有执行细节 | 给整个操作过程录像，事无巨细 | 巨大 | ⭐（调试用） |

---

## 四、详解 values vs updates（基于 Excel 案例）

### 初始表格
| 姓名 | 年龄 | 部门 | 工资 |
|------|------|------|------|
| 张三 | 25 | 技术部 | 10000 |

---

### 第1步：年龄改为 26

| 姓名 | 年龄 | 部门 | 工资 |
|------|------|------|------|
| 张三 | 26 | 技术部 | 10000 |

| 模式 | 输出 | 说明 |
|------|------|------|
| **values** | `{姓名:"张三", 年龄:26, 部门:"技术部", 工资:10000}` | 哪怕只改了一个格子，也把**整行**打印出来 |
| **updates** | `{年龄:26}` | 只记录**本次修改的字段** |

---

### 第2步：部门改为"市场部"

| 姓名 | 年龄 | 部门 | 工资 |
|------|------|------|------|
| 张三 | 26 | 市场部 | 10000 |

| 模式 | 输出 | 说明 |
|------|------|------|
| **values** | `{姓名:"张三", 年龄:26, 部门:"市场部", 工资:10000}` | 又是整行打印 |
| **updates** | `{部门:"市场部"}` | 只记录本次修改的字段 |

---

### 第3步：同时改年龄和工资（年龄→27，工资→12000）

| 姓名 | 年龄 | 部门 | 工资 |
|------|------|------|------|
| 张三 | 27 | 市场部 | 12000 |

| 模式 | 输出 | 说明 |
|------|------|------|
| **values** | `{姓名:"张三", 年龄:27, 部门:"市场部", 工资:12000}` | 还是整行打印 |
| **updates** | `{年龄:27, 工资:12000}` | 同时记录多个修改 |

---

## 五、代码示例（Excel 案例）

```python
from langgraph.graph import StateGraph, START
from typing import TypedDict

# 定义状态（就是 Excel 的一行）
class EmployeeState(TypedDict):
    姓名: str
    年龄: int
    部门: str
    工资: int

# 节点1：只改年龄
def update_age(state):
    return {"年龄": 26}  # 只返回要改的字段

# 节点2：只改部门
def update_dept(state):
    return {"部门": "市场部"}

# 节点3：同时改年龄和工资
def update_age_and_salary(state):
    return {"年龄": 27, "工资": 12000}

# 构建图
builder = StateGraph(EmployeeState)
builder.add_node("update_age", update_age)
builder.add_node("update_dept", update_dept)
builder.add_node("update_age_and_salary", update_age_and_salary)

builder.add_edge(START, "update_age")
builder.add_edge("update_age", "update_dept")
builder.add_edge("update_dept", "update_age_and_salary")

graph = builder.compile()

# 初始状态
initial = {"姓名": "张三", "年龄": 25, "部门": "技术部", "工资": 10000}

# ========== values 模式 ==========
print("=== values 模式（每次都是完整表格）===")
for chunk in graph.stream(initial, stream_mode="values"):
    print(chunk)

# 输出：
# {'姓名': '张三', '年龄': 25, '部门': '技术部', '工资': 10000}
# {'姓名': '张三', '年龄': 26, '部门': '技术部', '工资': 10000}
# {'姓名': '张三', '年龄': 26, '部门': '市场部', '工资': 10000}
# {'姓名': '张三', '年龄': 27, '部门': '市场部', '工资': 12000}

# ========== updates 模式 ==========
print("\n=== updates 模式（只记录修改的字段）===")
for chunk in graph.stream(initial, stream_mode="updates"):
    print(chunk)

# 输出：
# {'update_age': {'年龄': 26}}
# {'update_dept': {'部门': '市场部'}}
# {'update_age_and_salary': {'年龄': 27, '工资': 12000}}
```

---

## 六、values vs updates 选择指南

| 场景 | 推荐模式 | 原因 |
|------|----------|------|
| 前端需要完整状态来重新渲染整个UI | **values** | 直接拿到完整数据，不用自己合并 |
| 移动端/网络差 | **updates** | 数据量小，省流量 |
| 实时显示处理进度 | **updates** | 只看变化就知道现在到哪一步了 |
| 断点续传（保存状态后恢复） | **values** | 需要完整快照才能恢复 |
| 增量同步到数据库 | **updates** | 只更新变化的字段，效率高 |
| 调试时想看每个阶段的全貌 | **values** | 一目了然，不用拼凑 |

---

## 七、其他三种模式详解

### 1. messages 模式 - LLM实时输出

**比喻**：听写员逐字记录 LLM 说的话，还能知道是哪个老师念的。

```python
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer

def llm_node(state):
    writer = get_stream_writer()
    llm = ChatOpenAI(model="gpt-3.5-turbo", streaming=True)
    
    # 流式调用 LLM
    for chunk in llm.stream("讲个笑话"):
        writer(chunk.content)  # 逐字发送
        print(chunk.content, end="")  # 实时打印
    
    return {"response": "完整响应"}

# 消费
for msg, metadata in graph.stream(input, stream_mode="messages"):
    print(msg.content, end="")  # 打字机效果
```

**适用场景**：
- 聊天机器人的打字机效果
- 实时敏感词检测
- 边生成边播放语音

---

### 2. custom 模式 - 自定义数据

**比喻**：你自己举牌喊话，想说什么说什么，想什么时候说就什么时候说。

```python
from langgraph.config import get_stream_writer
import time

def batch_process_node(state):
    writer = get_stream_writer()
    items = state["items"]
    
    total = len(items)
    for i, item in enumerate(items):
        # 发送进度（你自定义的消息）
        writer({
            "type": "progress",
            "current": i + 1,
            "total": total,
            "percent": (i + 1) / total * 100,
            "processing": item
        })
        
        # 处理数据（你自定义的函数）
        result = your_custom_process(item)
        
        # 发送部分结果
        writer({"type": "partial_result", "index": i, "result": result})
    
    writer({"type": "complete", "message": "全部完成！"})
    return {"results": results}

# 消费
for chunk in graph.stream(input, stream_mode="custom"):
    if chunk.get("type") == "progress":
        update_progress_bar(chunk["percent"])
    elif chunk.get("type") == "partial_result":
        append_to_table(chunk["result"])
```

**适用场景**：
- 进度条（0% → 30% → 60% → 100%）
- 中间计算结果
- 给前端发送控制指令

---

### 3. debug 模式 - 调试利器

**比喻**：给整个操作过程录像，事无巨细，用于事后分析问题。

```python
# 仅开发环境使用！
for chunk in graph.stream(input, stream_mode="debug"):
    if chunk.get("type") == "node_start":
        print(f"开始执行: {chunk['node']}")
    elif chunk.get("type") == "node_end":
        print(f"执行完成: {chunk['node']}, 耗时: {chunk['duration']}ms")
    elif chunk.get("type") == "state_update":
        print(f"状态变化: {chunk['updates']}")
```

**⚠️ 警告**：生产环境慎用！数据量巨大，严重影响性能。

---

## 八、组合使用多种模式（实战最佳实践）

```python
# 场景：聊天机器人，同时需要：
# - 状态变化显示（updates）
# - 实时文字输出（messages）
# - 进度更新（custom）

async def chat_handler(user_input: str):
    async for mode, chunk in graph.astream(
        {"input": user_input},
        stream_mode=["updates", "messages", "custom"]
    ):
        if mode == "updates":
            # 发送状态变化（如"正在思考..."）
            await ws.send_json({"type": "status", "data": chunk})
            
        elif mode == "messages":
            # 逐字发送LLM输出（打字机效果）
            msg, _ = chunk
            await ws.send_json({"type": "token", "data": msg.content})
            
        elif mode == "custom":
            # 发送自定义事件（如进度条）
            if chunk.get("type") == "progress":
                await ws.send_json({"type": "progress", "data": chunk["percent"]})
```

---

## 九、Python 版本注意事项

| Python版本 | 同步代码 | 异步代码 |
|-----------|---------|---------|
| ≥ 3.11 | ✅ 正常使用 `get_stream_writer()` | ✅ 正常使用 `get_stream_writer()` |
| < 3.11 | ✅ 正常使用 `get_stream_writer()` | ❌ 需显式声明 `writer` 参数 |

**Python < 3.11 异步兼容写法**：
```python
# ❌ 会报错
async def my_node(state):
    writer = get_stream_writer()

# ✅ 正确写法
async def my_node(state, writer):  # 显式声明
    writer("进度更新")
    return {"result": "done"}
```

---

## 十、与 LangChain 流式的区别

| 维度 | LangChain 流式 | LangGraph 流式 |
|------|---------------|----------------|
| **关注点** | LLM 回复的文字内容 | 整个工作流的执行状态 |
| **典型输出** | 逐字文本 | 状态变化、节点进度、自定义事件 |
| **Excel 比喻** | 听写员记录 LLM 说的话 | 记录整个表格的修改过程 |
| **能看流程状态吗** | ❌ 不能 | ✅ 能（updates/values） |

**一句话总结**：
- **LangChain 流式**：让你"看到回复在写什么"
- **LangGraph 流式**：让你"看到程序在做什么"

---

## 十一、决策树

```
你的需求是什么？
│
├─ 需要实时显示 LLM 回复？
│  └─ 用 messages 模式 ⭐
│
├─ 需要知道程序执行到哪一步？
│  ├─ 只需要知道变了什么 → updates 模式（省流量）
│  └─ 需要完整状态重建UI → values 模式（省代码）
│
├─ 需要显示进度条/自定义信息？
│  └─ 用 custom 模式
│
└─ 需要调试/排查问题？
   └─ 用 debug 模式（仅开发环境）
```

**最佳实践组合**：
- 聊天机器人：`messages` + `updates`
- 数据处理管道：`custom` + `updates`
- 复杂 Agent 调试：`debug` + `values`

---

## 十二、完整可运行示例

```python
from langgraph.graph import StateGraph, START
from langgraph.config import get_stream_writer
from typing import TypedDict
from langchain_openai import ChatOpenAI
import time

class State(TypedDict):
    topic: str
    content: str
    saved: bool

# 节点1：设置主题
def set_topic(state):
    writer = get_stream_writer()
    writer({"type": "progress", "msg": "正在分析主题...", "step": 1})
    time.sleep(0.5)
    return {"topic": "冰淇淋"}

# 节点2：生成内容（LLM）
def generate_content(state):
    writer = get_stream_writer()
    writer({"type": "progress", "msg": "正在生成内容...", "step": 2})
    
    llm = ChatOpenAI(model="gpt-3.5-turbo", streaming=True)
    full_content = ""
    for chunk in llm.stream(f"讲个关于{state['topic']}的笑话"):
        full_content += chunk.content
        writer({"type": "llm_token", "token": chunk.content})
    
    return {"content": full_content}

# 节点3：保存
def save(state):
    writer = get_stream_writer()
    writer({"type": "progress", "msg": "正在保存...", "step": 3, "percent": 80})
    time.sleep(0.5)
    writer({"type": "progress", "msg": "完成！", "step": 3, "percent": 100})
    return {"saved": True}

# 构建图
builder = StateGraph(State)
builder.add_node("set_topic", set_topic)
builder.add_node("generate_content", generate_content)
builder.add_node("save", save)
builder.add_edge(START, "set_topic")
builder.add_edge("set_topic", "generate_content")
builder.add_edge("generate_content", "save")
graph = builder.compile()

# 运行
initial = {"topic": "", "content": "", "saved": False}

print("=== 开始处理 ===\n")

for mode, chunk in graph.stream(
    initial,
    stream_mode=["updates", "custom", "messages"]
):
    if mode == "updates":
        print(f"[状态变化] {chunk}")
    elif mode == "custom":
        if chunk.get("type") == "progress":
            print(f"[进度] {chunk['msg']}")
        elif chunk.get("type") == "llm_token":
            print(chunk["token"], end="", flush=True)
    elif mode == "messages":
        msg, _ = chunk
        print(msg.content, end="", flush=True)

print("\n\n=== 处理完成 ===")
```

---

## 参考文档

- [LangGraph 官方 Streaming Guide](https://langchain-ai.github.io/langgraph/concepts/streaming/)
- [LangGraph Python API Reference](https://langchain-ai.github.io/langgraph/reference/graphs/)
