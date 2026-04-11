---
title: LangChain 表达式语言（LCEL）
date: 2026-04-11
abstract: LangChain 表达式语言（LCEL）描述
tags:
- Ai
- langChain
---


# LangChain 表达式语言（LCEL）

> 一句话理解 LCEL：**像拼乐高一样搭建 AI 应用**

> LCEL : LangChain Expression Language


## 🎯 核心思想：Chain 的"三明治"结构

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  提示词模板  │ →  │   大模型     │ →  │  结果解析器  │
│  (Prompt)   │    │   (Model)   │    │  (Parser)   │
└─────────────┘    └─────────────┘    └─────────────┘
```

**生活类比**：
- 🥪 **提示词模板** = 你给厨师的"菜单订单"（要什么，格式是什么）
- 🧠 **大模型** = 厨师（负责做菜的大脑）
- 📝 **结果解析器** = 摆盘上菜（把结果整理成你想要的格式）

---

## 🔗 管道运算符 `|` —— LCEL 的灵魂

```python
# 这就是 LCEL 最经典的写法
chain = prompt | model | parser
```

**形象理解**：就像工厂里的传送带
- 原材料（用户输入）从一头进去
- 经过三个工位（prompt → model → parser）
- 成品（结构化结果）从另一头出来

```python
# 实际例子
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template("用{language}说：{text}")
model = ChatOpenAI()
parser = StrOutputParser()

chain = prompt | model | parser

# 运行
result = chain.invoke({"language": "中文", "text": "Hello"})
# 输出："你好"
```

---

## 📦 五种 Chain 类型详解

### 1️⃣ RunnableSequence —— 顺序链

**一句话**：一步一步往前走，不走回头路

```
输入 → [步骤1] → [步骤2] → [步骤3] → 输出
```

**生活类比**：流水线作业
- 第1步：洗菜
- 第2步：切菜
- 第3步：炒菜

```python
from langchain_core.runnables import RunnableSequence

# 这两种写法完全等价
chain = prompt | model | parser
chain = RunnableSequence(prompt, model, parser)

# ✅ 顺序链可以使用 | 语法糖
result = chain.invoke({"topic": "人工智能"})
```

---

### 2️⃣ RunnableBranch —— 分支链

**一句话**：看人下菜碟，根据条件走不同路线

```
                    ┌─ 条件A满足 → 路线1 ─┐
输入 → 判断条件 ─┼─ 条件B满足 → 路线2 ─┼→ 输出
                    └─ 都不满足 → 默认路线 ─┘
```

**生活类比**：银行柜台
- 取钱？→ 去取钱窗口
- 存钱？→ 去存钱窗口
- 办卡？→ 去办卡窗口

```python
from langchain_core.runnables import RunnableBranch

# ❌ 分支链不能使用 | 语法糖
# branch_chain = condition | chain1 | chain2  # 错误！

# ✅ 分支链必须使用 RunnableBranch
branch_chain = RunnableBranch(
    (lambda x: "紧急" in x, emergency_chain),   # 条件1：紧急消息
    (lambda x: "无聊" in x, joke_chain),        # 条件2：无聊消息
    default_chain                               # 默认：普通回复
)

# 使用
result = branch_chain.invoke("紧急！服务器挂了")  # 走 emergency_chain
```

---

### 3️⃣ RunnableSerializable —— 串行链

**一句话**：可以保存到硬盘，下次直接用的链

**生活类比**：菜谱
- 你开发了一套绝妙的烹饪流程
- 把它写成菜谱（保存）
- 下次直接照着做（加载），不用重新研究

```python
# 注意：RunnableSerializable 通常是从顺序链创建的
# ✅ 顺序链可以使用 | 语法糖
chain = prompt | model | parser

# 保存链
saved_path = chain.save("my_chain.json")

# 加载链（重启程序后也能用）
from langchain_core.runnables import RunnableSerializable
loaded_chain = RunnableSerializable.load("my_chain.json")
result = loaded_chain.invoke({"text": "hello"})
```

---

### 4️⃣ RunnableParallel —— 并行链

**一句话**：一心多用，同时干多件事

```
                    ┌─ 分支1 ─┐
输入 → 同时出发 ─┼─ 分支2 ─┼→ 合并结果
                    └─ 分支3 ─┘
```

**生活类比**：外卖骑手取餐
- 同时去3家店取餐
- 最后汇总所有餐品一起配送

```python
from langchain_core.runnables import RunnableParallel

# ❌ 并行链不能使用 | 语法糖
# parallel_chain = prompt | RunnableParallel(...)  # 错误！

# ✅ 并行链必须使用 RunnableParallel
parallel_chain = RunnableParallel(
    translation= prompt_translate | model,   # 任务1：翻译（内部子链可用|）
    summary=     prompt_summary | model,     # 任务2：总结
    keywords=    prompt_keywords | model     # 任务3：提取关键词
)

# 三个任务同时执行，互不干扰
result = parallel_chain.invoke("一大段文本...")
# result 包含三个字段：translation, summary, keywords
```

---

### 5️⃣ RunnableLambda —— 函数链

**一句话**：把普通 Python 函数包装成链的一环

**生活类比**：在自动化流水线中插入一个"人工质检"

```python
from langchain_core.runnables import RunnableLambda

# 普通 Python 函数
def clean_text(text: str) -> str:
    return text.strip().lower()

def add_exclamation(text: str) -> str:
    return text + "!"

# 包装成 LCEL 可用的组件
clean = RunnableLambda(clean_text)
exclaim = RunnableLambda(add_exclamation)

# ✅ RunnableLambda 可以用 | 串联到顺序链中
chain = clean | exclaim | model | parser

result = chain.invoke("  HELLO  ")
# 过程： "  HELLO  " → "hello" → "hello!" → 模型处理 → 结果
```

---

## 🔧 重要：语法糖 `|` 的真相

### 核心规则：**只有 `RunnableSequence`（顺序链）可以使用 `|` 语法糖**


### 🧪 直观对比示例

```python
from langchain_core.runnables import RunnableLambda, RunnableParallel, RunnableBranch

def add_one(x): return x + 1
def double(x): return x * 2

# ✅ 顺序链：可以用 | 
seq = RunnableLambda(add_one) | RunnableLambda(double) | RunnableLambda(add_one)
print(seq.invoke(1))  # (1+1)=2 → 2*2=4 → 4+1=5 ✅

# ❌ 并行链：不能用 |
# wrong = RunnableLambda(add_one) | RunnableParallel(a=..., b=...)  # 错误！

# ✅ 并行链：必须这样写
parallel = RunnableParallel(
    plus_one=RunnableLambda(add_one),
    times_two=RunnableLambda(double)
)

# ❌ 分支链：不能用 |
# wrong = condition | chain1 | chain2  # 错误！

# ✅ 分支链：必须这样写
branch = RunnableBranch(
    (lambda x: x > 10, RunnableLambda(double)),   # 大于10走加倍
    RunnableLambda(add_one)                        # 否则加1
)
```

### 💡 记忆技巧

把 `|` 想象成 **"直通管道"**：
- **顺序链** = 直通管道 → 可以用 `|`
- **分支链** = 分岔路口 → 不能用 `|`
- **并行链** = 多车道公路 → 不能用 `|`
- **Lambda函数** = 一个小零件 → 可以装在直通管道里
- **Serializable** = 顺序链的"保存版" → 继承 `|` 使用权

---

## 🧩 组合使用：发挥威力

```python
# 复杂场景：智能客服系统
chain = (
    preprocess |                      # 1. 预处理（Lambda）
    RunnableBranch(                   # 2. 路由（Branch）
        ("退款", refund_chain),
        ("咨询", info_chain),
        default_chain
    ) |
    RunnableParallel(                 # 3. 并行处理（Parallel）
        answer=main_model,
        suggestion=recommend_model,
        sentiment=emotion_model
    ) |
    format_output                     # 4. 格式化输出（Lambda）
)

# 注意：这里的 | 用于连接不同组件
# 但 RunnableBranch 和 RunnableParallel 内部不能直接用 |
# 它们需要显式构造
```

---

## 💡 核心要点总结

### 1. **`|` 是管道**
数据从左向右流动，像水流过管道

### 2. **一切皆 Runnable**
prompt、model、parser、chain 都是同一类对象

### 3. **组合优于继承**
用 `|` 拼装，而不是写复杂的类

### 4. **懒执行**
`chain = a | b | c` 只是"蓝图"，`invoke()` 才真正执行

### 5. **语法糖使用规则** ⚠️
- ✅ **只有顺序链**可以使用 `|` 语法糖
- ❌ 分支链、并行链**不能**使用 `|`
- ✅ Lambda 函数可以**作为组件**放入顺序链

---

## 📖 完整代码示例

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda, RunnableParallel, RunnableBranch
from langchain_openai import ChatOpenAI

# 初始化组件
model = ChatOpenAI()
parser = StrOutputParser()

# ✅ 顺序链：可以用 |
simple_chain = (
    ChatPromptTemplate.from_template("讲一个关于{topic}的笑话") |
    model |
    parser
)

# ✅ 分支链：必须用 RunnableBranch
emergency_chain = ChatPromptTemplate.from_template("紧急处理：{input}") | model | parser
normal_chain = ChatPromptTemplate.from_template("正常回复：{input}") | model | parser

branch_chain = RunnableBranch(
    (lambda x: len(x) > 100, emergency_chain),
    normal_chain
)

# ✅ 并行链：必须用 RunnableParallel
parallel_chain = RunnableParallel(
    joke=simple_chain,
    advice=normal_chain
)

# ✅ Lambda 链：可以用 |
def log_step(x):
    print(f"Processing: {x}")
    return x

chain_with_log = RunnableLambda(log_step) | simple_chain

# 执行
print(chain_with_log.invoke({"topic": "程序员"}))
```


