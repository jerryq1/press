---
title: LangGraph状态管理State
date: 2026-04-20
abstract: LangGraph状态管理State
tags:
- Ai
- LangGraph
---

# LangGraph状态管理State

## 一、核心概念：什么是 State？

**官方描述**：State 是在图（Graph）的节点之间传递的共享数据结构，所有节点都可以读取和修改它。

**生活比喻**：一个“共享笔记本”，每个处理步骤（节点）都可以在上面写字、看别人写的内容。

---

## 二、三种 Schema 的区分

### 2.1 概念对比

| Schema | 作用 | 是否必需 | 生活比喻 |
|:---|:---|:---|:---|
| **`state_schema`** | 内部完整状态，节点间共享 | ✅ 必需 | 后厨的完整工单 |
| **`input_schema`** | 用户需要传入的字段 | ❌ 可选 | 菜单（顾客只需点菜） |
| **`output_schema`** | 返回给用户的字段 | ❌ 可选 | 端上桌的菜 |

### 2.2 关系图解

```
用户传入（input_schema）→ 内部状态（state_schema）→ 返回用户（output_schema）
     （只传必要字段）      （包含所有内部字段）        （只返回结果）
```

### 2.3 代码示例

```python
from langgraph.graph import StateGraph
from typing_extensions import TypedDict

class InputState(TypedDict):
    question: str                    # 用户只需传问题

class OutputState(TypedDict):
    answer: str                      # 用户只得到答案

class InternalState(InputState, OutputState):
    # 以上自动包含: question, answer
    search_results: list[str]        # 内部专用
    retry_count: int                 # 内部专用

graph = StateGraph(
    state_schema=InternalState,
    input_schema=InputState,
    output_schema=OutputState,
)
```

### 2.4 核心原则

- **`state_schema` 是唯一必需项**，其他两个是“隔离墙”
- **`input_schema` 和 `output_schema` 必须是 `state_schema` 的子集**
- **不指定时，默认等于 `state_schema`**

---

## 三、为什么 `output_schema` 在实际接口中至关重要

### 3.1 不用 `output_schema` 的问题

假设内部状态有 10 个字段（思考链、工具调用、重试次数、搜索结果...），不限制输出时：

- ❌ 用户看到不该看的内部信息
- ❌ 可能泄露敏感数据
- ❌ 响应体积巨大
- ❌ 改内部字段 = 改 API，调用方崩溃

### 3.2 用 `output_schema` 的好处

| 维度 | 不用 | 用 |
|:---|:---|:---|
| 返回内容 | 整个 InternalState | 只返回承诺字段 |
| API 稳定性 | 内部改动影响接口 | 内部随便改，接口不变 |
| 信息泄露 | 有风险 | 无风险 |
| 响应体积 | 大 | 小 |

### 3.3 黄金法则

> **`output_schema` = API 契约**：对外只返回承诺的字段，对内随便改，调用方无感知。

**生活比喻**：后厨工单有 20 项细节，但端给顾客的只有做好的菜。

---

## 四、状态更新机制（Reducer）

### 4.1 核心原理

**官方描述**：节点返回的是“增量更新”（只返回变化的字段），LangGraph 自动合并到现有状态，不是替换整个状态。

**生活比喻**：团队共享 Excel，每人只提交自己修改的单元格，系统自动合并。

### 4.2 常用 Reducer

| Reducer | 行为 | 适用场景 |
|:---|:---|:---|
| **default** | 覆盖更新 | 普通字段（数字、字符串） |
| **`add_messages`** | 智能消息合并（基于ID去重、支持删除） | 对话历史 |
| **`operator.add`** | 简单列表拼接 | 数值累加、普通列表 |
| **`operator.mul`** | 数值相乘 | 累乘计算 |
| **自定义** | 用户定义逻辑 | 特殊业务需求 |

### 4.3 `add_messages` vs `operator.add` 关键区别

| 特性 | `add_messages` | `operator.add` |
|:---|:---|:---|
| ID去重 | ✅ 相同ID会替换 | ❌ 导致重复 |
| 删除消息 | ✅ 支持 | ❌ 不支持 |
| 适用场景 | 聊天机器人、Agent | 数值累加、普通列表 |

```python
# ✅ 消息列表必须用 add_messages
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]   # 正确
    counter: Annotated[int, operator.add]      # 数值用 operator.add
```

### 4.4 节点返回示例

```python
def some_node(state: State):
    # 只返回变化的字段，其他字段自动保留
    return {"counter": state["counter"] + 1, "messages": [new_msg]}
```

---

## 五、状态的不可变性

### 5.1 核心规则

**状态的结构编译时固定，运行时不能增删字段**，只能修改已有字段的值。

```python
class State(TypedDict):
    counter: int
    name: str

# ✅ 允许：修改已有字段
def good(state: State):
    return {"counter": state["counter"] + 1}

# ❌ 不允许：返回未定义字段
def bad(state: State):
    return {"new_field": "something"}  # 被忽略
```

### 5.2 可选字段

```python
from typing import Optional

class State(TypedDict):
    optional_field: Optional[str]  # 可设 None，但字段始终存在
```

---

## 六、State 的数据类型选择

| 对比项 | TypedDict | BaseModel |
|:---|:---|:---|
| 运行时校验 | ❌ 无 | ✅ 有 |
| 性能 | 快 | 稍慢 |
| LangGraph 推荐 | ✅ **官方推荐** | ❌ 不推荐 |

```python
# ✅ 推荐
from typing_extensions import TypedDict
class State(TypedDict):
    counter: int

# ❌ 不推荐（LangGraph 内部期望字典）
from pydantic import BaseModel
class State(BaseModel):
    counter: int
```

---

## 七、快速参考模板

```python
from langgraph.graph import StateGraph
from typing_extensions import TypedDict, Annotated
from langgraph.graph.message import add_messages
from operator import add

# 1. 定义输入（用户提供）
class InputState(TypedDict):
    query: str

# 2. 定义输出（用户收到）—— 这是你的 API 契约
class OutputState(TypedDict):
    result: str

# 3. 定义内部状态（继承+扩展）
class InternalState(InputState, OutputState):
    messages: Annotated[list, add_messages]  # 对话历史
    counter: Annotated[int, add]              # 累加计数
    temp_data: str                            # 内部临时数据

# 4. 构建图
graph = StateGraph(
    state_schema=InternalState,
    input_schema=InputState,
    output_schema=OutputState,
)

# 5. 节点只返回变化的字段
def process(state: InternalState):
    return {"result": f"处理了: {state['query']}"}
```

---

## 八、选型决策树

```
需要对外提供 API？
    ├─ 是 → 必须用 output_schema（这是 API 契约）
    └─ 否 → 可选

需要校验用户输入？
    ├─ 是 → 用 input_schema
    └─ 否 → 可选

状态中有消息列表？
    ├─ 是 → 必须用 add_messages
    └─ 否 → 可用 operator.add 或默认覆盖

需要复杂数据验证？
    ├─ 是 → 考虑 Pydantic（但需自己转换）
    └─ 否 → 用 TypedDict（官方推荐）
```

---

**文档版本**：基于 LangGraph Python 版本  
**核心原则**：状态结构固定、更新增量合并、接口隔离清晰、output_schema 即 API 契约
