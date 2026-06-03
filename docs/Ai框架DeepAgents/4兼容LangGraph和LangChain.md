---
title: 兼容LangGraph和LangChain
date: 2026-06-03
abstract: langchain家族DeepAgents-兼容LangGraph和LangChain
tags:
- Ai
- DeepAgents
---


#兼容LangGraph和LangChain

## 1.6 兼容LangGraph和LangChain

### 开篇引言：为什么要兼容？

想象一下这个场景：

- **你已经有了一个现成的LangChain Agent**（比如一个能查天气、算数学的智能助手），跑得好好的
- **现在你想把它塞进DeepAgents里**，作为一个子代理，让更高级的主代理来调度它
- **但问题来了**：DeepAgents只认「带有`messages`键的LangGraph图」，不直接认LangChain Agent

**怎么办？** 别担心——LangChain生态下的所有Agent都能转成LangGraph图，所以**最终都能挂载**！

> 💡 **一句话总结**：DeepAgents就像一个“跨国公司的HR部门”，只收一种格式的简历（LangGraph图）。你手里的LangChain Agent是“不同国家的专业人才”，需要把简历“翻译”成公司统一格式——这个过程就是封装。

---

### 1.6.1 核心要求：messages状态键

DeepAgents调度子代理的核心要求只有一个：**子代理的执行逻辑必须是「带有`messages`键的状态图」**。

**为什么必须是`messages`键？**

> **原理**：DeepAgents的主代理与子代理之间的通信协议，完全依赖`messages`数组来传递对话历史、工具调用、工具结果。这是DeepAgents的**硬性接口约定**，类似于REST API的JSON格式要求。

**具体要求**：
- 不管这个图是直接用`StateGraph`写的，还是从其他Agent转来的
- `messages`键是你之前看`result`结构时的核心字段
- 没有这个键，子代理就无法和主代理通信

> **✅ 结论**：所有LangChain Agent都能转成LangGraph图，所以最终都能挂载到DeepAgents。

---

### 1.6.2 封装方式对比：如何选择？

在开始写代码之前，先看看你手里有什么资产，选择合适的封装方式：

| 你的现有资产 | 推荐封装方式 | 工作量 | 参考示例 |
| :--- | :--- | :--- | :--- |
| **LangGraph StateGraph** | 直接封装为`CompiledSubAgent` | 低（只需确认State包含messages） | 1.6.3节 |
| **LangChain `create_agent`** | 直接封装为`CompiledSubAgent` | 极低（一行包装） | 1.6.4节 |
| **自定义Agent类** | 先转为LangGraph图，再封装 | 中等 | 参考LangGraph官方迁移文档 |
| **普通Python函数** | 包装成`@tool` + LangChain Agent，再封装 | 较高 | 建议直接用DeepAgents工具 |

---

### 1.6.3 示例：封装LangGraph图为子代理

> **场景**：当你已经有一个用LangGraph StateGraph构建的工作流，想把它作为一个子代理嵌入DeepAgents时。

**核心三步**：
1. 定义State（必须包含`messages`）
2. 构建/转换Agent为LangGraph图
3. 用`CompiledSubAgent`封装

```python
import os
from typing import TypedDict, Annotated
from dotenv import load_dotenv, find_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from deepagents import create_deep_agent, CompiledSubAgent
from langchain.chat_models import init_chat_model

# 加载环境变量
load_dotenv(find_dotenv())

# ========== 第1步：定义State（必须包含messages） ==========
class SubState(TypedDict):
    messages: Annotated[list, add_messages]  # ← 关键！DeepAgents靠这个通信


# ========== 第2步：定义节点逻辑 ==========
def processing_node(state: SubState):
    print("\n    >>> [子智能体内部] 收到任务，正在处理...")
    
    # 获取主智能体传来的任务描述
    last_msg = state["messages"][-1]
    print(f"    >>> [子智能体内部] 输入内容: {last_msg.content}")
    
    # 模拟处理逻辑
    result_text = f"【已由Graph处理】经核查，业务逻辑处理完毕。原始内容：{last_msg.content}"
    
    print(f"    >>> [子智能体内部] 处理完成，准备返回。\n")
    return {"messages": [AIMessage(content=result_text)]}


# ========== 第3步：构建图并封装 ==========
workflow = StateGraph(SubState)
workflow.add_node("worker", processing_node)
workflow.set_entry_point("worker")
workflow.add_edge("worker", END)
compiled_graph = workflow.compile()

# 封装为 CompiledSubAgent
sub_agent_config = CompiledSubAgent(
    name="complex_worker",
    description="处理复杂业务逻辑、核查任务的子智能体。当用户提到'复杂业务'或'核查'时调用。",
    runnable=compiled_graph
)

# ========== 创建主智能体 ==========
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai"
)

deep_agent = create_deep_agent(
    model=llm,
    subagents=[sub_agent_config],
    system_prompt="你是一个协调员。遇到复杂任务时，必须调用 complex_worker 子智能体处理。"
)

# ========== 运行测试 ==========
if __name__ == "__main__":
    query = "请帮我处理这个复杂业务：核对用户 ID 9527 的数据。"
    print(f"User: {query}")
    print("=" * 60)
    
    for chunk in deep_agent.stream({"messages": [HumanMessage(content=query)]}):
        print(f"chunk结果：: {chunk}")
```

**预期输出示例**：
```text
User: 请帮我处理这个复杂业务：核对用户 ID 9527 的数据。
============================================================

    >>> [子智能体内部] 收到任务，正在处理...
    >>> [子智能体内部] 输入内容: 请帮我处理这个复杂业务：核对用户 ID 9527 的数据。
    >>> [子智能体内部] 处理完成，准备返回。

chunk结果：: {'messages': [AIMessage(content='【已由Graph处理】经核查，业务逻辑处理完毕。原始内容：请帮我处理这个复杂业务：核对用户 ID 9527 的数据。')]}
```

---

### 1.6.4 示例：封装LangChain单智能体

> **场景**：当你已经有一个用LangChain `create_agent`创建的标准Agent，想直接复用时。

以上是封装“自定义LangGraph图”的方式。如果你已经有现成的LangChain Agent（比如用`create_agent`创建的），封装过程更简单——不需要手动定义节点和状态图，直接一步包装即可。

```python
import os
from langchain.chat_models import init_chat_model
from langchain.agents import create_agent
from langchain_core.tools import tool
from deepagents import create_deep_agent, CompiledSubAgent
from dotenv import load_dotenv, find_dotenv

# 加载环境变量
load_dotenv(find_dotenv())

# ========== 第1步：初始化模型 ==========
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai"
)


# ========== 第2步：定义工具 ==========
@tool
def get_weather(city: str) -> str:
    """查询指定城市的天气"""
    return f"{city}的天气是晴朗，25度"


# ========== 第3步：创建LangChain Agent ==========
langchain_agent = create_agent(
    model=llm,
    tools=[get_weather]
)


# ========== 第4步：直接封装为DeepAgents子代理 ==========
weather_subagent = CompiledSubAgent(
    name="weather_subagent",
    description="子任务，可以调用天气工具，查询天气信息！",
    runnable=langchain_agent  # ← 关键：直接传入LangChain Agent
)


# ========== 第5步：创建主智能体 ==========
deep_agent = create_deep_agent(
    model=llm,
    tools=[],  # 主代理本身不带工具
    system_prompt="你是一个智能助手，主要调用子代理实现功能，你只做任务分配，可以调用subagent实现功能！",
    subagents=[weather_subagent]
)


# ========== 运行测试 ==========
result = deep_agent.invoke({
    "messages": [
        {"role": "user", "content": "查询北京的天气！"}
    ]
})

print(f"最终结果：{result['messages'][-1].content}")
```

**预期输出示例**：
```text
最终结果：北京的天气是晴朗，25度
```

> 💡 **注意**：`CompiledSubAgent`的`runnable`参数非常灵活——它可以接受：
> - `CompiledGraph`（LangGraph编译后的图）
> - `CompiledStateGraph`（带状态的图）
> - 任何实现了`invoke`/`ainvoke`和`stream`/`astream`方法的Runnable对象（包括LangChain Agent）

---

### 1.6.5 常见错误与解决方案

> **💡 重要区分**：不同封装方式的错误风险不同
>
> | 封装方式 | 错误风险 | 需要关注的问题 |
> | :--- | :--- | :--- |
> | **封装LangChain Agent**（`create_agent`） | 极低 | 框架自动处理消息，几乎不会出错 |
> | **封装自定义LangGraph图** | 中等 | 需要手动管理`messages`，以下是常见坑点 |

---

#### 针对封装LangChain Agent

用 `CompiledSubAgent(runnable=langchain_agent)` 封装时，LangChain Agent内部已经完整实现了消息管理，**你不需要手动处理任何 `messages`**。以下问题**不会出现**：

- ✅ 不需要定义State中的`messages`字段
- ✅ 不需要手动返回`{"messages": [...]}`
- ✅ 不需要手动处理工具调用的`ToolMessage`

**唯一的注意事项**：确保你的LangChain Agent能正常运行（用`agent.invoke()`测试一下即可）。

---

#### 针对封装自定义LangGraph图

以下错误仅在你手动构建 `StateGraph` 时需要注意：

---

**⚠️ 错误1：忘记定义messages字段**

- **错误表现**：子代理被调用后无响应，或主代理报错 `KeyError: 'messages'`
- **原因**：DeepAgents通过`messages`键与子代理通信，State中缺失该字段
- **解决方案**：State中必须包含 `messages: Annotated[list, add_messages]`

```python
# ✅ 正确
class SubState(TypedDict):
    messages: Annotated[list, add_messages]

# ❌ 错误
class SubState(TypedDict):
    result: str  # 缺少messages字段
```

---

**⚠️ 错误2：节点函数返回格式不对**

- **错误表现**：主代理收到结果后无法解析，或报错 `AttributeError`
- **原因**：DeepAgents期望子代理返回包含`messages`的字典
- **解决方案**：节点函数必须返回 `{"messages": [AIMessage(...)]}` 格式

```python
# ✅ 正确
def my_node(state: SubState):
    return {"messages": [AIMessage(content="处理完成")]}

# ❌ 错误
def my_node(state: SubState):
    return {"result": "处理完成"}  # 缺少messages键
```

---

**⚠️ 错误3：工具调用后未追加ToolMessage**

- **错误表现**：子Agent内部调用工具后，工具结果没有被传回，主代理收不到完整结果
- **原因**：工具返回的结果需要包装成`ToolMessage`并追加到`messages`中
- **解决方案**：工具返回时，必须包装成`ToolMessage`并包含正确的`tool_call_id`

```python
# ✅ 正确
def node_with_tool(state: SubState):
    # 假设模型发起了工具调用
    tool_call = state["messages"][-1].tool_calls[0]
    result = execute_tool(tool_call)  # 执行工具
    return {"messages": [ToolMessage(content=result, tool_call_id=tool_call["id"])]}

# ❌ 错误
def node_with_tool(state: SubState):
    result = execute_tool(...)
    return {"messages": [AIMessage(content=result)]}  # 应该用ToolMessage
```

> **💡 提示**：LangChain Agent内部自动处理工具调用的消息追加。只有手写LangGraph节点时，才需要关注这个问题。

---

#### 快速排查清单

遇到问题时，按以下顺序检查：

1. [ ] 子代理的State是否定义了 `messages: Annotated[list, add_messages]`？（仅自定义图）
2. [ ] 节点函数是否返回了 `{"messages": [...]}` 格式？（仅自定义图）
3. [ ] 工具调用后是否追加了 `ToolMessage`？（仅自定义图+工具调用）
4. [ ] 先用 `agent.invoke()` 单独测试子代理是否能正常运行？

---

### 1.6.6 封装前后对比：价值在哪里？

为什么要费劲封装？直接拿LangChain Agent用不行吗？

| 维度 | 不封装（直接用LangChain Agent） | 封装后（作为DeepAgents子代理） |
| :--- | :--- | :--- |
| **主代理调度** | ❌ 无法被DeepAgents识别 | ✅ 通过`task`工具统一调度 |
| **上下文隔离** | ❌ 会污染主代理上下文窗口 | ✅ 完全隔离，只返回最终结果 |
| **工具权限控制** | ❌ 主代理可能误调用子Agent的工具 | ✅ 工具集物理隔离，各司其职 |
| **多Agent协作** | ❌ 需要自己写调度逻辑 | ✅ DeepAgents内置`task`工具自动调度 |
| **可复用性** | ⚠️ 只能单独使用 | ✅ 可作为模块嵌入更大系统 |

---

### 1.6.7 已知限制与注意事项

1. **嵌套限制**：被封装的子Agent如果再调用其他子Agent，DeepAgents目前不支持跨层级的自动调度。建议保持扁平化结构（主代理 → 一层子代理）。

2. **流式传输**：当子Agent内部有流式输出时，`stream`方法可能不会逐字透传。如果需要完整流式体验，建议在主代理层面处理。

3. **状态持久化**：被封装的LangChain Agent内部状态不会自动持久化到DeepAgents的checkpointer中。如需跨会话记忆，需要在主代理层面管理。

4. **工具冲突**：如果子Agent和主代理有同名工具，DeepAgents会优先使用子Agent的工具。建议做好命名隔离。

---

