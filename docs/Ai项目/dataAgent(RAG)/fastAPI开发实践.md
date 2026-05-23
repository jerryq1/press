---
title: fastAPI开发实践
date: 2026-05-23
abstract: fastAPI开发实践总结
tags:
- Ai实战项目
- fastAPI
---

# FastAPI 开发实践总结

## 参考资料索引

| 知识点 | 资源链接 | 说明 |
|--------|----------|------|
| 流式响应 | [FastAPI StreamingResponse](https://fastapi.org.cn/advanced/custom-response/#streamingresponse) | 官方文档，详解StreamingResponse用法 |
| SSE协议 | [阮一峰 SSE教程](http://www.ruanyifeng.com/blog/2017/05/server-sent_events.html) | SSE协议通俗讲解与API说明 |
| 依赖注入 | [FastAPI 依赖项](https://fastapi.org.cn/tutorial/dependencies/) | 官方教程，依赖注入系统详解 |
| 生命周期 | [FastAPI Lifespan事件](https://fastapi.org.cn/advanced/events/) | 启动/关闭事件处理官方文档 |
| 中间件 | [FastAPI 中间件](https://fastapi.org.cn/tutorial/middleware/) | 中间件创建与使用官方指南 |

---

## 1. 核心概念解析

### 1.1 流式响应 (StreamingResponse)

**官方描述**：流式响应允许服务器将数据分块发送给客户端，而不是一次性发送完所有数据。

**生活比喻**：就像吃自助餐，你可以一盘一盘地拿菜，而不是等厨房把所有菜做完了才一次性端上来。客人可以边吃边等，体验更好。

**典型应用场景**：
- AI对话（逐字输出）
- 大文件下载
- 实时日志推送
- 长任务进度展示

> **📚 深入学习：流式响应**
> 关于 `StreamingResponse` 的更多用法、参数细节以及如何正确处理生成器中的取消操作，请参阅 FastAPI 官方文档：
> [https://fastapi.org.cn/advanced/custom-response/#streamingresponse](https://fastapi.org.cn/advanced/custom-response/#streamingresponse)

### 1.2 SSE协议 (Server-Sent Events)

**官方描述**：SSE是一种基于HTTP的服务器推送技术，允许服务器通过单向通道持续向客户端发送事件流。

**生活比喻**：就像听收音机，电台（服务器）不断播放内容，你（客户端）只需要打开收音机就能持续收听，但你不能通过收音机跟电台对话。

**SSE数据格式**：
```
data: {"message": "第一块数据"}\n\n
data: {"message": "第二块数据"}\n\n
data: {"type": "done"}\n\n
```

**关键特点**：
- 单向通信（服务器→客户端）
- 自动重连机制
- 支持自定义事件类型

> **📚 深入学习：SSE 协议**
> 想了解 SSE 的客户端 `EventSource` API、完整的数据格式规范（`data`、`event`、`id`、`retry`字段）以及它与 WebSocket 的详细对比，推荐阅读阮一峰老师的经典教程：
> [http://www.ruanyifeng.com/blog/2017/05/server-sent_events.html](http://www.ruanyifeng.com/blog/2017/05/server-sent_events.html)

---

## 2. 项目架构设计

### 2.1 目录结构

```
data-agent/
├─ main.py                 # 应用入口
└─ app/
├─ api/                 # 接口层
│  ├─ routers/         # 路由定义
│  ├─ schemas/         # 数据模型
│  └─ dependencies.py  # 依赖注入
├─ services/           # 业务逻辑层
├─ core/               # 核心组件
│  ├─ lifespan.py     # 生命周期管理
│  ├─ context.py      # 上下文变量
│  └─ log.py          # 日志配置
└─ clients/           # 外部客户端管理
```

---

## 3. 代码实现详解

### 3.1 入口文件 (main.py)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
import uuid

from app.api.routers.query_router import query_router
from app.core.context import request_id_ctx_var
from app.core.lifespan import lifespan

# 创建FastAPI应用，注入生命周期管理
app = FastAPI(
    title="Data Agent API",
    description="智能数据查询服务",
    version="1.0.0",
    lifespan=lifespan  # 注册生命周期
)

# 添加请求ID中间件
@app.middleware("http")
async def add_request_id_middleware(request: Request, call_next):
    """为每个请求生成唯一ID，用于日志追踪"""
    request_id = str(uuid.uuid4())
    request_id_ctx_var.set(request_id)
    
    # 可选：添加响应头，方便客户端追踪
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# 注册路由
app.include_router(query_router)

# CORS配置（跨域资源共享）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 3.2 接口定义 (query_router.py)

```python
from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import StreamingResponse

from app.api.dependencies import get_query_service
from app.api.schemas.query_schema import QuerySchema
from app.services.query_service import QueryService

query_router = APIRouter(tags=["查询服务"])

@query_router.post(
    "/api/query",
    summary="智能数据查询",
    description="提交自然语言查询，实时返回执行进度和结果"
)
async def query(
    query: QuerySchema, 
    query_service: QueryService = Depends(get_query_service)
):
    """
    处理用户查询请求
    
    - **query**: 用户的自然语言查询内容
    - **返回**: SSE流式响应，实时推送查询进度和结果
    """
    try:
        return StreamingResponse(
            query_service.query(query.query),
            media_type="text/event-stream",  # SSE MIME类型
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no"  # 禁用Nginx缓冲
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 3.3 数据模型 (query_schema.py)

```python
from pydantic import BaseModel, Field

class QuerySchema(BaseModel):
    """查询请求数据模型"""
    query: str = Field(..., description="用户查询内容", min_length=1, max_length=1000)
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "查询上个月销售额最高的产品"
            }
        }
```

### 3.4 业务逻辑 (query_service.py)

```python
import json
from typing import AsyncGenerator

from app.agent.context import DataAgentContext
from app.agent.graph import graph
from app.agent.state import DataAgentState

class QueryService:
    """查询服务 - 处理核心业务逻辑"""
    
    def __init__(self, embedding_client, column_qdrant_repository, 
                 value_es_repository, metric_qdrant_repository,
                 meta_mysql_repository, dw_mysql_repository):
        # 注入各种外部服务依赖
        self.embedding_client = embedding_client
        self.column_qdrant_repository = column_qdrant_repository
        self.value_es_repository = value_es_repository
        self.metric_qdrant_repository = metric_qdrant_repository
        self.meta_mysql_repository = meta_mysql_repository
        self.dw_mysql_repository = dw_mysql_repository

    async def query(self, query: str) -> AsyncGenerator[str, None]:
        """
        执行查询并流式返回结果
        
        Args:
            query: 用户查询文本
            
        Yields:
            SSE格式的数据块
        """
        # 1. 构建上下文对象
        context = DataAgentContext(
            embedding_client=self.embedding_client,
            column_qdrant_repository=self.column_qdrant_repository,
            value_es_repository=self.value_es_repository,
            metric_qdrant_repository=self.metric_qdrant_repository,
            meta_mysql_repository=self.meta_mysql_repository,
            dw_mysql_repository=self.dw_mysql_repository
        )
        
        # 2. 初始化状态
        state = DataAgentState(query=query)
        
        try:
            # 3. 发送开始事件
            yield self._format_sse_event({
                "type": "start",
                "message": "开始处理查询...",
                "query": query
            })
            
            # 4. 流式执行工作流
            async for chunk in graph.astream(
                input=state, 
                context=context, 
                stream_mode="custom"
            ):
                yield self._format_sse_event(chunk)
                
            # 5. 发送完成事件
            yield self._format_sse_event({
                "type": "complete",
                "message": "查询完成"
            })
            
        except Exception as e:
            # 6. 错误处理
            yield self._format_sse_event({
                "type": "error",
                "message": str(e),
                "error_type": type(e).__name__
            })
    
    @staticmethod
    def _format_sse_event(data: dict) -> str:
        """格式化SSE事件数据"""
        return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
```

### 3.5 依赖注入 (dependencies.py)

**官方描述**：依赖注入是一种设计模式，对象通过构造函数接收其依赖，而不是自己创建它们。

**生活比喻**：就像去餐厅吃饭，你只需要点菜（声明需要什么），厨房（框架）会自动把做好的菜送到你面前，而不需要你自己去采购食材、洗菜、炒菜。

```python
from fastapi import Depends
from typing import AsyncGenerator

from app.clients.embedding_client_manager import embedding_client_manager
from app.clients.qdrant_client_manager import qdrant_client_manager
from app.repositories.qdrant.column_qdrant_repository import ColumnQdrantRepository
from app.services.query_service import QueryService

# 数据库会话依赖（带资源清理）
async def get_meta_session() -> AsyncGenerator:
    """获取元数据库会话，自动管理生命周期"""
    async with meta_mysql_client_manager.session_factory() as session:
        yield session

async def get_dw_session() -> AsyncGenerator:
    """获取数据仓库会话"""
    async with dw_mysql_client_manager.session_factory() as session:
        yield session

# 客户端依赖（单例模式）
async def get_embedding_client():
    """获取Embedding客户端"""
    return embedding_client_manager.client

async def get_column_qdrant_repository():
    """获取Qdrant列向量仓库"""
    return ColumnQdrantRepository(qdrant_client_manager.client)

# 服务依赖（组合多个底层依赖）
async def get_query_service(
    embedding_client=Depends(get_embedding_client),
    column_qdrant_repository=Depends(get_column_qdrant_repository),
    meta_mysql_repository=Depends(get_meta_mysql_repository),  # 嵌套依赖
) -> QueryService:
    """构建QueryService实例，自动注入所有依赖"""
    return QueryService(
        embedding_client=embedding_client,
        column_qdrant_repository=column_qdrant_repository,
        meta_mysql_repository=meta_mysql_repository,
        # ... 其他依赖
    )
```

> **📚 深入学习：依赖注入**
> FastAPI 的依赖注入系统非常强大，可以处理嵌套依赖、在依赖间共享数据等。想全面掌握其用法，请阅读官方教程：
> [https://fastapi.org.cn/tutorial/dependencies/](https://fastapi.org.cn/tutorial/dependencies/)

### 3.6 生命周期管理 (lifespan.py)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI生命周期管理器
    
    启动时执行：初始化外部资源（数据库连接池、Redis、向量数据库等）
    关闭时执行：清理资源，避免连接泄露
    """
    # ========== 启动阶段 ==========
    print("🚀 应用启动中...")
    
    # 初始化外部客户端
    embedding_client_manager.init()   # 初始化Embedding服务
    qdrant_client_manager.init()      # 初始化向量数据库
    es_client_manager.init()          # 初始化Elasticsearch
    meta_mysql_client_manager.init()  # 初始化元数据库连接池
    dw_mysql_client_manager.init()    # 初始化数据仓库连接池
    
    print("✅ 应用启动完成")
    
    yield  # 应用运行中...
    
    # ========== 关闭阶段 ==========
    print("🛑 应用关闭中...")
    
    # 优雅关闭外部连接
    await qdrant_client_manager.close()
    await es_client_manager.close()
    await meta_mysql_client_manager.close()
    await dw_mysql_client_manager.close()
    
    print("✅ 应用已安全关闭")
```

> **📚 深入学习：生命周期事件**
> 官方文档详细对比了 `lifespan` 上下文管理器与旧的 `startup`/`shutdown` 事件，并解释了如何正确管理资源。这里是权威指南：
> [https://fastapi.org.cn/advanced/events/](https://fastapi.org.cn/advanced/events/)

### 3.7 上下文变量与日志追踪 (context.py + log.py)

```python
# context.py - 上下文变量定义
from contextvars import ContextVar

# 创建上下文变量，用于跨函数传递请求ID
request_id_ctx_var = ContextVar("request_id", default="unknown")
```

```python
# log.py - 日志系统配置
import sys
from loguru import logger
from app.core.context import request_id_ctx_var

# 自定义日志格式（包含request_id）
log_format = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
    "<level>{level: <8}</level> | "
    "<magenta>request_id={extra[request_id]}</magenta> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
    "<level>{message}</level>"
)

def inject_request_id(record):
    """为每条日志注入当前请求的request_id"""
    record["extra"]["request_id"] = request_id_ctx_var.get()

# 应用补丁，注入request_id
logger = logger.patch(inject_request_id)

# 配置输出
logger.remove()  # 移除默认配置
logger.add(sys.stdout, format=log_format, level="INFO")
logger.add("logs/app.log", format=log_format, rotation="1 day", retention="30 days")

# 使用示例
logger.info("用户查询开始")   # 输出会自动带上当前请求的request_id
```

> **📚 深入学习：中间件**
> 中间件是处理请求与响应的全局钩子。官方文档解释了如何创建中间件、执行顺序以及与依赖项、后台任务的关系：
> [https://fastapi.org.cn/tutorial/middleware/](https://fastapi.org.cn/tutorial/middleware/)

---

## 4. 客户端使用示例

### 4.1 JavaScript客户端

```javascript
// 使用EventSource接收SSE流
async function streamQuery(query) {
    const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                console.log('收到数据:', data);
                // 更新UI...
            }
        }
    }
}

// 使用示例
streamQuery("查询本月销售数据");
```

### 4.2 Python客户端

```python
import httpx
import json

async def query_stream():
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "http://localhost:8000/api/query",
            json={"query": "查询上个月销售额最高的产品"}
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    print(f"收到: {data}")
```

---

## 5. 最佳实践建议

### 5.1 性能优化
- 使用连接池管理数据库连接
- 合理设置超时时间
- 大文件流式传输时设置合适的缓冲区大小

### 5.2 错误处理
- 使用try-except捕获异常并通过SSE返回
- 实现重试机制
- 记录完整的错误堆栈

### 5.3 生产环境注意事项
- 启用Gunicorn + Uvicorn workers
- 配置反向代理（Nginx）缓冲
- 添加请求限流
- 实现认证授权
- 监控和告警

### 5.4 与WebSocket的选型建议

| 特性 | SSE | WebSocket |
|------|-----|------------|
| 通信方向 | 单向（服务器→客户端） | 双向 |
| 协议 | HTTP | WS/WSS |
| 自动重连 | ✅ 内置 | ❌ 需自行实现 |
| 浏览器支持 | 除IE外都支持 | 现代浏览器 |
| 复杂度 | 简单 | 较复杂 |
| 适用场景 | 实时推送、进度更新 | 聊天、游戏 |

**选择建议**：对于你的场景（查询进度推送），SSE完全够用且更简单。

---

## 6. 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 客户端接收不到数据 | 缺少`\n\n`分隔符 | 确保每条SSE消息以两个换行结束 |
| 响应被缓冲 | Nginx缓冲 | 添加`X-Accel-Buffering: no`头 |
| 连接频繁断开 | 超时设置过短 | 增加超时时间或发送心跳包 |
| 日志中没有request_id | 中间件未生效 | 检查中间件注册顺序 |
```

