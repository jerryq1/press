---
title: Elasticsearch Python 异步连接示例文档
date: 2026-04-27
abstract: Elasticsearch Python 异步连接示例
tags:
- Ai实战项目
---

# Elasticsearch Python 异步连接示例文档

## 1. Elasticsearch 是什么？

| 表达方式 | 说明 |
| :--- | :--- |
| **官方描述** | 一个基于 Lucene 的分布式、RESTful 风格的搜索和分析引擎 |
| **生活比喻** | 像 **图书馆的巨型索引卡**，可以瞬间在几百万本书中找到包含某个词的所有书 |

---

## 2. 完整示例代码（基于您的 EsClientManager）

```python
import sys
import os
import asyncio

# 添加项目路径（根据您的项目结构调整）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from elasticsearch import AsyncElasticsearch
from app.conf.app_config import ESConfig, app_config


class EsClientManager:
    """
    Elasticsearch 客户端管理器
    负责创建和管理异步连接的生命周期
    """
    def __init__(self, config: ESConfig):
        # client: AsyncElasticsearch | None 表示可能为空，初始化后再赋值
        self.client: AsyncElasticsearch | None = None
        self.config: ESConfig = config

    def _get_url(self):
        """构建连接 URL，格式: http://host:port"""
        return f"http://{self.config.host}:{self.config.port}"

    def init(self):
        """初始化客户端，建立连接池"""
        # AsyncElasticsearch: 异步版本的 ES 客户端
        # hosts: 服务器地址列表，支持多节点负载均衡
        self.client = AsyncElasticsearch(hosts=[self._get_url()])

    async def close(self):
        """关闭连接，释放资源（必须调用，否则会连接泄漏）"""
        await self.client.close()


# 全局单例实例（从配置文件读取连接参数）
es_client_manager = EsClientManager(app_config.es)


async def main():
    # 1. 初始化连接
    es_client_manager.init()
    client = es_client_manager.client

    try:
        # 2. 删除已存在的索引（ignore_unavailable=True 表示不存在时不报错）
        await client.indices.delete(index="books", ignore_unavailable=True)

        # 3. 创建新索引（相当于关系型数据库中的"表"）
        await client.indices.create(index="books")

        # 4. 添加单条文档
        # index() 方法：插入或替换文档
        await client.index(
            index="books",
            document={
                "name": "Snow Crash",
                "author": "Neal Stephenson",
                "release_date": "1992-06-01",
                "page_count": 470
            },
        )

        # ⭐ 关键：强制刷新索引
        # Elasticsearch 默认每秒刷新一次，新写入的文档需要等待刷新后才能被搜索
        # refresh() 强制执行一次刷新，使文档立即可搜索（测试/开发时很有用）
        await client.indices.refresh(index="books")
        print("✅ 索引已刷新，文档现在可被搜索")

        # 5. 搜索数据
        # search(): 核心搜索方法
        # query: 查询条件，使用 ES 的 Query DSL 语法
        #   match: 全文搜索，会分词后匹配
        #   {"name": "Snow"} 表示在 name 字段中搜索包含 "Snow" 的文档
        resp = await client.search(
            index="books",
            query={"match": {"name": "Snow"}}
        )

        # resp 结构:
        # {
        #   "hits": {
        #     "total": {"value": 匹配总数},
        #     "hits": [文档列表]  # 每个文档包含 _source（原始数据）
        #   }
        # }
        print(f"找到 {resp['hits']['total']['value']} 条记录")

        for hit in resp['hits']['hits']:
            print(f"搜索结果: {hit['_source']['name']}")

    finally:
        # 6. 关闭连接（必须执行）
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
```

**预期输出：**
```
✅ 索引已刷新，文档现在可被搜索
找到 1 条记录
搜索结果: Snow Crash
```

---

## 3. 核心知识点解释

### 3.1 为什么要 refresh()？

| 对比 | 不调用 refresh() | 调用 refresh() |
| :--- | :--- | :--- |
| **写入后状态** | 文档在内存缓冲区，未上架 | 文档刷到磁盘，立即可搜索 |
| **搜索结果** | `total.value: 0`（搜不到） | `total.value: 1`（能搜到） |
| **生活比喻** | 书还了但还在推车里没上架 | 书已经放到书架上 |

### 3.2 异步客户端特点

| 表达方式 | 说明 |
| :--- | :--- |
| **官方描述** | 基于 `asyncio` 的非阻塞 I/O 客户端，等待响应时释放事件循环 |
| **生活比喻** | 咖啡店**点单后立刻转身服务下一位客人**，而不是等咖啡做好 |

---

## 4. 常用操作速查

```python
# 批量插入（需要 from elasticsearch.helpers import async_bulk）
docs = [{"_index": "books", "_source": {...}}]
success, failed = await async_bulk(client, docs)

# 获取单条文档
doc = await client.get(index="books", id="document_id")

# 更新文档
await client.update(index="books", id="doc_id", doc={"field": "new_value"})

# 删除文档
await client.delete(index="books", id="doc_id")

# 删除索引
await client.indices.delete(index="books", ignore_unavailable=True)
```

---

## 5. 官方文档链接

| 文档                          | 地址 |
|:----------------------------| :--- |
| **Elasticsearch(8.19)入门指南** | https://www.elastic.co/guide/en/elasticsearch/reference/8.19/getting-started.html |
| **Python 客户端文档**            | https://www.elastic.co/docs/reference/elasticsearch/clients/python |

---

