---
title: md图片处理(node_md_img)
date: 2026-06-17
abstract: 把md文档中的图片添加注释以及转化为远程连接
tags:
- Ai实战项目
---

# 图片处理(node_md_img)

## 5. 导入数据节点实现与测试

### 5.3 图片处理 (node_md_img)

**文件**: `app/import_process/agent/nodes/node_md_img.py`
**相关工具类位置**: `app/clients/minio_utils.py`, `app/utils/task_utils.py`

**节点作用**: 实现文档的“多模态语义对齐”。将 Markdown 中的本地图片路径转换为在线可访问的 MinIO 对象存储链接，并利用多模态大模型（VLM）生成图片内容的文字摘要，填入 `alt` 属性，使纯文本检索模型也能理解图片内容，将图片处理成需要的格式**\[多模态模型对图片的识别](自己文件服务器url地址，避免相对地址切换无法访问问题)**

**实现思路**:

1.  **图文解耦与持久化**: 将图片从本地文件系统迁移到 MinIO 对象存储，实现计算节点与存储分离，确保知识库在不同环境下的可访问性。
2.  **语义增强**: 引入 qwen3-vl-flash 或其他 VLM 模型（多模态模型），对每张图片进行“看图说话”，将视觉信息转化为文本摘要。这使得原本不可被搜索的图片，能够通过文本语义被检索到（如搜索“架构图”能找到对应的图片）。
3.  **速率控制**: 在调用 VLM API 时加入速率限制（Rate Limit），防止因图片过多触发并发风控。

#### 步骤分解

本节点负责处理 Markdown 文件中的图片，实现多模态信息的融合。

1.  **初始化与上下文获取 (Step 1)**: 从 `state` 中读取 Markdown 文件路径和内容。
2.  **扫描与筛选图片 (Step 2)**: 扫描 Markdown 中引用的本地图片，校验图片是否存在。
3.  **图片内容总结 (Step 3)**: 使用多模态大模型（如 qwen3-vl-flash 或其他 VL 模型）对图片生成中文摘要。为了避免 API 限流，实现了令牌桶算法进行速率控制（Rate Limit）。
4.  **上传与替换 (Step 4)**:
    *   清理 MinIO 中对应的旧图片目录。
    *   将图片批量上传到 MinIO 对象存储。
    *   将 Markdown 中的本地图片路径替换为 MinIO 的 HTTP URL，并将生成的图片摘要填入 Markdown 图片的 Alt 文本中。
5.  **备份与保存 (Step 5)**: 将处理后的内容保存为 `_new.md` 文件，并更新 `state` 中的路径。

#### 基于LangChain大模型的配置和类

添加全局配置 .env文件

```ini
# api_key申请地址：https://bailian.console.aliyun.com/cn-beijing/?spm=5176.29597918.J_SEsSjsNv72yRuRFS2VknO.2.4d877b08ThdGtP&tab=model#/api-key
# 大模型的文档地址：https://bailian.console.aliyun.com/cn-beijing/?spm=5176.29597918.J_SEsSjsNv72yRuRFS2VknO.2.4d877b08ThdGtP&tab=doc#/doc
# Qwen3系列Flash模型，实现思考模式和非思考模式的有效融合，可在对话中切换模式。复杂推理类任务性能优秀，指令遵循、文本理解等能力显著提高。支持1M上下文长度，按照上下文长度进行阶梯计费。
LLM_DEFAULT_MODEL=qwen-flash
#Qwen3系列小尺寸视觉理解模型，实现思考模式和非思考模式的有效融合，效果优于开源版Qwen3-VL-30B-A3B，响应速度快。全面升级图像/视频理解，支持长视频长文档等超长上下文、
#空间感知与万物识别；具备视觉2D/3D定位能力，胜任复杂现实任务。
VL_MODEL=qwen3-vl-flash
OPENAI_API_KEY=your key
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_DEFAULT_TEMPERATURE=0.1
```

定义配置类，读取配置文件

位置：`app/config/lm_config.py` 【通用配置放在app下】

```python
# 导入核心依赖：数据类、环境变量读取、路径处理
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# 提前加载.env配置文件（必须在读取环境变量前执行，确保os.getenv能获取到值）
# 若.env不在项目根目录，可指定路径：load_dotenv(dotenv_path=Path(__file__).parent / ".env")
load_dotenv()


# 定义minerU服务配置
@dataclass
class LLMConfig:
    base_url: str
    api_key : str
    lv_model: str
    llm_model: str
    llm_temperature: float

lm_config = LLMConfig(
    base_url=os.getenv("OPENAI_API_BASE"),
    api_key=os.getenv("OPENAI_API_KEY"),
    lv_model=os.getenv("VL_MODEL"),
    llm_model=os.getenv("LLM_DEFAULT_MODEL"),
    llm_temperature=float(os.getenv("LLM_DEFAULT_TEMPERATURE"))
)
```

首先引入必要的库，并加载环境变量配置。

定义大模型工具类

位置：`app/lm/llm_utils.py`

```python
# 环境配置与依赖导入
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.exceptions import LangChainException
from typing import Optional

# 项目内部依赖
from app.conf.lm_config import lm_config
from app.core.logger import logger

# 全局缓存：键为(模型名, JSON输出模式)元组，值为ChatOpenAI实例
# 作用：避免重复初始化客户端，提升性能，统一实例管理
_llm_client_cache = {}


def get_llm_client(model: Optional[str] = None, json_mode: bool = False) -> ChatOpenAI:
    """
    获取带全局缓存的LangChain ChatOpenAI客户端实例
    适配OpenAI/千问/即梦AI等**OpenAI兼容API**，支持自定义模型和JSON标准化输出
    核心特性：缓存机制+配置统一加载+异常精准捕获+国产模型参数适配

    :param model: 模型名称，优先级：传入参数 > 配置文件lm_config.llm_model > 内置默认qwen3-32b
    :param json_mode: 是否开启JSON输出模式，开启后返回标准json_object格式（适配结构化数据解析）
    :return: 初始化完成的ChatOpenAI实例（优先从全局缓存获取，未命中则新建并缓存）
    :raise ValueError: 缺失API密钥/基础地址等核心配置
    :raise Exception: 模型初始化失败（LangChain封装层异常）
    """
    # 1. 确定目标模型（优先级递减，保证模型名非空）
    target_model = model or lm_config.llm_model or "qwen3-32b"
    # 缓存键：模型名+JSON模式，唯一标识不同配置的客户端
    cache_key = (target_model, json_mode)

    # 2. 缓存命中：直接返回已初始化的实例，避免重复创建
    if cache_key in _llm_client_cache:
        logger.debug(f"[LLM客户端] 缓存命中，直接返回实例：模型={target_model}，JSON模式={json_mode}")
        return _llm_client_cache[cache_key]

    # 3. 核心配置校验：拦截缺失的API关键配置，提前抛出明确异常
    if not lm_config.api_key:
        raise ValueError("[LLM客户端] 配置缺失：请在.env中配置OPENAI_API_KEY（大模型API密钥）")
    if not lm_config.base_url:
        raise ValueError("[LLM客户端] 配置缺失：请在.env中配置OPENAI_API_BASE（API接口基础地址）")
    logger.info(f"[LLM客户端] 开始初始化新实例：模型={target_model}，JSON模式={json_mode}")

    # 4. 配置参数组装：区分「国产模型私有参数」和「OpenAI通用参数」
    # extra_body：千问/即梦等国产模型专属私有参数（LangChain透传至API）
    extra_body = {"enable_thinking": False}  # 千问专属：关闭思考链输出，减少冗余内容
    # model_kwargs：OpenAI通用参数，所有兼容API均支持
    model_kwargs = {}
    if json_mode:
        # 开启JSON标准输出模式，强制模型返回可解析的json_object
        model_kwargs["response_format"] = {"type": "json_object"}
        logger.debug(f"[LLM客户端] 已开启JSON输出模式，模型将返回标准JSON结构")

    # 5. 客户端初始化：捕获LangChain封装层异常，抛出更友好的提示
    try:
        llm_client = ChatOpenAI(
            model=target_model,  # 目标模型名
            temperature=lm_config.llm_temperature or 0.1,  # 低温度保证输出确定性（0~1）
            api_key=lm_config.api_key,  # API密钥
            base_url=lm_config.base_url,  # API基础地址（适配国产模型代理地址）
            extra_body=extra_body,  # 国产模型私有参数透传
            model_kwargs=model_kwargs,  # OpenAI通用参数
        )
    except LangChainException as e:
        raise Exception(f"[LLM客户端] 模型【{target_model}】初始化失败（LangChain层）：{str(e)}") from e

    # 6. 新实例存入全局缓存，供后续调用复用
    _llm_client_cache[cache_key] = llm_client
    logger.info(f"[LLM客户端] 实例初始化成功并缓存：模型={target_model}，JSON模式={json_mode}")

    return llm_client


# 测试示例：验证客户端创建、缓存机制及日志输出
if __name__ == "__main__":
    logger.info("===== 开始执行LLM客户端工具测试 =====")
    try:
        # 测试1：默认配置（默认模型+普通模式）
        client1 = get_llm_client()
        logger.info("✅ 测试1通过：默认配置客户端创建成功")

        # 测试2：指定多模态模型（qwen-vl-plus）+ 普通模式
        client2 = get_llm_client(model="qwen-vl-plus")
        logger.info("✅ 测试2通过：指定多模态模型客户端创建成功")

        # 测试3：同一模型+模式，验证缓存命中
        client3 = get_llm_client(model="qwen-vl-plus")
        logger.info(f"✅ 测试3通过：缓存机制验证成功，client2与client3为同一实例：{client2 is client3}")

        # 测试4：开启JSON输出模式
        client4 = get_llm_client(model="qwen3-32b", json_mode=True)
        logger.info("✅ 测试4通过：JSON输出模式客户端创建成功")

    except Exception as e:
        logger.error(f"❌ LLM客户端工具测试失败：{str(e)}", exc_info=True)
    finally:
        logger.info("===== LLM客户端工具测试结束 =====")
```

#### 工具类支持: MinIO 客户端

封装 MinIO 客户端的初始化过程，支持从环境变量读取配置。
特别之处在于，初始化时会自动检查并创建默认的 Bucket（如果不存在），减少手动运维成本。
采用模块级变量 `minio_client` 作为单例，避免重复建立连接。

**步骤1：使用Docker启动Minio**

```cmd
docker run -d --name minio \
    -p 9000:9000 -p 9001:9001 \
    -e "MINIO_ROOT_USER=minioadmin" \
    -e "MINIO_ROOT_PASSWORD=minioadmin" \
    -v $(pwd)/volumes/minio/data:/data \
    quay.io/minio/minio server /data --console-address ":9001"
    
docker stop minio
docker start minio
# 实时查看日志（按 Ctrl+C 退出）
docker logs -f minio
```

MinIO 在 **2025 年 5 月之后的社区版** 中，**完全移除了 Web 控制台（9001 端口）的权限管理入口**（包括 Identity、Policies 等菜单），仅保留「文件 / 桶的基础浏览上传功能」，这是官方对社区版的功能精简（商业版仍保留完整控制台权限功能）。

**步骤2：编写minio使用工具类**

Java代码回忆：

```java
public class App {
    public static void main(String[] args) throws IOException, NoSuchAlgorithmException, InvalidKeyException {

        try {
            //构造MinIO Client （登录）
            MinioClient minioClient = MinioClient.builder()
                    .endpoint("http://192.168.10.101:9000")
                    .credentials("minioadmin", "minioadmin")
                    .build();
            
            //创建hello-minio桶
            boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket("hello-minio").build());
            if (!found) {
                //创建hello-minio桶
                minioClient.makeBucket(MakeBucketArgs.builder().bucket("hello-minio").build());
                //设置hello-minio桶的访问权限
                String policy = """
                        {
                          "Statement" : [ {
                            "Action" : "s3:GetObject",
                            "Effect" : "Allow",
                            "Principal" : "*",
                            "Resource" : "arn:aws:s3:::hello-minio/*"
                          } ],
                          "Version" : "2012-10-17"
                        }""";
                minioClient.setBucketPolicy(SetBucketPolicyArgs.builder().bucket("hello-minio").config(policy).build());
            } else {
                System.out.println("Bucket 'hello-minio' already exists.");
            }

            //上传图片
            minioClient.uploadObject(
                    UploadObjectArgs.builder()
                            .bucket("hello-minio")
                            .object("公寓-外观.jpg")
                            .filename("D:\\workspace\\hello-minio\\src\\main\\resources\\公寓-外观.jpg")
                            .build());
            System.out.println("上传成功");
        } catch (MinioException e) {
            System.out.println("Error occurred: " + e);
        }
    }
}
```

添加minio全局配置 .env文件

```ini
#minio客户端
MINIO_ENDPOINT=http://47.94.86.115:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=knowledge-base-files
MINIO_IMG_DIR=/upload-images
```

定义配置类，读取配置文件

位置：`app/config/minio_config.py`

```python
# 导入核心依赖：数据类、环境变量读取、路径处理
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# 提前加载.env配置文件（确保os.getenv能获取到MinIO相关配置）
load_dotenv()


# 定义MinIO对象存储服务配置（与LLMConfig风格一致，字段对应.env配置项）
@dataclass
class MinIOConfig:
    endpoint: str    # MinIO服务地址（含http/https和端口）
    access_key: str  # MinIO访问密钥（对应MINIO_ACCESS_KEY）
    secret_key: str  # MinIO秘钥（对应MINIO_SECRET_KEY）
    bucket_name: str # MinIO默认存储桶名（知识库文件专用）
    minio_img_dir: str #Minio存储图片的文件夹


# 实例化MinIO配置对象，自动从.env读取配置并绑定
minio_config = MinIOConfig(
    endpoint=os.getenv("MINIO_ENDPOINT"),
    access_key=os.getenv("MINIO_ACCESS_KEY"),
    secret_key=os.getenv("MINIO_SECRET_KEY"),
    bucket_name=os.getenv("MINIO_BUCKET_NAME"),
    minio_img_dir=os.getenv("MINIO_IMG_DIR")
)
```

**工具类文件**: `app/clients/minio_utils.py`

```python
# 导入Python内置模块
import os
import json
# 导入MinIO官方Python SDK核心类
from minio import Minio
# 项目内部配置与日志
from app.conf.minio_config import minio_config
from app.core.logger import logger

# 全局MinIO客户端对象，初始化后供全项目调用
minio_client = None

try:
    # 初始化MinIO客户端实例
    minio_client = Minio(
        endpoint=minio_config.endpoint,
        access_key=minio_config.access_key,
        secret_key=minio_config.secret_key,
        secure=False  # 内网/本地部署用HTTP，公网部署需改为True并配置SSL
    )
    bucket_name = minio_config.bucket_name

    # 检查存储桶是否存在，不存在则自动创建
    if not minio_client.bucket_exists(bucket_name):
        logger.info(f"MinIO存储桶[{bucket_name}]不存在，开始创建")
        minio_client.make_bucket(bucket_name)
        logger.info(f"MinIO存储桶[{bucket_name}]创建成功")
    else:
        logger.info(f"MinIO存储桶[{bucket_name}]已存在，无需重复创建")

    # 配置存储桶公网只读策略：允许匿名用户通过URL直接访问桶内文件
    bucket_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},  # *表示所有匿名用户（S3兼容标识）
            "Action": ["s3:GetObject"],   # 仅授权文件获取/访问操作
            "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
        }]
    }
    minio_client.set_bucket_policy(bucket_name, json.dumps(bucket_policy))
    logger.info(f"MinIO存储桶[{bucket_name}]已配置公网只读策略，支持匿名URL访问")

except Exception as e:
    # 捕获初始化异常，记录错误日志并置空客户端
    logger.error(f"MinIO客户端初始化失败，错误信息：{str(e)}", exc_info=True)
    minio_client = None


def get_minio_client():
    """
    获取全局初始化的MinIO客户端实例
    :return: 已初始化的Minio对象 / None（初始化失败时）
    """
    return minio_client
```

#### 1. 导入与配置

首先引入必要的库，并加载环境变量配置。

```python
import os
import re
import sys
import base64
from pathlib import Path
from typing import Dict, List, Tuple
from collections import deque

# MinIO相关依赖
from minio import Minio
from minio.deleteobjects import DeleteObject

# 【核心改造1：移除原生OpenAI，导入LangChain工具类和多模态消息模块】
from app.clients.minio_utils import get_minio_client
from app.import_process.agent.state import ImportGraphState
from app.utils.task_utils import add_running_task
# LLM客户端工具类（核心复用，替换原生OpenAI调用）
from app.lm.lm_utils import get_llm_client
# LangChain多模态依赖（消息构造+异常捕获）
from langchain.messages import HumanMessage
from langchain_core.exceptions import LangChainException
# 项目配置
from app.conf.minio_config import minio_config
from app.conf.lm_config import lm_config
# 项目日志工具（统一使用）
from app.core.logger import logger
# api访问限速工具
from app.utils.rate_limit_utils import apply_api_rate_limit
# 提示词加载工具
from app.core.load_prompt import load_prompt

# MinIO支持的图片格式集合（小写后缀，统一匹配标准）
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}

def is_supported_image(filename: str) -> bool:
    """
    判断文件是否为MinIO支持的图片格式（后缀不区分大小写）
    :param filename: 文件名（含后缀）
    :return: 支持返回True，否则False
    """
    return os.path.splitext(filename)[1].lower() in IMAGE_EXTENSIONS
```

#### 2. 主流程定义

`node_md_img` 是本节点的入口函数，它定义了整个图片处理的流水线。我们先定义好步骤，具体的实现细节在后续部分展开。

```python
def node_md_img(state: ImportGraphState) -> ImportGraphState:
    """
    MD文件图片处理核心节点 - 五步法完成图片全流程处理
    核心流程：
    1. 初始化获取MD内容、文件路径、图片文件夹路径
    2. 扫描图片文件夹，筛选MD中实际引用的支持格式图片
    3. 调用多模态大模型为图片生成内容摘要
    4. 将图片上传至MinIO，替换MD中本地图片路径为MinIO访问URL，并填充图片摘要
    5. 备份原MD文件，保存处理后的新MD文件并更新状态
    :param state: 导入流程全局状态对象，包含task_id、md_path、md_content等核心参数
    :return: 更新后的全局状态对象（md_content/md_path为处理后新值）
    """
    # 记录当前运行任务，用于任务监控和状态追踪
    add_running_task(state["task_id"], sys._getframe().f_code.co_name)

    # 步骤1：初始化数据，获取MD核心信息
    md_content, path_obj, images_dir = step_1_get_content(state)
    state["md_content"] = md_content

    # 无图片文件夹，直接跳过所有图片处理逻辑
    if not images_dir.exists():
        logger.info(f"图片文件夹不存在，跳过图片处理：{images_dir.absolute()}")
        return state

    # 初始化MinIO客户端，失败则终止流程
    minio_client = get_minio_client()
    if not minio_client:
        logger.warning("MinIO客户端初始化失败，已跳过图片处理全流程")
        return state

    # 步骤2：扫描并筛选MD中引用的支持格式图片
    # (image_file, img_path, context_list[0])
    targets = step_2_scan_images(md_content, images_dir)
    if not targets:
        logger.info("未检测到MD中引用的支持格式图片，跳过后续处理")
        return state

    # 步骤3：调用多模态大模型生成图片摘要（修复原代码传参错误：使用文件主名而非MD内容）
    summaries = step_3_generate_summaries(path_obj.stem, targets)

    # 步骤4：上传图片至MinIO，替换MD图片路径并填充摘要
    new_md_content = step_4_upload_and_replace(minio_client, path_obj.stem, targets, summaries, md_content)
    state["md_content"] = new_md_content

    # 步骤5：备份并保存新MD文件，更新状态中的文件路径
    new_md_file_name = step_5_backup_new_md_file(state['md_path'], new_md_content)
    state["md_path"] = new_md_file_name
    logger.info(f"MD图片处理完成，新文件已保存：{new_md_file_name}")

    return state
```

#### 3. 步骤 1: 获取内容与路径

这一步负责从 `state` 中获取文件路径，读取文件内容，并确定图片存放的目录。

```python
# 步骤1：初始化MD核心数据，获取内容、文件路径、图片文件夹路径
def step_1_get_content(state: ImportGraphState) -> Tuple[str, Path, Path]:
    """
    从全局状态中提取并初始化MD处理所需核心数据
    :param state: 导入流程全局状态对象
    :return: 三元组(MD文件内容, MD文件路径对象, 图片文件夹路径对象)
    :raise FileNotFoundError: 当状态中无有效MD文件路径时抛出
    """
    md_file_path = state["md_path"]
    # 校验MD文件路径有效性
    if not md_file_path:
        raise FileNotFoundError(f"全局状态中无有效MD文件路径：{state['md_path']}")

    path_obj = Path(md_file_path)
    # 优先使用状态中已存在的MD内容，无则从文件读取
    if not state["md_content"]:
        with open(path_obj, "r", encoding="utf-8") as f:
            md_content = f.read()
        logger.debug(f"从文件读取MD内容完成，文件大小：{len(md_content)} 字符")
    else:
        md_content = state["md_content"]
        logger.debug(f"从全局状态获取MD内容完成，内容大小：{len(md_content)} 字符")

    # 图片文件夹固定为MD文件同级的images目录
    images_dir = path_obj.parent / "images"
    return md_content, path_obj, images_dir
```

#### 4. 步骤 2: 图片扫描

这一步扫描 Markdown 文件中引用的本地图片，并检查文件是否存在。同时提取图片的上下文（前后文），用于后续生成摘要。

```python
def is_supported_image(filename: str) -> bool:
    """
    判断文件是否为MinIO支持的图片格式（后缀不区分大小写）
    :param filename: 文件名（含后缀）
    :return: 支持返回True，否则False
    """
    return os.path.splitext(filename)[1].lower() in IMAGE_EXTENSIONS


def find_image_in_md(md_content: str, image_filename: str, context_len: int = 100) -> List[Tuple[str, str]]:
    """
    查找MD内容中指定图片的所有引用位置，并返回每个位置的上下文文本
    :param md_content: MD文件完整内容
    :param image_filename: 图片文件名（含后缀）
    :param context_len: 上下文截取长度，默认前后各100字符
    :return: 上下文列表，每个元素为(上文, 下文)元组，无匹配则返回空列表
    """
    # 转义图片文件名特殊字符，避免正则语法错误；编译正则提升匹配效率
    # r 全称是 raw string（原始字符串），作用是：告诉 Python 解释器：不要处理字符串里的转义字符（如 \、\n、\t 等），按字面意思解析。
    pattern = re.compile(r"!\[.*?\]\(.*?" + re.escape(image_filename) + r".*?\)")
    results = []

    # 迭代查找所有MD图片标签匹配项
    for m in pattern.finditer(md_content):
        start, end = m.span()
        # 截取匹配位置的上文和下文（防止索引越界）
        pre_text = md_content[max(0, start - context_len):start]
        post_text = md_content[end:min(len(md_content), end + context_len)]
        # 打印图片上下文，便于调试
        logger.debug(f"图片[{image_filename}]匹配到引用，上文：{pre_text.strip()}")
        logger.debug(f"图片[{image_filename}]匹配到引用，下文：{post_text.strip()}")
        results.append((pre_text, post_text))

    if not results:
        logger.debug(f"MD内容中未找到图片[{image_filename}]的引用")
    return results


# 步骤2：扫描图片文件夹，筛选MD中实际引用的支持格式图片
def step_2_scan_images(md_content: str, images_dir: Path) -> List[Tuple[str, str, Tuple[str, str]]]:
    """
    扫描图片文件夹，过滤出「支持格式+MD中实际引用」的图片，组装处理元数据
    :param md_content: MD文件完整内容
    :param images_dir: 图片文件夹路径对象
    :return: 待处理图片列表，每个元素为(图片文件名, 图片完整路径, 图片上下文)元组
    """
    targets = []
    # 遍历图片文件夹所有文件
    for image_file in os.listdir(images_dir):
        # 过滤非支持格式的图片
        if not is_supported_image(image_file):
            logger.debug(f"图片格式不支持，跳过：{image_file}")
            continue

        # 组装图片完整路径
        img_path = str(images_dir / image_file)
        # 查找图片在MD中的引用上下文
        context_list = find_image_in_md(md_content, image_file)

        # 过滤MD中未引用的图片
        if not context_list:
            logger.warning(f"图片未在MD中引用，跳过处理：{image_file}")
            continue

        # 组装待处理图片元数据，取第一个匹配的上下文
        targets.append((image_file, img_path, context_list[0]))
        logger.info(f"图片加入待处理列表：{image_file}")

    logger.info(f"图片扫描完成，共筛选出待处理图片：{len(targets)} 张")
    return targets
```

为避免与其他`re`方法混淆，整理关键方法差异，现在场景用`finditer`是最优选择：

|    方法    |            核心作用            |         返回值         |                适用场景                 |
| :--------: | :----------------------------: | :--------------------: | :-------------------------------------: |
| `compile`  |      预编译正则，提升效率      |      Pattern 对象      |       多次调用同一正则时（推荐）        |
| `finditer` |    迭代查找所有非重叠匹配项    |      Match 迭代器      | 大文本 / 需获取所有匹配结果（你的场景） |
| `findall`  | 查找所有匹配项，返回字符串列表 |   列表（[str, ...]）   |        简单场景，仅需匹配字符串         |
|  `search`  |        查找第一个匹配项        | 单个 Match 对象 / None |           仅需第一个匹配结果            |

明确 2 个基础概念

1. **.\* 贪婪匹配**：`.*` 表示**匹配任意字符（.）任意次数（\*，0 次或多次）**，**贪婪特性会让它尽可能多的匹配字符**，直到字符串末尾，再回头验证是否符合正则整体规则；
2. **.\*? 非贪婪匹配**：在`*`后加`?`就变成了非贪婪模式，**会让它尽可能少的匹配字符**，只要满足正则整体规则，就立刻停止匹配，不会继续向后延伸。

匹配 Markdown 图片语法：`!\[.*?\]\(.*?图片名.*?\)`，对应的 Markdown 图片格式是 `![图片描述](图片路径)`，比如一段包含**多张图片**的 Markdown 内容：

```
这是第一张图![风景](a.jpg)，这是第二张图![人物](b.jpg)，这是第三张图![动物](c.jpg)
```

用贪婪匹配 `.*`（会出现**匹配过度**，完全不符合需求），如果把你的正则写成贪婪模式（去掉`?`）：`!\[.*\]\(.*a.jpg.*\)`，匹配结果会是：

```
![风景](a.jpg)，这是第二张图![人物](b.jpg)，这是第三张图![动物](c.jpg)
```

贪婪的`.*`会「贪心」的尽可能多匹配：

- 第一个`.*`匹配从`[`开始，一直到**最后一个]**（而不是第一个`]`）；
- 第二个 .* 匹配从(开始，一直到最后一个`)`；

最终把从第一张图开始到最后一张图结束的所有内容都匹配成了「一个结果」，这就是匹配过度，完全无法精准获取单个图片标签。

假设有字符串：`ab123ab456ab`，正则匹配`a.*b`（贪婪）和`a.*?b`（非贪婪）：

- 贪婪`a.*b`：匹配结果是`ab123ab456ab`（从第一个 a 到最后一个 b，尽可能多匹配）；
- 非贪婪`a.*?b`：匹配结果是`ab`（从第一个 a 到**第一个**b，尽可能少匹配）。

#### 5. 步骤 3: 图片摘要

提取提示词，建议将所有的提示词提取放在外部，统一管理。我们存储的文件是根路径下 prompts文件夹

文件：`prompts/image_summary.prompt`

```
这是“{root_folder}”文件中的一张图片，图片上文部分为“{image_content[0]}”，
下文部分为“{image_content[1]}”，请用中文简要总结这张图片的内容，用于 Markdown 图片标题，控制在50字以内。
```

加载提示词和格式化工具类

文件：`app/core/load_prompt.py`

```python
from pathlib import Path
from app.utils.path_util import PROJECT_ROOT
from app.core.logger import logger  # 可选，加日志更友好

def load_prompt(name: str, **kwargs) -> str:
    """
    加载提示词并渲染变量占位符
    :param name: 提示词文件名（不带.prompt后缀，如image_summary）
    :param **kwargs: 需渲染的变量键值对（如root_folder="测试文件", image_content=("上文内容", "下文内容")）
    :return: 渲染后的最终提示词字符串
    """
    # 1. 拼接提示词路径（你的原有逻辑，完全保留）
    prompt_path = PROJECT_ROOT / 'prompts' / f'{name}.prompt'

    # 2. 校验文件是否存在（可选，避免文件不存在直接报错）
    if not prompt_path.exists():
        raise FileNotFoundError(f"提示词文件不存在：{prompt_path.absolute()}")

    # 3. 读取纯文本提示词（你的原有逻辑）
    raw_prompt = prompt_path.read_text(encoding='utf-8')

    # 4. 核心：如果传了参数，渲染占位符；没传参，直接返回原文本
    if kwargs:
        rendered_prompt = raw_prompt.format(**kwargs)
        logger.debug(f"提示词渲染成功，替换变量：{list(kwargs.keys())}")
        return rendered_prompt
    return raw_prompt



if __name__ == '__main__':
    # 测试：传入参数渲染占位符（和业务代码中实际使用方式一致）
    root_folder = "hl3070使用说明书"  # 要替换的文件名称
    image_content = ("这是图片的上文内容", "这是图片的下文内容")  # 要替换的上下文
    # 调用时传入所有需要渲染的变量（键名必须和.prompt中的占位符完全一致）
    final_prompt = load_prompt(
        name='image_summary',
        root_folder=root_folder,  # 对应{root_folder}
        image_content=image_content  # 对应{image_content[0]}、{image_content[1]}
    )
    print("✅ 渲染后的最终提示词：")
    print(final_prompt)
```

这一步调用多模态大模型（如 GPT-4o 或 Qwen-VL）来生成图片的中文摘要，作为 Markdown 图片的 Alt Text。为了避免触发 API 速率限制，我们实现了简单的令牌桶算法。

```python
def encode_image_to_base64(image_path: str) -> str:
    """
    将本地图片文件编码为Base64字符串（用于多模态大模型输入）
    :param image_path: 图片本地完整路径
    :return: 图片的Base64编码字符串（UTF-8解码）
    """
    with open(image_path, "rb") as img_file:
        base64_str = base64.b64encode(img_file.read()).decode("utf-8")
    logger.debug(f"图片Base64编码完成，文件：{image_path}，编码后长度：{len(base64_str)}")
    return base64_str


def summarize_image(image_path: str, root_folder: str, image_content: Tuple[str, str]) -> str:
    """
    调用多模态大模型生成图片内容摘要（适配LangChain工具类，复用项目统一LLM客户端）
    生成的摘要用于Markdown图片标题，严格控制50字以内中文描述
    :param image_path: 图片本地完整路径
    :param root_folder: 文档所属文件夹/主名，为大模型提供上下文
    :param image_content: 图片在MD中的上下文元组，格式(上文文本, 下文文本)
    :return: 图片内容摘要（异常时返回默认值"图片描述"）
    """
    # 将图片编码为Base64，适配多模态大模型输入要求
    base64_image = encode_image_to_base64(image_path)
    try:
        # 1. 获取项目统一LLM客户端（自动缓存，传入多模态模型名）
        lvm_client = get_llm_client(model=lm_config.lv_model)

        # 加载并渲染提示词（核心：传入所有占位符对应的变量）
        prompt_text = load_prompt(
            name="image_summary",  # 提示词文件名（不带.prompt）
            root_folder=root_folder,  # 对应{root_folder}
            image_content=image_content  # 对应{image_content[0]}、{image_content[1]}
        )

        # 2. 构造LangChain标准多模态HumanMessage（兼容千问/OpenAI等视觉模型）
        messages = [
            HumanMessage(
                content=[
                    # 文本提示词：携带上下文，限定摘要规则
                    {
                        "type": "text",
                        "text": prompt_text
                    },
                    # 多模态核心：Base64编码图片数据
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            )
        ]

        # 3. LangChain标准调用：invoke方法（工具类已封装超时/重试等参数）
        response = lvm_client.invoke(messages)

        # 4. 解析响应（LangChain统一返回content字段，统一格式无需多层解析）
        summary = response.content.strip().replace("\n", "")
        logger.info(f"图片摘要生成成功：{image_path}，摘要：{summary}")
        return summary

    except LangChainException as e:
        logger.error(f"图片摘要生成失败（LangChain框架异常）：{image_path}，错误信息：{str(e)}")
        return "图片描述"
    except Exception as e:
        logger.error(f"图片摘要生成失败（系统异常）：{image_path}，错误信息：{str(e)}")
        return "图片描述"


def step_3_generate_summaries(doc_stem: str, targets: List[Tuple[str, str, Tuple[str, str]]],
                              requests_per_minute: int = 9) -> Dict[str, str]:
    """
    步骤3：批量为待处理图片生成内容摘要，带API速率限制防止触发大模型限流
    :param doc_stem: 文档文件名（不含后缀），作为大模型prompt上下文
    :param targets: 待处理图片列表，元素为(图片文件名, 图片完整路径, 图片上下文)
    :param requests_per_minute: 每分钟最大API请求数，默认9次（按大模型限制调整）
    :return: 图片摘要字典，键：图片文件名，值：图片内容摘要
    """
    summaries = {}
    request_times = deque()  # 外部初始化请求时间队列，跨循环复用

    for img_file, image_path, context in targets:
        # 直接调用抽离的公共工具方法，参数和原逻辑完全一致
        apply_api_rate_limit(request_times, requests_per_minute, window_seconds=60)
        logger.debug(f"开始生成图片摘要：{image_path}")
        summaries[img_file] = summarize_image(image_path, root_folder=doc_stem, image_content=context)

    logger.info(f"图片摘要批量生成完成，共处理{len(summaries)}张图片")
    return summaries
```

#### 6. 步骤 4: 上传与替换

这一步将图片上传到 MinIO 对象存储，并将 Markdown 中的本地图片路径替换为 MinIO 的 URL，同时填入生成的摘要。

![img](../images/1770264878727.png)

```python
def step_4_upload_and_replace(minio_client: Minio, doc_stem: str, targets: List[Tuple[str, str, Tuple[str, str]]],
                              summaries: Dict[str, str], md_content: str) -> str:
    """
    步骤4：核心流程-图片上传MinIO + 合并摘要&URL + 替换MD图片引用
    完整流程：清理MinIO旧目录 → 批量上传新图片 → 合并摘要和URL → 替换MD内容
    :param minio_client: 初始化完成的MinIO客户端对象
    :param doc_stem: 文档文件名（不含后缀），作为MinIO上传子目录名（按文档隔离）
    :param targets: 待处理图片列表，元素为(图片文件名, 图片完整路径, 图片上下文)
    :param summaries: 图片摘要字典，键：图片文件名，值：内容摘要
    :param md_content: 原始MD文件内容
    :return: 图片引用替换后的新MD内容
    """
    # 构造MinIO上传目录：配置根目录 + 文档主名（去除空格，避免路径问题）
    minio_img_dir = minio_config.minio_img_dir
    upload_dir = f"{minio_img_dir}/{doc_stem}".replace(" ", "")

    # 步骤1：清理该文档对应的MinIO旧目录，保证幂等性
    clean_minio_directory(minio_client, upload_dir)
    # 步骤2：批量上传图片至MinIO，获取URL映射
    urls = upload_images_batch(minio_client, upload_dir, targets)
    # 步骤3：合并图片摘要和URL，过滤上传失败的图片
    image_info = merge_summary_and_url(summaries, urls)
    # 步骤4：替换MD内容中的本地图片引用为MinIO远程引用
    if image_info:
        md_content = process_md_file(md_content, image_info)

    return md_content

def clean_minio_directory(minio_client: Minio, prefix: str) -> None:
    """
    幂等性清理MinIO指定目录下的所有旧文件，防止重名文件内容混淆和垃圾文件堆积
    幂等性：多次调用结果一致，无文件时不报错
    :param minio_client: 初始化完成的MinIO客户端对象
    :param prefix: MinIO目录前缀（要清理的目录路径）
    """
    try:
        # 列出指定前缀下的所有对象（递归遍历子目录）
        objects_to_delete = minio_client.list_objects(
            bucket_name=minio_config.bucket_name,
            prefix=prefix,
            recursive=True
        )
        # 构造删除对象列表
        delete_list = [DeleteObject(obj.object_name) for obj in objects_to_delete]

        if delete_list:
            logger.info(f"开始清理MinIO旧文件，待删除文件数：{len(delete_list)}，目录：{prefix}")
            # 批量删除对象
            errors = minio_client.remove_objects(minio_config.bucket_name, delete_list)
            # 遍历删除错误信息，记录异常
            for error in errors:
                logger.error(f"MinIO文件删除失败：{error}")
        else:
            logger.debug(f"MinIO目录无旧文件，无需清理：{prefix}")
    except Exception as e:
        logger.error(f"MinIO目录清理失败：{prefix}，错误信息：{str(e)}")


def upload_images_batch(minio_client: Minio, upload_dir: str, targets: List[Tuple[str, str, Tuple[str, str]]]) -> Dict[
    str, str]:
    """
    批量上传待处理图片至MinIO，返回图片文件名与访问URL的映射关系
    :param minio_client: 初始化完成的MinIO客户端对象
    :param upload_dir: MinIO上传根目录
    :param targets: 待处理图片列表，元素为(图片文件名, 图片完整路径, 图片上下文)
    :return: 图片URL字典，键：图片文件名，值：MinIO访问URL
    """
    urls = {}
    for img_file, img_path, _ in targets:
        # 构造MinIO对象名称
        object_name =  f"{upload_dir}/{img_file}"
        logger.debug(f"构造MinIO对象名称完成：{object_name}")
        # 上传单张图片并获取URL
        """
        := 是 Python 3.8+ 引入的海象运算符（Walrus Operator），核心作用是 **「表达式内赋值 + 结果判断」一体化 **：
        在执行判断、循环等逻辑的同一个表达式中，完成变量赋值和赋值结果的使用 / 判断，替代传统「先赋值、后判断」的两行代码，让逻辑更简洁。
        """
        if img_url := upload_to_minio(minio_client, img_path, object_name):
            urls[img_file] = img_url
    logger.info(f"图片批量上传完成，成功上传{len(urls)}/{len(targets)}张图片")
    return urls

def upload_to_minio(minio_client: Minio, local_path: str, object_name: str) -> str | None:
    """
    将单张本地图片上传至MinIO对象存储，并返回公网可访问URL
    :param minio_client: 初始化完成的MinIO客户端对象
    :param local_path: 图片本地完整路径
    :param object_name: MinIO中要存储的对象名称（带目录）
    :return: 图片MinIO访问URL（上传失败返回None）
    """
    try:
        logger.info(f"开始上传图片至MinIO：本地路径={local_path}，MinIO对象名={object_name}")
        # 上传本地文件至MinIO（fput_object：文件流上传，适合大文件）
        minio_client.fput_object(
            bucket_name=minio_config.bucket_name,  # MinIO存储桶名（从配置读取）
            object_name=object_name,  # MinIO对象名称
            file_path=local_path,  # 本地文件路径
            # 自动推断图片Content-Type（如image/png、image/jpeg）
            # 入参：文件路径字符串（可带目录，如/a/b/test.jpg、demo.tar.gz）；
            # 返回值：元组(root, ext)，其中：
            # root：文件主名（含目录，去掉最后一个后缀的完整部分）；
            # ext：文件后缀（以.开头，仅包含最后一个扩展名，如.jpg、.gz，无后缀则为空字符串""）；
            # 关键规则：仅识别 ** 最后一个.** 作为后缀分隔符，多后缀文件仅拆分最后一个（如test.tar.gz拆分为("test.tar", ".gz")）。
            content_type=f"image/{os.path.splitext(local_path)[1][1:]}"
        )

        # 处理路径特殊字符，避免URL解析错误
        object_name = object_name.replace("\\", "%5C")
        # 根据配置选择HTTP/HTTPS协议
        protocol = "https" if minio_config.minio_secure else "http"
        # 构造MinIO基础访问URL
        base_url = f"{protocol}://{minio_config.endpoint}/{minio_config.bucket_name}"
        # 拼接完整图片访问URL base_url 后面带 / 中间直接两个字符串拼接即可
        img_url = f"{base_url}{object_name}"
        logger.info(f"图片上传成功，访问URL：{img_url}")
        return img_url
    except Exception as e:
        logger.error(f"图片上传MinIO失败：{local_path}，错误信息：{str(e)}")
        return None
    
def merge_summary_and_url(summaries: Dict[str, str], urls: Dict[str, str]) -> Dict[str, Tuple[str, str]]:
    """
    合并图片摘要字典和URL字典，过滤掉上传失败无URL的图片
    :param summaries: 图片摘要字典，键：图片文件名，值：内容摘要
    :param urls: 图片URL字典，键：图片文件名，值：MinIO访问URL
    :return: 合并后的图片信息字典，键：图片文件名，值：(摘要, URL)元组
    """
    image_info = {}
    # 遍历摘要字典，仅保留有对应URL的图片
    for image_file, summary in summaries.items():
        if url := urls.get(image_file):
            image_info[image_file] = (summary, url)
    logger.info(f"图片摘要与URL合并完成，有效图片信息{len(image_info)}条")
    return image_info

def process_md_file(md_content: str, image_info: Dict[str, Tuple[str, str]]) -> str:
    """
    核心功能：替换MD内容中的本地图片引用为MinIO远程引用
    替换规则：![原描述](本地路径) → ![图片摘要](MinIO访问URL)
    :param md_content: 原始MD文件内容
    :param image_info: 合并后的图片信息字典，键：图片文件名，值：(摘要, URL)
    :return: 替换后的新MD内容
    """
    for img_filename, (summary, new_url) in image_info.items():
        # 正则匹配MD图片标签，忽略大小写，兼容不同路径写法
        # 正则规则：![任意描述](任意路径+图片文件名+任意后缀)
        pattern = re.compile(
            r"!\[.*?\]\(.*?" + re.escape(img_filename) + r".*?\)",
            re.IGNORECASE
        )
        # 替换匹配内容：使用新摘要作为图片描述，新URL作为图片路径
        # - 如果你的 summary 和 new_url 是完全可控的纯文本（不含反斜杠） ：这两种写法确实 一模一样 。
        # - 如果你想写出“防御性代码”（Defensive Code），防止未来某天被特殊字符坑 ：请坚持使用 Lambda 写法 。它是最稳健、最安全的做法。
        # md_content = pattern.sub(lambda m: f"![{summary}]({new_url})", md_content)
        md_content = pattern.sub( f"![{summary}]({new_url})", md_content)
        logger.debug(f"完成MD图片引用替换：{img_filename} → {new_url}")

    logger.info(f"MD文件图片引用替换完成，共替换{len(image_info)}处图片引用")
    logger.debug(f"替换后MD内容：{md_content[:500]}..." if len(md_content) > 500 else f"替换后MD内容：{md_content}")
    return md_content
```

#### 7. 步骤 5: 备份文件

最后，我们将处理后的 Markdown 内容保存为一个新的文件，通常命名为 `*_new.md`。

```python
def step_5_backup_new_md_file(origin_md_path: str, md_content: str) -> str:
    """
    步骤5：将处理后的MD内容保存为新文件（原文件不变，避免数据丢失）
    新文件命名规则：原文件名 + _new.md（如test.md → test_new.md）
    :param origin_md_path: 原始MD文件完整路径
    :param md_content: 处理后的新MD内容
    :return: 新MD文件的完整路径
    """
    # 构造新文件路径：替换原后缀为 _new.md
    new_md_file_name = os.path.splitext(origin_md_path)[0] + "_new.md"

    # 写入新MD内容（覆盖写入，若文件已存在则更新）
    with open(new_md_file_name, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.info(f"处理后MD文件已保存，新文件路径：{new_md_file_name}")
    return new_md_file_name
```

#### 8. 单元测试 (Unit Test)

您可以在 `node_md_img.py` 文件底部直接运行以下测试代码：

```python
if __name__ == "__main__":
    """本地测试入口：单独运行该文件时，执行MD图片处理全流程测试"""
    from app.utils.path_util import PROJECT_ROOT
    logger.info(f"本地测试 - 项目根目录：{PROJECT_ROOT}")

    # 测试MD文件路径（需手动将测试文件放入对应目录）
    test_md_name = os.path.join(r"output\hl3040网络说明书", "hl3040网络说明书.md")
    test_md_path = os.path.join(PROJECT_ROOT, test_md_name)

    # 校验测试文件是否存在
    if not os.path.exists(test_md_path):
        logger.error(f"本地测试 - 测试文件不存在：{test_md_path}")
        logger.info("请检查文件路径，或手动将测试MD文件放入项目根目录的output目录下")
    else:
        # 构造测试状态对象，模拟流程入参
        test_state = {
            "md_path": test_md_path,
            "task_id": "test_task_123456",
            "md_content": ""
        }
        logger.info("开始本地测试 - MD图片处理全流程")
        # 执行核心处理流程
        result_state = node_md_img(test_state)
        logger.info(f"本地测试完成 - 处理结果状态：{result_state}")
```

