---
title: DeepAgents快速入门
date: 2026-06-02
abstract: langchain家族DeepAgents快速入门
tags:
- Ai
- DeepAgents
---

# DeepAgents快速入门

## 1.3 DeepAgents快速入门

快速构建第一个 Deep Agent：**一个能够自主联网搜索并撰写报告的“AI 研究员”**会借用Tavily网络搜索工具！

**步骤1：安装依赖**

```cmd
uv方式:

# 初始化项目
cd ~/DeepAgentsTest
uv init

# 添加依赖
uv add deepagents tavily-python python-dotenv langchain-openai

# 创建虚拟环境
/opt/homebrew/bin/python3.12 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate
```

```cmd
pip方式:

pip install deepagents tavily-python python-dotenv langchain-openai
```

**步骤2：配置 API Key**

确保你拥有 LLM  和 Tavily (搜索) 的 API Key。位置：`.env`

```bash
# OPENAI风格配置
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=sk-6296bb4dab98463689911fd07a973c97
LLM_QWEN3=qwen3-32b
LLM_QWEN_MAX=qwen-max

#https://app.tavily.com/
#tavily-api-key
TAVILY_API_KEY=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
```

**步骤3：定义搜索工具**

DeepAgents 需要通过工具与外部世界交互。我们先定义一个简单的联网搜索工具。

位置：`tavily_tools.py`

```python
from typing import Literal
from langchain.tools import tool
from tavily import TavilyClient
from dotenv import load_dotenv,find_dotenv
import os

# 加载 .env文件
load_dotenv(find_dotenv())

# 创建tavily_client
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

# 定义搜索工具
@tool
def internet_search(
        query:str,
        max_results:int =10,
        topic:Literal["general","news","finance"] = "general",
        include_raw_content:bool = False):
    """
    互联网搜索工具！
    :param query: 搜索关键字
    :param max_results: 返回结果数量
    :param topic: 主题类型
    :param include_raw_content: False精简 True 返回详细结果
    :return: 搜索结果列表
    """
    print(f"进行网络搜索！搜索条件：{query},搜索主题类别:{topic},搜索最大的条数：{max_results}")
    return tavily_client.search(
        query=query,
        max_results=max_results,
        topic=topic,
        include_raw_content=include_raw_content
    )
```

**步骤4：创建 Deep Agent**

通过 `create_deep_agent` 工厂函数，将工具和 System Prompt 组装成一个智能体。

```python
from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
import os
from dotenv import load_dotenv, find_dotenv

from base.tavily_tool import internet_search

# 使用 find_dotenv() 自动查找 .env 文件，无论你在哪个目录下运行脚本都能正确加载环境变量
load_dotenv(find_dotenv())

# 极简初始化（自动读取OPENAI环境变量）
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai"
)

# api地址 https://reference.langchain.com/python/deepagents/graph/
# 功能等价于langchain的 create_agent
deep_agent = create_deep_agent(
    model=llm,
    tools=[internet_search],
    subagents=[],
    system_prompt="""
      你是一位专家级研究员。你的任务是进行深入研究并撰写一份精美的报告。
      你有权使用 internet_search 工具来收集信息。
    """
)
```

**步骤5：运行并获取结果**

```python
# 运行代理
prompt = input("输入你关心的问题！")
result = deep_agent.invoke({
    "messages":[
        {"role":"user","content":f"{prompt}"}
    ]
})
#result = main_agent.invoke({"inout":"人工智能和机器人的热点新闻！！"})

"""
结果数据说明
 {
    "messages": [
        # 第0条：你的提问（HumanMessage）
        HumanMessage(content='搜索宇树机器人的新闻！'),
        # 第1条：Agent 调用工具的指令（AIMessage，内容为空，仅触发工具）
        AIMessage(content='', tool_calls=[{'name':'internet_search', ...}]),
        # 第2条：工具返回的搜索结果（ToolMessage，一堆JSON数据）
        ToolMessage(content='{"query":"宇树机器人 新闻","results":[...]}'),
        # 第3条：Agent 整理后的最终回复（AIMessage，这是你要的内容）
        AIMessage(content='以下是关于宇树机器人的一些最新新闻：...')
    ]
}
"""
print(result['messages'][-1].content)
```

总结

1. `result['messages']`：定位到存储全流程对话的列表；
2. `[-1]`：精准抓取列表最后一条（Agent 整理后的最终回复）；
3. `.content`：过滤掉所有冗余属性，只取纯文本回复内容。

## 1.4 DeepAgents流式处理结果解析（重点）

深度代理基于 LangGraph 的流基础设施构建，提供一流的子代理流支持。当深度代理将工作委派给子代理时，你可以独立从每个子代理处流式更新——实时跟踪进展、LLM 令牌和工具调用

```python
# 运行代理
# 输入：查询机器人最新的热点
prompt = input("输入你关心的问题！")
# 同步流
stream = deep_agent.stream({
    "messages":[
        {"role":"user","content":f"{prompt}"}
    ]
})
# =============================================================================
# Chunk 数据结构参考文档 (Python 对象视图)
# =============================================================================
# LangGraph 流式输出 (chunk) 的四种核心场景示例：
# 1. [场景 A：Agent 思考并决定调用工具]
#    {
#      "model": {
#        "messages": [
#          AIMessage(
#            content="",
#            tool_calls=[{
#              "name": "read_file_content",
#              "args": {"filename": "需求.docx"},
#              "id": "call_123"
#            }]
#          )
#        ]
#      }
#    }
# 2. [场景 B：工具执行完毕，返回结果]
#    {
#      "tools": {
#        "messages": [
#          ToolMessage(
#            content="[文件内容]...",
#            name="read_file_content",
#            tool_call_id="call_123"
#          )
#        ]
#      }
#    }
# 3. [场景 C：Agent 决定调用子 Agent (特殊工具 'task')]
#    {
#      "model": {
#        "messages": [
#          AIMessage(
#            content="",
#            tool_calls=[{
#              "name": "task",
#              "args": {
#                "subagent_type": "网络搜索助手",  # 目标子 Agent
#                "description": "查询2024政策"     # 下发的具体任务
#              },
#              "id": "call_456"
#            }]
#          )
#        ]
#      }
#    }
# 4. [场景 D：Agent 最终回复用户]
#    {
#      "model": {
#        "messages": [
#          AIMessage(
#            content="根据查询结果，2024年新政策如下...",
#            tool_calls=[]
#          )
#        ]
#      }
#    }
# =============================================================================
for chunk in stream:
    """
        # 场景1：单个节点更新（常见）
        chunk = {
            "model": {"messages": [AIMessage(content='', tool_calls=[...])]}  # 仅模型节点更新
        }
        
        # 场景2：多个节点同时更新（少数但存在）
        chunk = {
            "model": {"messages": [AIMessage(content='最终回复...')]},  # 模型节点
            "tools": {"messages": [ToolMessage(content='工具结果...')]},  # 工具节点
            "todos": {"todos_list": ["已完成：搜索宇树机器人新闻"]}       # 待办节点
        }
    """
    for node_name, state in chunk.items():
        print(f"本次处理的节点类型{node_name}")
        # 有些中间节点 例如：TodoListMiddleware 没有 messages跳过！
        if not state or "messages" not in state: continue
        # 有的直接获取
        messages = state["messages"]
        # message不为null!并且是集合类型
        if messages and isinstance(messages, list):
            # 获取最后一条就是最终结果
            last_msg = messages[-1]
            # 1. 模型节点 (model)：决定下一步行动
            if node_name == "model":
                # 如果有 tool_calls，说明模型决定调用工具或子智能体
                if last_msg.tool_calls:
                    for tool_call in last_msg.tool_calls:
                        if tool_call['name'] == 'task':
                            sub_agent = tool_call['args'].get('subagent_type')
                            print(f"[模型决策] 呼叫子智能体: {sub_agent}")
                        else:
                            print(f"[模型决策] 调用工具: {tool_call['name']},参数为：{tool_call['args']}")
                # 如果没有 tool_calls 且有 content，说明是最终回复
                elif last_msg.content:
                    print(f"📝 [最终回复] {last_msg.content}")
            # 2. 工具节点 (tools)：显示工具/子智能体的执行结果
            elif node_name == "tools":
                # ToolMessage 的 content 是工具返回的原始数据 (可能是 JSON 字符串)
                # 建议只打印前 100 个字符，避免刷屏
                # 展开成普通if-else，更易理解
                content_preview = ''
                if len(last_msg.content) > 100:
                    # 取前100个字符 + 省略号（截断预览）
                    content_preview = last_msg.content[:100] + "..."
                else:
                    # 内容较短，直接完整显示
                    content_preview = last_msg.content
                print(f"[执行结果] {content_preview}")
```



**解读返回结果：**

场景 1：智能体前置处理（before_agent 节点）

节点名：`PatchToolCallsMiddleware.before_agent`

核心含义：接收用户输入，格式化 / 校验消息

```json
{
  "PatchToolCallsMiddleware.before_agent": {
    "messages": Overwrite(  # LangChain 自定义Overwrite对象
      value=[  # 核心数据在value字段
        HumanMessage(  # 用户消息对象
          content="北京今天天气怎么样？",  # 用户提问内容
          additional_kwargs={},
          response_metadata={},
          id="466118de-5cdb-4250-a57f-bacf28b6407a"  # 消息唯一ID
        )
      ]
    )
  }
}
```

场景 2：模型思考（决定调用工具）（model 节点）

节点名：`model`

核心含义：大模型分析问题，决定调用工具 / 子代理（无直接回答）

```json
{
  "model": {
    "messages": [
      AIMessage(  # 模型消息对象
        content="",  # 内容为空（因为要调用工具）
        additional_kwargs={"refusal": None},
        response_metadata={  # 模型元数据
          "token_usage": {"completion_tokens": 30, "prompt_tokens": 5265, "total_tokens": 5295},
          "model_provider": "openai",
          "model_name": "qwen-max",
          "finish_reason": "tool_calls"  # 结束原因：调用工具
        },
        id="lc_run--019c6f4e-9c10-7ae0-966a-5788f78b2017-0",
        tool_calls=[  # 模型决定调用的工具列表
          {
            "name": "task",  # 工具/子任务名
            "args": {  # 工具参数
              "subagent_type": "weather_helper",
              "description": "查询北京今天的天气情况。"
            },
            "id": "call_232308d358d64454905543",
            "type": "tool_call"
          }
        ],
        invalid_tool_calls=[],
        usage_metadata={"input_tokens": 5265, "output_tokens": 30}
      }
    ]
  }
}
```

子智能体：`name="task"`，`args` 含 `subagent_type`/`description`；

自定义工具：`name=工具名`，`args` 含工具自有参数（如`query`）；

场景 3：模型后置钩子（after_model 节点）

节点名：`TodoListMiddleware.after_model`

核心含义：模型执行完成的空钩子（无实际业务数据）

```json
{
  "TodoListMiddleware.after_model": None
}
```

场景 4：工具 / 子代理执行（tools 节点）

节点名：`tools`

核心含义：执行工具调用，返回外部数据（如天气、搜索结果）

```json
{
  "tools": {
    "messages": [
      ToolMessage(  # 工具消息对象
        content='{"query": "DeepAgents", "results": [{"url": "...", "title": "deepagents - PyPI", "content": "..."}]}',  # 实际返回的是 JSON 字符串
        name="internet_search",  # 对应调用的工具名 (例如 internet_search)
        id="81d0bddd-30de-4874-baac-0bca8aa38936",
        tool_call_id="call_232308d358d64454905543"  # 关联模型调用的工具ID
      )
    ]
  }
}
```

场景 5：模型生成最终回答（model 节点）

节点名：`model`

核心含义：模型基于工具结果，生成自然语言最终回答

```json
{
  "model": {
    "messages": [
      AIMessage(
        content="今天北京的天气晴朗，气温25度，非常适合出游。",  # 最终回答内容
        additional_kwargs={"refusal": None},
        response_metadata={
          "token_usage": {"completion_tokens": 17, "prompt_tokens": 5318, "total_tokens": 5335},
          "finish_reason": "stop"  # 结束原因：正常完成
        },
        id="lc_run--019c6f4e-af53-7ca3-aee6-9f386be2ac78-0",
        tool_calls=[],  # 无工具调用（已完成回答）
        usage_metadata={"input_tokens": 5318, "output_tokens": 17}
      )
    ]
  }
}
```


### 异步流式代码

```python
import asyncio
from agent import deep_agent

async def async_stream():
    """异步流式处理示例"""
    prompt = input("🤔 请输入您关心的问题：")
    
    print("\n🔄 开始流式处理...\n")
    
    # 创建流（异步版本使用 astream）
    stream = deep_agent.astream({
        "messages": [
            {"role": "user", "content": prompt}
        ]
    })
    
    # 处理流式数据（异步迭代）
    async for chunk in stream:
        for node_name, state in chunk.items():
            print(f"📍 处理节点: {node_name}")
            
            # 跳过没有消息的节点
            if not state or "messages" not in state:
                continue
            
            messages = state["messages"]
            if not messages or not isinstance(messages, list):
                continue
            
            last_msg = messages[-1]
            
            # 1. 模型节点：决定下一步行动
            if node_name == "model":
                if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
                    for tool_call in last_msg.tool_calls:
                        if tool_call['name'] == 'task':
                            sub_agent = tool_call['args'].get('subagent_type')
                            print(f"🤖 [模型决策] 呼叫子智能体: {sub_agent}")
                        else:
                            print(f"🔧 [模型决策] 调用工具: {tool_call['name']}")
                            print(f"   参数: {tool_call['args']}")
                
                elif hasattr(last_msg, 'content') and last_msg.content:
                    print(f"💬 [模型回复] {last_msg.content[:200]}...")
            
            # 2. 工具节点：显示执行结果
            elif node_name == "tools":
                content_preview = last_msg.content[:100] + "..." if len(last_msg.content) > 100 else last_msg.content
                print(f"✅ [执行结果] {content_preview}")

if __name__ == "__main__":
    asyncio.run(async_stream())
```
