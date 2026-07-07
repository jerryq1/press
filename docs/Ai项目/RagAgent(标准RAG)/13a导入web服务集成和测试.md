---
title: 导入web服务集成和测试
date: 2026-06-21
abstract: 此文档为(文件上传前后端交互)的源文档
tags:
- Ai实战项目
---

# 导入web服务集成和测试

## 6. 导入web服务集成和测试

本章节介绍如何将上述实现的 LangGraph 知识库导入流程集成到 FastAPI Web 服务中，并提供可视化界面供用户上传文件和查看导入进度。

### 6.1 FastAPI 基础讲解

FastAPI 是一个现代、快速（高性能）的 Web 框架，用于构建 APIs with Python 3.7+。本节内容完全独立于本项目，旨在帮助初学者快速掌握 FastAPI 的核心用法。

#### 1. 为什么选择 FastAPI？

*   **极速性能**：基于 **Starlette** (负责路由和异步) 和 **Pydantic** (负责数据验证)，性能在 Python web 框架中名列前茅。
*   **开发快**：简捷的语法减少了约 40% 的代码量，自动补全支持极佳。
*   **原生异步**：完美支持 `async` / `await`，轻松应对高并发场景。
*   **交互式文档**：启动服务后，访问 `/docs` 即可获得自动生成的 Swagger UI 接口文档，直接在浏览器调试接口。

#### 2. 核心概念与代码示例

##### 示例1：安装和快速体验

安装 FastAPI 很简单，这里我们使用 **pip** 命令来安装。

```
uv add install fastapi
```

另外我们还需要一个 ASGI 服务器，生产环境可以使用 Uvicorn 或者 Hypercorn：

```
uv add "uvicorn[standard]"
```

运行第一个 FastAPI 应用

创建一个名为 main.py 的文件，添加以下代码：

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}
```

在命令行中运行以下命令以启动应用：

```
uvicorn main:app --reload
```

现在，打开浏览器并访问 **http://127.0.0.1:8000**，你应该能够看到 FastAPI 自动生成的交互式文档，并在根路径 ("/") 返回的 JSON 响应。

**代码解析：**

- `from fastapi import FastAPI`： 这行代码从< code>fastapi 模块中导入了 `FastAPI` 类。`FastAPI` 类是 FastAPI 框架的核心，用于创建 FastAPI 应用程序实例。
- `app = FastAPI()`：这行代码创建了一个 FastAPI 应用实例。与 Flask 不同，FastAPI 不需要传递 `__name__` 参数，因为它默认使用当前模块。
- `@app.get("/")`： 这是一个装饰器，用于告诉 FastAPI 哪个 URL 应该触发下面的函数，并且指定了 HTTP 方法为 GET。在这个例子中，它指定了根 URL（即网站的主页）。
- `def read_root():`： 这是定义了一个名为 `read_root` 的函数，它将被调用当用户使用 GET 方法访问根 URL 时。
- `return {"Hello": "World"}`： 这行代码是 `read_root` 函数的返回值。当用户使用 GET 方法访问根 URL 时，这个 JSON 对象将被发送回用户的浏览器或 API 客户端。

##### **示例 2: 最简单的 API 与 参数解析**

展示如何定义 GET 请求，以及如何自动解析路径参数和查询参数。

```python
from fastapi import FastAPI

app = FastAPI()

# 访问 http://127.0.0.1:8000/
@app.get("/")
async def root():
    return {"message": "Hello World"}

# 访问 http://127.0.0.1:8000/items/5?q=somequery
# item_id: 路径参数 (自动转为 int)
# q: 查询参数 (可选，默认 None)
@app.get("/items/{item_id}")
async def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}

# 接收? skip=? & limit = ?
@app.get("/items/")
def read_item(skip: int = 0, limit: int = 10):
    return {"skip": skip, "limit": limit}

# 展示如何定义数据结构，FastAPI 会自动进行类型检查和错误提示。
from pydantic import BaseModel

# 定义数据模型
class Item(BaseModel):
    name: str
    price: float
    is_offer: bool = None

# 使用 Header 和 Cookie 类型注解获取请求头和 Cookie 数据。
# POST 请求接收 JSON 数据
@app.post("/items/")
def create_item(item: Item):
    # item 已经是验证过的 Item 对象
    # 如果客户端传来的 price 是字符串 "abc"，FastAPI 会自动报错
    return {"item_name": item.name, "item_price": item.price}

from fastapi import Header, Cookie
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/")
def read_item(user_agent: str = Header(None), session_token: str = Cookie(None)):
    return {"User-Agent": user_agent, "Session-Token": session_token}
```

函数接受两个参数：

- **item_id** --是路径参数，指定为整数类型。
- **q** -- 是查询参数，指定为字符串类型或空（None）。

FastAPI 提供了内置的交互式 API 文档，使开发者能够轻松了解和测试 API 的各个端点。

这个文档是自动生成的，基于 OpenAPI 规范，支持 Swagger UI 和 ReDoc 两种交互式界面。

通过 FastAPI 的交互式 API 文档，开发者能够更轻松地理解和使用 API，提高开发效率

在运行 FastAPI 应用时，Uvicorn 同时启动了交互式 API 文档服务。

默认情况下，你可以通过访问 **http://127.0.0.1:8000/docs** 来打开 Swagger UI 风格的文档：


![img](../images/image-20260126150221641-17694799119601.png)



##### **示例 3: 响应JSON**数据

展示如何定义数据结构，FastAPI 会自动进行类型检查和错误提示。

```python
# 路由处理函数返回一个 Pydantic 模型实例，FastAPI 将自动将其转换为 JSON 格式，并作为响应发送给客户端：
@app.post("/items/return")
def create_item(item: Item):
    return item

#使用 RedirectResponse 实现重定向，将客户端重定向到 /items/ 路由。
from fastapi.responses import RedirectResponse

@app.get("/redirect")
def redirect():
    return RedirectResponse(url="/items/")

#使用 HTTPException 抛出异常，返回自定义的状态码和详细信息。
#以下实例在 item_id 为 42 会返回 404 状态码：
from fastapi import HTTPException

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int):
    if item_id == 42:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"item_id": item_id}
```

FastAPI 从 `fastapi.responses` 中提供了多种响应类，覆盖不同的使用场景，下面按「常用程度」整理，每个都附简单示例：

1. JSONResponse（最常用）

    - **作用**：返回 JSON 格式的数据（FastAPI 默认的响应类型）；

    - **场景**：接口返回普通数据（列表、字典、状态信息等）；

    - 示例

      ```python
      from fastapi.responses import JSONResponse
      
      @app.get("/api/user")
      def get_user():
          # 等价于直接 return {"name": "张三", "age": 20}（FastAPI 自动转 JSONResponse）
          return JSONResponse(
              content={"name": "张三", "age": 20},
              status_code=200,  # 可选，默认 200
              headers={"X-Custom-Header": "custom-value"}  # 可选，自定义响应头
          )
      ```

2. FileResponse（文件专用）

    - **作用**：返回文件（支持大文件、静态文件、下载文件）；

    - **场景**：返回 HTML / 图片 / 视频 / Excel 等文件；

    - 关键参数

        - `path`：文件路径（必填）；
        - `filename`：下载时显示的文件名（可选）；
        - `media_type`：手动指定 MIME 类型（比如 `media_type="application/pdf"`）；

    - 示例:

      ```python
      from fastapi.responses import FileResponse
      
      @app.get("/download/excel")
      def download_excel():
          excel_path = "./data/report.xlsx"
          # 返回文件并指定下载文件名
          return FileResponse(
              path=excel_path,
              filename="月度报表.xlsx",
              media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          )
      ```

3. HTMLResponse

    - **作用**：返回 HTML 字符串（直接渲染页面）；

    - **场景**：动态生成 HTML 内容（比如拼接变量到 HTML 中）；

    - 示例:

      ```python
      from fastapi.responses import HTMLResponse
      
      @app.get("/hello")
      def hello(name: str = "游客"):
          html_content = f"""
          <html>
              <body>
                  <h1>你好，{name}！</h1>
              </body>
          </html>
          """
          return HTMLResponse(content=html_content, status_code=200)
      ```

      > 注意：如果是返回静态 HTML 文件，优先用 `FileResponse`；动态生成 HTML 用 `HTMLResponse`。

4. PlainTextResponse

    - **作用**：返回纯文本格式的数据（非 JSON、非 HTML）；

    - **场景**：返回简单的文本提示、日志内容等；

    - 示例：

      ```python
      from fastapi.responses import PlainTextResponse
      
      @app.get("/text")
      def get_text():
          return PlainTextResponse(content="这是纯文本响应", status_code=200)
      ```

5. RedirectResponse

    - **作用**：实现页面重定向；

    - **场景**：登录成功后跳转到首页、旧接口重定向到新接口等；

    - 示例:

      ```python
      from fastapi.responses import RedirectResponse
      
      @app.get("/old-path")
      def redirect_old_path():
          # 重定向到 /new-path，状态码 307 表示临时重定向
          return RedirectResponse(url="/new-path", status_code=307)
      
      @app.get("/new-path")
      def new_path():
          return {"message": "这是新接口"}
      ```

6. StreamingResponse（流式响应）

    - **作用**：返回流式数据（逐块传输，不一次性加载到内存）；

    - **场景**：返回大文件、LLM 流式输出（比如 ChatGPT 逐字回复）、实时日志流等；

    - 示例（LLM 流式输出）:

      ```python
      from fastapi.responses import StreamingResponse
      import asyncio
      
      async def generate_stream():
          # 模拟流式输出（逐字返回）
          words = ["你", "好", "，", "这", "是", "流", "式", "响", "应"]
          for word in words:
              await asyncio.sleep(0.5)
              yield word.encode("utf-8")  # 流式输出需返回字节流
      
      @app.get("/stream")
      async def stream_response():
          return StreamingResponse(generate_stream(), media_type="text/plain")
      ```

7. Response（基础响应类）

    - **作用**：所有响应类的父类，用于自定义任意格式的响应；

    - **场景**：需要高度定制响应（比如自定义 MIME 类型、响应体格式）；

    - 示例：

      ```python
      from fastapi.responses import Response
      
      @app.get("/custom")
      def custom_response():
          # 返回二进制数据，指定自定义 MIME 类型
          return Response(
              content=b"custom binary data",
              media_type="application/octet-stream",
              status_code=200
          
      ```

总结

1. `FileResponse` 是 FastAPI 专门用于**返回文件**的响应类，支持流式传输，适合静态文件 / 下载场景；
2. FastAPI 核心响应类型按场景分类：
    - 常规数据：`JSONResponse`（默认）；
    - 文件：`FileResponse`；
    - 动态 HTML：`HTMLResponse`；
    - 纯文本：`PlainTextResponse`；
    - 重定向：`RedirectResponse`；
    - 流式数据：`StreamingResponse`；
    - 自定义响应：`Response`（父类）；
3. 选择响应类型的核心原则：**匹配返回数据的格式和业务场景**（比如静态文件用 `FileResponse`，流式输出用 `StreamingResponse`）。

##### **示例 4: 文件上传 (UploadFile)**

展示如何接收上传的文件，这是本项目最常用的功能。

```python
from fastapi import FastAPI, File,UploadFile,HTTPException
from fastapi.responses import JSONResponse
import os

from rich import status

app = FastAPI()

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.post("/upload",summary="单个文件上传接口")
async def upload(file: UploadFile = File(
    ...,
    description="需要上传的文件（支持图片/文档等)",
    alias="upload_file", #前端参数的别名，默认文件名是file
    media_type="application/octet-stream"
),remark:str = None
):
    try:
        # 1. 校验文件类型（示例：只允许上传图片）
        ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"]
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"仅支持上传{ALLOWED_TYPES}类型的文件，当前文件类型：{file.content_type}"
            )
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        CHUNK_SIZE = 1024 * 1024  # 1MB分块
        with open(file_path, "wb") as f:
            # 分块读取大文件（避免内存溢出）
            while True:
                chunk = await file.read(CHUNK_SIZE)  # 每次读1MB
                if not chunk:
                    break
                f.write(chunk)
            """
            await的必要性：file.read()是异步函数，必须用await才能拿到文件内容，否则程序报错；
            分块读取的核心：给read()传一个字节数（如 1MB），循环读取 + 写入，避免大文件占满内存；
            用法选择：小文件可以用await file.read()一次性读取，大文件必须分块读取；
            """
        return JSONResponse(
            status_code=200,
            content={
                "code": 0,
                "msg": "文件上传成功",
                "data": {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "file_size": f"{file.size} 字节",  # 文件大小
                    "save_path": file_path,
                    "remark": remark or "无备注"
                }
            }
        )
    except Exception as e:
        # 异常捕获：返回友好的错误信息
        raise HTTPException(
            status_code=500,
            detail=f"文件上传失败：{str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)      
```

`File()`的参数和`Form()`/`Query()`逻辑一致，核心常用配置如下：

|     参数      |                             作用                             |                示例                 |
| :-----------: | :----------------------------------------------------------: | :---------------------------------: |
|     `...`     |      表示**必填项**（必须传文件，不传则返回 422 错误）       |             `File(...)`             |
|    `None`     |            表示**可选项**（不传文件也能调用接口）            |            `File(None)`             |
| `description` |   接口文档中显示的描述（提升可读性，FastAPI 自动生成文档）   | `File(..., description="上传图片")` |
|    `alias`    | 前端传参的别名（比如前端用`file_upload`传，后端用`file`接收） |  `File(..., alias="file_upload")`   |
| `media_type`  |            限定文件的 MIME 类型（比如只允许图片）            |  `File(..., media_type="image/*")`  |
| `min_length`  |     限制文件内容最小字节数（很少用，一般在校验逻辑里做）     |    `File(..., min_length=1024)`     |
| `max_length`  | 限制文件内容最大字节数（比如限制 5MB：`max_length=5*1024*1024`） |   `File(..., max_length=5242880)`   |

##### **示例 5: 后台任务 (BackgroundTasks)**

展示如何在返回响应后继续执行耗时操作（如发送邮件、处理数据），避免阻塞用户。

```python
from fastapi import BackgroundTasks
import time

# 定义一个模拟的耗时任务
def write_log(message: str):
    time.sleep(2) # 模拟耗时 2 秒
    with open("log.txt", "a") as log:
        log.write(message + "\n")

@app.post("/send-notification/{email}")
async def send_notification(email: str, background_tasks: BackgroundTasks):
    # 1. 添加任务到后台队列
    background_tasks.add_task(write_log, f"Notification sent to {email}")
    # 2. 立即返回响应给用户，不需要等待 write_log 执行完毕
    return {"message": "Notification sent in the background"}
```

##### **示例 6: 静态文件与跨域配置 (CORS)**

Web 开发必备：托管 HTML 页面和解决浏览器跨域限制。

```python
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# 1. 静态文件挂载
# 假设当前目录下有个 static 文件夹，里面有 index.html
# 访问 http://127.0.0.1:8000/static/index.html 即可
app.mount("/static", StaticFiles(directory="static"), name="static")

# 访问 /go-to-index → 跳转到本地static/index.html
@app.get("/go-to-index")
async def redirect_to_index():
    return RedirectResponse(url="/static/index.html")

# 2. CORS 配置
# 允许前端页面（如运行在 5500 端口）访问后端 API（8000 端口）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 允许所有来源（生产环境建议指定具体域名）
    allow_credentials=True,
    allow_methods=["*"], # 允许所有 HTTP 方法
    allow_headers=["*"], # 允许所有请求头
)
```

### 6.2 web服务实现过程

**文件位置**:`app/import_process/api/file_import_service.py`

本节将展示完整的 Web 服务实现代码。该服务基于 FastAPI 构建，提供了文件上传、后台任务调度、状态查询以及静态页面服务功能。

#### 1. 依赖库

在运行本服务前，请确保安装以下 Python 依赖库（已包含在 `requirements.txt` 中）：

```bash
uv add fastapi uvicorn python-multipart python-dotenv minio
```

此外，本项目依赖 LangGraph 和 LangChain 相关库来执行后台任务。

#### 2. 代码实现详解

我们将 `app/import_process/api/file_import_service.py` 的实现拆分为 6 个核心部分进行讲解，以便理解每个模块的作用。

##### (1) 引入依赖与环境配置

首先，导入必要的系统库、FastAPI 组件以及我们的工具类 (`minio_utils`, `task_utils`, `main_graph`)。同时加载 `.env` 环境变量。

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
```

##### (2) 应用初始化与跨域配置

初始化 FastAPI 应用，并配置 CORS（跨域资源共享）以允许前端调用。

```python
# 定义fastapi对象
app = FastAPI(title="query service", description="掌柜智库查询服务！")

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# 静态页面路由：返回文件导入前端页面import.html
# 访问地址：http://localhost:8000/import.html
# --------------------------
@app.get("/import.html", response_class=FileResponse)
async def get_import_page():
    """返回文件导入前端页面：import.html"""
    # 拼接HTML文件绝对路径，基于项目根目录定位
    html_abs_path = PROJECT_ROOT / "app/import_process/page/import.html"
    # 日志记录页面访问的文件路径，方便排查文件不存在问题
    logger.info(f"前端页面访问，文件绝对路径：{html_abs_path}")

    # 校验文件是否存在，不存在则抛出404异常
    if not os.path.exists(html_abs_path):
        logger.error(f"前端页面文件不存在，路径：{html_abs_path}")
        raise HTTPException(status_code=404, detail="import.html page not found")

    # 以FileResponse返回HTML文件，浏览器自动渲染
    return FileResponse(
        path=html_abs_path,
        media_type="text/html"  # 显式指定媒体类型为HTML，确保浏览器正确解析
    )
```

##### (3) 后台任务逻辑

这是连接 Web 服务与 LangGraph 的桥梁。`run_graph_task` 函数会在后台运行（不阻塞 HTTP 响应），它监听图的执行事件，并实时更新任务状态。

```python
# --------------------------
# 后台任务：LangGraph全流程执行
# 独立于主请求线程，由BackgroundTasks触发，避免阻塞接口响应
# --------------------------
def run_graph_task(task_id: str, local_dir: str, local_file_path: str):
    """
    LangGraph全流程执行后台任务
    核心流程：初始化状态 → 流式执行图节点 → 实时更新任务状态 → 异常捕获
    任务状态更新：pending → processing → completed/failed
    节点进度更新：每完成一个节点，将节点名加入done_list，供前端轮询查看

    :param task_id: 全局唯一任务ID，关联单个文件的全流程处理
    :param local_dir: 该任务的本地文件存储目录（含临时文件/解析结果）
    :param local_file_path: 上传文件的本地绝对路径
    """
    try:
        # 1. 更新任务全局状态为：处理中
        update_task_status(task_id, "processing")
        logger.info(f"[{task_id}] 开始执行LangGraph全流程，本地文件路径：{local_file_path}")

        # 2. 初始化LangGraph状态：加载默认状态 + 注入当前任务的核心参数
        init_state = get_default_state()
        init_state["task_id"] = task_id  # 任务ID关联
        init_state["local_dir"] = local_dir  # 任务本地目录
        init_state["local_file_path"] = local_file_path  # 上传文件本地路径

        # 3. 流式执行LangGraph全流程（stream模式：实时获取每个节点的执行结果）
        for event in kb_import_app.stream(init_state):
            for node_name, node_result in event.items():
                # 记录每个节点完成的日志，包含任务ID和节点名，方便追踪执行顺序
                logger.info(f"[{task_id}] LangGraph节点执行完成：{node_name}")
                # 将完成的节点名加入【已完成列表】，前端轮询/status/{task_id}可实时获取
                add_done_task(task_id, node_name)

        # 4. 全流程执行完成，更新任务全局状态为：已完成
        update_task_status(task_id, "completed")
        logger.info(f"[{task_id}] LangGraph全流程执行完毕，任务完成")

    except Exception as e:
        # 5. 捕获全流程异常，更新任务全局状态为：失败，并记录错误日志（含堆栈）
        update_task_status(task_id, "failed")
        logger.error(f"[{task_id}] LangGraph全流程执行失败，异常信息：{str(e)}", exc_info=True)
```

##### (4) 文件上传接口 (/upload)

处理文件上传请求。它负责：

1. 生成全局唯一的 `task_id`。
2. 将文件保存到本地临时目录。
4. 启动后台任务 (`run_graph_task`) 开始处理。

```python
# --------------------------
# 核心接口：多文件上传接口（不上传 MinIO）
# 支持多文件批量上传，核心流程：接收文件 → 本地保存 → 启动后台任务
# 访问地址：http://localhost:8000/upload （POST请求，form-data格式传参）
# --------------------------
from pathlib import Path

@app.post("/upload", summary="文件上传接口", description="支持多文件批量上传，自动触发知识库导入全流程")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    文件上传核心接口（不上传 MinIO）
    1. 接收前端上传的多文件（PDF/MD为主）
    2. 按「日期/任务ID」分层保存到本地输出目录，避免文件冲突
    3. 为每个文件生成唯一TaskID，启动独立的LangGraph后台处理任务
    4. 实时更新任务状态，供前端轮询监控进度

    :param background_tasks: FastAPI后台任务对象，用于异步执行LangGraph流程
    :param files: 前端上传的文件列表（form-data格式）
    :return: 包含上传结果和所有任务ID的JSON响应
    """
    # 1. 构建本地存储根目录：项目根目录/output/YYYYMMDD（按日期分层，方便管理）
    today_str = datetime.now().strftime("%Y%m%d")
    date_based_root_dir: Path = PROJECT_ROOT / "output" / today_str

    # 初始化任务ID列表，用于返回给前端（一个文件对应一个TaskID）
    task_ids = []

    # 2. 遍历处理每个上传的文件（多文件批量处理，各自独立生成TaskID）
    for file in files:
        # 生成全局唯一TaskID（UUID4），作为单个文件的全流程标识
        task_id = str(uuid.uuid4())
        task_ids.append(task_id)
        logger.info(f"[{task_id}] 开始处理上传文件，文件名：{file.filename}，文件类型：{file.content_type}")

        # 3. 标记「文件上传」阶段为「运行中」，前端轮询可查
        add_running_task(task_id, "upload_file")

        # 4. 构建该任务的本地独立目录：output/YYYYMMDD/TaskID，避免多文件重名冲突
        task_local_dir: Path = date_based_root_dir / task_id
        task_local_dir.mkdir(parents=True, exist_ok=True)

        # 5. 构建上传文件的本地保存绝对路径
        local_file_abs_path: Path = task_local_dir / file.filename

        # 6. 将上传的文件保存到本地临时目录
        with local_file_abs_path.open("wb") as file_buffer:
            shutil.copyfileobj(file.file, file_buffer)
        logger.info(f"[{task_id}] 文件已保存至本地，路径：{local_file_abs_path}")

        # 7. 标记「文件上传」阶段为「已完成」
        add_done_task(task_id, "upload_file")

        # 8. 将LangGraph全流程处理加入FastAPI后台任务
        background_tasks.add_task(
            run_graph_task,
            task_id,
            str(task_local_dir),
            str(local_file_abs_path)
        )
        logger.info(f"[{task_id}] 已将LangGraph全流程加入后台任务，任务已启动")

    # 9. 所有文件处理完毕，返回上传成功信息和所有TaskID
    logger.info(f"多文件上传处理完毕，共处理{len(files)}个文件，生成TaskID列表：{task_ids}")
    return {
        "code": 200,
        "message": f"Files uploaded successfully, total: {len(files)}",
        "task_ids": task_ids
    }
```

##### (5) 任务状态查询接口 (/status)

前端轮询此接口以获取进度。它直接从内存中读取由 `task_utils` 维护的任务状态。

```python
# --------------------------
# 核心接口：任务状态查询接口
# 前端轮询此接口获取单个任务的处理进度和状态
# 访问地址：http://localhost:8000/status/{task_id} （GET请求）
# --------------------------
@app.get("/status/{task_id}", summary="任务状态查询", description="根据TaskID查询单个文件的处理进度和全局状态")
async def get_task_progress(task_id: str):
    """
    任务状态查询接口
    前端轮询此接口（如每秒1次），获取任务的实时处理进度
    返回数据均来自内存中的任务管理字典（task_utils.py），高性能无IO

    :param task_id: 全局唯一任务ID（由/upload接口返回）
    :return: 包含任务全局状态、已完成节点、运行中节点的JSON响应
    """
    # 构造任务状态返回体
    task_status_info: Dict[str, Any] = {
        "code": 200,
        "task_id": task_id,
        "status": get_task_status(task_id),  # 任务全局状态：pending/processing/completed/failed
        "done_list": get_done_task_list(task_id),  # 已完成的节点/阶段列表
        "running_list": get_running_task_list(task_id)  # 正在运行的节点/阶段列表
    }
    # 记录状态查询日志，方便追踪前端轮询情况
    logger.info(
        f"[{task_id}] 任务状态查询，当前状态：{task_status_info['status']}，已完成节点：{task_status_info['done_list']}")
    return task_status_info
```

##### (6) 启动入口

配置 Uvicorn 服务器启动参数。包含一段针对 Windows/PyCharm 环境下 `asyncio` 事件循环的兼容性补丁。

```python
# --------------------------
# 服务启动入口
# 直接运行此脚本即可启动FastAPI服务，无需额外执行uvicorn命令
# --------------------------
if __name__ == "__main__":
    """服务启动入口：本地开发环境直接运行"""
    logger.info("File Import Service 服务启动中...")
    # 启动uvicorn服务，绑定本地IP和8000端口，关闭自动重载（生产环境建议用workers多进程）
    uvicorn.run(
        app=app,
        host="127.0.0.1",  # 仅本地访问，生产环境改为0.0.0.0（允许所有IP访问）
        port=8000  # 服务端口
    )
```

#### 3. 接口与 Task 列表关系详解

本服务通过 `kb.utils.task_utils` 模块维护了一个内存中的任务状态列表，实现了前后端的状态同步。

1.  **上传阶段 (`/upload`)**:
    *   请求到达时，生成 `task_id`。
    *   调用 `add_running_task(task_id, "upload_file")`：此时前端查询状态，会看到 "开始上传文件" 正在运行。
    *   文件上传 MinIO 成功后，调用 `add_done_task(task_id, "upload_file")`：此时前端会看到 "开始上传文件" 变为已完成。

2.  **处理阶段 (`run_graph_task`)**:
    *   后台任务启动，调用 `update_task_status(task_id, "processing")`：标记任务整体正在处理中。
    *   LangGraph 每执行完一个节点（如 PDF 转 Markdown），流式输出会捕获到事件。
    *   调用 `add_done_task(task_id, node_name)`：将该节点标记为已完成。前端轮询时，进度条或日志列表会相应更新。

3.  **完成阶段**:
    *   图执行结束，调用 `update_task_status(task_id, "completed")`。
    *   前端收到 completed 状态，提示用户导入成功。


### 6.3 页面导入配置

**文件位置**: `app/import_process/page/import.html`

这是一个简洁的原生 HTML/JS 页面，实现了以下功能：

1.  **文件拖拽/选择**：支持 PDF 和 MD 文件。
2.  **上传进度条**：显示文件上传到服务器的进度。
3.  **状态轮询**：上传成功后，通过 `setInterval` 每 2 秒请求一次 `/status` 接口。
4.  **日志展示**：根据后端返回的 `done_list` 和 `running_list`，动态渲染任务执行日志（如 "node_entry已完成", "node_pdf_to_md正在进行..."）。

### 6.4 服务启动与测试流程

#### 1. 启动服务

在项目根目录下（`atguigu_knowledge_base`），运行以下命令：

```bash
# 方式一：直接运行 Python 模块
python -m kb.web.file_import_service

# 方式二：使用 uvicorn 命令
uvicorn kb.web.file_import_service:app --host 0.0.0.0 --port 8000 --reload
```

看到 `Application startup complete` 即表示启动成功。

#### 2. 页面测试

1.  打开浏览器访问：`http://127.0.0.1:8000/import.html`
2.  点击上传区域，选择一个测试文件（如 `doc/hak180产品安全手册.pdf`）。
3.  **观察页面交互**：
    *   状态变为 "上传中..." -> "处理中..."。
    *   点击 "日志（点击展开）"，可以看到节点逐个执行的过程。
    *   等待所有节点执行完毕，状态变为 "已完成" (绿色)。

#### 3. 验证结果

*   **MinIO**: 检查文件是否已上传到对应日期的 bucket 中。
*   **Milvus**: 使用 Attu 查看 `kb_chunks` 集合，确认是否新增了该文件的向量数据。

通过以上步骤，我们完成了从后端逻辑实现到 Web 服务集成，再到前端可视化操作的完整闭环！
