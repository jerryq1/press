---
title: Python异步MySQL客户端架构
date: 2026-05-01
abstract: Python异步MySQL客户端架构
tags:
- Ai实战项目
---


# Python异步MySQL客户端架构

## 一、核心概念

### 1.1 异步数据库访问（官方描述）
异步I/O允许程序在等待数据库响应时执行其他任务，而非阻塞等待，从而提升并发性能。

### 1.2 生活比喻
**餐厅点餐场景：**
- **同步方式**：你站在厨房窗口盯着厨师做菜，做完一道端一道，期间不能做任何事
- **异步方式**：你点完菜拿个震动号码牌，去招呼其他客人，震动响起再去取菜

---

## 二、技术栈说明

| 组件 | 作用 |
|------|------|
| `SQLAlchemy` | ORM框架，提供统一数据库接口 |
| `asyncmy` | 异步MySQL驱动（基于pymysql，异步非阻塞） |
| `create_async_engine` | 创建异步连接引擎 |
| `async_sessionmaker` | Session工厂，负责生产AsyncSession实例 |

---

## 三、关键参数详解

### 3.1 连接池相关

```python
create_async_engine(url, pool_size=10, pool_pre_ping=True)
```

| 参数 | 含义（官方） | 生活比喻 |
|------|-------------|----------|
| `pool_size` | 连接池中保持的常驻连接数 | 餐厅准备的固定餐具套餐数量（10套） |
| `pool_pre_ping` | 每次借出连接前测试连接是否存活 | 服务员拿杯子前先倒点水试一下有没有裂缝 |

### 3.2 Session配置

```python
async_sessionmaker(engine, autoflush=True, autocommit=False)
```

| 参数 | 含义 | 建议 |
|------|------|------|
| `autoflush` | 查询前自动将待提交变更推送到数据库 | 保持`True`，避免脏数据查询 |
| `autocommit` | 每条语句自动提交 | 必须`False`，异步模式需手动控制事务 |

---

## 四、完整优化版代码

```python
# mysql_client.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from app.conf.app_config import DBConfig, app_config


class MySQLClientManager:
    """
    异步MySQL客户端管理器（使用session工厂模式）
    
    职责：
    1. 管理数据库连接池（engine）
    2. 提供session工厂（session_maker）用于创建会话
    
    使用示例:
        # 初始化（应用启动时）
        client = MySQLClientManager(db_config)
        client.init()
        
        # 获取session执行查询
        async with client.session_maker() as session:
            result = await session.execute(text("SELECT * FROM users"))
            users = result.mappings().fetchall()
        
        # 关闭连接池（应用退出时）
        await client.close()
    """
    
    def __init__(self, config: DBConfig):
        """
        初始化管理器
        
        Args:
            config: 数据库配置对象（包含host, port, user, password, database）
        """
        self.engine: AsyncEngine | None = None
        self.session_maker: async_sessionmaker | None = None  # session工厂，用于生产AsyncSession实例
        self.config = config

    def _get_url(self) -> str:
        """生成异步MySQL连接URL"""
        return (
            f"mysql+asyncmy://{self.config.user}:{self.config.password}"
            f"@{self.config.host}:{self.config.port}/{self.config.database}?charset=utf8mb4"
        )

    def init(self) -> None:
        """
        初始化连接池和session工厂（需在应用启动时调用）
        
        注意：这是一个同步方法，因为create_async_engine和async_sessionmaker
        不会执行真正的异步I/O操作，只是创建对象
        """
        # 1. 创建异步引擎（连接池）
        self.engine = create_async_engine(
            self._get_url(),
            pool_size=10,           # 连接池大小
            pool_pre_ping=True,     # 捡出前检查连接存活
            pool_recycle=3600,      # 1小时回收连接（防止MySQL超时）
            echo=False              # 设为True可打印SQL日志
        )
        
        # 2. 创建session工厂
        # async_sessionmaker是一个可调用对象，每次调用()都会创建新的AsyncSession实例
        # 参数autoflush=True: 查询前自动将待提交变更推送到数据库
        # 参数autocommit=False: 禁用自动提交，需手动控制事务
        self.session_maker = async_sessionmaker(
            self.engine,
            autoflush=True,
            autocommit=False
        )

    async def close(self) -> None:
        """优雅关闭所有连接（应用退出时调用）"""
        if self.engine:
            await self.engine.dispose()
            self.engine = None
            self.session_maker = None


# ========== 全局单例实例 ==========
# 为不同的数据库创建独立的客户端管理器
# 应用启动时需要调用各实例的init()方法
# 应用关闭时需要调用各实例的close()方法

dw_mysql_client_manager = MySQLClientManager(app_config.db_dw)      # 数据仓库客户端
meta_mysql_client_manager = MySQLClientManager(app_config.db_meta)  # 元数据库客户端


# ========== 使用示例 ==========
if __name__ == '__main__':
    # 初始化（应用启动时）
    dw_mysql_client_manager.init()
    
    async def test():
        """
        演示如何使用session_factory获取session并执行查询
        """
        # 方式1：使用session_maker创建session（推荐）
        # session_maker() 每次调用都会创建一个新的AsyncSession实例
        # async with 会自动处理session的关闭（不是commit/rollback）
        async with dw_mysql_client_manager.session_maker() as session:
            # 执行查询
            result = await session.execute(text("SELECT * FROM fact_order LIMIT 10"))
            
            # mappings()将行结果转为字典格式，方便通过列名访问
            rows = result.mappings().fetchall()
            
            # 打印结果
            print(f"查询到{len(rows)}条记录")
            if rows:
                print(f"第一行数据类型: {type(rows[0])}")  # <class 'sqlalchemy.engine.row.RowMapping'>
                print(f"第一行数据: {rows[0]}")
                print(f"访问特定字段: {rows[0]['order_id'] if 'order_id' in rows[0] else '无order_id字段'}")
    
    # 运行异步测试函数
    asyncio.run(test())
    
    # 清理（应用退出时）
    # asyncio.run(dw_mysql_client_manager.close())
```

---

## 五、Session工厂模式详解

### 5.1 什么是Session工厂？

```python
# session_maker 是一个工厂对象，负责创建AsyncSession实例
self.session_maker = async_sessionmaker(engine, autoflush=True, autocommit=False)

# 每次调用 session_maker() 都会创建一个全新的session
session1 = self.session_maker()  # 新session
session2 = self.session_maker()  # 另一个新session
```

### 5.2 为什么要用Session工厂？

| 特性 | 直接创建Session | 使用Session工厂 |
|------|----------------|----------------|
| 配置复用 | 每次都要传参 | 配置固化在工厂中 |
| 代码简洁度 | 重复代码多 | 一行创建session |
| 一致性 | 容易配置不一致 | 保证所有session配置一致 |
| 测试友好 | 难以Mock | 易于替换工厂实现 |

### 5.3 事务管理说明

```python
async with session_maker() as session:
    # 进入上下文：session已打开
    await session.execute(text("INSERT INTO users VALUES (1)"))
    # 退出上下文：自动调用 session.close()
    # 注意：不会自动commit！需要显式调用session.commit()
```

**正确的提交方式：**
```python
async with session_maker() as session:
    try:
        await session.execute(text("INSERT INTO users VALUES (1)"))
        await session.commit()  # 显式提交
    except:
        await session.rollback()  # 异常回滚
        raise
```

---

## 六、最佳实践

### 6.1 应用生命周期管理

```python
# app_main.py
from app.mysql_client import dw_mysql_client_manager, meta_mysql_client_manager

async def startup():
    """应用启动时的初始化"""
    dw_mysql_client_manager.init()
    meta_mysql_client_manager.init()

async def shutdown():
    """应用退出时的清理"""
    await dw_mysql_client_manager.close()
    await meta_mysql_client_manager.close()

# FastAPI示例
@app.on_event("startup")
async def startup_event():
    await startup()

@app.on_event("shutdown")
async def shutdown_event():
    await shutdown()
```

### 6.2 连接池大小建议

| 应用类型 | pool_size | 说明 |
|----------|-----------|------|
| 轻量API（QPS<100） | 5-10 | 足够应付常规请求 |
| 中等并发（QPS 100-500） | 10-20 | 配合max_overflow使用 |
| 高并发（QPS>500） | 20-50 | 需同时调大MySQL的max_connections |

### 6.3 补充参数：pool_recycle

**为什么需要？** MySQL默认`wait_timeout=28800`（8小时），超过此时间空闲连接会被服务端关闭。设置`pool_recycle=3600`（1小时）可提前回收，避免使用已断开的连接。

### 6.4 常用查询模式封装

```python
# 可选：在MySQLClientManager中添加便捷方法
class MySQLClientManager:
    # ... 原有代码 ...
    
    async def execute_query(self, sql: str, params: dict = None):
        """执行只读查询"""
        async with self.session_maker() as session:
            result = await session.execute(text(sql), params or {})
            rows = result.mappings().fetchall()
            return [dict(row) for row in rows]
    
    async def execute_write(self, sql: str, params: dict = None):
        """执行写操作"""
        async with self.session_maker() as session:
            result = await session.execute(text(sql), params or {})
            await session.commit()
            return result.rowcount
```

---

## 七、常见问题

### Q1: 为什么用asyncmy而不是aiomysql？
**答：** asyncmy性能更高（Cython实现），且与PyMySQL API兼容，稳定性更好。

### Q2: result.mappings()是什么？
**答：** 将行结果转为字典格式，方便通过列名访问：`row["column_name"]` 而非 `row[0]`。

### Q3: async_sessionmaker和AsyncSession的区别？
**答：**
- `async_sessionmaker`：工厂类，负责创建session（类似模具）
- `AsyncSession`：实际的session实例（类似模具生产的产品）

### Q4: 如何处理大批量插入？
```python
# 使用executemany（SQLAlchemy 2.0+）
async with dw_mysql_client_manager.session_maker() as session:
    data = [{"name": f"user_{i}"} for i in range(1000)]
    await session.execute(
        text("INSERT INTO users (name) VALUES (:name)"),
        data
    )
    await session.commit()
```

---

## 八、架构图

```
Application
    │
    ├── dw_mysql_client_manager (单例)
    │       │
    │       ├── engine (连接池, size=10)
    │       │       ├── connection_1
    │       │       ├── connection_2
    │       │       └── ...
    │       │
    │       └── session_maker (session工厂)
    │               │
    │               └── 生产 → AsyncSession实例
    │                           ├── transaction begin
    │                           ├── execute SQL
    │                           ├── commit/rollback
    │                           └── transaction end
    │
    └── meta_mysql_client_manager (单例)
            └── ... (同上)
```

---

## 总结要点

1. **init()是同步方法**：create_async_engine和async_sessionmaker不执行真正I/O
2. **session_maker是工厂**：每次调用创建新session，不是复用session
3. **必须显式commit**：async with只负责关闭session，不负责提交事务
4. **charset=utf8mb4**：支持完整Unicode（包括emoji）
5. **pool_pre_ping=True**：避免使用失效连接导致的错误
6. **应用关闭时调用close()**：优雅释放连接池资源
```

