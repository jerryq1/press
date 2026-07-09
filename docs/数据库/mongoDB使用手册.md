---
title: MongoDB 实战使用手册
date: 2026-07-01
abstract: MongoDB的一些实践经验
tags:
- 数据库
---

#  MongoDB 实战使用手册

---

## 1. MongoDB 介绍与核心特性

### 1.1 什么是 MongoDB？
**MongoDB** 是一个基于分布式文件存储的开源 NoSQL 数据库系统，由 C++ 语言编写。它旨在为现代 Web 应用及大模型（LLM/Agent）应用提供可扩展、高性能、高灵活性的数据存储解决方案。

* **官方网站**：[https://www.mongodb.com](https://www.mongodb.com)
* **官方中文文档**：[https://www.mongodb.com/zh-cn/docs](https://www.mongodb.com/zh-cn/docs)

### 1.2 核心特性与 RAG 场景契合点
* **面向文档（Document-Oriented）**：数据以 BSON（二进制 JSON）格式存储，字段可以任意嵌套。在 RAG 场景中，单条对话记录可能包含图片列表、提取的商品实体、检索的参考文档等，使用 MongoDB 能够以原生的 JSON 结构完美保存，省去了传统 SQL 数据库繁化复杂的建表和外键关联。
* **模式自由（Schema-less）**：同一个集合（Collection）内的文档不需要拥有完全相同的字段。这使得我们可以随时在聊天记录中追加新的元数据（如 Token 统计、耗时监控等），不需要运行任何数据库迁移（Migration）脚本。
* **高效的读写与索引**：支持单字段索引、复合索引及 TTL 自动过期索引，能够轻松应对高并发聊天记录写入，并且能以 0 毫秒的现场 CPU 消耗实现时间戳倒序输出。
* **高可用与易水平扩容**：原生支持副本集（Replica Set）实现主从备份、自动故障转移；支持分片集群（Sharding）把海量对话数据水平打散存储在多台服务器上。

---

## 2. Docker 部署与网络连通指南

本项目采用 **Docker** 对 MongoDB 进行容器化管理，并与 Milvus、MinIO 等服务统一集成。

### 2.1 方式一：Docker Compose 统一部署（推荐 ⭐⭐⭐⭐⭐）
在项目根目录下的 [docker-compose.yaml](file:///Users/jerry/Desktop/AI/rag_agent/docker/docker-compose.yaml) 中，我们已经集成了 MongoDB 服务配置：

```yaml
  # ==========================================
  # 5. MongoDB (存储历史对话记录，占用约150M内存)
  # ==========================================
  mongo:
    image: mongo:latest
    container_name: mongodb
    ports:
      - "27017:27017"            # 映射到宿主机 27017 端口
    volumes:
      - ./volumes/mongo/data:/data/db # 数据持久化挂载目录
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M           # 限制最大内存为 512M，保障主机系统流畅
```

#### 常用管理命令：
* **一键后台启动所有环境**（在根目录下执行）：
  ```bash
  docker compose -f docker/docker-compose.yaml up -d
  ```
* **查看 MongoDB 容器状态与日志**：
  ```bash
  docker compose -f docker/docker-compose.yaml ps
  docker compose -f docker/docker-compose.yaml logs -f mongo
  ```
* **停止环境**：
  ```bash
  docker compose -f docker/docker-compose.yaml down
  ```

### 2.2 方式二：Docker Standalone 独立运行
如果您只想单独启动一个 MongoDB 实例，可以运行以下命令：
```bash
docker run -itd --name mongo -p 27017:27017 -v ./mongo_data:/data/db mongo:latest
```

### 2.3 ⚠️ 避坑指南：Docker 网络互联（Docker DNS）
* **场景一：Python 服务直接运行在宿主机上（当前开发环境）**：
  此时连接字符串写：`mongodb://127.0.0.1:27017`，因为容器将 `27017` 端口映射到了主机的 `127.0.0.1`。
* **场景二：将来把 Python 服务也打包进同一个 Docker Compose 中运行**：
  此时由于 Python 运行在 Docker 虚拟网络内，写 `127.0.0.1` 会指向 Python 服务自身的容器，导致无法连接数据库。
  **解决方案**：必须修改连接字符串，将主机名改为 MongoDB 服务的服务名称（即 `container_name`）：
  ```text
  mongodb://mongodb:27017
  ```

---

## 3. MongoDB 核心功能：增、删、改、查（CRUD）详解

MongoDB 使用文档存储，其操纵语句与传统 SQL 有很大差异。下面我们通过命令行（`mongosh`）与 Python 原生驱动（`pymongo`）进行对比说明：

### 3.1 增加数据 (Create)
在集合中插入一条或多条文档。

#### 命令行客户端 (mongosh)：
* **插入单条**：
  ```javascript
  db.chat_message.insertOne({
      session_id: "session_001",
      role: "user",
      text: "万用表怎么换电池？",
      ts: new Date() // 使用 BSON Date 类型以适配 TTL 自动删除
  })
  ```
* **批量插入**：
  ```javascript
  db.chat_message.insertMany([
      { session_id: "session_001", role: "assistant", text: "拆开后盖更换即可", ts: new Date() },
      { session_id: "session_001", role: "user", text: "谢谢", ts: new Date() }
  ])
  ```

#### Python 驱动 (pymongo)：
* **插入单条**：
  ```python
  import datetime
  doc = {
      "session_id": "session_001", 
      "role": "user", 
      "text": "万用表怎么换电池？", 
      "ts": datetime.datetime.now() # 存储为 datetime 对象，在 MongoDB 中自动映射为 BSON Date
  }
  result = db.chat_message.insert_one(doc)
  print(f"新插入文档的ID为: {result.inserted_id}")
  ```

---

### 3.2 查询数据 (Read)
MongoDB 提供了极强的数据检索过滤、排序与分页机制。

#### 命令行客户端 (mongosh)：
* **等值查询（查找指定会话的消息）**：
  ```javascript
  db.chat_message.find({ session_id: "session_001" })
  ```
* **条件范围查询**（查找在 2026-07-01 之后生成的记录）：
  ```javascript
  // $gt: greater than (大于)
  db.chat_message.find({ ts: { $gt: new Date("2026-07-01") } })
  ```
* **多条件组合查询 (AND / OR)**：
  ```javascript
  // 查找 session_id 为 session_001 且 role 为 user 的记录
  db.chat_message.find({ session_id: "session_001", role: "user" })
  
  // 查找符合条件 A 或条件 B 的记录
  db.chat_message.find({
      $or: [
          { role: "user" },
          { rewritten_query: { $ne: "" } } // $ne: not equal (不等于)
      ]
  })
  ```
* **排序与限制**（查询最新的 10 条记录）：
  ```javascript
  // sort({ ts: -1 }): 按照 ts 降序排列 (最新在最前)
  // limit(10): 只取前 10 条
  db.chat_message.find({ session_id: "session_001" }).sort({ ts: -1 }).limit(10)
  ```

#### Python 驱动 (pymongo)：
* **代码内查询与游标读取**：
  ```python
  query = {"session_id": "session_001"}
  # pymongo 中升序使用 1 (或 pymongo.ASCENDING), 降序使用 -1 (或 pymongo.DESCENDING)
  cursor = db.chat_message.find(query).sort("ts", -1).limit(10)
  messages = list(cursor)
  ```

---

### 3.3 修改数据 (Update)
MongoDB 使用修改器（如 `$set`）实现部分更新，防止覆盖整篇文档。

#### 命令行客户端 (mongosh)：
* **修改单条（根据主键更新内容）**：
  ```javascript
  db.chat_message.updateOne(
      { _id: ObjectId("60c72b2f9b1d8b2bad000001") }, // 过滤条件
      { $set: { text: "修改后的问题内容", rewritten_query: "修改后的重写词" } } // 更新操作
  )
  ```
* **批量修改（将某些消息的商品名称全部追加）**：
  ```javascript
  db.chat_message.updateMany(
      { session_id: "session_001" },
      { $set: { item_names: ["数字万用表"] } }
  )
  ```

#### Python 驱动 (pymongo)：
* **代码内批量字段更新**：
  ```python
  filter_condition = {"_id": {"$in": [ObjectId("60c7..."), ObjectId("60c8...")]}}
  update_op = {"$set": {"item_names": ["新万用表"]}}
  result = db.chat_message.update_many(filter_condition, update_op)
  print(f"匹配到 {result.matched_count} 条，实际修改了 {result.modified_count} 条。")
  ```

---

### 3.4 删除数据 (Delete)
根据过滤条件删除单条或多条数据。

#### 命令行客户端 (mongosh)：
* **删除单条**：
  ```javascript
  db.chat_message.deleteOne({ _id: ObjectId("60c72b2f9b1d8b2bad000001") })
  ```
* **清空指定会话的全部记录**：
  ```javascript
  db.chat_message.deleteMany({ session_id: "session_001" })
  ```

#### Python 驱动 (pymongo)：
* **批量删除历史会话**：
  ```python
  result = db.chat_message.delete_many({"session_id": "session_001"})
  print(f"清空了 {result.deleted_count} 条聊天记录")
  ```

---

## 4. 索引（Index）深度解析与实战

索引是提高 MongoDB 查询和排序性能的关键。数据库会为索引在内存中维护一棵高效率的 B-Tree。

### 4.1 索引的分类与应用

#### 1. 单字段索引 (Single Field Index)
根据单个字段建立索引。
* **创建语法**：
  ```javascript
  db.chat_message.createIndex({ session_id: 1 })
  ```
* **说明**：支持快速定位会话。对于单字段索引，MongoDB 具有双向扫描能力，因此写 `1` (升序) 还是 `-1` (降序) 对单字段排序的耗时没有区别。

#### 2. 复合索引 (Compound Index) (⭐项目中使用)
由两个或多个字段组合构成的索引，顺序至关重要。
* **创建语法**：
  ```javascript
  db.chat_message.createIndex({ session_id: 1, ts: -1 })
  ```
* **匹配原则**：支持等值查询 `session_id`，并在此基础上加速 `ts` 字段的排序。
* **支持的排序查询**：
    * `.sort({ session_id: 1, ts: -1 })`（顺着扫）
    * `.sort({ session_id: -1, ts: 1 })`（完全反着扫）
* **不支持的排序查询**（会导致内存中重新排序）：
    * `.sort({ session_id: 1, ts: 1 })`（方向冲突）

#### 3. TTL 自动过期索引 (Time-To-Live Index) (⭐高频考点)
这是一种特殊类型的单字段索引，主要用于让旧数据到期自动物理销毁，防止硬盘撑满。
* **创建语法**：
  ```javascript
  // 让 chat_message 集合中的数据在 ts 字段代表的时间后 30 天 (2592000 秒) 自动删除
  db.chat_message.createIndex({ ts: 1 }, { expireAfterSeconds: 2592000 })
  ```
* **⚠️ 避坑提醒**：**TTL 索引字段必须是 BSON 的 Date 类型**。如果我们将时间戳保存为浮点数（Float，例如通过 `time.time()` 或 `.timestamp()` 获取的值），**TTL 线程无法识别，自动过期删除功能将彻底失效**。所以在入库时，必须将时间戳保存为 Python 原始的 `datetime.datetime.now()` 日期对象。

---

### 4.2 索引的管理与分析

#### 1. 查看集合下已有的索引：
```javascript
db.chat_message.getIndexes()
```
*返回类似如下结构，其中 `_id_` 是默认生成的主键索引，另一个是自定义的联合索引：*
```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  { "v": 2, "key": { "session_id": 1, "ts": -1 }, "name": "session_id_1_ts_-1" }
]
```

#### 2. 删除指定的索引：
```javascript
// 可以根据 getIndexes() 里获取到的 name 值来删除
db.chat_message.dropIndex("session_id_1_ts_-1")
```

#### 3. 分析查询是否走索引 (Explain)：
在执行语句后链式调用 `.explain("executionStats")`，可以获得执行计划分析。
```javascript
db.chat_message.find({ session_id: "session_001" }).sort({ ts: -1 }).explain("executionStats")
```
* **查阅关键指标**：
    * `stage`: 如果显示为 `IXSCAN` 代表走了索引扫描；如果显示为 `COLLSCAN` 则代表悲惨的全表扫描。
    * `totalDocsExamined`: 实际扫描的文档数。如果这个值接近返回的数据行数（如 10），说明索引极度精准；如果这个值特别大，说明发生了索引失效或无索引扫描。

---

## 5. MongoDB 其他企业级核心功能

### 5.1 副本集 (Replica Set) — 高可用与读写分离
在生产环境下，单机运行存在宕机丢失数据的风险。企业中会部署 3 台及以上机器组成副本集。

```mermaid
flowchart TD
    Client[客户端应用程序] -->|1. 写请求| Primary[(主节点 Primary)]
    Client -->|2. 读分流| Secondary1[(从节点 Secondary 1)]
    Client -->|2. 读分流| Secondary2[(从节点 Secondary 2)]
    Primary -->|3. 异步数据同步| Secondary1
    Primary -->|3. 异步数据同步| Secondary2
```

* **心跳检测**：节点之间每 2 秒发送一次心跳包。
* **自动故障转移**：如果主节点宕机，另外两个从节点会在秒级选出新的主节点继续工作，对外服务不中断。

### 5.2 分片 (Sharding) — 横向扩容终极武器
当单表的数据行数从千万跨越到亿级，服务器的内存和磁盘无法装下时，需要采用分片技术，把一个大集合的数据横向打散存放到多台物理机器上。

```mermaid
flowchart LR
    Client[客户端] --> Router[路由网关 mongos]
    Router --> Config[配置数据库]
    Router --> ShardA[(分片 A: 存储 user_id: A-H)]
    Router --> ShardB[(分片 B: 存储 user_id: I-Z)]
```
* **片键（Shard Key）**：数据分类的依据（如 `user_id`）。路由服务会根据片键自动把写入导流到不同分片，开发者查询时依旧只需面对一个统一的库，完全不用手动拆表。

### 5.3 聚合管道 (Aggregation Pipeline) — 数据报表与统计
除了基础查询，MongoDB 还支持聚合管道。它允许数据像流水线一样，经过一轮一轮的加工（筛选、分组、排序、累加）输出结果。

* **实战案例：统计每个会话中用户发了多少条消息**
  ```javascript
  db.chat_message.aggregate([
      // Step 1: 筛选出角色为用户的消息
      { $match: { role: "user" } },
      // Step 2: 按照 session_id 进行分组，并累加计数
      { $group: { _id: "$session_id", total_user_messages: { $sum: 1 } } },
      // Step 3: 按消息数从多到少排序
      { $sort: { total_user_messages: -1 } }
  ])
  ```

---

## 6. 核心可复用代码抽取与封装

您可以直接将以下经过严格测试、带有双轨制注释的代码复制到您新模块的客户端文件中（如 `mongo_history_utils.py`）进行直接复用：

```python
# -*- coding: utf-8 -*-
"""
MongoDB 历史对话读写工具包 (基于原生 PyMongo)
提供单例连接、安全索引初始化、会话增删改查等全套 API 接口。
"""

import os
import logging
import datetime
from typing import List, Dict, Any, Optional
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# 加载 .env 配置文件，使 os.getenv 能读取到 MONGO_URL 等参数
load_dotenv()

class HistoryMongoTool:
    """
    MongoDB 数据库连接管理工具类 (单例连接池包装)
    """
    def __init__(self):
        try:
            # 读取环境变量配置
            self.mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
            self.db_name = os.getenv("MONGO_DB_NAME", "knowledge_base")

            # 💡 优化点：添加 serverSelectionTimeoutMS=2000 参数
            # 控制连接超时时间为 2000毫秒（2秒）。若数据库离线，立刻抛出异常走熔断流程，
            # 从而防止默认的 30 秒超时策略导致后端服务大面积卡死和前端长时间挂起。
            self.client = MongoClient(
                self.mongo_url, 
                serverSelectionTimeoutMS=2000
            )
            self.db = self.client[self.db_name]
            
            # 获取/创建名为 chat_message 的聊天记录集合（相当于关系型数据库的表）
            self.chat_message = self.db["chat_message"]

            # 为集合建立联合索引：会话ID升序 + 时间戳降序，用来加速按会话拉取最新消息的性能
            # create_index 具有幂等性，如索引已存在，数据库会自动忽略，不会重复创建
            self.chat_message.create_index([("session_id", 1), ("ts", -1)])
            
            logging.info(f"Successfully connected to MongoDB: {self.db_name}")
        except Exception as e:
            logging.error(f"Failed to initialize MongoDB connection: {e}")
            raise


# 全局私有单例变量，防止模块加载时多次实例化导致连接数暴涨
_history_mongo_tool: Optional[HistoryMongoTool] = None

def get_history_mongo_tool() -> HistoryMongoTool:
    """
    获取 MongoDB 工具类的单例实例 (懒加载模式)
    """
    global _history_mongo_tool
    if _history_mongo_tool is None:
        _history_mongo_tool = HistoryMongoTool()
    return _history_mongo_tool


# ==========================================
# 核心通用 API 接口 (复用直接调用以下函数)
# ==========================================

def save_chat_message(
    session_id: str,
    role: str,
    text: str,
    rewritten_query: str = "",
    item_names: List[str] = None,
    image_urls: List[str] = None,
    message_id: str = None
) -> str:
    """
    保存或更新单条对话历史记录到数据库
    
    :param session_id: 会话唯一标识 (用来将一连串对话归属于同一个聊天框)
    :param role: 消息角色 (取值: 'user' 代表用户提问, 'assistant' 代表 AI 回复)
    :param text: 消息的文本正文
    :param rewritten_query: 大模型改写后的查询词 (可选，默认为空)
    :param item_names: 关联的实体/商品名称列表 (可选，默认为 None)
    :param image_urls: 关联的图片链接列表 (多模态场景用，可选，默认为 None)
    :param message_id: 消息的 _id (可选，传入则更新已有文档，不传则插入新文档)
    :return: 写入/更新文档的 ObjectId 字符串
    """
    # 💡 优化点：使用 datetime.datetime.now() BSON Date 存储，以支持 TTL 自动过期机制。
    ts = datetime.datetime.now()
    
    # 构造标准 MongoDB 存储文档字典
    document = {
        "session_id": session_id,
        "role": role,
        "text": text,
        "rewritten_query": rewritten_query or "",
        "item_names": item_names,
        "image_urls": image_urls,
        "ts": ts
    }

    mongo_tool = get_history_mongo_tool()
    
    # 判断是更新还是新增
    if message_id:
        # 💡 高级语法解读：
        # 使用 update_one 和 $set 运算符，只针对指定的字段进行覆盖修改，保留文档中其他字段。
        #
        # 对应传统简单写法：
        #   db.chat_message.replaceOne({"_id": ObjectId(message_id)}, document)
        mongo_tool.chat_message.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": document}
        )
        return message_id
    else:
        # 新增记录并获取生成的 BSON ObjectId，转换为 string 返回
        result = mongo_tool.chat_message.insert_one(document)
        return str(result.inserted_id)


def get_recent_messages(session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    获取指定会话中最近的 N 条对话历史，按时间正序排列 (从旧到新)
    """
    mongo_tool = get_history_mongo_tool()
    try:
        query = {"session_id": session_id}
        
        # 1. 核心逻辑：先按时间降序（ts: -1）捞出最新 limit 条
        cursor = mongo_tool.chat_message.find(query).sort("ts", -1).limit(limit)
        messages = list(cursor)
        
        # 2. 💡 高级语法解读：
        # 使用 Python 列表的内置 reverse() 方法在内存中原地反转列表，
        # 将其还原为时间正序（从旧到新），从而完美匹配大模型阅读顺序与前端时间线回显顺序。
        #
        # 对应传统简单写法：
        #   reversed_list = []
        #   for i in range(len(messages) - 1, -1, -1):
        #       reversed_list.append(messages[i])
        #   messages = reversed_list
        messages.reverse()
        
        return messages
    except Exception as e:
        logging.error(f"Error retrieving history for session {session_id}: {e}")
        return []


def clear_history(session_id: str) -> int:
    """
    清空指定会话下的所有历史对话数据
    :return: 实际删除的记录数量
    """
    mongo_tool = get_history_mongo_tool()
    try:
        result = mongo_tool.chat_message.delete_many({"session_id": session_id})
        logging.info(f"Successfully cleared {result.deleted_count} messages for session {session_id}")
        return result.deleted_count
    except Exception as e:
        logging.error(f"Error clearing history for session {session_id}: {e}")
        return 0


def update_message_item_names(ids: List[str], item_names: List[str]) -> int:
    """
    批量更新指定消息 ID 列表的商品关联信息 (常用于异步流式输出完后，追加实体识别结果)
    """
    mongo_tool = get_history_mongo_tool()
    try:
        # 💡 高级语法解读：
        # 使用列表推导式，快速将前端传来的字符串 ID 列表转化为 PyMongo 专用的 ObjectId 列表。
        #
        # 对应传统简单写法：
        #   object_ids = []
        #   for idx in ids:
        #       object_ids.append(ObjectId(idx))
        object_ids = [ObjectId(idx) for idx in ids]
        
        result = mongo_tool.chat_message.update_many(
            {"_id": {"$in": object_ids}},
            {"$set": {"item_names": item_names}}
        )
        return result.modified_count
    except Exception as e:
        logging.error(f"Failed to batch update item_names: {e}")
        return 0
```

---

## 7. 生产环境安全认证配置（密码保护）

在生产或公网环境中部署时，**绝对不能使用免密连接**。请按照以下步骤进行密码保护配置：

### 7.1 Docker Compose 开启强密码认证：
修改 `docker-compose.yaml` 中 `mongo` 服务的配置，添加环境变量：
```yaml
  mongo:
    image: mongo:latest
    container_name: mongodb
    ports:
      - "27017:27017"
    environment:
      # 设置超级管理员账号和密码
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: mySuperSecurePassword123
    volumes:
      - ./volumes/mongo/data:/data/db
    restart: unless-stopped
```

### 7.2 客户端带密码连接字符串写法：
在您的环境变量或 `.env` 文件中，将 `MONGO_URL` 修改为如下带用户名和密码的格式：
```text
mongodb://admin:mySuperSecurePassword123@127.0.0.1:27017/knowledge_base?authSource=admin
```
* `admin` 和 `mySuperSecurePassword123` 对应上一步中设置的账号密码。
* `authSource=admin` 指定进行密码验证的认证库为默认的 `admin` 库。

---

## 8. 常见问题 (FAQ)

### Q1: 启动项目连接 MongoDB 提示 Connection Refused？
* **排查步骤**：
    1. 确认 Docker 容器是否正常运行：执行 `docker ps`。
    2. 确认宿主机端口没有被占用：检查是否有其他本地独立 MongoDB 服务在抢占 `27017` 端口。
    3. 检查 `.env` 配置文件中的 `MONGO_URL` 是不是写的 `mongodb://127.0.0.1:27017`。

### Q2: 为什么我的历史记录查询接口报错 `TypeError: 'ObjectId' object is not iterable`？
* **原因**：FastAPI 的 `jsonable_encoder` 在把数据打包成 JSON 返回给浏览器时，不支持 MongoDB 专属的 `ObjectId` 类型。
* **解决**：在返回给前端之前，必须用循环把数据里的 `_id` 转换为字符串：`chat["_id"] = str(chat["_id"])`。
