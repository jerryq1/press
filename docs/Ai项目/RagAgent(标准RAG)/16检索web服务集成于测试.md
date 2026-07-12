---
title: 检索web服务集成于测试
date: 2026-07-03
abstract: 检索web服务集成于测试
tags:
- Ai实战项目
---

# 检索web服务集成于测试

## 8. 检索web服务端搭建

### 8.1 SSE快速入门

SSE (**Server-Sent Events**) 是一种 **基于 HTTP 的服务端单向推送** 技术：浏览器用一个长连接（通常是 GET）订阅，服务端持续向这个连接 **按事件（event）流式写数据**，浏览器按事件回调接收。

- **单向推送**：服务端 → 客户端（客户端发消息仍走普通 HTTP 请求）
- **事件化**：每条消息带 event 类型 + data 数据
- **自动重连**：浏览器 EventSource 断线会自动重连（可配合 retry）
- **轻量**：基于 HTTP，不需要 WebSocket 的双工协议栈

#### 8.1.1 应用场景

- **任务进度/阶段状态**：文件上传处理、图执行流程、批处理进度条
- **LLM 流式输出**：边生成边展示（token/片段增量 delta）
- **日志/监控流**：持续输出日志、告警、指标变化
- **通知推送**：轻量通知、状态变化（但不适合高频双向交互）

#### 8.1.2 数据格式

SSE 协议规定了服务端向前端推送数据的**固定核心格式**，前端需按此解析，具体规则如下：

```text
[可选] event: <事件名> 用于分类数据（如progress进度、result答案、error报错），前端可按事件名单独处理；
必填   data: <数据内容>\n\n 必填：\n\n（两个连续换行符，作为单条数据的结束标识）
（扩展）id: <唯一ID>/retry: <重连毫秒数>：可选，用于断点续传、自定义重连时间。
```

其中 `event` 把数据按事件分类，比如进度变更、答案输出、报错等等。`data` 是自定义数据。

#### 8.1.3 SSE基础入门

##### 场景一：最基础的 SSE

目标：后端每秒推 1 条固定消息，前端实时显示

**步骤1：后端代码（sse_step1.py）**

```python
import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

# 1. 初始化+跨域（最基础配置）
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 仅测试用
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 核心：SSE接口（只推固定数据）
@app.get("/simple_stream")
async def simple_stream():
    async def event_generator():
        # 模拟推5条消息，每秒1条
        for i in range(5):
            # ✅ 核心：SSE固定格式 data: 内容\n\n
            # yield f"event:自定义\ndata:xxxx\n\n"
            yield f"data: 这是第{i+1}条测试消息\n\n"
            await asyncio.sleep(1)  # 每秒推1条

    # ✅ 核心：StreamingResponse + media_type=text/event-stream
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

**步骤2：前端代码（sse_step1.html）**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>步骤1：基础SSE</title>
</head>
<body>
    <h3>步骤1：接收后端固定消息</h3>
    <div id="result"></div>

    <script>
        // ✅ 核心：创建EventSource连接SSE接口
        const eventSource = new EventSource("http://127.0.0.1:8001/simple_stream");
        const resultDom = document.getElementById("result");

        // 监听SSE消息（实时接收）
        eventSource.onmessage = function(event) {
            resultDom.innerHTML += event.data + "<br>";
        };
    </script>
</body>
</html>
```

**步骤3：运行演示**

1. 启动后端：`python sse_step1.py`；

2. 打开sse_step1.html，能看到页面每秒显示 1 条消息：

   ```
   这是第1条测试消息
   这是第2条测试消息
   ...
   这是第5条测试消息
   ```

**核心知识点拆解：**

1. `async def` 异步函数

   FastAPI 支持异步接口，async 标识该函数可以执行异步操作（比如

   await asyncio.sleep(1)），不会阻塞整个服务的其他请求，性能更好。

2. **异步生成器 event_generator()**

    - 用 `async def` 定义，内部通过 `yield` 逐次返回数据（而非 `return` 一次性返回）；
    - 每次 `yield` 都会向客户端推送一段数据，直到循环结束；
    - `await asyncio.sleep(1)` 是异步休眠，区别于 `time.sleep(1)`（同步休眠会阻塞），保证服务能同时处理其他请求。

3. `StreamingResponse` 流式响应

   FastAPI 提供的专门用于 “流式返回数据” 的响应类，接收一个生成器（或异步生成器）作为参数，会逐次把生成器 yield 的内容发送给客户端。

4. **SSE 协议核心规则**

    - 响应的 `media_type` 必须设为 `text/event-stream`，客户端（比如浏览器）才能识别这是 SSE 流；
    - 推送的每条消息必须遵循 `data: 内容\n\n` 格式（`\n\n` 是消息结束的分隔符，缺一不可）；
    - SSE 是**单向通信**（服务器→客户端），适合实时推送通知、日志、进度等场景。

##### 场景二：动态传参

目标：前端传会话 ID，后端按 ID 返回专属消息

**步骤1：后端代码（sse_step2.py）**

```python
import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 新增：接口接收session_id参数
@app.get("/stream/{session_id}")
async def stream_by_session(session_id: str):
    async def event_generator():
        for i in range(5):
            # 按session_id定制消息
            yield f"data: 会话{session_id} - 第{i+1}条消息\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

**步骤2：前端代码（sse_step2.html）**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>步骤2：按会话ID推数据</title>
</head>
<body>
    <h3>步骤2：输入会话ID，接收专属消息</h3>
    <input type="text" id="sessionIdInput" placeholder="输入会话ID（如123）" value="123">
    <button onclick="connectSSE()">连接SSE</button>
    <div id="result"></div>

    <script>
        let eventSource = null;
        const resultDom = document.getElementById("result");

        function connectSSE() {
            const sessionId = document.getElementById("sessionIdInput").value;
            resultDom.innerHTML = "";
            
            // ✅ 新增：URL带session_id参数
            eventSource = new EventSource(`http://127.0.0.1:8001/stream/${sessionId}`);
            eventSource.onmessage = function(event) {
                resultDom.innerHTML += event.data + "<br>";
            };
        }
    </script>
</body>
</html>
```

**步骤3：运行演示**

启动后端，打开前端，输入 “abc123” 点击连接，页面显示：

```
会话abc123 - 第1条消息
会话abc123 - 第2条消息
...
```

**核心知识点**

- 后端：通过 URL 路径参数（`session_id`）接收前端传参；
- 前端：SSE 连接的 URL 可动态拼接参数，实现 “一对一” 推送。

##### 场景三：异步任务

目标：后端先接收查询请求，后台处理，SSE 推处理结果

**步骤1： 后端代码（sse_step3.py）**

```python
import asyncio
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 核心优化：用异步队列存储每个会话的待推送数据（替代列表+轮询）
task_queues = {}


# 异步耗时任务：直接往队列丢数据，不用列表累加
async def long_task(session_id: str):
    # 为当前会话创建专属队列
    queue = asyncio.Queue()
    task_queues[session_id] = queue

    # 模拟5秒处理，每秒生成1条结果并丢进队列
    for i in range(5):
        msg = f"会话{session_id}处理结果{i + 1}"
        await queue.put(msg)  # 把数据丢进队列
        await asyncio.sleep(1)

    # 关键：丢一个"结束标记"，告诉SSE可以停止了
    await queue.put(None)


# 提交任务接口（逻辑不变）
@app.get("/submit/{session_id}")
async def submit_task(session_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(long_task, session_id)
    return {"message": "任务已启动", "session_id": session_id}


# 简化后的SSE接口：直接从队列取数据，没有轮询！
@app.get("/stream/{session_id}")
async def stream_result(session_id: str):
    async def event_generator():
        # 获取当前会话的队列（没有则等待任务创建）
        while session_id not in task_queues:
            await asyncio.sleep(0.1)
        queue = task_queues[session_id]

        # 核心：循环从队列取数据，有数据就推，收到结束标记就停
        while True:
            msg = await queue.get()  # 阻塞等待队列数据（比轮询高效）
            if msg is None:  # 收到结束标记，退出循环
                break
            yield f"data: {msg}\n\n"  # 推送数据

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
```

`asyncio.Queue` 是 Python 异步编程（`asyncio` 框架）里的**异步队列**，专门解决异步场景下 “生产者 - 消费者” 的通信问题，你可以把它理解成一个「异步版的消息中转站」—— 生产者（比如你的后台任务）往里面丢数据，消费者（比如你的 SSE 接口）从里面取数据，全程不阻塞、不轮询，比你之前用的 “列表 + 轮询” 高效得多。

先讲核心特点（和普通列表 / 同步队列的区别）：

|      特性       |          普通列表          |    `asyncio.Queue`（异步队列）     |
| :-------------: | :------------------------: | :--------------------------------: |
|  取数据的方式   | 主动轮询（每 0.5s 查一次） |      被动等待（有数据才唤醒）      |
|    是否阻塞     |   不阻塞（空列表也能查）   | 异步阻塞（没数据就暂停，不占 CPU） |
| 线程 / 协程安全 | 不安全（多协程操作易出错） |    天然安全（专为异步场景设计）    |
|   代码复杂度    | 高（要判断长度、处理重复） |       低（只需要 `put/get`）       |

核心用法（通俗解释）：

`asyncio.Queue` 的用法特别简单，核心就 3 个方法，且都需要用 `await` 调用（因为是异步操作）：

创建队列

```python
# 创建一个无界异步队列（能装无限多数据）
queue = asyncio.Queue()
# 也可以指定最大容量（比如最多装10条，满了之后put会等待）
queue = asyncio.Queue(maxsize=10)
```

生产者：往队列里放数据（`put`）

```python
await queue.put("要推送的消息")  # 把数据丢进队列
# 如果队列满了（指定了maxsize），这行代码会暂停，直到队列有空闲位置
```

对应你代码里的后台任务：`await queue.put(msg)`，每秒往队列丢一条消息。

消费者：从队列里取数据（`get`）

```python
msg = await queue.get()  # 从队列取数据
# 如果队列为空，这行代码会「异步暂停」，直到队列里有新数据才唤醒
```

对应你代码里的 SSE 接口：`msg = await queue.get()`，没有数据就等着，有数据就立刻取，不用你手动轮询。

**步骤2：前端代码（sse_step3.html）**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>步骤3：异步任务+SSE推送</title>
</head>
<body>
    <h3>步骤3：提交任务，SSE接收处理结果</h3>
    <input type="text" id="sessionIdInput" placeholder="会话ID" value="test001">
    <button onclick="submitTask()">提交任务</button>
    <div id="result"></div>

    <script>
        let eventSource = null;
        const resultDom = document.getElementById("result");

        // 提交任务（触发后端异步处理）
        async function submitTask() {
            const sessionId = document.getElementById("sessionIdInput").value;
            resultDom.innerHTML = "";

            // 1. 调用提交接口
            await fetch(`http://127.0.0.1:8001/submit/${sessionId}`);
            
            // 2. 立即建立SSE连接，等结果
            eventSource = new EventSource(`http://127.0.0.1:8001/stream/${sessionId}`);
            eventSource.onmessage = function(event) {
                resultDom.innerHTML += event.data + "<br>";
            };
        }
    </script>
</body>
</html>
```

**步骤3：运行演示**

1. 启动后端，打开前端，点击 “提交任务”；
2. 页面每秒显示 1 条后端处理结果，5 秒后停止。

核心知识点

- 后端：`BackgroundTasks` 实现异步任务，避免阻塞 SSE 连接；
- 核心逻辑：“提交任务→后台处理→SSE 监听结果→实时推送”。

##### 场景四：前端输入查询内容

目标：前端输入查询内容，后端按查询词返回结果

**步骤1：后端代码（sse_step4.py）**

```python
import asyncio
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()
# 跨域配置（保持不变）
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 替换列表：用异步队列存储每个会话的待推送数据
task_queues = {}

# 新增：定义请求体模型（保持不变）
class QueryRequest(BaseModel):
    query: str
    session_id: str

# 重构异步任务：往队列丢数据（替代列表累加）
async def long_task(session_id: str, query: str):
    # 为当前会话创建专属异步队列
    queue = asyncio.Queue()
    task_queues[session_id] = queue
    
    # 按查询词生成5条结果，每秒1条丢进队列
    for i in range(5):
        msg = f"【{query}】的第{i+1}段回答：xxx{i+1}"
        await queue.put(msg)  # 数据入队
        await asyncio.sleep(1)
    
    # 关键：放入结束标记，告诉SSE停止推送
    await queue.put(None)

# POST接口（逻辑不变，仅任务内部实现变了）
@app.post("/submit_query")
async def submit_query(req: QueryRequest, background_tasks: BackgroundTasks):
    # 把查询词和会话ID传给后台任务
    background_tasks.add_task(long_task, req.session_id, req.query)
    return {"message": "任务已启动", "session_id": req.session_id}

# 简化SSE接口：从队列取数据，无轮询
@app.get("/stream/{session_id}")
async def stream_result(session_id: str):
    async def event_generator():
        # 等待当前会话的队列创建（防止SSE比任务先启动）
        while session_id not in task_queues:
            await asyncio.sleep(0.1)
        queue = task_queues[session_id]
        
        # 循环取队列数据，有数据就推，收到结束标记就停
        while True:
            msg = await queue.get()  # 异步阻塞等待数据（无轮询）
            if msg is None:  # 收到结束标记，退出循环
                break
            yield f"data: {msg}\n\n"  # 推送SSE数据
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

**步骤2：前端代码（sse_step4.html)**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>步骤4：输入查询内容</title>
</head>
<body>
    <h3>步骤4：输入查询内容，SSE接收专属回答</h3>
    <input type="text" id="queryInput" placeholder="输入查询内容" value="Python SSE怎么用">
    <button onclick="submitQuery()">提交查询</button>
    <div id="result"></div>

    <script>
        let eventSource = null;
        const resultDom = document.getElementById("result");

        async function submitQuery() {
            const query = document.getElementById("queryInput").value;
            const sessionId = "query_" + Date.now(); // 自动生成会话ID
            resultDom.innerHTML = "";

            // 1. POST提交查询内容
            await fetch("http://127.0.0.1:8001/submit_query", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({query: query, session_id: sessionId})
            });

            // 2. 建立SSE连接
            eventSource = new EventSource(`http://127.0.0.1:8001/stream/${sessionId}`);
            eventSource.onmessage = function(event) {
                resultDom.innerHTML += event.data + "<br>";
            };
        }
    </script>
</body>
</html>
```

**步骤3：运行演示**

输入 “FastAPI 教程”，点击提交，页面显示：

```
【FastAPI教程】的第1段回答：xxx1
【FastAPI教程】的第2段回答：xxx2
...
```

核心知识点

- 后端：用`Pydantic`模型接收 POST 请求体，解析查询内容；
- 前端：POST 请求传 JSON 数据，实现 “用户输入→后端处理→实时返回”。

##### 场景五：SSE 事件属性说明

SSE 协议中，除了核心的 `data` 字段，还支持 `event`（自定义事件类型）、`id`（消息 ID）、`retry`（重连时间）等属性：

- `event`：用于给不同类型的消息标记自定义事件名，前端可以根据事件名区分处理不同消息（比如 “进度更新”“完成通知”）；
- 格式要求：`event: 事件名\n` 必须在 `data: 内容\n\n` 之前；
- 改造方向：在生成 SSE 响应时，为不同阶段的消息（进度、完成）添加不同的 `event` 属性。

**步骤1：后端代码（sse_step5.py）**

```python
import asyncio
import uuid
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()
# 跨域配置（保持不变）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ✅ 替换列表缓存：用异步队列存储每个会话的消息（key: session_id, value: asyncio.Queue）
task_queues = {}

class QueryRequest(BaseModel):
    query: str
    session_id: str = None

@app.post("/submit_query")
async def submit_query(req: QueryRequest, background_tasks: BackgroundTasks):
    # 生成或使用用户传入的session_id
    session_id = req.session_id or str(uuid.uuid4())
    # 将耗时任务加入后台执行
    background_tasks.add_task(long_task, session_id, req.query)
    return {"message": "任务已经启动", "session_id": session_id}

async def long_task(session_id: str, query: str):
    """模拟耗时的异步任务，分阶段往队列丢消息（替代列表累加）"""
    # 为当前会话创建专属异步队列
    queue = asyncio.Queue()
    task_queues[session_id] = queue
    
    # 模拟5个进度步骤，往队列丢进度消息
    for i in range(5):
        progress_msg = {
            "event": "progress",
            "data": f"【{query}】的第{i+1}段回答:xxx{i+1}"
        }
        await queue.put(progress_msg)  # 进度消息入队
        await asyncio.sleep(1)
    
    # 任务完成，往队列丢完成消息
    complete_msg = {
        "event": "complete",
        "data": f"【{session_id}】查询完成！所有结果已返回"
    }
    await queue.put(complete_msg)
    # 关键：丢结束标记，告诉SSE可以停止监听
    await queue.put(None)

@app.get("/stream/{session_id}")
async def stream(session_id: str):
    """SSE流式返回任务结果，基于队列实现（无轮询）"""
    async def event_generator():
        # 等待当前会话的队列创建（防止SSE比任务先启动）
        while session_id not in task_queues:
            await asyncio.sleep(0.1)
        queue = task_queues[session_id]
        
        # 循环从队列取消息，有消息就推，收到结束标记就停
        while True:
            msg = await queue.get()  # 异步阻塞等待消息（无轮询）
            if msg is None:  # 收到结束标记，退出循环
                break
            
            # 拼接自定义Event的SSE格式（和你原逻辑一致）
            yield f"event: {msg['event']}\n"
            yield f"data: {msg['data']}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

`long_task` 中不再存储纯文本，而是存储包含 `event` 和 `data` 的字典，分别标记消息类型（`progress`/`complete`）和内容；

这样可以区分 “进度更新” 和 “任务完成” 两类消息，前端能针对性处理。

标准 SSE 格式要求：`event: 事件名\n` + `data: 内容\n\n`；

示例输出（前端收到的原始数据）：

```
event: progress
data: 【测试】的第1段回答:xxx1

event: complete
data: 【xxx-xxx-xxx】查询完成！所有结果已返回
```

**步骤2：前端代码（sse_step5.py）**

```js
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>FastAPI SSE 测试</title>
    <!-- 仅保留必要的基础样式，无复杂装饰 -->
    <style>
        body { padding: 20px; }
        #response { margin-top: 20px; white-space: pre-wrap; }
        .progress { color: #666; }
        .complete { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <!-- 核心交互区域 -->
    <input type="text" id="query" placeholder="输入查询内容" style="width: 400px; padding: 5px;">
    <button onclick="submitQuery()">提交查询</button>

    <!-- 流式响应展示区 -->
    <div id="response"></div>

    <script>
        // 后端接口地址（和你的FastAPI启动地址一致）
        const API_BASE = 'http://127.0.0.1:8001';
        let eventSource = null; // 存储SSE连接实例

        // 提交查询的核心函数
        async function submitQuery() {
            const query = document.getElementById('query').value.trim();
            if (!query) {
                alert('请输入查询内容！');
                return;
            }

            // 清空之前的响应内容
            document.getElementById('response').innerHTML = '';

            // 1. 调用submit_query接口获取session_id
            try {
                const res = await fetch(`${API_BASE}/submit_query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: query })
                });
                const data = await res.json();
                const sessionId = data.session_id;

                // 2. 建立SSE连接监听流式响应
                connectSSE(sessionId);
            } catch (err) {
                document.getElementById('response').innerHTML = `<div class="error">提交失败：${err.message}</div>`;
            }
        }

        // 建立SSE连接的函数
        function connectSSE(sessionId) {
            // 关闭已有连接，避免重复监听
            if (eventSource) eventSource.close();

            // 创建新的SSE连接
            eventSource = new EventSource(`${API_BASE}/stream/${sessionId}`);

            // 监听进度事件（progress）
            eventSource.addEventListener('progress', (e) => {
                const responseDiv = document.getElementById('response');
                responseDiv.innerHTML += `<div class="progress">${e.data}</div>`;
            });

            // 监听完成事件（complete）
            eventSource.addEventListener('complete', (e) => {
                const responseDiv = document.getElementById('response');
                responseDiv.innerHTML += `<div class="complete">${e.data}</div>`;
                eventSource.close(); // 完成后关闭连接
            });

            // 监听错误事件
            eventSource.onerror = (e) => {
                document.getElementById('response').innerHTML += `<div class="error">连接异常：${e.message || '未知错误'}</div>`;
                eventSource.close();
            };
        }
    </script>
</body>
</html>
```

`event` 是 SSE 协议的扩展属性，用于分类消息，前端可通过 `addEventListener(事件名)` 监听；

SSE 消息必须以 `\n\n` 结尾，多个字段（event/data）之间用 `\n` 分隔；

### 8.2 基础 Web 服务端搭建

本节介绍如何基于 FastAPI 搭建后端服务，提供页面访问和查询接口。

#### 8.2.1 前端交互设计

检索 Web 聊天界面（`chat.html`）的核心结构与数据流转逻辑，该页面直接决定了后端接口的设计规范。

![img](../images/1773117592710.png)

**1）页面核心组件**

- **顶栏 (Topbar)**：展示服务连接状态与流式开关。
- **对话区 (Chat)**：
    - **用户气泡**：展示提问内容。
    - **系统气泡**：集成**文本答案**与**处理进度**（折叠面板），实时展示后台（检索/重排/生成）的执行状态。
- **输入区 (Composer)**：支持快捷发送与多行输入。

**2）数据交互闭环**

前端与后端的全双工交互流程如下：

1. **会话初始化**：加载页面时生成或读取 `session_id`，作为用户唯一标识。
2. **提交任务**：点击发送 -> POST `/query`（携带问题与流式标记） -> 获取 `session_id` 确认任务已接收。
3. **建立长连接 (SSE)**：立即通过 `EventSource` 监听 `/stream/{session_id}`，建立实时通信管道。
4. **事件驱动更新**：
    - `ready`: 连接握手成功。
    - `progress`: **实时更新进度条**（如：正在检索... -> 检索完成）。
    - `delta`: **流式逐字输出**（打字机效果）。
    - `final`: 接收完整答案与引用源。

基于此逻辑，后端需提供 `/query`（任务提交）与 `/stream`（事件推送）两个核心接口。

#### 8.2.2 服务接口设计

本节详细定义查询服务的所有对外接口，包括页面访问、任务提交、流式推送及历史管理。

**1）页面访问接口**

- **路径**: `/chat.html` (GET)
- **功能**: 返回前端聊天界面。
- **响应**: HTML 静态页面。

**2）检索查询接口**

- **路径**: `/query` (POST)

- **功能**: 接收用户提问并启动后台处理图逻辑。

- **参数**:

  ```json
  {
    "query": "万用表怎么测量电压？",
    "session_id": "可选，未传则后台自动生成",
    "is_stream": true // 是否启用流式推送
  }
  ```

- **响应 (is_stream: true)**:

  ```json
  { "message": "结果正在处理中...", "session_id": "xxx-uuid" }
  ```

- **响应 (is_stream: false)**:

  ```json
  { "message": "处理完成！", "session_id": "xxx", "answer": "回答内容...", "done_list": [] }
  ```

**3）流式获取接口 (SSE)**

- **路径**: `/stream/{session_id}` (GET)
- **功能**: 建立 SSE 长连接，实时推送任务进度与生成文本。
- **推送数据格式 (JSON)**:
    - **progress 事件**: `{"done_list": ["节点A", "节点B"], "running_list": ["节点C"]}`
    - **delta 事件**: `{"text": "生成的增量字符"}`
    - **final 事件**: `{"answer": "完整最终答案"}`
    - **error 事件**: `{"error": "错误详情"}`

**4）会话历史查询**

- **路径**: `/history/{session_id}` (GET)

- **功能**: 从 MongoDB 中获取当前会话的历史聊天记录。

- **参数**: `limit` (可选，默认50条)

- **响应**:

  ```json
  {
    "session_id": "xxx",
    "items": [
      {
        "_id": str(r.get("_id")) if r.get("_id") is not None else "",
        "session_id": r.get("session_id", ""),
         "role": r.get("role", ""),
         "text": r.get("text", ""),
         "rewritten_query": r.get("rewritten_query", ""),
          "item_names": r.get("item_names", []),
          "ts": r.get("ts")
        }
    ]
  }
  ```

**5）清空会话历史**

- **路径**: `/history/{session_id}` (DELETE)
- **功能**: 删除 MongoDB 中该会话的所有记录。
- **响应**: `{ "message": "History cleared", "deleted_count": 10 }`

**6）健康检查接口**

- **路径**: `/health` (GET)
- **功能**: 检查服务存活状态。
- **响应**: `{ "ok": True }`

#### 8.2.3 接口代码实现

**1）导入查询页面**

将资料`chat.html`添加到`app/query_process/page`文件夹中！

![img](../images/1773118530707.png)

**3）前后端交互说明**

知识库查询服务的流式响应流程 ，涉及到四个核心模块的协同工作：

1. Web 服务层 ( query_service.py ): 负责接收请求、建立 SSE 连接。
2. SSE 工具层 ( sse_utils.py ): 负责管理消息队列、打包和推送事件。
3. 任务状态层 ( task_utils.py ): 负责记录每个节点的执行进度，并自动触发 SSE 推送。
4. 图节点执行层 ( query_process/ ): 实际的业务逻辑节点（如检索、Rerank、生成答案），它们通过更新状态来驱动进度条。

核心流程时序图：

![image-20260331232210783](../images/image-20260331232210783.png)

**2）定义和实现api接口服务**

在 `app/query_process/api` 目录下创建 `query_service.py`，我们将代码拆解为以下几个部分进行实现。

首先引入 FastAPI、Pydantic 以及项目内部的工具类。

```python
from pathlib import Path
import uuid
import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware
from app.core.logger import logger

from app.utils.task_utils import *
from app.utils.sse_utils import create_sse_queue, SSEEvent, sse_generator
from app.clients.mongo_history_utils import *
from app.query_process.agent.main_graph import query_app


# 定义fastapi对象
app = FastAPI(title="query service", description="掌柜智库查询服务！")

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 返回chat.html页面
@app.get("/chat.html")
async def chat():
    current_dir_parent_path = Path(__file__).absolute().parent.parent
    chat_html_path = current_dir_parent_path / "page" / "chat.html"
    if not chat_html_path.exists():
        logger.error(f"页面不存在：{chat_html_path}")
        raise HTTPException(status_code=404, detail=f"没有查询到页面，地址为：{chat_html_path}！")
    logger.info("成功加载 chat.html 页面")
    return FileResponse(chat_html_path)
```

**3）定义数据模型 (Pydantic)**

定义前端请求的数据结构，确保参数类型安全，并增加兼容字段。

```python
# 定义接口接收的数据结构
class QueryRequest(BaseModel):
    """查询请求数据结构"""
    query: str = Field(..., description="查询内容")
    session_id: str = Field(None, description="会话ID")
    is_stream: bool = Field(False, description="是否流式返回")
```

**4）实现核心查询逻辑**

这是最关键的逻辑部分，包含后台任务处理函数 `run_query_graph` 和 API 接口 `/query`。

```python
# 核心查询处理函数
def run_query_graph(session_id: str, user_query: str, is_stream: bool = True):
    logger.info(f"[{session_id}] 开始执行查询流程，流式模式：{is_stream}")
    default_state = {"original_query": user_query, "session_id": session_id, "is_stream": is_stream}
    try:
        query_app.invoke(default_state)
        update_task_status(session_id, TASK_STATUS_COMPLETED, is_stream)
        logger.info(f"[{session_id}] 查询流程执行完成")
    except Exception as e:
        logger.exception(f"[{session_id}] 查询流程异常：{str(e)}")
        update_task_status(session_id, TASK_STATUS_FAILED, is_stream)
        if is_stream:
            push_to_session(session_id, SSEEvent.ERROR, {"error": str(e)})

# 查询接口
@app.post("/query")
async def query(background_tasks: BackgroundTasks, request: QueryRequest):
    """
    1 解析参数
    2 更新任务状态
    3 调用处理流程图
    4 返回结果
    """
    user_query = request.query
    session_id = request.session_id if request.session_id else str(uuid.uuid4())
    is_stream = request.is_stream

    if is_stream:
        create_sse_queue(session_id)
        logger.info(f"[{session_id}] 已创建 SSE 消息队列")

    update_task_status(session_id, TASK_STATUS_PROCESSING, is_stream)
    logger.info(f"[{session_id}] 任务开始处理，查询内容：{user_query}")

    if is_stream:
        background_tasks.add_task(run_query_graph, session_id, user_query, is_stream)
        logger.info(f"[{session_id}] 流式任务已提交至后台执行")
        return {
            "message": "结果正在处理中...",
            "session_id": session_id
        }
    else:
        run_query_graph(session_id, user_query, is_stream)
        answer = get_task_result(session_id, "answer", "")
        logger.info(f"[{session_id}] 非流式查询处理完成")
        return {
            "message": "处理完成！",
            "session_id": session_id,
            "answer": answer,
            "done_list": []
        }
        
# SSE 流式推送接口
@app.get("/stream/{session_id}")
async def stream(session_id: str, request: Request):
    logger.info(f"[{session_id}] 客户端已建立 SSE 流式连接")
    return StreamingResponse(
        sse_generator(session_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
```

**5）健康检查接口**

```python
# 健康检查
@app.get("/health")
async def health():
    """服务健康检查"""
    logger.info("健康检查接口调用成功")
    return {"ok": True}
```

**6）启动查询服务**

```python
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

### 8.3 历史对话记录管理

1. **上下文连续**：保留关键信息，支持追问、补充条件与多轮推理不断档。
2. **指代消歧**：如果只考虑本次的问题往往不足以让大模型理解用户的上下文含义，尤其是一些指代比如：“这个设备”，“它”等等。
3. **交互确认**：为明确问题的一些信息，Agent 可能会反问用户一些问题，经过几次确认后才能准确解答后续问题，比如商品的信号。
4. **识别用户**：长期记录对话可以记住用户偏好，最终形成用户画像。

咱们项目这里没有使用 LangChain 的 Checkpointer 方式管理会话，而是自定义了一套基于 MongoDB 的持久化管理策略。

这样做的有很多好处：更加灵活自主，可以根据条件范围查询对话，可以给对话自定义格式，管理查询写入内容。

但是相对来说需要做的开发工作也比较多。

MongoDB 是一种文档数据库，特别适用于存储海量数据，结构简单，关系简单的数据。

*   **性能和单表容量**上都比 MySQL/PostgreSQL 等传统关系型数据库要好。虽比不上 Redis 这种内存数据库，但在持久化能力和检索功能又比内存数据库强上很多。
*   **缺点**是不适合保持有复杂关联关系，查询复杂的场景。

所以对于这种**结构简单、查询简单但数据庞大**的对话信息特别合适。尤其是 MongoDB 的存储基本单元就是一份 **JSON** 文档，与对话也是非常契合。

### 8.4 MongoDB 快速准备

MongoDB 是一个基于分布式文件存储的数据库，由 C++ 语言编写。旨在为 WEB 应用提供可扩展的高性能数据存储解决方案。

#### 8.4.1 Linux 下使用 Docker 安装 MongoDB

**1. 拉取 MongoDB 镜像**

```bash
docker pull mongo:latest
```

**2. 运行 MongoDB 容器**

```bash
docker run -itd --name mongo -p 27017:27017 mongo
```

*   `-p 27017:27017`：将容器的 27017 端口映射到主机的 27017 端口。
*   `--name mongo`：容器名称。

**3. 常用管理命令**

* **查看运行状态**：

  ```bash
  docker ps | grep mongo
  ```

* **停止 MongoDB 容器**：

  ```bash
  docker stop mongo
  ```

* **启动 MongoDB 容器**（停止后再次启动）：

  ```bash
  docker start mongo
  ```

* **重启 MongoDB 容器**：

  ```bash
  docker restart mongo
  ```

**4. 进入 MongoDB 容器**

```bash
docker exec -it mongo mongosh
```

#### 8.4.2 MongoDB 客户端安装 (Windows)

推荐使用 **MongoDB Compass**，这是 MongoDB 官方提供的图形化管理工具。

1.  **下载**：访问 [MongoDB Download Center](https://www.mongodb.com/try/download/compass)，选择 Windows 版本下载安装包。
2.  **安装**：运行下载的 `.exe` 或 `.msi` 文件，按照提示完成安装。
3.  **连接**：
    *   打开 MongoDB Compass。
    *   在连接页面输入连接字符串（URI），例如：`mongodb://localhost:27017`（如果是远程服务器，替换 `localhost` 为服务器 IP）。
    *   点击 **Connect** 按钮。

#### 8.4.3 MongoDB 基本使用 (CRUD)

在 MongoDB 中，数据存储在 **数据库 (Database)** -> **集合 (Collection)** -> **文档 (Document)** 中。

以下操作可以在 `mongosh` 命令行或 MongoDB Compass 的 `Mongosh` 终端中执行。

**1. 创建数据库和集合**

MongoDB 不需要显式创建数据库，当往一个不存在的数据库中写入数据时，它会自动创建。

```javascript
// 切换/创建数据库 'testdb'
use users
db.dropDatabase()  // 删除当前库
```

**2. 插入文档 (Create)**

```javascript
// 插入一条数据到 'users' 集合
// 创建 users 集合 db.createCollection("users")
// 语法: db.collection【集合名】.insertOne(document)
// _id字段必须是唯一的
在MongoDB集合中，每个文档都必须包含具有唯一值的 _id字段。
如果为 _id字段指定值，则必须确保该值在集合中是唯一的。如果不指定值，驱动程序会自动为该字段生成唯一的 ObjectId 值。
我们建议让驱动程序自动生成 _id 值以确保唯一性。重复的 _id 值违反了唯一索引约束，导致驱动程序返回错误。

db.users.insertOne({ name: "张三", age: 25, email: "zhangsan@example.com" })

// 插入多条数据
// 语法: db.collection.insertMany([document1, document2, ...])
db.users.insertMany([
  { name: "李四", age: 30, email: "lisi@example.com", city: "Beijing" },
  { name: "王五", age: 28, email: "wangwu@example.com", city: "Shanghai" },
  { name: "赵六", age: 35, email: "zhaoliu@example.com", city: "Beijing" }
])
```

**3. 查询文档 (Read)**

```javascript
// 1. 查询所有数据
// 语法: db.collection.find(query, projection)
db.users.find()

// 2. 等值查询：查询 name 为 "张三" 的数据
db.users.find({ name: "张三" })

// 3. 比较操作符查询：
// $gt (大于), $lt (小于), $gte (大于等于), $lte (小于等于), $ne (不等于)
// 示例：查询 age 大于 25 的数据
db.users.find({ age: { $gt: 25 } })

// 4. 逻辑操作符查询：
// $and (与), $or (或)
// 示例：查询 city 为 "Beijing" 并且 age 小于 30 的数据
db.users.find({ city: "Beijing", age: { $lt: 30 } })

// 示例：查询 city 为 "Beijing" 或者 "Shanghai" 的数据
db.users.find({ $or: [ { city: "Beijing" }, { city: "Shanghai" } ] })

// 5. 包含查询 ($in)
// 示例：查询 age 在 [25, 30] 中的数据
db.users.find({ age: { $in: [25, 30] } })
```

**4. 更新文档 (Update)**

```javascript
// 1. 更新一条数据
// 语法: db.collection.updateOne(filter, update, options)
// $set 操作符用于修改指定字段的值，如果字段不存在则创建
db.users.updateOne(
  { name: "张三" },       // 过滤条件：找到 name 为 "张三" 的第一条文档
  { $set: { age: 26 } }   // 更新操作：将 age 设为 26
)

// 2. 更新多条数据
// 语法: db.collection.updateMany(filter, update, options)
// 示例：将所有 city 为 "Beijing" 的用户的 status 字段设为 "active"
db.users.updateMany(
  { city: "Beijing" },
  { $set: { status: "active" } }
)

// 3. 自增/自减 ($inc)
// 示例：将 name 为 "李四" 的 age 增加 1
db.users.updateOne(
  { name: "李四" },
  { $inc: { age: 1 } }
)
```

**5. 删除文档 (Delete)**

```javascript
// 1. 删除一条数据
// 语法: db.collection.deleteOne(filter)
// 示例：删除 name 为 "王五" 的第一条记录
db.users.deleteOne({ name: "王五" })

// 2. 删除多条数据
// 语法: db.collection.deleteMany(filter)
// 示例：删除 age 大于等于 35 的所有用户
db.users.deleteMany({ age: { $gte: 35 } })

// 删除所有数据 (慎用)
// db.users.deleteMany({})
```

**6. 了解索引(Index)**

https://www.mongodb.com/zh-cn/docs/manual/core/indexes/index-types/index-single/

https://www.mongodb.com/zh-cn/docs/manual/core/indexes/index-types/index-compound/

```javascript
// 1. 创建【单字段索引】
// 单列索引 -》 根据单个字段进行查询
//  where [ name = x ] and  [ age = x ]
// 语法：db.集合.createIndex({字段: 1})  1升序 / -1降序
// 索引本身就是排好序的结构 (MongoDB 默认是 WiredTiger 索引树(B树))
// 创建时写 1 或 -1，就是告诉 MongoDB：
// 这个索引按什么顺序存
db.users.createIndex({ name: 1 })        // 给 name 建索引
db.users.createIndex({ age: -1 })        // 给 age 倒序索引
// 1  索引数据 正序排列  
// -1 索引数据 倒序排列  不影响主数据的排序！ 主数据也不会排序！
// 单列索引 1 和 -1 随便...


// 2. 创建【联合索引】（多字段组合）
// 最左匹配原则：顺序非常重要！ 用法： 1个联合索引顶多个单个索引 （多）
// 先按 city 从小到大排序（1） 用法： 条件 （1 -1 无所谓） + 排序 （排序规则 正 1 倒 -1）
// city 一样的，再按 age 从大到小排序（-1）
db.users.createIndex({ city: 1, age: -1 })
// db.users.find({ city: "北京" }).sort({ age: -1 })
// 数据已经按 city 分组、age 倒序排好了！直接返回，不用再排序。

// 3. 查看集合所有索引
db.users.getIndexes()

// 4. 查看查询是否使用索引（执行计划）
// 重点：executionStats 看是否走索引
db.users.find({ name: "张三" }).explain()
```

### 8.5 开发基于 MongoDB 的历史对话工具

在 MongoDB 服务中创建数据库和 Collection（kb002）。

#### 8.5.1 对话数据结构

```json
{
    "session_id": "",
    "role": "",
    "text": "",
    "rewritten_query": "",
    "item_names": [],
    "ts": 123
}
```

每条数据代表一条对话。

| 字段名              | 说明                  |
| :------------------ | :-------------------- |
| **session_id**      | session id            |
| **role**            | 角色： user\assistant |
| **text**            | 对话文本【答案】      |
| **rewritten_query** | 改写后的问题          |
| **item_names**      | 产品名称，可多个      |
| **ts**              | 时间戳 秒             |

#### 8.5.2 添加配置文件

根目录下建立 `.env` 文件：

```env
#Mongodb的配置
MONGO_URL=mongodb://47.94.86.115:27017
MONGO_DB_NAME=kb002
```

#### 8.5.3 历史对话工具代码实现

```python
# 导入系统模块：用于读取环境变量
import os
# 导入日志模块：用于记录程序运行日志（成功/失败/错误信息）
import logging
# 导入类型注解模块：用于函数参数/返回值的类型提示，提升代码可读性和规范性
from typing import List, Dict, Any, Optional
# 导入时间模块：用于生成时间戳，记录对话的创建时间
from datetime import datetime
# 导入pymongo核心模块：MongoDB原生Python驱动，实现数据库连接和操作
# ASCENDING：表示升序排序，用于MongoDB索引和查询排序
from pymongo import MongoClient, ASCENDING
# 导入bson的ObjectId：MongoDB默认的主键类型，用于唯一标识文档
from bson import ObjectId
# 导入dotenv模块：用于从.env文件加载环境变量，避免硬编码敏感配置（如MongoDB连接地址）
from dotenv import load_dotenv

# 加载.env文件中的环境变量，使os.getenv能读取到配置
load_dotenv()


class HistoryMongoTool:
    """
    MongoDB 历史对话记录读写工具类 (基于原生 PyMongo 实现)
    核心功能：封装MongoDB的连接、集合初始化、索引创建，为上层提供统一的数据库操作入口
    扩展功能：支持与LangChain消息对象的格式转换（原代码预留能力）
    """
    def __init__(self):
        """
        类初始化方法：完成MongoDB的连接、数据库/集合获取、索引创建
        初始化失败会抛出异常并记录错误日志，确保程序感知连接问题
        """
        try:
            # 从环境变量读取MongoDB连接地址（敏感配置，不硬编码）
            self.mongo_url = os.getenv("MONGO_URL")
            # 从环境变量读取要使用的数据库名称
            self.db_name = os.getenv("MONGO_DB_NAME")

            # 创建MongoDB客户端实例，建立与数据库的连接
            self.client = MongoClient(self.mongo_url)
            # 获取指定名称的数据库对象
            self.db = self.client[self.db_name]
            # 获取对话记录的集合（相当于关系型数据库的表），集合名：chat_message
            self.chat_message = self.db["chat_message"]

            # 为chat_message集合创建复合索引，提升查询性能
            # 索引规则：session_id升序 + ts降序，适配"按会话查最新记录"的核心查询场景
            # create_index自带幂等性：索引已存在时不会重复创建，无需额外判断
            self.chat_message.create_index([("session_id", 1), ("ts", -1)])

            # 记录成功日志，确认数据库连接和初始化完成
            logging.info(f"Successfully connected to MongoDB: {self.db_name}")
        except Exception as e:
            # 捕获所有初始化异常，记录详细错误日志
            logging.error(f"Failed to connect to MongoDB: {e}")
            # 重新抛出异常，让调用方感知初始化失败，避免使用未初始化的实例
            raise


# 定义全局变量：存储HistoryMongoTool的单例实例
# 作用：避免多次创建HistoryMongoTool实例，从而避免重复建立MongoDB连接
_history_mongo_tool = None
# 模块加载时尝试初始化单例实例，实现预加载
# 目的：将数据库连接的初始化提前到模块加载阶段，避免第一次调用接口时才建立连接（提升首次响应速度）
try:
    _history_mongo_tool = HistoryMongoTool()
except Exception as e:
    # 初始化失败时仅记录警告日志，不抛出异常
    # 原因：模块加载阶段的异常可能导致整个程序启动失败，此处保留懒加载兜底（get_history_mongo_tool会再次尝试创建）
    logging.warning(f"Could not initialize HistoryMongoTool on module load: {e}")

def get_history_mongo_tool() -> HistoryMongoTool:
    """
    获取HistoryMongoTool的单例实例（饿汉模式）
    核心逻辑：全局实例为空时创建，不为空时直接返回，保证整个程序只有一个数据库连接实例
    :return: HistoryMongoTool的单例实例
    """
    # 声明使用全局变量，避免函数内视为局部变量
    global _history_mongo_tool
    # 懒加载：仅当全局实例为空时，才创建新的实例
    if _history_mongo_tool is None:
        _history_mongo_tool = HistoryMongoTool()
    # 返回单例实例
    return _history_mongo_tool



def clear_history(session_id: str) -> int:
    """
    清空指定会话的所有历史对话记录
    :param session_id: 会话唯一标识，用于筛选要删除的记录
    :return: 实际删除的文档数量，删除失败返回0
    """
    # 获取全局的HistoryMongoTool实例，使用单例模式避免重复创建数据库连接
    mongo_tool = get_history_mongo_tool()
    try:
        # 执行批量删除操作：删除所有session_id匹配的文档
        result = mongo_tool.chat_message.delete_many({"session_id": session_id})
        # 记录删除成功日志，包含删除数量和会话ID，便于问题排查
        logging.info(f"Deleted {result.deleted_count} messages for session {session_id}")
        # 返回实际删除的数量（delete_many的返回对象包含deleted_count属性）
        return result.deleted_count
    except Exception as e:
        # 捕获删除异常，记录错误日志，包含会话ID
        logging.error(f"Error clearing history for session {session_id}: {e}")
        # 异常时返回0，标识删除失败
        return 0


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
    写入/更新单条会话记录到MongoDB
    支持两种模式：无message_id时新增记录，有message_id时更新已有记录
    :param session_id: 会话唯一标识，关联对话所属的会话
    :param role: 消息角色，固定值：user（用户）/assistant（助手）
    :param text: 对话核心内容，用户的提问或助手的回答
    :param rewritten_query: 重写后的查询语句（可选，用于检索增强等场景，默认空字符串）
    :param item_names: 关联的商品名称列表（可选，支持多商品，默认None）
    :param image_urls: 关联的图片URL列表（可选，默认None）
    :param message_id: 记录主键ID（可选，有值则更新，无值则新增）
    :return: 插入/更新的记录唯一标识（新增返回ObjectId字符串，更新返回传入的message_id）
    """
    # 生成当前时间的时间戳（秒级），用于记录消息的创建时间，后续用于排序和查询
    ts = datetime.now().timestamp()

    # 构造要插入/更新的文档数据（MongoDB的基本数据单元是文档，类似Python字典）
    document = {
        "session_id": session_id,  # 会话ID，关联维度
        "role": role,  # 消息角色
        "text": text,  # 消息内容
        "rewritten_query": rewritten_query or "",  # 重写查询，空值处理为空字符串
        "item_names": item_names,  # 关联商品名称列表
        "image_urls": image_urls,  # 关联图片URL列表
        "ts": ts  # 时间戳，排序和时间筛选维度
    }

    # 获取全局的HistoryMongoTool实例，使用单例模式
    mongo_tool = get_history_mongo_tool()
    # 判断是否传入主键ID，区分更新/新增逻辑
    if message_id:
        # 有message_id：执行更新操作（根据主键更新）
        result = mongo_tool.chat_message.update_one(
            {"_id": ObjectId(message_id)},  # 更新条件：主键匹配（需将字符串转为ObjectId类型）
            {"$set": document}  # 更新操作：$set表示只更新指定字段，保留其他字段
        )
        # 更新操作返回传入的message_id作为标识
        return message_id
    else:
        # 无message_id：执行新增操作
        result = mongo_tool.chat_message.insert_one(document)
        # 新增操作返回插入的ObjectId并转为字符串，便于上层使用（避免直接返回ObjectId对象）
        return str(result.inserted_id)


def update_message_item_names(ids: List[str], item_names: List[str]) -> int:
    """
    批量更新历史会话记录的关联商品名称
    :param ids: 要更新的记录主键ID列表（字符串类型）
    :param item_names: 要设置的新商品名称列表
    :return: 实际更新的文档数量，更新失败返回0
    """
    # 获取全局的HistoryMongoTool实例，使用单例模式
    mongo_tool = get_history_mongo_tool()
    try:
        # 将字符串类型的主键列表转为MongoDB的ObjectId类型（数据库中主键是ObjectId类型）
        object_ids = [ObjectId(i) for i in ids]
        # 执行批量更新操作
        result = mongo_tool.chat_message.update_many(
            # 更新条件：复合条件，同时满足
            {
                "_id": {"$in": object_ids}# 主键在指定的ID列表中（批量筛选）
            },
            {"$set": {"item_names": item_names}}  # 更新操作：设置新的商品名称列表
        )
        # 记录更新成功日志，包含更新数量和新的商品名称
        logging.info(f"Updated {result.modified_count} records to item_names: {item_names}")
        # 返回实际更新的数量（modified_count：真正被修改的文档数，区别于matched_count）
        return result.modified_count
    except Exception as e:
        # 捕获批量更新异常，记录错误日志
        logging.error(f"Error updating history item_names: {e}")
        # 异常时返回0，标识更新失败
        return 0


def get_recent_messages(session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    查询指定会话的最近N条对话记录，返回原始字典格式
    结果按时间正序排列，可直接喂给LLM作为上下文
    :param session_id: 会话唯一标识，用于筛选指定会话的记录
    :param limit: 条数限制，默认返回最近10条
    :return: 对话记录列表（字典格式），查询失败返回空列表
    """
    # 获取全局的HistoryMongoTool实例，使用单例模式
    mongo_tool = get_history_mongo_tool()
    try:
        # 构造查询条件：仅查询指定session_id的记录
        query = {"session_id": session_id}

        # 执行查询：按时间戳升序排序，限制返回条数
        # find(query)：获取符合条件的游标（惰性加载，不立即查询）
        # sort("ts", ASCENDING)：按ts字段升序（从旧到新），适配LLM上下文顺序
        # limit(limit)：限制返回的最大条数
        cursor = mongo_tool.chat_message.find(query).sort("ts", ASCENDING).limit(limit)
        # 将游标转为列表，触发实际数据库查询，获取所有符合条件的文档
        messages = list(cursor)

        # 返回查询结果列表
        return messages
    except Exception as e:
        # 捕获查询异常，记录错误日志
        logging.error(f"Error getting recent messages: {e}")
        # 异常时返回空列表，避免上层处理None报错
        return []


# 主程序入口：仅当直接运行该脚本时执行，用于简单的功能测试
if __name__ == "__main__":
    # 简单测试代码：验证数据库的写入和查询功能是否正常
    # 测试会话ID，用于标识测试的对话记录
    sid = "000015_hybrid"
    # 1. 写入用户消息（手动指定ts=1000，便于测试排序）
    save_chat_message(sid, "user", "你好 (Hybrid)")
    # 2. 写入助手回复（手动指定ts=1001，按时间顺序紧跟用户消息）
    save_chat_message(sid, "assistant", "你好！我是基于原生 Mongo + LangChain 对象的助手。")
    # 3. 写入带关联商品的用户消息（手动指定ts=1002，测试item_names字段）
    save_chat_message(sid, "user", "这个万用表怎么换电池？", item_names=["混合万用表"])

    # 4. 查询指定会话的最近5条记录，验证查询功能
    print("--- 查询 LangChain 对象记录 ---")
    messages = get_recent_messages(sid, limit=5)
    # 打印查询到的记录数量
    print(f"查询到的记录数: {len(messages)}")
    # 遍历打印每条记录的详细内容
    for m in messages:
        print(f" {m}  ")
```

#### 8.5.4 调用历史对话

**1. 在 `query_service.py` 中加入**

```python
@app.get("/history/{session_id}")
async def history(session_id: str, limit: int = 50):
    """
    查询当前会话历史记录
    """
    try:
        records = get_recent_messages(session_id, limit=limit)
        items = []
        for r in records:
            items.append({
                "_id": str(r.get("_id")) if r.get("_id") is not None else "",
                "session_id": r.get("session_id", ""),
                "role": r.get("role", ""),
                "text": r.get("text", ""),
                "rewritten_query": r.get("rewritten_query", ""),
                "item_names": r.get("item_names", []),
                "ts": r.get("ts")
            })
        return {"session_id": session_id, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"history error: {e}")

@app.delete("/history/{session_id}")
async def clear_chat_history(session_id: str):
    count =  clear_history(session_id)
    return {"message": "History cleared", "deleted_count": count}
```

**2. 在 `node_item_name_confirm.py` 中增加保存消息的调用**

```python
def node_item_name_confirm(state):
    print(f"---node_item_name_confirm 处理")
    
    add_running_task(state['session_id'], sys._getframe().f_code.co_name, state.get("is_stream"))
    add_done_task(state['session_id'], sys._getframe().f_code.co_name, state.get("is_stream"))

    save_chat_message(state['session_id'], "user", state['original_query'], "", state.get("item_names", []))

    print(f"---已保存对话 处理完成")
```

