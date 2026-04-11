---
title: LangChain 工具(Tool)
date: 2026-04-11
abstract: LangChain 工具(Tool)描述
tags:
- Ai
- langChain
---

# LangChain 工具（Tool）

## 学习路径

1. 理解 Tool 是什么（概念篇）
2. 为什么需要 Tool（动机篇）
3. Tool 的核心机制（原理篇）
4. 如何创建 Tool（实践篇）
5. 完整项目串联（整合篇）

---

## 第一部分：Tool 核心概念

### 什么是 Tool？

**一句话定义**：Tool 是 LangChain 中让 LLM（大语言模型）能够**调用外部函数**的桥梁。

**比喻理解**：

```
LLM = 一个聪明的实习生，知识渊博但手无缚鸡之力
Tool = 给实习生配备的各种工具（计算器、温度计、搜索引擎）

没有 Tool：实习生只能动嘴说"我猜天气可能是..."
有 Tool：实习生可以拿出温度计实测"温度是28℃"
```

### 为什么需要 Tool？

LLM 有三个天生的**缺陷**：

| 缺陷 | 说明 | Tool 如何解决 |
|------|------|---------------|
| 无法获取实时信息 | 训练数据截止于某个时间点 | 通过 Tool 调用 API 获取最新数据 |
| 无法执行精确计算 | 复杂数学计算容易出错 | 通过 Tool 调用计算器、代码解释器 |
| 无法操作外部系统 | 不能发邮件、查数据库 | 通过 Tool 调用相应函数 |

**真实案例**：
```python
# LLM 自己做不到的事：
"帮我查一下北京现在的天气"     # 需要实时数据
"计算 12345 * 67890"          # 可能算错
"把这封邮件发给老板"           # 无法操作邮箱

# 有了 Tool 就能做到：
get_weather("Beijing")        # 调用天气 API
calculator("12345 * 67890")   # 精确计算
send_email(contents)          # 调用邮件服务
```

### Tool 的核心机制

Tool 本质上是一个**适配器**，它做了三件事：

```python
# 1. 包装普通函数
def my_function(x):
    return x * 2

# 2. 添加元数据（让 LLM 能理解）
tool = Tool(
    name="double_number",           # 工具名称
    description="将数字翻倍",        # 工具描述（LLM 会读）
    func=my_function                 # 实际执行的函数
)

# 3. 提供统一接口
tool.invoke(5)    # 输出: 10
```

**关键洞察**：LLM 不能直接执行 Python 代码，但 LLM 能**生成 JSON 格式的工具调用请求**，LangChain 负责**解析请求并执行真实函数**。

---

## 第二部分：创建 Tool 的三种方式

### 方式一：`@tool` 装饰器（最推荐）

```python
from langchain_core.tools import tool

@tool
def get_weather(loc):
    """
    查询即时天气函数
    
    :param loc: 城市英文名，如 'Beijing'
    :return: JSON 格式的天气数据
    """
    # 函数实现...
    return weather_data

# 自动获得的属性
print(get_weather.name)        # "get_weather"
print(get_weather.description) # "查询即时天气函数..."
```

**装饰器做了什么？**

```python
# 你写的代码
@tool
def get_weather(loc):
    pass

# 等价于（简化版）
def get_weather(loc):
    pass
get_weather = Tool(
    name="get_weather",
    description=get_weather.__doc__,
    func=get_weather
)
```

### 方式二：继承 BaseTool 类

```python
from langchain_core.tools import BaseTool

class GetWeatherTool(BaseTool):
    name = "get_weather"
    description = "查询即时天气函数"
    
    def _run(self, loc: str) -> str:
        # 实现逻辑
        return weather_data

tool = GetWeatherTool()
```

### 方式三：直接实例化 Tool 类

```python
from langchain_core.tools import Tool

def get_weather_func(loc):
    # 实现逻辑
    return weather_data

tool = Tool(
    name="get_weather",
    description="查询即时天气函数",
    func=get_weather_func
)
```

### 三种方式对比

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| @tool 装饰器 | 简洁、自动生成元数据 | 不够灵活 | 大多数情况，推荐使用 |
| 继承 BaseTool | 完全可控、支持异步 | 代码较多 | 需要复杂定制时 |
| 实例化 Tool | 灵活、可动态创建 | 需手动维护描述 | 动态生成工具时 |

---

## 第三部分：深入理解 Tool 的工作流程

### 完整调用链路

```
用户输入: "北京天气怎么样？"
    ↓
【步骤1】LLM 接收输入，判断需要调用工具
    ↓
【步骤2】LLM 输出工具调用请求（JSON格式）
    {
      "name": "get_weather",
      "arguments": {"loc": "Beijing"}
    }
    ↓
【步骤3】LangChain 解析请求，找到对应的 Tool 对象
    ↓
【步骤4】调用 tool.invoke(loc="Beijing")
    ↓
【步骤5】执行真实的 get_weather 函数
    ↓
【步骤6】将结果返回给 LLM
    ↓
【步骤7】LLM 根据结果生成最终回答
```

### Tool 对象的内部结构

```python
@tool
def get_weather(loc):
    """查询天气"""
    return {"temp": 28}

# 实际生成的对象包含：
get_weather.name          # "get_weather"
get_weather.description   # "查询天气"
get_weather.args_schema   # 自动生成的参数校验模型
get_weather.func          # 原始函数
get_weather.invoke()      # 统一调用接口
get_weather.batch()       # 批量调用
get_weather.map()         # 并行映射
```

---

## 第四部分：实战代码解析（天气查询工具）

### 完整的工具定义

```python
from langchain_core.tools import tool
import json
import os
import httpx

@tool
def get_weather(loc):
    """
    查询即时天气函数

    :param loc: 必要参数，字符串类型，用于表示查询天气的具体城市名称。
                注意，中国的城市需要用对应城市的英文名称代替，例如如果需要查询北京市天气，
                则 loc 参数需要输入 'Beijing'/'shanghai'。
    :return: OpenWeather API 查询即时天气的结果。具体 URL 请求地址为：
             https://home.openweathermap.org/users/sign_in。
             返回结果对象类型为解析之后的 JSON 格式对象，并用字符串形式进行表示，
             其中包含了全部重要的天气信息。
    """
    # 步骤1: 构建请求 URL
    url = "https://api.openweathermap.org/data/2.5/weather"

    # 步骤2: 设置查询参数
    params = {
        "q": loc,
        "appid": os.getenv("OPENWEATHER_API_KEY"),  # 从环境变量读取 API Key
        "units": "metric",   # 使用摄氏度
        "lang": "zh_cn"      # 输出语言为简体中文
    }

    # 步骤3: 发送 GET 请求
    response = httpx.get(url, params=params, timeout=30)

    # 步骤4: 解析响应内容并返回
    data = response.json()
    return json.dumps(data)


# 测试工具是否正常工作
if __name__ == "__main__":
    result = get_weather.invoke("beijing")
    print(result)
```

### 逐行解读

**1. 装饰器声明**
```python
@tool  # 这一行将普通函数升级为 LangChain 工具
```
没有这一行，`get_weather` 只是个普通函数；加上这一行，LLM 就能识别和调用它。

**2. 函数文档字符串（docstring）**
```python
"""
查询即时天气函数
:param loc: 城市英文名...
:return: JSON 格式天气数据...
"""
```
这段文字会变成 `get_weather.description`，LLM 会**阅读这段文字**来决定何时调用这个工具。写清楚参数格式至关重要。

**3. 环境变量读取**
```python
"appid": os.getenv("OPENWEATHER_API_KEY")
```
API 密钥不应该硬编码在代码中，而是通过环境变量注入，避免泄露风险。

**4. 统一返回格式**
```python
return json.dumps(data)  # 返回字符串，不是字典
```
Tool 的返回值应该是字符串，这样 LLM 可以更好地处理。

**5. 测试调用**
```python
result = get_weather.invoke("beijing")  # 使用 .invoke() 方法
```
所有 Tool 对象都支持 `.invoke()` 统一接口。

---

## 第五部分：Tool 的最佳实践

### 工具描述撰写指南

```python
@tool
def get_weather(loc):
    """
    [工具名称] 查询即时天气
    
    [什么时候用] 当用户询问任何城市的天气情况时，都应该使用此工具。
    
    [参数说明] loc: 城市英文名称。重要：中国城市必须使用英文名，
               如北京用 Beijing，上海用 shanghai。
    
    [返回值] JSON 字符串，包含温度、湿度、天气状况等信息。
    """
```

好的描述应该包含：
- 工具的用途
- 什么场景下调用
- 参数的格式要求
- 返回值的结构

### 错误处理

```python
@tool
def get_weather(loc):
    """
    查询即时天气函数
    """
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {
            "q": loc,
            "appid": os.getenv("OPENWEATHER_API_KEY"),
            "units": "metric",
            "lang": "zh_cn"
        }
        response = httpx.get(url, params=params, timeout=30)
        response.raise_for_status()  # 检查 HTTP 错误
        data = response.json()
        return json.dumps(data)
    except httpx.TimeoutException:
        return json.dumps({"error": "请求超时，请稍后重试"})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return json.dumps({"error": f"未找到城市 '{loc}' 的天气信息"})
        return json.dumps({"error": f"天气服务异常: {e}"})
    except Exception as e:
        return json.dumps({"error": f"未知错误: {str(e)}"})
```

### 超时和重试

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@tool
@retry(
    stop=stop_after_attempt(3),  # 最多重试3次
    wait=wait_exponential(multiplier=1, min=2, max=10)  # 指数退避等待
)
def get_weather(loc):
    # 实现...
```

---

## 第六部分：Tool 的调试技巧

### 查看工具信息

```python
@tool
def get_weather(loc):
    """查询天气"""
    pass

# 调试信息
print(f"工具名称: {get_weather.name}")
print(f"工具描述: {get_weather.description}")
print(f"参数模式: {get_weather.args_schema.schema()}")
```

### 测试工具调用

```python
# 直接调用测试
result = get_weather.invoke("beijing")
print(result)

# 批量调用测试
cities = ["beijing", "shanghai", "guangzhou"]
results = get_weather.batch(cities)
for city, result in zip(cities, results):
    print(f"{city}: {result[:100]}...")
```

---

## 总结

| 核心概念 | 一句话解释 |
|----------|-----------|
| Tool | 让 LLM 能调用外部函数的适配器 |
| @tool 装饰器 | 将普通函数转换为 Tool 对象 |
| tool.invoke() | Tool 的统一调用接口 |
| tool.description | LLM 阅读的工具使用说明 |
| bind_tools() | 将工具注册给 LLM 使用 |

**记住这个核心流程**：
1. 用 `@tool` 装饰器定义工具函数
2. 用 `bind_tools()` 把工具注册给 LLM
3. LLM 自动决定何时调用哪个工具
4. LangChain 自动执行工具并返回结果
