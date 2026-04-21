---
title: LangGraph 记忆与持久化
date: 2026-04-21
abstract: LangGraph 记忆与持久化描述,还有Node节点缓存概念的区别对比
tags:
- Ai
- LangGraph
---

# LangGraph 记忆与持久化

## 1. 核心概念：为什么要让 AI “长记性”？

### 1.1 是什么（What）？
在 LangGraph 中，**持久化**指的是将程序运行时的状态（State）保存到硬盘或数据库中，以便程序重启后能够恢复。这主要分为两种：

-   **短期记忆**：基于 **Checkpointer** 机制。自动保存当前会话（线程）的对话历史、中间步骤和操作状态。
-   **长期记忆**：基于 **BaseStore** 机制。手动保存跨会话的用户画像、偏好或知识库。

### 1.2 生活比喻（Analogy）
想象你在开发一个“客服机器人”：

-   **无记忆**：像第一次接电话的新员工，每通电话都要用户重复“我叫张三，我的订单号是...”，效率极低。
-   **短期记忆**：像客服手上的**便签纸**。记录当前这通电话的上下文（刚才说到哪了？是否要查物流？）。挂断电话（程序重启），便签纸就扔掉了。
-   **长期记忆**：像公司的**CRM系统**。即使过了一年，用户再来，系统会弹出“VIP客户张三，上次投诉过物流慢，态度要好”。

### 1.3 官方定义（Official）
-   **Checkpointer**：LangGraph 的“游戏存档”机制。在每个节点执行后自动保存图状态，支持失败恢复、暂停与恢复、时间旅行和审计追踪。
-   **Store**：LangGraph 的存储模块，提供持久化的键值存储，支持跨线程和会话的长期记忆，适用于需持久化数据的复杂工作流。

---

## 2. 短期记忆（Checkpointer）—— 会话上下文管理

### 2.1 核心原理
每次调用 `graph.invoke()`，LangGraph 都会维护一个 `State`。
-   **无 Checkpointer**：State 仅存在于本次调用，结束后即销毁。
-   **有 Checkpointer**：State 被序列化存入外部介质。下次调用时传入相同的 `thread_id`（会话ID），系统自动加载历史状态，实现“续写”。

### 2.2 持久化后端选型（从开发到生产）

| 后端 | 特点 | 一句话总结 | 代码示例 |
| :--- | :--- | :--- | :--- |
| **MemorySaver** | 内存存储，极快，无需依赖，**重启即丢**。 | 仅适合本地开发测试/单元测试。 | `checkpointer=MemorySaver()` |
| **SqliteSaver** | 磁盘文件持久化，轻量级，无需额外服务。 | 适合小体量Demo、个人工具、边缘设备。 | `checkpointer=SqliteSaver.from_conn_string("sqlite.db")` |
| **PostgresSaver** | 数据库持久化，支持高并发、分布式、备份。 | **企业级生产标配**，可靠性和扩展性最佳。 | `checkpointer=PostgresSaver.from_conn_string(DB_URL)` |

### 2.3 代码示例

**MemorySaver（开发测试）**
```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, MessagesState

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "user-001"}}
result = graph.invoke({"messages": [("user", "你好")]}, config=config)
```

**SqliteSaver（轻量生产）**
```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "user-001"}}
result = graph.invoke({"messages": [("user", "你好")]}, config=config)
```

**PostgresSaver（企业生产）**
```python
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

conn_string = "postgresql://user:pass@localhost:5432/langgraph"
with psycopg.connect(conn_string) as conn:
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()  # 仅首次运行需要

graph = builder.compile(checkpointer=checkpointer)
config = {"configurable": {"thread_id": "user-001"}}
result = graph.invoke({"messages": [("user", "你好")]}, config=config)
```

### 2.4 企业级场景实战

**场景**：构建一个**长时运行的自动化数据提取Agent**。用户上传100页PDF，处理到第50页时服务器发布更新重启，必须能从中断处继续，而不是重头开始。

```python
# 第一次调用：处理到一半崩溃
config = {"configurable": {"thread_id": "session_123"}}
for chunk in graph.stream({"messages": [("user", "分析财报")]}, config=config):
    print(chunk)  # 假设执行到一半程序崩溃

# 恢复执行：传入相同 thread_id，自动从断点继续
resume_config = {"configurable": {"thread_id": "session_123"}}
for chunk in graph.stream(None, config=resume_config):
    print(chunk)  # 从中断处继续输出
```

---

## 3. 长期记忆（BaseStore）—— 用户画像与知识库

### 3.1 核心区别
Checkpointer 是**自动**、**频繁**、**线程隔离**的；Store 是**手动**、**低频**、**跨线程共享**的。

**生活比喻**：
-   **Checkpointer**：便签纸，记录“刚才用户说他渴了”。
-   **Store**：病历本，记录“用户有糖尿病，不能喝含糖饮料”。这个信息在用户下次打开App（新线程）时依然存在。

### 3.2 支持的存储后端
-   **InMemoryStore**：测试用。
-   **RedisStore**：高性能键值存储，适合快速读写用户偏好。
-   **AsyncPostgreSQLStore**：支持向量检索的生产级存储。

### 3.3 企业级场景实战

**场景**：智能客服需要记住“用户身份”。用户A第一次告诉机器人“我是VIP会员，喜欢简洁的回答”。10分钟后，用户A刷新页面（开启新会话），机器人应自动应用该偏好。

**代码实现**：
```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
graph = builder.compile(checkpointer=checkpointer, store=store)

def call_model(state, config, store):
    user_id = config["configurable"].get("user_id", "anonymous")
    namespace = ("user_profiles", user_id)
    
    # 读取长期记忆
    memories = store.search(namespace, query="用户偏好", limit=3)
    user_context = memories[0].value.get("preference") if memories else ""
    
    # 写入长期记忆
    if "我是VIP" in state['messages'][-1].content:
        store.put(namespace, "role", {"preference": "concise", "role": "VIP"})
    
    return {"messages": [llm.invoke(f"{user_context}\n{state['messages'][-1]}")]}
```

---

## 4. 补充：节点缓存（Node Cache）

**核心区别一句话**：节点缓存是针对**单次会话内**某个节点结果的临时复用，而持久化（Checkpointer）是针对**多次会话间**整个图状态的长期保存。

```python
from langgraph.types import CachePolicy

# 节点缓存：相同输入的单次会话内复用，TTL过期即丢
cache_policy = CachePolicy(
    key_func=lambda state: state["user_id"],
    ttl=3600
)
graph.add_node("profile_lookup", fetch_user_profile, cache=cache_policy)
```

---

## 5. 总结：一张表看懂所有概念

| 概念 | 存储内容 | 生命周期 | 读写方式 | 生产必选 |
| :--- | :--- | :--- | :--- | :--- |
| **节点缓存** | 节点输出结果 | TTL 过期（分钟/小时） | 框架自动，按节点配置 | 视场景（有昂贵操作时） |
| **Checkpointer** | 对话历史、执行进度、中断点 | 跨多次 invoke（thread_id） | 框架自动保存/加载 | **是**（否则无法恢复长任务） |
| **BaseStore** | 用户偏好、身份、知识库 | 永久/跨所有会话 | 开发者手动 API 读写 | 视场景（To C 必备） |

### 一句话记住
- **节点缓存**：避免重复干同样的活（性能优化）
- **Checkpointer**：防止干到一半的活丢了（故障恢复）
- **Store**：记住用户是个什么样的人（个性化）
