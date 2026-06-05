---
title: Middleware 核心概念
date: 2026-06-05
abstract: langchain家族DeepAgents-Middleware 核心概念
tags:
- Ai
- DeepAgents
---

# Middleware 核心概念

## 1.9 Middleware 核心概念

> **生活中的小比喻**：想象一下你打电话给客服（这就像Agent调用一个工具）。通话前客服要报工号（前置日志），通话中解决问题（执行工具），通话后客服请你评分（后置日志）。Middleware 就是这个“客服流程管理系统”，让你能自由定义“报工号”、“评分”等环节，而不需要改动客服本身的工作流程。

Middleware 是 DeepAgents 的「流程拦截器」，可以在 Agent 执行的**关键生命周期节点**（如工具调用前 / 后、思考完成后、回复生成前）插入自定义逻辑，实现：

- **操作日志记录**（就像飞机的黑匣子，记录每一步）
- **权限校验 / 参数过滤**（就像小区门口的保安，核对来访者身份和携带物品）
- **工具调用结果修改**（就像翻译官，把外文结果翻译成中文再交给Agent）
- **异常捕获 / 兜底处理**（就像汽车的备胎，出问题时顶上）
- **自定义监控 / 告警**（就像体检报告，告诉你哪里指标异常）

### 案例目标

实现一个中间件，进行日志输出：
1. **工具调用前日志**：记录调用的工具名和参数；
2. **工具调用后日志**：记录工具执行结果和耗时。

### 代码执行流程预览

```
用户提问："帮我计算 100 + 200"
    ↓
Agent 思考：需要调用 add_numbers 工具
    ↓
【前置中间件触发】→ 打印：工具调用开始，参数 a=100, b=200
    ↓
执行 add_numbers 工具（真正的加法计算）
    ↓
【后置中间件触发】→ 打印：工具调用完成，结果=300，耗时0.52秒
    ↓
Agent 生成最终回复："300"
    ↓
用户看到结果
```

### @wrap_tool_call 实现

```python
# -*- coding: utf-8 -*-
"""
DeepAgents Middleware 极简案例
核心：实现工具调用的日志监控中间件
"""
import os
import time

from langchain.agents.middleware import wrap_tool_call
# ToolCallRequest 类型在本例中未显式使用，故删除未使用的导入
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import InMemorySaver
from dotenv import load_dotenv, find_dotenv

# 加载 .env 文件中的环境变量（如 API Key、模型名称等配置）
load_dotenv(find_dotenv())


# ======================== 1. 定义测试工具 ========================
@tool
def add_numbers(a: int, b: int):
    """计算两个数字的和"""
    time.sleep(0.5)  # 模拟耗时操作
    result = a + b
    print(f"[工具执行] {a} + {b} = {result}")
    return result


# ======================== 2. 定义中间件 ========================
# @wrap_tool_call 是 DeepAgents 提供的"魔法开关"
# 它能把下面这个普通函数自动包装成一个标准的中间件
# 就像给工具外面裹了一层糖纸，糖纸上可以写你想要的任何信息
@wrap_tool_call
def log_tool_call(request, handler):
    """
    工具调用日志中间件

    参数:
        request: ToolCallRequest 对象，包含 tool_call 属性（工具名和参数）
        handler: 接力函数，调用它将执行真正的工具（或下一个中间件）

    返回:
        工具执行结果（原样返回，不做修改）
    """
    tool_name = request.tool_call["name"]
    tool_args = request.tool_call["args"]

    # 1. 前置逻辑：工具调用前执行
    print(f"\n[前置中间件] 工具调用开始 - 工具名: {tool_name}, 参数: {tool_args}, 时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    start_time = time.time()

    # 2. 执行工具（把接力棒传下去）
    result = handler(request)

    end_time = time.time()
    duration = end_time - start_time

    # 3. 后置逻辑：工具调用后执行
    # 小贴士：为什么用 getattr 而不是直接 result.content？
    # 因为 handler 返回的可能是一个普通字符串，也可能是 ToolMessage 对象
    # 这么写能保证无论返回什么，程序都不会崩溃，非常健壮
    content = getattr(result, "content", str(result))
    print(f"[后置中间件] 工具调用完成 - 工具名: {tool_name}, 结果: {content}, 耗时: {duration:.2f}秒")

    return result


# ======================== 3. 配置Agent并绑定Middleware ========================
# 初始化LLM
# 注意：请根据你的实际模型配置修改环境变量名，例如 "OPENAI_MODEL"、"QWEN_MODEL" 等
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),  # 示例变量名，请替换为你的实际配置
    model_provider="openai"
)

# 创建Agent，绑定中间件
deep_agent = create_deep_agent(
    model=llm,
    tools=[add_numbers],
    checkpointer=InMemorySaver(),  # 内存检查点存储器，用于保存会话状态（如对话历史）
    # 绑定中间件：传入 Middleware 实例列表
    # 注意：多个中间件按列表顺序形成"洋葱模型"（外层中间件先执行前置，后执行后置）
    middleware=[log_tool_call],
    system_prompt="你是一个计算器助手，使用add_numbers工具完成加法计算，回答仅返回计算结果。"
)


# ======================== 4. 执行测试 ========================
if __name__ == "__main__":
    # 会话配置：thread_id 用于区分不同会话，相同 thread_id 可恢复历史对话
    thread_config = {"configurable": {"thread_id": "middleware_test_1"}}

    # 调用Agent
    result = deep_agent.invoke(
        {
            "messages": [
                {"role": "user", "content": "帮我计算 100 + 200 的结果"}
            ]
        },
        config=thread_config
    )

    # 输出最终回复（取消息列表中最后一条消息的内容）
    print("\n=== 最终回复 ===")
    print(result["messages"][-1].content)
```

### 预期输出结果

当你运行上述代码时，终端会显示类似下面的内容：

```
[前置中间件] 工具调用开始 - 工具名: add_numbers, 参数: {'a': 100, 'b': 200}, 时间: 2025-01-15 14:30:25
[工具执行] 100 + 200 = 300
[后置中间件] 工具调用完成 - 工具名: add_numbers, 结果: 300, 耗时: 0.52秒

=== 最终回复 ===
300
```

### 小贴士 & 思考题

**💡 关键知识点**
- `@wrap_tool_call` 装饰器：让你用写普通函数的方式定义中间件，框架会自动帮你包装成标准格式。
- `handler` 参数：它是一个回调函数，代表“继续执行链条”。调用它就是把控制权交给真正的工具或下一个中间件。
- `getattr(result, "content", str(result))`：这是一行防御性代码，无论 result 是对象还是字符串，都能正确提取内容。

**🤔 思考题**
- 如果你想统计一个会话中用户一共调用了多少次工具，应该把计数器加在前置逻辑还是后置逻辑？为什么？
- 如果绑定了多个中间件，它们的执行顺序是怎样的？（提示：洋葱模型，先进后出）

**⚠️ 注意事项**
- 确保环境变量 `LLM_QWEN_MAX` 已正确配置（或替换为你实际使用的模型变量名），否则模型初始化会失败。
- 中间件中的耗时统计包含了工具本身的执行时间，但不包含 Agent 思考的时间。
- 本示例使用 `InMemorySaver`，会话状态存储在内存中，程序重启后历史记录会丢失。生产环境可替换为持久化存储（如 RedisSaver）。

---
