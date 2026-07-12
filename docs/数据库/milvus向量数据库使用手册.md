---
title: Milvus 向量数据库使用手册
date: 2026-07-02
abstract: Milvus 向量数据库介绍
tags:
- 数据库
---


#  Milvus 向量数据库使用手册

本手册旨在为开发人员提供关于 Milvus 向量数据库在本项目中从基本概念、Docker 部署、数据表结构设计、核心增删改查（CRUD）到双路混合检索（Hybrid Search）的完整实战指南。文档配备了大量通俗易懂的“生活比喻”以及详尽的 Python 代码注释，适合新手快速学习与参考。

---

## 🔍 说明目录 (TOC)
* [1. 官方资源地址](#1-官方资源地址)
* [2. 用生活常识搞懂 Milvus 核心概念](#2-用生活常识搞懂-milvus-核心概念)
* [3. 部署与建立连接](#3-部署与建立连接)
* [4. 数据表 (Collection) 与 Schema 设计 (建表)](#4-数据表-collection-与-schema-设计-建表)
* [5. 集合生命周期：加载 (Load) 与释放 (Release)](#5-集合生命周期加载-load-与释放-release)
* [6. Milvus 的基本数据操作 (CRUD)](#6-milvus-的基本数据操作-crud)
* [7. 向量化与混合索引构建](#7-向量化与混合索引构建)
* [8. 双路混合检索与评委重排 (Rerank)](#8-双路混合检索与评委重排-rerank)
* [9. 项目中的实际应用代码解析 (`node_item_name_confirm.py`)](#9-项目中的实际应用代码解析-node_item_name_confirmpy)
* [10. 常见问题排查 (FAQ)](#10-常见问题排查-faq)

---

## 1. 官方资源地址

在学习和开发过程中，推荐随时查阅官方最新版本的开发手册：
* **Milvus 官方主页**：[https://milvus.io](https://milvus.io)
* **Milvus 官方英文文档**：[https://milvus.io/docs](https://milvus.io/docs)
* **PyMilvus (Python SDK) 开发者手册**：[https://milvus.io/api-reference/pymilvus/v2.4.x/About.md](https://milvus.io/api-reference/pymilvus/v2.4.x/About.md)

---

## 2. 用生活常识搞懂 Milvus 核心概念

### 2.1 什么是向量数据库？
* **官方定义**：专门用于存储、检索和管理高维向量（Embedding）特征的非关系型数据库。
* **生活比喻**：它是一个**“凭感觉和气质”的智能配对系统**。
    * 传统数据库（如 MySQL）就像**“核对暗号”**：你查“万用表”，它就必须在书里死板地去对“万用表”这三个字，字错一个都不行。
    * 向量数据库就像**“看脸找人”**：你问“那个能测电压的电子仪器”，它虽然找不到字面一样的词，但它能“感觉”出你描述的就是“万用表”，从而将它们成功匹配。

### 2.2 稠密向量（Dense） vs. 稀疏向量（Sparse）
本项目选用 **BGE-M3** 双路向量模型，会将文本同时转化为“稠密向量”和“稀疏向量”。
* **稠密向量 (Dense Vector)**
    * *官方概念*：一个固定长度（通常为 1024 维）的连续浮点数数组，用来捕捉句子的深层语义信息。
    * *生活比喻*：它代表一个人的**“整体气质和神态”**。比如“开心”、“喜悦”、“乐开花”字面完全不同，但它们的“气质”是极其相似的。稠密向量擅长进行**语义理解**。
* **稀疏向量 (Sparse Vector)**
    * *官方概念*：一个键值对（Key-Value）组成的稀疏矩阵，键代表词的编号，值代表词的频次和重要性。
    * *生活比喻*：它代表个人护照上的**“出入境钢印”**。它非常死板，只关心你有没有去过“HAK180”或“徐展宏”这几个特定的地方。只要印章对上了，哪怕气质不同也能精准匹配。稀疏向量擅长进行**精准的关键字匹配**（类似于升级版的 BM25 算法）。

### 2.3 度量类型 (Metric Type) —— 怎么算“三观相近度”？
在本项目中，我们使用 **Cosine（余弦相似度）** 来度量相似度：
* *生活比喻*：**“三观夹角测试”**。我们不在乎两个人说话的字数多寡（向量的长度），我们只看他们谈话的逻辑方向（向量在多维空间中的夹角）是不是一致。如果方向完全相同，夹角余弦值就是 `1.0`（百分之百匹配）；方向如果垂直，夹角余弦值就是 `0`（完全不相干）。

---

## 3. 部署与建立连接

### 3.1 极简 Docker 部署（开发环境）
你可以使用 `docker-compose.yaml` 在本地快速拉起一个单机版 Milvus 服务。通常暴露以下两个端口：
* `19530`：客户端 SDK 连接端口（Python API 连接使用此端口）。
* `9091`：系统监控和指标输出端口。

### 3.2 Python 客户端连接代码（单例模式）
在项目里，我们使用 PyMilvus SDK 来和 Milvus 服务通信。我们采用**单例模式**防止连接资源被重复创建。

```python
# 引入 Milvus 的客户端对象
from pymilvus import MilvusClient
import os

# 全局单例连接对象缓存，避免多次初始化产生连接泄露
_milvus_client = None

def get_milvus_client():
    """
    获取 Milvus 客户端连接 (单例模式)
    """
    global _milvus_client
    # 💡 高级语法解读：
    # 如果 _milvus_client 已经存在，则直接返回，避免重复连接
    # 对应传统简单写法：
    #   if _milvus_client != None:
    #       return _milvus_client
    if _milvus_client is not None:
        return _milvus_client

    # 读取环境变量中的 Milvus URL (本地通常为 http://localhost:19530)
    milvus_url = os.getenv("MILVUS_URL", "http://localhost:19530")
    try:
        # 建立连接，并设置 3 秒超时限制，超过 3 秒连不上则报错
        _milvus_client = MilvusClient(uri=milvus_url, timeout=3.0)
        return _milvus_client
    except Exception as e:
        print(f"连接 Milvus 失败，请检查 Docker 服务是否拉起: {e}")
        return None
```

---

## 4. 数据表 (Collection) 与 Schema 设计 (建表)

在插入向量前，我们必须规划好“表的字段网格（Schema）”。建表过程包含：**定义字段 ➔ 声明 Schema ➔ 创建表**。

* **生活比喻**：建 Collection 就像**“规划抽屉网格”**，必须提前定好哪个格装主键，哪个格装字符串，哪个格装稠密向量，哪个格装稀疏向量。装错了抽屉就拉不上了。

```python
from pymilvus import DataType

def create_knowledge_collection(client: MilvusClient, collection_name: str):
    """
    创建一个支持双路向量检索的知识库集合 (建表)
    """
    # 1. 确认该集合是否存在，如果已经存在则先删除 (方便新手重新调试)
    if client.has_collection(collection_name):
        client.drop_collection(collection_name)
    
    # 2. 定义字段 Schema (相当于定义表里的列)
    schema = client.create_schema(
        auto_id=False,            # 不自动递增生成主键，使用我们自定义的主键 ID
        enable_dynamic_field=True # 开启动态字段支持，允许插入未预定义的标量字段
    )
    
    # 3. 往 Schema 里添加各个具体字段
    # 主键字段 (VARCHAR 字符串类型，最大长度 64)
    schema.add_field(field_name="id", datatype=DataType.VARCHAR, max_length=64, is_primary=True)
    
    # 业务名称字段 (用来存真实的商品/实体名称，如 'BrotherHAK180烫金机')
    schema.add_field(field_name="item_name", datatype=DataType.VARCHAR, max_length=256)
    
    # 稠密向量字段 (BGE-M3 的维度固定为 1024 维)
    schema.add_field(field_name="dense_vector", datatype=DataType.FLOAT_VECTOR, dim=1024)
    
    # 稀疏向量字段 (SPARSE_FLOAT_VECTOR 用于存放稀疏键值对词频)
    schema.add_field(field_name="sparse_vector", datatype=DataType.SPARSE_FLOAT_VECTOR)

    # 4. 创建集合
    client.create_collection(
        collection_name=collection_name,
        schema=schema
    )
    print(f"成功创建集合: {collection_name}")
```

---

## 5. 集合生命周期：加载 (Load) 与释放 (Release)

这是新手最容易踩坑的地方！**在 Milvus 中，所有的向量必须装载到内存后才能执行 Search 或 Query。**

* **生活比喻**：**“从书架拿书到书桌”**。
  Milvus 的数据平时存在硬盘里（书架上）。要看资料前，必须先调用 `load_collection` 把它抱到桌面上。书桌空间有限，不用时可以调用 `release_collection` 放回书架。

```python
# 💡 在进行检索（search）或查询（query）前，必须装载集合：
client.load_collection("kb_item_names")

# 💡 当完成数据入库，且近期无查询需求，为节约服务器内存：
client.release_collection("kb_item_names")
```

---

## 6. Milvus 的基本数据操作 (CRUD)

### 6.1 增 (Insert) —— 插入数据
批量向集合中写入数据，注意数据结构需要与 Schema 严格对齐。

```python
def insert_item_record(client: MilvusClient, collection_name: str, item_id: str, name: str, dense_emb: list, sparse_emb: dict):
    """
    向 Milvus 中插入一条多路特征数据
    """
    # 构造数据字典
    data = [
        {
            "id": item_id,
            "item_name": name,
            "dense_vector": dense_emb,   # 1024维浮点数列表
            "sparse_vector": sparse_emb   # BGE-M3产生的词频字典，如 {345: 0.12, 10294: 0.95}
        }
    ]
    # 执行写入操作
    result = client.insert(
        collection_name=collection_name,
        data=data
    )
    print(f"数据插入成功，写入条数: {result['insert_count']}")
```

### 6.2 删 (Delete) —— 删除数据
使用标量过滤表达式（Filter Expression）删除符合条件的实体。

```python
def delete_item_by_id(client: MilvusClient, collection_name: str, item_id: str):
    """
    根据主键ID删除 Milvus 中的指定数据
    """
    # 构造标量过滤条件 (支持 ==, !=, in, >, < 等关系运算)
    filter_expr = f"id == '{item_id}'"
    
    # 执行删除
    client.delete(
        collection_name=collection_name,
        filter_expr=filter_expr
    )
    print(f"成功执行删除，过滤条件为: {filter_expr}")
```

### 6.3 改 (Upsert) —— 覆写式更新
* **重要概念**：出于底层索引效率考量，向量数据库通常**不支持传统关系型数据库里的原地 Update 字段更新**。
* **修改实现**：Milvus 采用 **`upsert` (更新或插入)** 机制。如果主键 ID 在数据库中已存在，则用新传入的向量和标量完全覆写该条旧记录；如果不存在，则作为新数据插入。

```python
def upsert_item_record(client: MilvusClient, collection_name: str, item_id: str, new_name: str, new_dense: list, new_sparse: dict):
    """
    更新或覆写 Milvus 中的一条记录
    """
    data = [
        {
            "id": item_id,
            "item_name": new_name,
            "dense_vector": new_dense,
            "sparse_vector": new_sparse
        }
    ]
    # 执行覆写更新
    client.upsert(
        collection_name=collection_name,
        data=data
    )
    print(f"数据更新/覆写成功, ID: {item_id}")
```

### 6.4 查 (Query vs. Search) —— 精确过滤查询
在 Milvus 中，普通的**属性条件查询（Query）**和**向量相似度检索（Search）**是完全不同的两套接口。
* **Query**：类似于 SQL 中的 `SELECT * WHERE`，仅对标量属性进行精确过滤（如找 `id == '001'` 或 `item_name LIKE 'Brother%'`），不进行向量距离计算。

```python
def query_item_by_name(client: MilvusClient, collection_name: str, target_name: str):
    """
    使用标量过滤表达式精确查询数据
    """
    # 查询 item_name 等于 target_name 的记录
    # ⚠️ 特别注意：为防止转义符、引号造成解析错误，推荐使用 escape 函数转义特殊字符
    filter_expr = f"item_name == '{target_name}'"
    
    # 执行属性查询
    results = client.query(
        collection_name=collection_name,
        filter_expr=filter_expr,
        output_fields=["id", "item_name"] # 限制返回的字段名，节约传输带宽
    )
    return results
```

---

## 7. 向量化与混合索引构建

在插入向量并加载后，为了在检索时获得飞一样的速度，我们需要为向量建立索引。

### 7.1 稠密索引：HNSW (分层小世界网络)
* **生活比喻**：**“六度空间与高速公路网”**。
  HNSW 将所有向量连接成图。最上层是“高速公路”，你可以跨省飞跃；最底层是“街头小巷”，用于精细定位。检索时，先在高层快速锁定省份区域，再逐步跳入低层找目标邻居，避开了把全国所有小路都摸排一遍的蠢办法。

### 7.2 稀疏索引：Sparse Inverted Index (倒排索引)
* **生活比喻**：书本末尾的**“关键词页码索引”**。
  想要查找包含“万用表”的数据，直接从倒排索引查找哪些页码包含这个词，不需要一页页去翻正文。

```python
# 1. 稠密向量索引参数配置
dense_index_params = {
    "metric_type": "COSINE",     # 相似度度量夹角余弦
    "index_type": "HNSW",        # 选用基于图层分级网络的 HNSW 索引
    "params": {
        "M": 16,                 # 每个节点的最大邻居数 (值越大越精准，但建索引越慢)
        "efConstruction": 200    # 构建时搜索范围 (值越大质量越好)
    }
}

# 2. 稀疏向量索引参数配置
sparse_index_params = {
    "metric_type": "IP",         # 稀疏向量相似度强制使用内积计算 (归一化后等价余弦)
    "index_type": "SPARSE_INVERTED_INDEX", # 倒排索引
    "params": {
        "drop_ratio_build": 0.2  # 舍弃权重小于 20% 的细微干扰词词频，极大压缩索引体积
    }
}

# 3. 绑定列字段并创建索引
client.create_index(
    collection_name="kb_item_names",
    field_name="dense_vector",    # 对稠密向量列建索引
    index_params=dense_index_params
)

client.create_index(
    collection_name="kb_item_names",
    field_name="sparse_vector",   # 对稀疏向量列建索引
    index_params=sparse_index_params
)
```

---

## 8. 双路混合检索与评委重排 (Rerank)

### 8.1 为什么需要混合检索？
纯语义检索（Dense）容易漏掉精确的专属型号（比如把 `BrotherHAK180` 算成和 `HAK200` 高度相似）；而纯关键字检索（Sparse/BM25）又由于用户口语化表达（如“这个东西怎么换电池”）缺乏专有名词而面临检索失败。
两者互补就是**混合检索**。

### 8.2 评委折算权重（WeightedRanker）
* **生活比喻**：**“期末总成绩折算”**。
  因为 Dense 的余弦分和 Sparse 的内积词频分不在同一个维度。我们需要安排两位“评委”打分，最后根据权重算总分：
    * **评委一（Dense）**：打语义相似分（占比 80%）。
    * **评委二（Sparse）**：打拼写及关键字命中分（占比 20%）。
    * **总得分** = $Dense \times 0.8 + Sparse \times 0.2$。

```python
from pymilvus import AnnSearchRequest, WeightedRanker

def execute_hybrid_search(client: MilvusClient, collection_name: str, dense_vector: list, sparse_vector: dict, limit: int = 5):
    """
    执行混合双路向量检索并获得重排结果
    """
    # 1. 封装稠密通道的检索请求
    req_dense = AnnSearchRequest(
        data=[dense_vector],
        anns_field="dense_vector",
        param={"metric_type": "COSINE", "params": {"ef": 50}}, # 运行时检索广度为 50
        limit=limit
    )

    # 2. 封装稀疏通道的检索请求
    req_sparse = AnnSearchRequest(
        data=[sparse_vector],
        anns_field="sparse_vector",
        param={"metric_type": "IP", "params": {}},
        limit=limit
    )

    # 3. 指定双路评委的比重为 0.8 : 0.2
    ranker = WeightedRanker(0.8, 0.2)

    # 4. 调用 hybrid_search 执行双路检索融合
    results = client.hybrid_search(
        collection_name=collection_name,
        reqs=[req_dense, req_sparse],
        ranker=ranker,
        limit=limit,
        output_fields=["item_name"] # 额外获取商品名这一标量列以便做实体对齐
    )
    return results
```

---

## 9. 项目中的实际应用代码解析 (`node_item_name_confirm.py`)

在咱们项目的主干业务逻辑中，我们在商品名确认节点里对 Milvus 进行了集成调用。下面是 `node_item_name_confirm.py` 内部的核心检索调用封装：

```python
# -*- coding: utf-8 -*-
import os
import logging
from typing import List, Dict, Any
from app.clients.milvus_utils import get_milvus_client, create_hybrid_search_requests, hybrid_search
from app.lm.embedding_utils import generate_embeddings

def step_4_vectorize_and_query(item_names: List[str]) -> List[Dict]:
    """
    对提取到的歧义/模糊名词进行向量化，并在 Milvus (kb_item_names 表) 中检索标准实体名
    """
    results = []
    
    # 1. 获取 Milvus 连接池中的单例客户端
    client = get_milvus_client()
    if not client:
        logging.error("Failed to connect to Milvus, skipping query")
        return results

    # 读取环境变量中的集合表名
    collection_name = os.environ.get("ITEM_NAME_COLLECTION", "kb_item_names")

    # 2. 批量进行文本向量化 (包含稠密和稀疏)，大幅降低网络IO延迟
    embeddings = generate_embeddings(item_names)

    # 3. 遍历提取的名词，依次发起双路相似度对齐检索
    # 💡 对应传统简单写法对照：
    #   for i in range(len(item_names)):
    #       name = item_names[i]
    #       dense = embeddings["dense"][i]
    #       sparse = embeddings["sparse"][i]
    #       ... (依次打包发送检索并提取结果)
    for i, name in enumerate(item_names):
        try:
            dense_vector = embeddings.get("dense")[i]
            sparse_vector = embeddings.get("sparse")[i]

            # 4. 构建子查询请求包
            reqs = create_hybrid_search_requests(
                dense_vector=dense_vector,
                sparse_vector=sparse_vector,
                limit=5
            )

            # 5. 调用检索方法，混合系数设为 稠密(0.8) + 稀疏(0.2)，开启动态分数归一化 (norm_score=True)
            search_res = hybrid_search(
                client=client,
                collection_name=collection_name,
                reqs=reqs,
                ranker_weights=(0.8, 0.2),
                limit=5,
                norm_score=True,
                output_fields=["item_name"]
            )

            # 6. 整理匹配项的得分列表，供下游判定 (分值高于 0.85 自动对齐，0.6~0.85 用户确认)
            matches = []
            if search_res and len(search_res) > 0:
                for hit in search_res[0]:
                    matches.append({
                        "item_name": hit.get("entity", {}).get("item_name"), # 获取对齐后的实体名
                        "score": hit.get("distance")                        # 0~1 的相似度评分
                    })

            results.append({
                "extracted_name": name,
                "matches": matches
            })

        except Exception as e:
            logging.error(f"Error searching item '{name}' in Milvus: {e}")

    return results
```

---

## 10. 常见问题排查 (FAQ)

### Q1: 检索时遇到 `collection not loaded` 报错怎么解决？
* **原因**：Milvus 中集合还没有被抱到“内存书桌上”。
* **解决**：在查询执行前，执行 `client.load_collection("集合名")`。

### Q2: 插入数据或检索时，报错提示 `Dimension mismatch: expected 1024, got 768`？
* **原因**：BGE-M3 模型产生的稠密特征维度是 1024，而当初建 Collection 字段 Schema 时，`dim` 参数错误写成了 768。
* **解决**：需要先 drop 掉这个 Collection，重新按照本文档中 [第 4 节](#4-数据表-collection-与-schema-设计-建表) 的 Schema 规范，设定维度 `dim=1024` 重新建表。

### Q3: 混合检索时，稀疏向量字段的距离度量为什么强制用 `IP`？
* **原因**：Milvus 对稀疏向量索引的内置公式仅对 `IP` (内积) 有最快、最直接的算法支撑，通过对向量做 L2 归一化后，`IP` 结果与 Cosine 完全等价，请放心使用。
