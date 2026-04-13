---
title: RAG检索增强生成
date: 2026-04-13
abstract: RAG检索增强生成
tags:
- Ai
- langChain
---

# RAG检索增强生成

## 第一章：RAG 思想与核心价值

### 1.1 什么是 RAG？

#### 通俗理解

想象一下：

> 你有一个非常聪明但**有点健忘**的朋友（大语言模型，LLM）。他知道很多常识，但如果你问他：“我们上周三开会时说了什么？” 他就傻眼了，因为他没有那天的记忆。

**RAG 就是给这个朋友配了一个笔记本**。每次你问问题，他先快速翻笔记本（**检索**），找到相关记录，然后结合自己的理解来回答你（**生成**）。

- **没有 RAG**：LLM 只靠训练时记住的知识回答 → 容易“已读乱回”（幻觉）或“已读不回”（知识陈旧）
- **有了 RAG**：LLM 先查你给的知识库，再基于这些知识回答 → 答案更准确、可溯源

#### 官方定义

**RAG（Retrieval-Augmented Generation，检索增强生成）** 是一种将**信息检索**与**大语言模型生成能力**相结合的技术架构。

> 核心公式：**RAG = 检索（Retrieval） + 增强（Augmented） + 生成（Generation）**

| 环节 | 作用 |
|------|------|
| 检索 | 从知识库中找到与问题相关的信息片段 |
| 增强 | 把这些片段作为“上下文”注入到提示词中 |
| 生成 | LLM 基于增强后的提示词生成最终答案 |

#### RAG vs 微调（Fine-tuning）

| 对比维度 | RAG | 微调 |
|---------|-----|------|
| **知识更新** | 只需更新知识库，无需重新训练 | 需要重新训练模型 |
| **可解释性** | 答案可追溯到原始文档 | 难以追溯知识来源 |
| **实现成本** | 低，无需 GPU 训练 | 高，需要训练算力 |
| **实时性** | 秒级生效 | 小时/天级 |
| **适用场景** | 知识频繁更新、私有文档问答 | 改变模型风格、行为或学习特定格式 |

> 💡 **一句话建议**：想**让模型知道新事实** → 用 RAG；想**改变模型行为方式** → 考虑微调。

---

### 1.2 RAG 能解决什么问题？

| 问题 | 说明 | RAG 如何解决 |
|------|------|-------------|
| **知识截止日期** | GPT-4 知识截止于 2023 年 10 月 | 注入最新的文档（如今天的新闻） |
| **模型幻觉** | LLM 会编造不存在的“事实” | 强制基于检索到的上下文回答 |
| **私有领域知识** | 公司内部文档、产品手册、法律条文 | 将这些文档作为知识库 |
| **动态更新** | 知识每天变化（如股价、政策） | 只需更新向量库，秒级生效 |
| **答案可溯源** | 用户想知道“你从哪里知道的” | 返回答案时可附带来源文档 |

---

### 1.3 RAG 工作流程全景图

RAG 分为**两大阶段**：

#### 阶段一：索引阶段（Indexing）—— 离线准备知识库

```
原始文档 → 文档加载 → 文本拆分 → 文本块 → 向量化 → 向量数据库
   │           │          │         │        │         │
 PDF/Word     读取     切分成块   小片段   转成向量   存储检索
```

> 这个阶段**不需要用户等待**，可以在后台定期执行（如每晚更新一次）。

#### 阶段二：检索与生成阶段（Retrieval & Generation）—— 在线回答问题

```
用户问题 → 向量化 → 问题向量 → 向量数据库相似度搜索 → Top-K 相关文本块
                                                              ↓
最终答案 ← 大语言模型 ← 构建 Prompt（上下文 + 问题） ← ────────┘
```

#### 一个完整的例子

假设你上传了一份《2024年公司休假政策》文档：

| 步骤 | 阶段 | 发生了什么 |
|------|------|-----------|
| 1 | 索引 | 文档被切分成块 → 向量化 → 存入向量库 |
| 2 | 检索 | 你问：“春节放假几天？” → 问题被向量化 |
| 3 | 检索 | 向量库找到最相关的文本块（含“春节假期7天”） |
| 4 | 生成 | Prompt = “根据上下文回答：春节放假几天？ 上下文：春节假期7天...” |
| 5 | 生成 | LLM 回答：“根据公司政策，春节放假7天。” |

---

### 第一章小结

| 核心概念 | 一句话总结 |
|---------|-----------|
| **RAG** | 先查资料，再回答问题，让 LLM 有据可依 |
| **索引阶段** | 离线准备知识库（文档→向量库） |
| **检索+生成阶段** | 在线回答问题（问题→检索→生成） |
| **RAG vs 微调** | RAG 给知识，微调改能力 |

---

## 第二章：RAG 核心原理（纯概念，无代码）

> 本章只讲**原理**，不涉及任何代码或框架。所有 LangChain 实现放在第四章。

### 2.1 索引阶段原理

#### 2.1.1 文档加载

**目标**：将各种格式的原始文档读取为程序可处理的纯文本。

**挑战**：不同格式有不同复杂度

| 格式 | 挑战 | 原理说明 |
|------|------|---------|
| PDF | 表格、图片、多列布局 | 需要解析器提取文字流 |
| Word | 复杂格式、嵌入对象 | 需要解压并提取文本 |
| Markdown | 标题层级需保留 | 标题可作为结构信息 |
| HTML | 标签噪声 | 需去除标签，保留正文 |
| 纯文本 | 最简单 | 直接读取 |

#### 2.1.2 文本拆分（Chunking）

**为什么需要拆分？**

1. **LLM 上下文窗口限制**：模型一次能处理的文本长度有限
2. **检索精度**：小块更容易精准匹配问题，大块会引入噪声
3. **成本控制**：只发送相关片段，节省 token 费用

**核心概念**：

| 概念 | 含义 | 示例 |
|------|------|------|
| `chunk_size` | 单个文本块的最大长度 | 500 字符 或 200 tokens |
| `chunk_overlap` | 相邻块之间的重叠长度 | 50 字符，保留上下文连续性 |
| `separators` | 优先切割的位置 | 段落 > 句子 > 词语 > 字符 |

**重叠的作用**：

```
文档: [A段开头...中间部分...B段结尾]
                    ↓
块1: [A段开头...中间部分]
块2: [中间部分...B段结尾]  ← 重叠部分防止信息被切断
```

#### 2.1.3 文本向量化（Embedding）

**什么是向量化？**

将文本转换为固定维度的浮点数数组（向量），**语义相似的文本在向量空间中距离更近**。

```
"苹果很好吃" → [0.12, -0.34, 0.56, ..., 0.78]  (1536维)
"水果很美味" → [0.11, -0.33, 0.55, ..., 0.79]  (距离很近，语义相似)

"汽车很快"   → [-0.45, 0.23, -0.67, ..., 0.12]  (距离很远，语义不同)
```

**关键原则**：索引阶段和检索阶段必须使用**同一个 Embedding 模型**，否则向量空间不匹配，无法正确比较。

#### 2.1.4 向量数据库存储

存储的内容结构：

```
┌─────────────────────────────────────────────┐
│              向量数据库中的一条记录           │
├─────────────────────────────────────────────┤
│  向量：[0.12, -0.34, 0.56, ..., 0.78]       │
│  原始文本："春节假期共7天"                    │
│  元数据：{"source": "holiday.pdf", "page": 3}│
└─────────────────────────────────────────────┘
```

---

### 2.2 检索与生成阶段原理

#### 2.2.1 问题向量化

将用户问题用**与索引阶段相同的 Embedding 模型**转换为向量。

#### 2.2.2 相似度搜索

**常用相似度算法**：

| 算法 | 直观理解 | 公式 |
|------|---------|------|
| 余弦相似度 | 关注方向是否一致（最常用） | `cos(θ) = (A·B)/(|A||B|)` |
| 欧氏距离 | 关注绝对距离远近 | `d = √Σ(Ai-Bi)²` |
| 点积 | 向量已归一化时等价于余弦 | `A·B` |

**Top-K 检索**：返回与问题向量最相似的 K 个文本块。

#### 2.2.3 构建 Prompt

**核心思想**：将检索到的文本块作为“上下文”注入到提示词中。

**标准 RAG Prompt 模板结构**：

```
你是一个基于以下上下文回答问题的助手。

<上下文>
{这里放检索到的相关文本块}
</上下文>

问题：{用户的问题}

请基于以上上下文回答。如果上下文中没有相关信息，请说"我不知道"。
```

#### 2.2.4 LLM 生成

大语言模型接收包含“上下文+问题”的 Prompt，基于上下文生成答案，而不是依赖自己的训练记忆。

---

### 第二章小结

| 概念 | 一句话解释 |
|------|-----------|
| 文本拆分 | 把长文档切成小块，便于检索 |
| chunk_size | 每块多大 |
| chunk_overlap | 块之间重叠多少 |
| 向量化 | 把文字转成数字数组 |
| 相似度搜索 | 找最接近问题向量的文本块 |
| Top-K | 返回最相似的 K 个块 |
| Prompt | 把“上下文+问题”打包发给 LLM |

---

## 第三章：向量数据库选型

### 3.1 为什么需要向量数据库？

传统数据库（如 MySQL）无法高效进行**向量相似度搜索**：

| 能力 | 传统数据库 | 向量数据库 |
|------|-----------|-----------|
| 精确匹配 | ✅ 快 | ❌ 不支持 |
| 模糊搜索 | ⚠️ 慢 | ❌ 不支持 |
| 向量相似度 | ❌ 不支持 | ✅ 快 |
| 标量过滤 | ✅ 支持 | ✅ 支持（多数） |

向量数据库专为向量搜索设计，提供：
- **高效索引**：HNSW、IVF 等算法实现毫秒级搜索
- **相似度计算**：内置余弦、欧氏距离等
- **混合搜索**：向量 + 标量过滤

### 3.2 常用向量数据库对比

| 数据库 | 类型 | 性能 | 易用性 | 扩展性 | 最佳场景 |
|--------|------|------|--------|--------|---------|
| **Chroma** | 嵌入式 | 中等 | ⭐⭐⭐⭐⭐ | 低 | 学习原型、小项目 |
| **FAISS** | 库 | 高 | ⭐⭐⭐ | 中 | 本地研究、无需持久化 |
| **Pgvector** | PostgreSQL扩展 | 中高 | ⭐⭐⭐⭐ | 高 | 已有 PostgreSQL 栈 |
| **Milvus** | 云原生 | 极高 | ⭐⭐ | 极高 | 十亿级向量生产环境 |
| **Redis** | 内存数据库 | 极高 | ⭐⭐⭐⭐ | 高 | 超低延迟场景 |
| **Elasticsearch** | 搜索引擎 | 高 | ⭐⭐⭐ | 高 | 需要混合搜索 |

#### 各数据库详解

**Chroma**
- 轻量级，纯 Python，API 极其简单
- 数据持久化到本地磁盘
- 适合：学习 RAG、原型验证、小规模应用

**FAISS**
- Facebook 开源，C++ 核心，性能强悍
- 本质是库而非完整数据库（无持久化，需自己管理）
- 适合：学术研究、本地实验、对性能要求高但不需分布式

**Pgvector**
- PostgreSQL 官方扩展，SQL 语法操作向量
- 复用现有 PG 基础设施（备份、高可用、权限）
- 适合：团队已有 PostgreSQL，不想引入新组件

**Milvus**
- 云原生架构，支持十亿级向量
- 功能最全：混合搜索、动态 schema、多副本
- 适合：大规模生产系统、需要分布式扩展

**Redis**
- 内存级速度，毫秒级响应
- 支持向量搜索作为辅助功能
- 适合：超低延迟场景、已有 Redis 基础设施

**Elasticsearch**
- 老牌搜索引擎，现支持向量
- 最大优势：关键词搜索 + 向量搜索混合
- 适合：需要同时支持精确关键词匹配和语义匹配

### 3.3 选型决策树

```
开始
  │
  ├─ 只是学习/原型 → Chroma
  │
  ├─ 已有 PostgreSQL → Pgvector
  │
  ├─ 十亿级向量 / 云原生 → Milvus
  │
  ├─ 需要超低延迟（<10ms）→ Redis
  │
  ├─ 需要关键词+向量混合 → Elasticsearch
  │
  └─ 本地研究/高性能 → FAISS
```

---

## 第四章：LangChain 实战（精简版）

> 本章只讲**核心常用代码**，次要内容简要带过。

### 4.1 环境准备

```bash
pip install langchain langchain-community chromadb openai tiktoken
# 按需安装：unstructured pypdf docx2txt jq redis dashscope
```

### 4.2 核心组件速览

| 组件 | 作用 | 常用类 |
|------|------|--------|
| 文档加载器 | 读取各种格式文档 | `TextLoader`, `PyPDFLoader`, `CSVLoader`, `Docx2txtLoader`, `JSONLoader` |
| 文本分割器 | 切分长文档 | `RecursiveCharacterTextSplitter`（首选） |
| Embedding模型 | 文本向量化 | `OpenAIEmbeddings`, `HuggingFaceEmbeddings`, `DashScopeEmbeddings` |
| 向量数据库 | 存储与检索 | `Chroma`（学习）, `Redis`（生产）, `FAISS`（本地） |
| 检索器 | 查询相关文档 | `as_retriever(k=4)` |
| LLM | 生成答案 | `ChatOpenAI`, `init_chat_model`（阿里千问） |
| Prompt模板 | 组装提示词 | `PromptTemplate`, `ChatPromptTemplate` |

### 4.3 文档加载器（常用示例）

```python
# 纯文本
from langchain_community.document_loaders import TextLoader
loader = TextLoader("file.txt", encoding="utf-8")
docs = loader.load()

# PDF
from langchain_community.document_loaders import PyPDFLoader
loader = PyPDFLoader("file.pdf", extraction_mode="plain")
docs = loader.load()

# Word
from langchain_community.document_loaders import Docx2txtLoader
loader = Docx2txtLoader("file.docx")
docs = loader.load()

# CSV
from langchain_community.document_loaders.csv_loader import CSVLoader
loader = CSVLoader(file_path="file.csv")
docs = loader.load()

# JSON
from langchain_community.document_loaders import JSONLoader
loader = JSONLoader(file_path="file.json", jq_schema=".", text_content=False)
docs = loader.load()
```

> 其他加载器（Markdown、HTML、目录批量等）用法类似，按需查阅文档。

### 4.4 文本分割器

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,      # 每块最大字符数
    chunk_overlap=50,    # 块间重叠
)
chunks = splitter.split_documents(docs)
```

### 4.5 Embedding 模型

```python
# OpenAI
from langchain_openai import OpenAIEmbeddings
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# HuggingFace 本地（中文推荐）
from langchain_community.embeddings import HuggingFaceEmbeddings
embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-large-zh")

# 阿里千问
from langchain_community.embeddings import DashScopeEmbeddings
embeddings = DashScopeEmbeddings(model="text-embedding-v3", dashscope_api_key=api_key)
```

### 4.6 向量数据库

```python
# Chroma（学习推荐）
from langchain_community.vectorstores import Chroma
vector_store = Chroma.from_documents(chunks, embeddings, persist_directory="./db")
vector_store.persist()

# Redis（生产推荐）
from langchain_community.vectorstores import Redis
vector_store = Redis.from_documents(docs, embeddings, redis_url="redis://localhost:6379", index_name="my_index")

# FAISS（本地快速）
from langchain_community.vectorstores import FAISS
vector_store = FAISS.from_documents(chunks, embeddings)
vector_store.save_local("./faiss_index")
```

### 4.7 检索器

```python
retriever = vector_store.as_retriever(search_kwargs={"k": 4})  # 返回 Top-4
```

### 4.8 LLM 模型

```python
# OpenAI
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

# 阿里千问
from langchain.chat_models import init_chat_model
llm = init_chat_model(model="qwen-plus", model_provider="openai", api_key=api_key, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")
```

### 4.9 Prompt 模板

```python
from langchain_core.prompts import PromptTemplate

template = """基于以下上下文回答问题：
上下文：{context}
问题：{question}"""
prompt = PromptTemplate(template=template, input_variables=["context", "question"])
```

### 4.10 完整 RAG Chain

```python
from langchain_core.runnables import RunnablePassthrough

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
)

result = rag_chain.invoke("你的问题")
print(result.content)
```

### 4.11 完整问答实例（阿里千问 + Redis）

```python
# complete_rag_example.py
import os
from langchain.chat_models import init_chat_model
from langchain_community.document_loaders import Docx2txtLoader
from langchain_core.prompts import PromptTemplate
from langchain_classic.text_splitter import CharacterTextSplitter
from langchain_core.runnables import RunnablePassthrough
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_community.vectorstores import Redis

# 1. 初始化 LLM
llm = init_chat_model(
    model="qwen-plus",
    model_provider="openai",
    api_key=os.getenv("aliQwen-api"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

# 2. Prompt 模板
prompt_template = """
请使用以下提供的文本内容来回答问题。仅使用提供的文本信息，
如果文本中没有相关信息，请回答"抱歉，提供的文本中没有这个信息"。

文本内容：{context}
问题：{question}
回答：
"""
prompt = PromptTemplate(template=prompt_template, input_variables=["context", "question"])

# 3. Embedding
embeddings = DashScopeEmbeddings(model="text-embedding-v3", dashscope_api_key=os.getenv("aliQwen-api"))

# 4. 加载文档
loader = Docx2txtLoader("alibaba-java.docx")
documents = loader.load()

# 5. 分割文档
text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
texts = text_splitter.split_documents(documents)

# 6. 创建 Redis 向量库
vector_store = Redis.from_documents(
    documents=documents,
    embedding=embeddings,
    redis_url="redis://localhost:6379",
    index_name="my_index",
)

# 7. 检索器
retriever = vector_store.as_retriever(search_kwargs={"k": 2})

# 8. RAG Chain
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
)

# 9. 提问
result = rag_chain.invoke("00000和A0001分别是什么意思")
print(result.content)
```

---

## 第五章：参数调优与最佳实践

### 5.1 核心参数调优指南

#### chunk_size 选择

| 文档类型 | 推荐值 | 原因 |
|---------|--------|------|
| 产品问答 | 200-300 字符 | 每个问答短小精悍 |
| 技术文档 | 500-800 字符 | 段落通常较长 |
| 法律条文 | 300-500 字符 | 条款需保持独立 |
| 长篇文章 | 1000-1500 字符 | 保持上下文连贯 |

#### chunk_overlap 设置

```
chunk_overlap = chunk_size × (10% ~ 20%)
```

#### Top-K 选择

| K 值 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| 3 | 答案集中在少数段落 | 精准 | 可能遗漏信息 |
| 5 | **通用推荐** | 平衡 | - |
| 10 | 需要广泛上下文 | 信息全面 | 噪声增多，成本增加 |

### 5.2 进阶优化技术（简介）

| 技术 | 一句话说明 |
|------|-----------|
| **多查询检索** | 将问题改写成多个角度，分别检索后合并 |
| **父文档检索** | 存小块（精准匹配），返回大块（完整上下文） |
| **自查询检索** | 从问题中提取语义条件 + 元数据过滤条件 |
| **重排序** | 检索更多结果，用更强模型重新排序取 Top-K |

### 5.3 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 答案不相关 | chunk 太大含噪声 | 减小 `chunk_size` |
| 丢失关键信息 | chunk 太小切断上下文 | 增大 `chunk_size` 或 `overlap` |
| 检索不到 | 问题表述与文档不匹配 | 使用多查询检索 |
| 回答“不知道”但有文档 | Embedding 模型不适合中文 | 换 `BAAI/bge-large-zh` |
| 速度慢 | 向量库太大 | 添加索引、使用 GPU |
| 成本高 | Top-K 或 chunk 太大 | 减小 K 和 `chunk_size` |

### 5.4 推荐起步配置

```python
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
retriever = vector_store.as_retriever(search_kwargs={"k": 4})
```


