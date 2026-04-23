---
title: LangGraph 子图（Subgraph）
date: 2026-04-21
abstract: LangGraph 子图（Subgraph）以及两种经典模式
tags:
- Ai
- LangGraph
---

# LangGraph 子图（Subgraph）

## 一、什么是子图？

**官方描述**：在LangGraph中，子图是指将一个完整的图（StateGraph）作为另一个图的节点来使用。这种机制允许将复杂的任务拆解为多个专业智能体协同完成。

**生活比喻**：就像一家大公司（父图）里的各个部门（子图）。每个部门有自己的内部流程、规则和私有数据（比如财务部的工资单），但又能与公司其他部门共享必要信息。公司只需要知道“把任务交给销售部”，而不需要关心销售部内部如何运作。

## 二、为什么需要子图？

| 优势 | 说明 |
|------|------|
| **模块化** | 每个子图可独立开发、测试、复用 |
| **职责分离** | 子图拥有私有数据，不与父图污染 |
| **团队协作** | 不同团队可并行开发不同子图 |
| **可维护性** | 修改子图不影响父图逻辑 |

## 三、两种子图集成模式

### 模式一：直接添加子图节点（状态字段共享）

**适用场景**：父子图状态字段有重叠，需要共享数据。

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

# ========== 1. 状态定义（字段名必须一致才能自动传递）==========
class ParentState(TypedDict):
    messages: list          # 共享字段
    parent_private: str     # 父图私有

class ChildState(TypedDict):
    messages: list          # 共享字段（同名自动传递）
    child_private: str      # 子图私有

# ========== 2. 子图定义 ==========
def child_process(state: ChildState) -> ChildState:
    state["messages"].append("子图处理完成")
    state["child_private"] = "子图的秘密"
    return state

def build_child():
    builder = StateGraph(ChildState)
    builder.add_node("process", child_process)
    builder.add_edge(START, "process")
    builder.add_edge("process", END)
    return builder.compile()

# ========== 3. 父图定义（直接添加子图节点）==========
def parent_init(state: ParentState) -> ParentState:
    if "messages" not in state:
        state["messages"] = []
    state["messages"].append("父图开始")
    state["parent_private"] = "父图的秘密"
    return state

def build_parent():
    child = build_child()
    builder = StateGraph(ParentState)
    builder.add_node("init", parent_init)
    builder.add_node("child", child)      # ⭐ 直接添加子图作为节点
    builder.add_edge(START, "init")
    builder.add_edge("init", "child")
    builder.add_edge("child", END)
    return builder.compile()

# ========== 4. 执行 ==========
parent = build_parent()
result = parent.invoke({"messages": []})
print(result)
# 输出: {'messages': ['父图开始', '子图处理完成'], 'parent_private': '父图的秘密'}
# 注意：child_private 不会出现在最终结果中（父图状态没有这个字段）
```

### 模式二：代理节点手动调用（状态结构完全不同）⭐ 企业级常用

**适用场景**：父子图状态字段完全不一致，需要手动转换。这是**企业级开发中最常见的模式**。

**生活比喻**：就像不同国家的公司合作。中国公司（父图）用中文写合同，美国公司（子图）只接受英文合同。这时需要一个翻译（代理节点）先把中文翻译成英文，等美国公司返回英文结果后，再翻译回中文。

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

# ========== 1. 状态定义（完全不同的结构）==========
# 父图：业务视角
class ParentState(TypedDict):
    user_query: str          # 用户问题
    final_answer: str | None # 最终答案

# 子图：技术分析视角
class SubgraphState(TypedDict):
    analysis_input: str      # 分析输入
    analysis_result: str     # 分析结果
    intermediate_steps: list # 中间步骤（私有）

# ========== 2. 子图定义（专注分析任务）==========
def analysis_node(state: SubgraphState) -> SubgraphState:
    query = state["analysis_input"]
    state["intermediate_steps"] = [f"解析: {query}", "执行NLP分析", "生成报告"]
    state["analysis_result"] = f"分析结果: {query} 的关键词是[LangGraph, 子图, 状态管理]"
    return state

def build_subgraph():
    builder = StateGraph(SubgraphState)
    builder.add_node("analyze", analysis_node)
    builder.add_edge(START, "analyze")
    builder.add_edge("analyze", END)
    return builder.compile()

# 预编译子图
compiled_subgraph = build_subgraph()

# ========== 3. 父图代理节点（核心：状态转换）==========
def proxy_node(state: ParentState) -> ParentState:
    """
    代理节点充当「翻译官」角色
    步骤1: ParentState → SubgraphState
    步骤2: 手动调用子图
    步骤3: SubgraphState → ParentState
    """
    # 步骤1: 转换输入
    sub_input = {
        "analysis_input": state["user_query"],
        "intermediate_steps": [],
        "analysis_result": ""
    }
    
    # 步骤2: 手动调用子图
    sub_output = compiled_subgraph.invoke(sub_input)
    
    # 步骤3: 转换输出
    return {
        "user_query": state["user_query"],
        "final_answer": sub_output["analysis_result"]
    }

def build_parent():
    builder = StateGraph(ParentState)
    builder.add_node("proxy", proxy_node)  # 添加代理节点
    builder.add_edge(START, "proxy")
    builder.add_edge("proxy", END)
    return builder.compile()

# ========== 4. 执行 ==========
parent = build_parent()
result = parent.invoke({
    "user_query": "LangGraph子图怎么用？",
    "final_answer": None
})
print(f"答案: {result['final_answer']}")
```

## 四、两种模式对比

| 对比维度 | 模式一（直接添加） | 模式二（代理调用）⭐ |
|---------|------------------|-------------------|
| 状态字段 | 必须有重叠字段名 | 可以完全不同 |
| 数据传递 | 自动（同名映射） | 手动（完全可控） |
| 代码复杂度 | 低 | 中 |
| 灵活性 | 低 | 高 |
| 调试难度 | 低 | 中 |
| 企业级使用 | 简单场景 | **80%以上场景** |

## 五、企业级实战案例：智能客服系统

**场景**：一个智能客服系统，需要将用户问题分发到不同的专业子图处理（退货、技术咨询、物流查询）。

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Literal
import random

# ========== 状态定义 ==========
class RouterState(TypedDict):
    user_query: str
    intent: str | None
    final_response: str | None

class ReturnState(TypedDict):
    order_id: str
    reason: str
    return_result: str
    steps: list

class TechState(TypedDict):
    product_name: str
    issue_desc: str
    solution: str
    debug_logs: list

# ========== 退货子图 ==========
def return_process(state: ReturnState) -> ReturnState:
    state["steps"] = ["验证订单", "检查退货政策", "生成退货单"]
    state["return_result"] = f"订单{state['order_id']}退货申请已通过，退货单号：RET-{random.randint(1000,9999)}"
    return state

def build_return_subgraph():
    builder = StateGraph(ReturnState)
    builder.add_node("process", return_process)
    builder.add_edge(START, "process")
    builder.add_edge("process", END)
    return builder.compile()

# ========== 技术咨询子图 ==========
def tech_process(state: TechState) -> TechState:
    state["debug_logs"] = [f"检查{state['product_name']}配置", "分析错误日志", "生成解决方案"]
    state["solution"] = f"针对{state['product_name']}的{state['issue_desc']}问题，建议重启后升级固件"
    return state

def build_tech_subgraph():
    builder = StateGraph(TechState)
    builder.add_node("process", tech_process)
    builder.add_edge(START, "process")
    builder.add_edge("process", END)
    return builder.compile()

# ========== 父图 + 代理节点 ==========
return_subgraph = build_return_subgraph()
tech_subgraph = build_tech_subgraph()

def router_proxy(state: RouterState) -> RouterState:
    """根据意图路由到不同子图"""
    query = state["user_query"]
    
    # 简单意图识别
    if "退货" in query or "退款" in query:
        # 转换为退货子图需要的状态
        sub_input = {
            "order_id": "提取订单号",  # 实际应用中用NLP提取
            "reason": query,
            "return_result": "",
            "steps": []
        }
        sub_output = return_subgraph.invoke(sub_input)
        return {
            "user_query": query,
            "intent": "退货",
            "final_response": sub_output["return_result"]
        }
    
    elif "怎么" in query or "故障" in query or "不工作" in query:
        sub_input = {
            "product_name": "智能音箱",  # 实际应用中从query提取
            "issue_desc": query,
            "solution": "",
            "debug_logs": []
        }
        sub_output = tech_subgraph.invoke(sub_input)
        return {
            "user_query": query,
            "intent": "技术咨询",
            "final_response": sub_output["solution"]
        }
    
    else:
        return {
            "user_query": query,
            "intent": "未知",
            "final_response": "抱歉，我无法理解您的问题，请转人工客服。"
        }

def build_customer_service():
    builder = StateGraph(RouterState)
    builder.add_node("router", router_proxy)
    builder.add_edge(START, "router")
    builder.add_edge("router", END)
    return builder.compile()

# ========== 执行 ==========
cs_system = build_customer_service()

# 测试1：退货请求
result1 = cs_system.invoke({
    "user_query": "我要退货，订单号12345",
    "intent": None,
    "final_response": None
})
print(f"退货结果: {result1['final_response']}")

# 测试2：技术咨询
result2 = cs_system.invoke({
    "user_query": "音箱怎么连不上WiFi？",
    "intent": None,
    "final_response": None
})
print(f"技术咨询结果: {result2['final_response']}")
```

## 六、最佳实践与注意事项

### ✅ 推荐做法

1. **始终使用代理节点模式**，即使状态字段相同，也便于后续扩展
2. **子图应保持单一职责**，一个子图只做一件事
3. **在代理节点中添加异常处理**：

```python
def safe_proxy(state: ParentState) -> ParentState:
    try:
        sub_input = {"input": state["query"]}
        sub_output = compiled_subgraph.invoke(sub_input, config={"recursion_limit": 50})
        return {"query": state["query"], "result": sub_output["result"]}
    except Exception as e:
        return {"query": state["query"], "result": f"子图执行失败: {str(e)}"}
```

### ❌ 避免做法

1. 不要创建过深的子图嵌套（建议不超过3层）
2. 不要在子图中直接修改父图状态（通过返回值传递）
3. 不要让子图之间直接通信（通过父图协调）

## 七、总结

| 知识点 | 核心要点 |
|--------|---------|
| 子图本质 | 图作为节点，实现模块化 |
| 模式一 | 直接添加，状态字段需重叠 |
| 模式二（企业级） | 代理节点手动调用，完全解耦 |
| 关键API | `compiled_subgraph.invoke()` |
| 典型场景 | 多智能体协作、任务分发、领域专家系统 |


## 补充:Simple.py vs Pro.py 核心区别

简单来说：**Simple.py 是「自动挡」，Pro.py 是「手动挡」**。

---

### 一、一句话总结

| 文件 | 核心模式 | 比喻 |
|------|---------|------|
| **simple.py** | 子图作为节点直接添加 | 像USB插头，接口对得上就能直接用 |
| **pro.py** | 代理节点手动调用子图 | 像电源转换头，接口不对需要转接 |

---

### 二、详细对比表

| 对比维度 | simple.py | pro.py |
|---------|-----------|--------|
| **添加方式** | `builder.add_node("subgraph", compiled_subgraph)` | 自定义函数内调用 `compiled_subgraph.invoke()` |
| **状态字段** | 必须有重叠字段（`parent_messages` 同名） | 可以完全不同（无重叠字段） |
| **数据传递** | **自动**：同名字段自动共享 | **手动**：代理节点中显式转换 |
| **子图私有数据** | 存在但父图不可见（如 `sub_message`） | 存在且父图不可见（如 `intermediate_steps`） |
| **代码复杂度** | 低（~50行） | 中（~80行） |
| **灵活性** | 低（必须字段名一致） | 高（任意状态结构） |
| **控制粒度** | 粗（子图作为黑盒） | 细（可做输入预处理、输出后处理） |

---

### 三、核心代码对比

#### Simple.py（自动传递）
```python
# 状态定义：必须有同名字段
class ParentState(TypedDict):
    parent_messages: list  # ⭐ 与子图共享

class SubgraphState(TypedDict):
    parent_messages: list  # ⭐ 同名字段，自动传递
    sub_message: str       # 私有字段

# 添加子图：直接作为节点
builder.add_node("subgraph_node", compiled_subgraph)  # 一行搞定
```

#### Pro.py（手动转换）
```python
# 状态定义：完全独立，无重叠字段
class ParentState(TypedDict):
    user_query: str      # 父图独有
    final_answer: str    # 父图独有

class SubgraphState(TypedDict):
    analysis_input: str  # 子图独有
    analysis_result: str # 子图独有
    intermediate_steps: list

# 添加子图：通过代理节点手动调用
def proxy_node(state: ParentState) -> ParentState:
    # 步骤1: 手动转换输入
    sub_input = {"analysis_input": state["user_query"], ...}
    # 步骤2: 手动调用子图
    sub_output = compiled_subgraph.invoke(sub_input)
    # 步骤3: 手动转换输出
    return {"user_query": state["user_query"], "final_answer": sub_output["analysis_result"]}

builder.add_node("proxy", proxy_node)  # 添加的是代理函数，不是直接加子图
```

---

### 四、数据流向图

#### Simple.py 数据流
```
父图状态 ──(自动传递同名字段)──> 子图状态
     ↑                              ↓
     └──────(自动返回)──────────────┘
```

#### Pro.py 数据流
```
父图状态 → [代理节点] → 手动构造 → 子图状态
                ↓                      ↓
           手动提取 ← 子图结果 ← 手动调用
                ↓
           新父图状态
```

---

### 五、什么时候用哪个？

| 场景 | 推荐 | 原因 |
|------|------|------|
| 快速原型验证 | simple.py | 代码少，跑得快 |
| 父子图本来就是同一团队开发 | simple.py | 可以约定字段名 |
| 父子图由不同团队开发 | **pro.py** | 无法保证字段名一致 |
| 需要复用第三方子图 | **pro.py** | 不能修改子图状态定义 |
| 需要对子图输入做复杂预处理 | **pro.py** | 代理节点可以做任意转换 |
| 需要根据子图结果做分支逻辑 | **pro.py** | 代理节点内可写复杂逻辑 |
| 企业级生产环境 | **pro.py** | 更灵活、更可控、更易调试 |

---

### 六、本质区别总结

> **simple.py** 假设父子图「说同一种语言」（字段名相同），LangGraph 帮你自动翻译。
>
> **pro.py** 不假设任何东西，你自己当翻译官，想怎么转就怎么转。

**实际企业开发中，99% 的情况用 pro.py 模式**，因为真实项目里不同模块的状态结构几乎不可能完全一致。
