---
title: text-embeddings-inference Python 异步连接示例文档
date: 2026-04-27
abstract: text-embeddings-inference Python 异步连接示例文档
tags:
- Ai实战项目
---

# text-embeddings-inference Python 异步连接示例文档

## 1. text-embeddings-inference 是什么？

| 表达方式 | 说明 |
| :--- | :--- |
| **官方描述** | 一个高性能、轻量级的 Embedding 模型推理服务，将文本转换为固定维度的浮点数向量，用于语义搜索。 |
| **生活比喻** | 像一家**照片冲印店**：您把文字送进去，它返回一张"向量照片"。语义相似的文字，照片也相似。 |

---

## 2. 完整示例代码（基于您的 EmbeddingClientManager）

### 安装依赖

```bash
uv add langchain-openai
```

### 代码

```python
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from langchain_openai import OpenAIEmbeddings
from app.conf.app_config import EmbeddingConfig, app_config


class EmbeddingClientManager:
    """
    Embedding 客户端管理器
    负责创建和管理异步连接
    """
    def __init__(self, config: EmbeddingConfig):
        self.client: OpenAIEmbeddings | None = None
        self.config: EmbeddingConfig = config

    def _get_url(self):
        """构建服务地址，格式: http://host:port/v1"""
        return f"http://{self.config.host}:{self.config.port}/v1"

    def init(self):
        """初始化客户端，建立连接"""
        print(f"🚀 正在初始化 Embedding 客户端: {self._get_url()}")
        self.client = OpenAIEmbeddings(
            model=self.config.model,        # 模型名称，如 "BAAI/bge-small-en-v1.5"
            openai_api_key="-",              # text-embeddings-inference 不需要认证
            openai_api_base=self._get_url()  # 服务基础地址，端口 8082
        )


emb_client_manager = EmbeddingClientManager(app_config.embedding)


async def main():
    # 1. 初始化连接
    emb_client_manager.init()
    client = emb_client_manager.client

    # 2. 单个文本向量化
    text = "测试一下"
    # aembed_query: 异步方法，将单个文本转换为向量
    # 返回值: 浮点数列表，维度取决于模型（如 384、768、1024）
    query_result = await client.aembed_query(text)
    print(f"文本: {text}")
    print(f"向量前三维: {query_result[:3]}")
    print(f"向量维度: {len(query_result)}")

    # 3. 批量文本向量化（性能更优）
    texts = ["文本1", "文本2", "文本3"]
    # aembed_documents: 批量向量化，一次请求处理多条文本
    batch_result = await client.aembed_documents(texts)
    print(f"批量处理 {len(batch_result)} 条文本")


if __name__ == "__main__":
    asyncio.run(main())
```

**预期输出：**
```
🚀 正在初始化 Embedding 客户端: http://localhost:8082/v1
文本: 测试一下
向量前三维: [0.023, -0.045, 0.012, ...]
向量维度: 384
批量处理 3 条文本
```

---

## 3. 核心知识点解释

### 3.1 单个 vs 批量处理

| 方法 | 用途 | 适用场景 |
| :--- | :--- | :--- |
| `aembed_query(text)` | 单个文本 → 单条向量 | 实时单条查询 |
| `aembed_documents(texts)` | 批量文本 → 多条向量 | 大量文本一次性处理 |

**生活比喻**：单个像寄一封信，批量像寄一麻袋信。批量性能更好。

### 3.2 配置说明

| 配置项 | 值 | 说明 |
| :--- | :--- | :--- |
| `host` | 服务地址 | 如 `localhost` |
| `port` | `8082` | 服务端口 |
| `model` | 模型名称 | 必须与服务器一致 |

---

## 4. 完整配置示例（app_config）

```python
# 在您的 app_config 中添加
class EmbeddingConfig:
    host: str = "localhost"
    port: int = 8082
    model: str = "BAAI/bge-small-en-v1.5"
```

---

## 5. 官方文档链接

| 文档 | 地址 |
| :--- | :--- |
| **text-embeddings-inference GitHub** | https://github.com/huggingface/text-embeddings-inference |
| **LangChain OpenAI Embeddings** | https://python.langchain.com/docs/integrations/text_embedding/openai |

---

## 6. 一句话总结

**`OpenAIEmbeddings` + `aembed_query` / `aembed_documents`** = 异步调用 text-embeddings-inference 服务，将文本转换为向量。记得批量处理以提升性能。
