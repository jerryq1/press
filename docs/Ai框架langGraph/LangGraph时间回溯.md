---
title: LangGraph 时间回溯(Time-Travel)
date: 2026-04-21
abstract: LangGraph 时间回溯(Time-Travel)描述与内存检查点的关系描述
tags:
- Ai
- LangGraph
---

# LangGraph 时间回溯(Time-Travel)

## 1. 核心概念

### 1.1 什么是时间回溯？

| 维度 | 说明 |
| :--- | :--- |
| **官方描述** | 从工作流历史中的任意检查点恢复执行，可原样重放或修改状态后探索新分支 |
| **生活比喻** | 像玩多结局游戏，可以随时"存档"和"读档"，选择不同选项探索不同剧情线 |
| **本质公式** | `时间回溯 = 回到指定检查点 + (可选)提供新状态 + 重新执行` |

### 1.2 依赖条件

时间回溯依赖 **Checkpointer（检查点系统）**，它在每个节点执行后自动保存状态快照。

| 实现 | 用途 | 场景 |
| :--- | :--- | :--- |
| `InMemorySaver` | 内存存储 | 开发测试 |
| `PostgresSaver` | 数据库持久化 | **生产环境必备** |

---

## 2. 检查点与时间回溯的关系

### 2.1 核心关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        原始执行路径                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │CP-1(起点)│→│  CP-2   │→│  CP-3   │→│  CP-4   │→│CP-5(终点)││
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘│
│                    ↑                                            │
│                    │ 时间回溯                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        新执行分支                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌─────────┐        │
│  │CP-1(起点)│→│  CP-2   │→│ CP-3'(修改后) │→│ CP-4'   │→ ...   │
│  └─────────┘  └─────────┘  └─────────────┘  └─────────┘        │
│                    ↑                                            │
│                    └── 从 CP-2 分叉，CP-3 变成了 CP-3'          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 关系速查表

| 概念 | 定义 | 关系 |
| :--- | :--- | :--- |
| **检查点** | 节点执行后的状态快照 | 时间回溯的**目标锚点** |
| **时间回溯** | 从历史检查点恢复执行的能力 | 检查点的**消费方式** |

### 2.3 关键关系点

| 要点 | 说明 |
| :--- | :--- |
| 检查点不可变 | 原始检查点永不修改 |
| 回溯产生新分支 | 每次回溯都会创建新的检查点链 |
| 唯一标识 | 每个检查点有唯一的 `checkpoint_id` |
| 一句话总结 | **检查点是"存档"，时间回溯是"读档"** |

### 2.4 生活比喻：游戏存档系统

| 游戏概念 | LangGraph 概念 |
| :--- | :--- |
| 游戏存档 | 检查点 |
| 读档操作 | `get_state_history` + 选择目标 |
| 修改器改存档 | `update_state` |
| 从存档继续玩 | `invoke(None, new_config)` |

---

## 3. 为什么需要时间回溯

| 场景 | 说明 | 企业级价值 |
| :--- | :--- | :--- |
| **调试** | 回到错误现场，看Agent会如何响应 | 快速定位问题，无需从头运行 |
| **修复** | 修正中间错误状态后继续执行 | 节省大量重跑成本 |
| **探索分支** | 从同一状态测试不同决策路径 | 优化Agent策略，做What-If分析 |
| **人机协同** | 用户拒绝高风险操作后回退 | 安全可控，提升用户体验 |

---

## 4. 核心API速查

### 4.1 工作流四步法

```python
# 步骤1：运行图，生成历史
config = {"configurable": {"thread_id": "user_123"}}
graph.invoke(initial_input, config)

# 步骤2：获取历史状态（注意：返回倒序！）
states = list(graph.get_state_history(config))

# 步骤3：选择目标检查点，可选修改状态
target_state = states[2]  # 索引2是目标位置
new_config = graph.update_state(
    target_state.config,
    {"field": "new_value"}  # 完全替换指定字段
)

# 步骤4：从新配置继续执行（时间回溯的核心操作）
result = graph.invoke(None, config=new_config)
```

### 4.2 API 速查表

| API | 作用 | 返回值 |
| :--- | :--- | :--- |
| `graph.invoke(input, config)` | 执行图，自动保存检查点 | 最终状态 |
| `graph.get_state_history(config)` | 获取所有检查点（倒序） | 检查点列表 |
| `graph.update_state(config, values)` | 修改检查点状态 | 新配置 |
| `graph.invoke(None, config)` | 从指定配置继续执行 | 最终状态 |

### 4.3 ⚠️ 常见陷阱

| 陷阱 | 正确做法 |
| :--- | :--- |
| 忘记传入 `checkpointer` | 编译时务必指定 `checkpointer=...` |
| 混淆历史顺序 | 记住 `states[0]` 是最后一步 |
| 修改状态破坏数据结构 | 只修改需要的字段，保持类型一致 |

---

## 5. 完整示例代码

### 5.1 基础示例：故事生成工作流

```python
"""
LangGraph 时间回溯完整演示
功能：故事生成工作流，展示回溯并修改角色，创造不同分支
"""

import uuid
from typing_extensions import TypedDict, NotRequired
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver


class StoryState(TypedDict):
    character: NotRequired[str]  # 角色
    setting: NotRequired[str]    # 场景
    plot: NotRequired[str]       # 剧情
    ending: NotRequired[str]     # 结局


def create_character(state: StoryState):
    print("执行: create_character")
    return {"character": "一只会说话的猫"}


def set_setting(state: StoryState):
    print("执行: set_setting")
    return {"setting": "在一个神秘的图书馆里"}


def develop_plot(state: StoryState):
    print("执行: develop_plot")
    character = state.get("character", "未知")
    setting = state.get("setting", "未知")
    return {"plot": f"{character}在{setting}发现了一本会发光的书"}


def write_ending(state: StoryState):
    print("执行: write_ending")
    plot = state.get("plot", "未知")
    return {"ending": f"当{plot}时，整个图书馆都被魔法照亮了"}


def main():
    # 构建图
    workflow = StateGraph(StoryState)
    workflow.add_node("create_character", create_character)
    workflow.add_node("set_setting", set_setting)
    workflow.add_node("develop_plot", develop_plot)
    workflow.add_node("write_ending", write_ending)

    workflow.add_edge(START, "create_character")
    workflow.add_edge("create_character", "set_setting")
    workflow.add_edge("set_setting", "develop_plot")
    workflow.add_edge("develop_plot", "write_ending")
    workflow.add_edge("write_ending", END)

    graph = workflow.compile(checkpointer=InMemorySaver())

    # 第一次执行
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    story1 = graph.invoke({}, config)
    print(f"故事1: {story1}")

    # 查看历史（注意倒序）
    states = list(graph.get_state_history(config))
    print(f"共有 {len(states)} 个检查点")

    # 时间回溯：回到 create_character 之后，把猫改成龙
    checkpoint_after_character = states[2]  # 倒序索引2
    new_config = graph.update_state(
        checkpoint_after_character.config,
        {"character": "一只会飞的龙"}
    )

    # 从修改点继续执行
    story2 = graph.invoke(None, config=new_config)
    print(f"故事2: {story2}")


if __name__ == "__main__":
    main()
```

### 5.2 企业级示例：修复Agent错误决策

```python
"""场景：客服Agent错误调用了cancel_order，需要回溯修正"""

import uuid
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.messages import AIMessage, HumanMessage


class AgentState(TypedDict):
    messages: list
    order_id: str


def query_order(order_id: str) -> str:
    return f"订单 {order_id} 状态：已发货"


def cancel_order(order_id: str) -> str:
    return f"订单 {order_id} 已申请取消（危险操作）"


def agent_node(state: AgentState):
    """模拟一个有bug的LLM，错误选择了cancel"""
    last_msg = state["messages"][-1]
    if "查询" in last_msg.content:
        # 错误决策：应该用query却用了cancel
        return {
            "messages": [AIMessage(
                content="",
                tool_calls=[{"name": "cancel_order", "args": {"order_id": state["order_id"]}, "id": "1"}]
            )]
        }
    return state


def tool_node(state: AgentState):
    """执行工具"""
    last_msg = state["messages"][-1]
    tool_name = last_msg.tool_calls[0]["name"]
    args = last_msg.tool_calls[0]["args"]
    
    if tool_name == "query_order":
        result = query_order(args["order_id"])
    else:
        result = cancel_order(args["order_id"])
    
    return {"messages": [AIMessage(content=result)]}


# 构建图
builder = StateGraph(AgentState)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)
builder.add_edge(START, "agent")
builder.add_edge("agent", "tools")
builder.add_edge("tools", END)

graph = builder.compile(checkpointer=InMemorySaver())

# 用户会话
thread_id = str(uuid.uuid4())
config = {"configurable": {"thread_id": thread_id}}

# 用户请求
print("=== 用户发起查询 ===")
result = graph.invoke(
    {"messages": [HumanMessage(content="帮我查询订单 12345")], "order_id": "12345"},
    config
)
print(f"错误结果: {result['messages'][-1].content}")
# 输出: 订单 12345 已申请取消（危险操作）

# 时间回溯修复
print("\n=== 时间回溯修复 ===")
states = list(graph.get_state_history(config))

# 找到agent决策后、tool执行前的检查点
for state in states:
    if state.next and 'tools' in state.next:
        agent_decision_state = state
        break

# 修正工具调用
last_msg = agent_decision_state.values['messages'][-1]
last_msg.tool_calls[0]['name'] = 'query_order'  # cancel → query

new_config = graph.update_state(
    agent_decision_state.config,
    {"messages": [last_msg]}
)

# 重放
correct_result = graph.invoke(None, config=new_config)
print(f"修复后结果: {correct_result['messages'][-1].content}")
# 输出: 订单 12345 状态：已发货
```

---

## 6. 关键知识点总结

### 6.1 核心要点

| # | 知识点 | 说明 |
| :--- | :--- | :--- |
| 1 | **历史顺序是倒序** | `states[0]` = 最后一步，`states[-1]` = 起点 |
| 2 | **检查点不可变** | 原始检查点永不修改，回溯产生新分支 |
| 3 | **update_state 完全替换** | 会覆盖指定的顶层字段，不是合并 |
| 4 | **必须传入 checkpointer** | 否则状态不会被保存 |
| 5 | **thread_id 是关键** | 同一会话的所有检查点通过它关联 |

### 6.2 三种回溯模式

| 模式 | 是否修改状态 | 代码 | 场景 |
| :--- | :--- | :--- | :--- |
| 纯重放 | 否 | `invoke(None, config)` | 验证确定性 |
| 部分修改 | 是（部分字段） | `update_state(config, {"field": new})` | 修正错误 |
| 完全替换 | 是（全部字段） | `update_state(config, new_state)` | 极端测试 |

### 6.3 检查点生命周期

```
执行前 → 节点1执行 → 保存CP-1 → 节点2执行 → 保存CP-2
                              ↓
                         时间回溯
                              ↓
                       读取CP-1 → 修改状态 → 保存CP-1' → 继续执行
```

---

## 7. 企业级最佳实践

### 7.1 生产环境配置

```python
# 使用持久化存储，而非内存
from langgraph.checkpoint.postgres import PostgresSaver

# 数据库连接
conn_string = "postgresql://user:pass@localhost/db"
with PostgresSaver.from_conn_string(conn_string) as checkpointer:
    checkpointer.setup()  # 创建表
    graph = builder.compile(checkpointer=checkpointer)
```

### 7.2 设计建议

| 建议 | 说明 |
| :--- | :--- |
| 每个用户独立 `thread_id` | 避免状态混淆 |
| 关键节点添加人工确认 | 高风险操作前插入 `interrupt` |
| 结合 LangSmith 追踪 | 可视化查看分支和状态变化 |
| 定期清理过期检查点 | 避免存储无限膨胀 |

### 7.3 何时使用时间回溯

| 使用 | 不使用 |
| :--- | :--- |
| 调试非确定性行为 | 确定性的纯函数流程 |
| 修复历史错误 | 实时在线推理（延迟敏感） |
| 做 What-If 分析 | 简单线性流程 |
| 人机协同审核 | 无状态计算 |

---

## 快速参考卡

```python
# 最常用的4行代码（时间回溯核心操作）
states = list(graph.get_state_history(config))           # 看历史
target = states[2]                                        # 选目标
new_cfg = graph.update_state(target.config, {"key": v})  # 改状态
result = graph.invoke(None, config=new_cfg)              # 回溯执行
```


