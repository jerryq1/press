---
title: ChatPromptTemplate 指南
date: 2026-04-09
abstract: ChatPromptTemplate 指南
tags:
- Ai
- langChain
---

# LangChain 核心组件：ChatPromptTemplate 指南

### 1. 概述：什么是 ChatPromptTemplate？

`ChatPromptTemplate` 是 LangChain 中专门用于**构建结构化聊天对话提示**的核心组件。与普通的 `PromptTemplate`（适用于单轮文本补全）不同，它原生支持多角色（System, Human, AI）、多轮次的对话场景，能为现代聊天模型（如 GPT-4, Claude 等）提供上下文丰富、会话友好的交互格式。

### 2. 核心概念：消息类型 (Message Types)

在构建对话提示前，需要理解三种基础消息角色，LangChain 提供了对应的类：

| 角色 | 类名 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| **系统** | `SystemMessage` | 设定 AI 的行为、角色或规则。 | `SystemMessage(content="你是一个AI开发工程师")` |
| **用户** | `HumanMessage` | 代表用户发送给 AI 的输入。 | `HumanMessage(content="你能开发哪些AI应用？")` |
| **AI** | `AIMessage` | 代表 AI 模型的回复，可用于提供示例对话。 | `AIMessage(content="我能开发聊天机器人、图像识别等应用。")` |

### 3. 创建 ChatPromptTemplate 的两种主要方式

虽然可以通过构造函数直接传入消息列表，但更常用、更灵活的是 `from_messages` 类方法。

#### 方式一：使用 `from_messages` 类方法（推荐）

`from_messages` 接受一个 `messages` 参数，该参数是一个列表，列表中的每个元素支持多种格式。

**支持的格式类型与示例：**

| 格式类型 | 格式示例 | 说明 |
| :--- | :--- | :--- |
| **元组 (tuple)** 列表 | `[("system", "你是一个专家"), ("human", "你好"), ("ai", "你好")]` | 最简洁，角色使用字符串名。 |
| **字典 (dict)** 列表 | `[{"role": "system", "content": "你是一个专家"}, {"role": "user", "content": "你好"}]` | 结构清晰，类似 API 请求格式。 |
| **Message 类** 列表 | `[SystemMessage(content="你是一个专家"), HumanMessage(content="你好")]` | 直接使用消息对象，类型安全。 |

**代码示例：**

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# 示例1：使用元组列表（最常用）
template1 = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}专家。"),
    ("human", "请解释一下{concept}。")
])

# 示例2：混合使用 Message 类和元组
template2 = ChatPromptTemplate.from_messages([
    SystemMessage(content="你是一个乐于助人的助手。"),
    ("human", "我的问题是：{question}")
])

# 示例3：包含 AI 消息的示例对话
template3 = ChatPromptTemplate.from_messages([
    ("system", "你是一个数学老师。"),
    ("human", "1+1等于几？"),
    ("ai", "1+1等于2。"),
    ("human", "那{num}+{num}呢？")
])
```

#### 方式二：使用构造函数（较少用）

直接使用 `ChatPromptTemplate(messages=...)`，参数类型与 `from_messages` 类似。

### 4. 高级功能：MessagesPlaceholder（消息占位符）

#### 4.1 是什么？为什么需要它？

在某些动态场景中，我们事先**不知道**要插入多少条消息，或者消息是运行时生成的（例如：从数据库中读取的**聊天历史记录**）。这时可以使用 `MessagesPlaceholder` 作为一个“占位符”，在调用 `invoke` 时动态插入一组消息。

#### 4.2 显式使用 MessagesPlaceholder

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

# 创建一个带占位符的模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个友好的客服。"),
    MessagesPlaceholder(variable_name="chat_history"),  # 关键占位符
    ("human", "{user_input}")
])

# 准备动态的聊天历史
chat_history = [
    HumanMessage(content="我的订单什么时候到？"),
    AIMessage(content="请提供您的订单号。"),
    HumanMessage(content="12345")
]

# 调用时传入占位符所需的数据
final_prompt = prompt.invoke({
    "chat_history": chat_history,
    "user_input": "订单号是12345，现在能查了吗？"
})

# final_prompt 将包含：系统消息 + 整个历史对话 + 最新用户输入
```

#### 4.3 隐式使用 MessagesPlaceholder

当使用 `format_messages` 或直接将消息列表作为变量传入时，LangChain 内部会自动处理，效果类似于显式占位符，但显式方式更具可读性和可控性。

### 5. 完整示例：从创建到调用

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# 1. 定义模板
prompt = ChatPromptTemplate.from_messages([
    SystemMessage(content="你是一个{role}，请用{language}回答。"),
    ("human", "{question}")
])

# 2. 部分格式化（可选）
partial_prompt = prompt.partial(role="AI编程导师", language="中文")

# 3. 最终调用，生成可用于模型的消息列表
messages = partial_prompt.format_messages(question="什么是递归？")

# 4. 查看结果
for msg in messages:
    print(f"{msg.type}: {msg.content}")
# 输出:
# system: 你是一个AI编程导师，请用中文回答。
# human: 什么是递归？
```

### 6. 总结对比：ChatPromptTemplate vs PromptTemplate

| 特性 | ChatPromptTemplate | PromptTemplate |
| :--- | :--- | :--- |
| **适用场景** | 多轮对话、多角色（系统/用户/AI） | 单轮文本生成、指令型任务 |
| **消息结构** | 支持 System, Human, AI 消息列表 | 单个字符串模板 |
| **核心方法** | `from_messages` | `from_template` |
| **占位符** | `MessagesPlaceholder`（用于动态消息列表） | 普通变量 `{variable}` |
| **输出类型** | `List[BaseMessage]` | `String` |

