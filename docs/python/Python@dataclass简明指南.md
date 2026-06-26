title: Python @dataclass 简明指南
date: 2026-06-21
abstract: Python @dataclass 简明指南
tags:
- python
---


# Python @dataclass 简明指南

## 是什么？

`@dataclass` 是 Python 3.7+ 的装饰器，**自动生成** `__init__`、`__repr__`、`__eq__` 等特殊方法。

## 对比

### 传统写法（15行）
```python
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    def __repr__(self):
        return f"User(name={self.name}, age={self.age})"
    def __eq__(self, other):
        return self.name == other.name and self.age == other.age
```

### @dataclass（4行）
```python
@dataclass
class User:
    name: str
    age: int
```

---

## 常用特性

```python
from dataclasses import dataclass, field

# 1. 基础
@dataclass
class Config:
    url: str
    timeout: int = 30  # 默认值

# 2. 可变默认值
@dataclass
class Student:
    name: str
    scores: list = field(default_factory=list)  # 不能用 [] 

# 3. 后处理
@dataclass
class Rect:
    w: float
    h: float
    area: float = field(init=False)
    
    def __post_init__(self):
        self.area = self.w * self.h

# 4. 不可变
@dataclass(frozen=True)
class ImmutableConfig:
    version: str
```

---

## 什么时候用？

### ✅ 用 @dataclass（数据容器）
- 配置类：`DatabaseConfig`、`ApiConfig`
- DTO/实体：`User`、`Order`、`Product`
- 请求/响应结构

```python
@dataclass
class MineruConfig:
    base_url: str
    api_token: str
```

### ❌ 不用 @dataclass（功能/工具类）
- 有复杂初始化（网络连接、文件IO）
- 有副作用（修改数据库、写日志）
- 执行业务逻辑

```python
class HistoryMongoTool:
    def __init__(self):
        self.client = MongoClient(...)  # 网络连接
        self.db = self.client["db"]
        self.collection.create_index(...)  # 副作用
```

---

## 一句话原则

**"有什么"用 @dataclass，"能做什么"用普通 class**

| 对比 | @dataclass | 普通 class |
|------|-----------|-----------|
| 定位 | 数据容器 | 功能工具 |
| 行为 | 被动存储 | 主动执行 |
| 副作用 | 无 | 可能有 |
| 典型 | 配置、实体 | Service、Manager |

---

## 实战示例

```python
# 配置类 → @dataclass ✅
@dataclass
class AppConfig:
    mongo_url: str
    redis_host: str
    debug: bool = False

# 工具类 → 普通 class ❌
class MongoClient:
    def __init__(self):
        self.conn = connect_db()  # 复杂初始化
        self.setup_indexes()
    
    def query(self, sql):
        return self.conn.execute(sql)
```
