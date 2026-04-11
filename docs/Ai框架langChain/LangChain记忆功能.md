---
title: LangChain记忆功能
date: 2026-04-11
abstract: LangChain记忆功能
tags:
- Ai
- langChain
---

# LangChain 记忆功能

## 🤔 为什么需要记忆？

想象一下你在和一个朋友聊天：
- **没有记忆的朋友**：每次见面都像第一次认识你，你每次都要重新介绍自己
- **有记忆的朋友**：记得你说过的话，能延续话题，聊天更自然

大语言模型默认就是那个“没有记忆的朋友”。**LangChain 的记忆功能**，就是给 AI 装上“大脑记忆区”。

---

## 📖 核心原理：三步记忆法

用一张图理解整个流程：

```
┌─────────────────────────────────────────────────────────┐
│                        第1步：读                         │
│  ┌──────────┐    读取历史     ┌──────────┐              │
│  │ 记忆组件  │ ◄───────────── │  用户输入  │              │
│  └──────────┘                 └──────────┘              │
│       │                            │                     │
│       └──────────┬─────────────────┘                     │
│                  ▼                                       │
│         ┌─────────────────┐                             │
│         │   组装提示词      │                             │
│         │ "历史消息 + 新问题" │                             │
│         └─────────────────┘                             │
│                  │                                       │
│                  ▼                                       │
│         ┌─────────────────┐                             │
│         │   大语言模型      │                             │
│         └─────────────────┘                             │
│                  │                                       │
│                  ▼                                       │
│         ┌─────────────────┐                             │
│         │   模型输出        │                             │
│         └─────────────────┘                             │
│                                                         │
│                        第2步：写                         │
│  ┌──────────┐    保存新消息    ┌──────────────────┐     │
│  │ 记忆组件  │ ◄───────────── │ 用户输入 + 模型输出 │     │
│  └──────────┘                 └──────────────────┘     │
│                                                         │
│                     第3步：重复                          │
│              下次调用时，回到第1步                        │
└─────────────────────────────────────────────────────────┘
```

### 代码层面的理解

```python
# 伪代码展示三步法
def chat_with_memory(user_input, memory, llm):
    # 第1步：读 - 获取历史消息
    past_messages = memory.get_messages()
    
    # 组装提示词
    prompt = f"""
    历史对话：{past_messages}
    用户新问题：{user_input}
    请回答：
    """
    
    # 调用模型
    response = llm.invoke(prompt)
    
    # 第2步：写 - 保存本次对话
    memory.add_message(user_input)      # 保存用户输入
    memory.add_message(response)        # 保存AI回复
    
    return response

# 第3步：下次调用自动重复上述过程
```

---

## 🏗️ 核心组件：BaseChatMessageHistory

这是 LangChain 中所有记忆组件的**抽象基类**（可以理解为“模板”）。

### 类图结构

```
┌─────────────────────────────────────────┐
│      BaseChatMessageHistory             │
│         (抽象基类)                       │
├─────────────────────────────────────────┤
│ 属性：                                   │
│  • messages: List[BaseMessage]          │
│    （只读，获取所有历史消息）              │
├─────────────────────────────────────────┤
│ 方法：                                   │
│  • add_message(message)    # 添加单条    │
│  • add_messages(messages)  # 批量添加    │
│  • clear()                 # 清空所有    │
└─────────────────────────────────────────┘
           ▲              ▲              ▲
           │              │              │
           │ 继承         │ 继承         │ 继承
           │              │              │
┌──────────┴──────────┐ ┌─┴─────────────┐ ┌─┴─────────────────┐
│ InMemoryChatMessage │ │FileChatMessage│ │  RedisChatMessage │
│      History        │ │   History     │ │     History       │
├─────────────────────┤ ├───────────────┤ ├───────────────────┤
│ • 存在内存中         │ │ • 存在文件里   │ │ • 存在Redis中      │
│ • 程序重启就丢失     │ │ • 永久保存     │ │ • 高性能，分布式   │
│ • 适合测试          │ │ • 适合单机     │ │ • 适合生产环境     │
└─────────────────────┘ └───────────────┘ └───────────────────┘
```

### 使用示例

```python
from langchain.memory import InMemoryChatMessageHistory

# 创建记忆组件（就像买一个笔记本）
memory = InMemoryChatMessageHistory()

# 写入消息（就像往笔记本里写字）
memory.add_message("用户：你好，我叫小明")
memory.add_message("AI：你好，小明！")

# 读取消息（就像翻开笔记本看）
print(memory.messages)
# 输出：[用户：你好，我叫小明, AI：你好，小明！]

# 清空消息（就像撕掉所有页）
memory.clear()
```

---

## 🔗 配合使用：RunnableWithMessageHistory

`BaseChatMessageHistory` 是“记忆仓库”，`RunnableWithMessageHistory` 是“仓库管理员”。

```python
from langchain.memory import InMemoryChatMessageHistory
from langchain.runnables.history import RunnableWithMessageHistory

# 1. 创建记忆仓库
store = InMemoryChatMessageHistory()

# 2. 创建带记忆的对话链
conversation = RunnableWithMessageHistory(
    runnable=llm_chain,      # 你的LLM链
    get_session_history=lambda session_id: store,  # 获取记忆的方法
)

# 3. 使用（自动处理读写）
response = conversation.invoke(
    "我叫小明",
    config={"configurable": {"session_id": "user_001"}}  # 会话ID
)
```

---

## 🚀 进阶选择：Redis Stack

### 为什么需要 Redis Stack？

| 场景 | InMemory | File | Redis Stack |
|------|----------|------|-------------|
| 程序重启后记忆还在？ | ❌ 丢失 | ✅ 在 | ✅ 在 |
| 多个服务器共享记忆？ | ❌ 不行 | ❌ 不行 | ✅ 可以 |
| 百万用户同时使用？ | ❌ 内存爆炸 | ❌ 文件锁 | ✅ 轻松应对 |
| 需要搜索历史消息？ | ❌ 不支持 | ❌ 不支持 | ✅ 支持全文搜索 |

### Redis Stack vs 原生 Redis

| 功能维度 | 原生 Redis | Redis Stack |
|----------|-----------|-------------|
| 基础数据类型 | 字符串、列表、集合 | ✅ 全部 + JSON、图、时序数据 |
| 查询方式 | 只能根据key查 | ✅ 全文搜索、向量搜索 |
| 典型用途 | 缓存、计数器 | ✅ 实时推荐、AI记忆、知识图谱 |
| 开发体验 | 手动拼逻辑 | ✅ 可视化工具、开发效率高 |

**一句话理解**：Redis Stack 就像给 Redis 装上了“搜索引擎 + 数据类型扩展包”，让它从一个简单的缓存工具，升级为能处理 AI 记忆、知识图谱的现代数据库。

### 安装 Redis Stack

```bash
# 使用 Docker 一键安装（推荐）
docker run -d -p 6379:6379 redis/redis-stack:latest

# Python 安装对应版本
pip install langchain redis redis-stack
```

### 实际使用

```python
from langchain_community.chat_message_histories import RedisChatMessageHistory

# 使用 Redis 作为记忆仓库
memory = RedisChatMessageHistory(
    session_id="user_123",
    url="redis://localhost:6379"
)

# 用法和之前完全一样！
memory.add_message("用户：帮我记住这件事")
memory.add_message("AI：好的，我记住了")

# 即使重启程序，消息依然存在
print(memory.messages)  # 依然能读到历史
```

---

## 📋 快速对照表

| 需求场景 | 推荐方案 |
|---------|---------|
| 本地测试、学习 | `InMemoryChatMessageHistory` |
| 单机应用、需要持久化 | `FileChatMessageHistory` |
| 生产环境、高并发 | `RedisChatMessageHistory` |
| 需要搜索历史消息 | `Redis Stack` |
| 分布式部署 | `Redis Stack` |

---

## 💡 核心要点总结

1. **三步记忆法**：读历史 → 调模型 → 写新消息
2. **BaseChatMessageHistory**：所有记忆组件的“模板”
3. **RunnableWithMessageHistory**：自动管理读写的“管家”
4. **Redis Stack**：生产环境首选，支持高并发和搜索

记忆功能的核心就是把“无状态的 API 调用”变成“有状态的对话体验”。就像给人配上大脑，让 AI 真正能“记住”你说过的话。

## 实际案例

```python
"""
LangChain + Redis 记忆对话系统
特点：简洁、生产可用、支持多会话
"""

from langchain.chat_models import init_chat_model
from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableConfig
import os
import redis
from loguru import logger

# ========== 1. 配置部分 ==========
REDIS_URL = "redis://localhost:6379"  # 你的 Redis 地址

# 创建原生 Redis 客户端（用于手动保存等操作）
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# ========== 2. 初始化大模型 ==========
# 这里以阿里云通义千问为例，你可以换成任何 OpenAI 兼容的模型
llm = init_chat_model(
    model="qwen-plus",                      # 模型名称
    model_provider="openai",                # 使用 OpenAI 兼容接口
    api_key=os.getenv("aliQwen-api"),       # 从环境变量读取 API Key
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"  # 阿里云网关
)

# ========== 3. 创建提示词模板 ==========
# 关键点：使用 MessagesPlaceholder 来动态插入历史消息
prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder("history"),  # 历史消息会插入在这里
    ("human", "{question}")          # 当前用户问题
])

# 最终生成的提示词结构：
# [历史消息1, 历史消息2, ..., 当前用户问题]

# ========== 4. 定义会话历史获取函数 ==========
def get_session_history(session_id: str) -> RedisChatMessageHistory:
    """
    获取或创建会话历史
    session_id: 用户唯一标识（如 user-001, user-002）
    """
    history = RedisChatMessageHistory(
        session_id=session_id,
        url=REDIS_URL,
        # ttl=3600  # 可选：设置过期时间（秒），不设置则永久保存
    )
    return history

# ========== 5. 创建带记忆的链 ==========
# 这是整个记忆功能的核心：RunnableWithMessageHistory
# 它会自动处理：读历史 → 调用模型 → 写历史
chain = RunnableWithMessageHistory(
    prompt | llm,                        # 基础链：提示词 + 模型
    get_session_history,                 # 历史获取函数
    input_messages_key="question",       # 用户输入对应的 key
    history_messages_key="history"       # 历史消息在 prompt 中的占位符名称
)

# ========== 6. 配置会话 ==========
# 不同用户使用不同的 session_id，实现会话隔离
config = RunnableConfig(configurable={"session_id": "user-001"})

# ========== 7. 主程序：交互式对话 ==========
def main():
    print("=" * 50)
    print("🤖 AI 对话助手已启动（带记忆功能）")
    print(f"📱 当前会话 ID: {config['configurable']['session_id']}")
    print("💡 输入 'quit' 退出，输入 'clear' 清空记忆")
    print("=" * 50)
    
    while True:
        # 获取用户输入
        question = input("\n👤 你：")
        
        # 退出命令
        if question.lower() in ['quit', 'exit', 'q']:
            print("👋 再见！")
            break
        
        # 清空记忆命令
        if question.lower() == 'clear':
            history = get_session_history(config['configurable']['session_id'])
            history.clear()
            print("🗑️ 对话记忆已清空")
            continue
        
        try:
            # 调用带记忆的链
            # 这一步会自动完成：
            # 1. 从 Redis 读取历史消息
            # 2. 将历史消息插入到 prompt 的 MessagesPlaceholder
            # 3. 调用 LLM
            # 4. 将用户输入和 AI 回复保存到 Redis
            response = chain.invoke({"question": question}, config)
            
            # 输出 AI 回复
            print(f"🤖 AI：{response.content}")
            
            # 记录日志
            logger.info(f"用户: {question} | AI: {response.content[:50]}...")
            
            # 可选：手动触发 Redis 持久化（默认异步，调用 save() 强制写入磁盘）
            redis_client.save()
            
        except Exception as e:
            logger.error(f"调用失败: {e}")
            print(f"❌ 出错了：{e}")


# ========== 8. 辅助功能：查看历史记录 ==========
def show_history(session_id: str):
    """查看指定会话的历史记录"""
    history = get_session_history(session_id)
    print(f"\n📚 会话 {session_id} 的历史记录：")
    for i, msg in enumerate(history.messages, 1):
        msg_type = "👤 用户" if msg.type == "human" else "🤖 AI"
        print(f"  {i}. {msg_type}: {msg.content}")


# ========== 9. 辅助功能：多会话管理 ==========
def multi_session_demo():
    """演示多会话隔离"""
    users = ["user-001", "user-002"]
    configs = {
        uid: RunnableConfig(configurable={"session_id": uid})
        for uid in users
    }
    
    for uid, cfg in configs.items():
        response = chain.invoke({"question": "我叫" + uid}, cfg)
        print(f"{uid} 说：{response.content}")
    
    # 验证会话隔离：user-001 问自己的名字
    response = chain.invoke({"question": "我叫什么名字？"}, configs["user-001"])
    print(f"\nuser-001 问名字：{response.content}")


if __name__ == "__main__":
    # 运行主程序
    main()
    
    # 可选：查看历史
    # show_history("user-001")
    
    # 可选：多会话演示
    # multi_session_demo()
```

### 数据导向图
```python
用户输入 "我叫张三"
        │
        ▼
┌───────────────────────────────────────────────┐
│         RunnableWithMessageHistory             │
│  ┌─────────────────────────────────────────┐  │
│  │ 1. 调用 get_session_history("user-001") │  │
│  │    └─► 从 Redis 读取历史消息             │  │
│  │                                          │  │
│  │ 2. 构建最终提示词：                       │  │
│  │    [历史消息..., ("human","我叫张三")]    │  │
│  │                                          │  │
│  │ 3. 调用 LLM                              │  │
│  │                                          │  │
│  │ 4. 保存到 Redis：                        │  │
│  │    - HumanMessage("我叫张三")            │  │
│  │    - AIMessage("你好张三，很高兴认识你")  │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
        │
        ▼
    AI 回复 "你好张三，很高兴认识你"
```

## 需要注意redis版本问题

### Redis 版本与 langchain_community 兼容性表

| Redis 版本范围 | 兼容性 | 主要问题 | 推荐程度 |
|---------------|--------|---------|---------|
| **redis < 4.0.0** | ❌ 不兼容 | API 完全不同，`from_url()`、`decode_responses` 等参数不存在 | ❌ 不推荐 |
| **redis 4.0.0 - 4.4.0** | ✅ 兼容 | 基础功能正常，部分高级特性缺失 | ⚠️ 可用但不推荐 |
| **redis 4.4.1 - 4.6.0** | ✅ 完全兼容 | 经过大量生产验证，最稳定 | ⭐ **强烈推荐** |
| **redis 4.6.1 - 4.6.x** | ✅ 兼容 | 修复少量 bug，兼容性良好 | ✅ 推荐 |
| **redis 5.0.0 - 5.0.1** | ⚠️ 部分兼容 | `from_url()` 行为变更，可能出现连接错误 | ⚠️ 谨慎使用 |
| **redis 5.0.2 - 5.0.3** | ⚠️ 有警告 | 弃用警告，功能基本正常 | ⚠️ 可用但避免 |
| **redis 5.1.0+** | ❌ 不兼容 | 同步客户端 API 重构，`RedisChatMessageHistory` 可能完全失效 | ❌ 不推荐 |

---

### 具体错误对照表

| redis 版本 | 典型错误信息 | 解决方案 |
|-----------|-------------|---------|
| `< 4.0.0` | `AttributeError: module 'redis' has no attribute 'from_url'` | 升级到 4.6.0 |
| `5.0.0 - 5.0.1` | `TypeError: Redis.__init__() got an unexpected keyword argument 'decode_responses'` | 降级到 4.6.0 或调整连接方式 |
| `5.0.2 - 5.0.3` | `DeprecationWarning: Redis.from_url() is deprecated` | 降级到 4.6.0 |
| `5.1.0+` | `AttributeError: 'Redis' object has no attribute 'connection_pool'` | 必须降级到 4.6.0 |

---

### 版本选择建议表

| 使用场景 | 推荐版本 | 命令 |
|---------|---------|------|
| 新项目开发 | **4.6.0** | `pip install redis==4.6.0` |
| 生产环境部署 | **4.5.4 - 4.6.0** | `pip install "redis>=4.5.4,<4.6.1"` |
| 已有 5.x 项目 | **降级到 4.6.0** | `pip uninstall redis && pip install redis==4.6.0` |
| 学习测试 | **4.6.0** | `pip install redis==4.6.0` |
| Docker 镜像 | **4.6.0** | `RUN pip install redis==4.6.0` |

---

### 验证版本兼容性代码

```python
import redis
from packaging import version

def check_redis_compatibility():
    """检查当前 redis 版本是否兼容"""
    current = redis.__version__
    compatible = version.parse("4.4.0") <= version.parse(current) <= version.parse("4.6.0")
    
    result = {
        "current_version": current,
        "is_compatible": compatible,
        "recommended_version": "4.6.0"
    }
    
    if not compatible:
        result["action"] = f"请运行: pip install redis==4.6.0"
    
    return result

print(check_redis_compatibility())
```

**一句话总结**：**锁定 `redis==4.6.0` 是最安全的选择**，不要使用 5.x 版本。
