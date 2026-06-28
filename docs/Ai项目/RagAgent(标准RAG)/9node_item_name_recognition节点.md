---
title: 主体识别 (node_item_name_recognition)
date: 2026-06-16
abstract: 识别文档主题(item_name),并且进行向量化存入 Milvus 向量数据库
tags:
- Ai实战项目
---

## 5. 导入数据节点实现与测试

### 5.5 主体识别 (node_item_name_recognition)

**文件**: `app/import_process/agent/nodes/node_item_name_recognition.py`

#### 1. 节点作用与实现思路

**节点作用**: 提取文档的核心实体（如产品名称、特定概念），用于后续的精确过滤和去重。这是构建“实体-切片”关联的关键一步，支持基于实体的结构化查询。

**实现思路**:

1.  **上下文压缩**: 取文档的前 K 个切片（通常包含标题和摘要）构建 Prompt，利用 LLM 强大的理解能力提取核心实体名称。
2.  **错误鲁棒性**: 考虑到 LLM 输出的不确定性，增加了空结果处理和默认值兜底机制，确保流程不会因识别失败而中断。
3.  **向量化准备**: 识别出的实体名称也会被向量化，用于在 Milvus 中进行基于实体的语义对齐（如搜索“iPhone”能关联到“苹果手机”的切片）。

#### 2. 步骤分解

1.  **导入与配置**: 引入必要的库（LangChain, Milvus, etc.）及配置参数。
2.  **核心辅助函数**: 包含字符串安全转义等辅助逻辑。
3.  **主流程定义**: LangGraph 节点的入口函数，串联各个步骤。
4.  **步骤 1: 获取输入**: 校验 State 中的 `file_title` 和 `chunks`。
5.  **步骤 2: 构建上下文**: 截取前 K 个切片作为 LLM 的识别素材。
6.  **步骤 3: 调用 LLM**: 使用大模型识别商品名称，包含错误重试与兜底。
7.  **步骤 4: 回填数据**: 将识别结果更新回 State 和 Chunks 元数据。
8.  **步骤 5: 生成向量**: 调用 Embedding 模型生成 Dense/Sparse 向量。
9.  **步骤 6: 保存结果**: 将数据写入 Milvus 向量库，并处理幂等性。
10.  **单元测试**: 独立运行的测试代码，验证核心流程。

#### 3. 准备Embedding模型和工具

##### 3.1 什么是 “生成词向量”？

词向量（Word Vector/Embedding）就是把**文字（比如 “苏泊尔 5000W 大功率电磁炉”）转换成计算机能理解的数字列表（向量）** 的过程。

打个比方

- 人类理解文字：“苹果手机”= 品牌（苹果）+ 品类（手机）；
- 计算机理解文字：没法直接懂 “苹果手机”，但能懂 `[0.23, -0.56, 1.89, ...]` 这样的数字列表；
- 词向量的作用：把文字的**语义信息**（含义、特征、关联度）编码成数字，让计算机能 “计算文字相似度”“分类文字”“检索相似内容”。

举个简单例子

|    文字    | 对应的词向量（简化版，实际是几百 / 几千维） |
| :--------: | :-----------------------------------------: |
|  苹果手机  |          [0.23, -0.56, 1.89, 0.78]          |
|  华为手机  |          [0.21, -0.58, 1.91, 0.76]          |
| 苹果笔记本 |          [0.22, -0.55, 0.87, 0.79]          |

计算机通过对比这些数字列表的相似度，就能判断：

- “苹果手机” 和 “华为手机” 更像（数字差异小）；
- “苹果手机” 和 “苹果笔记本” 相似度低（数字差异大）。

##### 3.2  “稀疏向量 + 稠密向量”

代码是基于 `BGE-M3` 模型生成两种词向量（这是当前主流的多模态嵌入方案）拆解：

|           类型            |                             特点                             |                             用途                             |
| :-----------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: |
| 稠密向量（Dense Vector）  | 长度固定（比如 768 维 / 1024 维），每个位置都是连续数值（如 0.23、-0.56） | 捕捉文字的**语义信息**（比如 “苹果手机” 的核心含义），适合相似度计算 |
| 稀疏向量（Sparse Vector） | 长度极长（比如几十万维），但只有少数位置有非 0 值，其余都是 0 | 捕捉文字的**关键词 / 字面特征**（比如 “苹果”“5000W”“电磁炉”），适合精准检索 |

BGE-M3 模型同时输出这两种向量，结合使用能兼顾 “语义理解” 和 “精准匹配”。

##### 3.3 安装Python依赖库

在使用模型之前，需要安装相关的 Python 依赖库。

```cmd
# ===================== 环境安装命令（适配BGE-M3+Milvus，GPU/CPU版区分）=====================
# 【优先推荐-GPU版】安装CUDA 12.4版PyTorch（含torchvision/torchaudio，NVIDIA显卡GPU加速必备）
# 适配：有NVIDIA独显且驱动≥551.61，后续BGE-M3可开启FP16半精度推理
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# 【备用-CPU版】无NVIDIA显卡（AMD/Intel集显）请用此命令，直接安装CPU版PyTorch
# 注释掉上方GPU版命令，取消注释下方即可
uv add torch torchvision torchaudio

# 安装Milvus和BGE-M3核心依赖（所有环境必装，无GPU/CPU区分）
# pymilvus[model]：Milvus Python客户端（带模型相关依赖，适配向量入库/检索）
# FlagEmbedding：BGE-M3向量生成模型的核心依赖（不可替代）
# transformers：FlagEmbedding底层依赖，Hugging Face模型运行库
uv add  pymilvus[model] FlagEmbedding transformers

#⚠️：安装FlagEmbedding的时候会自动安装一个cpu版本的torch替换掉之前的gpu版本的torch，
# 要解决这个问题需要做以下几个步骤
# 步骤1 先删除已经安装的FlagEmbedding（先在pyproject.toml中确定一下自己安装的版本）
uv remove FlagEmbeddin

# 步骤2 将以下内容配置在pyproject.toml中
dependencies = [
     其他之前安装过的配置,
    "flagembedding>=v1.3.5",
    "torch>=2.10.0",
    "torchvision>=0.25.0",
    "torchaudio>=2.10.0",
]

[tool.uv.sources]
# 强制从 NVIDIA 源安装
torch = { index = "pytorch-cuda" }
torchvision = { index = "pytorch-cuda" }
torchaudio = { index = "pytorch-cuda" }

[[tool.uv.index]]
name = "pytorch-cuda"
url = "https://download.pytorch.org/whl/cu128"
explicit = true

# 步骤3 删除锁文件并重新锁定
rm uv.lock
uv lock

# 步骤4：重新同步环境
uv sync --reinstall

# 步骤5：验证
uv run python -c "import torch; print('GPU:', torch.cuda.is_available())"
```

CUDA 每个版本都有**最低算力要求**，CUDA 12.4 要求显卡的**CUDA 算力≥3.5**（几乎 2016 年之后的 NVIDIA 独显都满足，老款如 GTX 750 Ti 也达标），**主流显卡（RTX30/40 系、GTX16/20 系）全兼容**，几乎不用担心里程碑。

直接打开 NVIDIA 官方算力表，搜索自己的显卡型号，看对应的**Compute Capability（算力）** 数值：

[NVIDIA 显卡 CUDA 算力官方查询地址](https://developer.nvidia.com/cuda-gpus)

- 桌面显卡看**GeForce**栏，笔记本显卡看**GeForce Notebook**栏；
- 示例：RTX 3060 算力 8.6、GTX 1650 算力 7.5、RTX 4090 算力 8.9，都远大于 3.5，完美适配 CUDA 12.4。

##### 3.4 Embedding下载模型

如果访问 HuggingFace 较慢，可以使用阿里云(阿里巴巴通义实验室（原达摩院）)的 ModelScope 社区下载。

https://www.modelscope.cn/models/BAAI/bge-m3

**1.** **安装 modelscope 库**：

```python
uv add modelscope
```

**2.** **运行 Python 脚本下载**： 创建一个临时的 Python 脚本（例如 download_bge.py）并运行：

```python
from modelscope.hub.snapshot_download import snapshot_download

# 下载模型到当前目录下的 models/bge-m3 文件夹
model_dir = snapshot_download('BAAI/bge-m3', cache_dir='D:/ai_models/modelscope_cache/models')
print(f"模型已下载到: {model_dir}")
```

**3. .env配置**

```ini
#embedding配置
# BGE-M3模型本地缓存/部署路径（本地加载模型时使用，指向ModelScope下载的模型目录）
BGE_M3_PATH=D:\ai_models\modelscope_cache\models\BAAI\bge-m3
# BGE-M3模型官方标识（ModelScope/HuggingFace通用，拉取模型时使用）
BGE_M3=BAAI/bge-m3
# BGE-M3运行设备，cuda:0表示使用第1块GPU，cpu表示使用CPU，cuda:N表示第N+1块GPU
BGE_DEVICE=cuda:0 
# BGE-M3是否开启FP16半精度推理，1=开启（GPU加速更高效），0=关闭（兼容低版本GPU/CPU）
BGE_FP16=1
```

**4. 配置参数读取**

文件：`app.config.embedding_config.py`

```py
# 导入核心依赖：数据类、环境变量读取、路径处理
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# 提前加载.env配置文件（保持和原代码一致，只需执行一次）
load_dotenv()

# 定义Embedding配置（适配BGE-M3的所有配置，类名embedding_config）
@dataclass
class EmbeddingConfig:
    bge_m3_path: str  # 本地模型路径
    bge_m3: str       # 模型仓库标识
    bge_device: str   # 运行设备(cuda:0/cpu)
    bge_fp16: bool    # 是否开启半精度（1=True/0=False）

# 实例化配置对象，和原代码lm_config风格保持一致
embedding_config = EmbeddingConfig(
    bge_m3_path=os.getenv("BGE_M3_PATH"),
    bge_m3=os.getenv("BGE_M3"),
    bge_device=os.getenv("BGE_DEVICE"),
    # 特殊处理：将.env中的1/0转为布尔值，兼容常见的数字/字符串格式
    bge_fp16=os.getenv("BGE_FP16") in ("1", "True", "true", 1)
)
```

##### 3.5 工具代码导入

文件：`app.lm.embedding_utils.py`

```python
from pymilvus.model.hybrid import BGEM3EmbeddingFunction
from app.core.logger import logger
from app.conf.embedding_config import embedding_config

# 模型单例对象，避免重复初始化
_bge_m3_ef = None

def get_bge_m3_ef():
    """
    获取BGE-M3模型单例对象，自动加载环境变量配置
    :return: 初始化完成的BGEM3EmbeddingFunction实例
    """
    global _bge_m3_ef
    # 单例模式：已初始化则直接返回，避免重复加载模型
    if _bge_m3_ef is not None:
        logger.debug("BGE-M3模型单例已存在，直接返回实例")
        return _bge_m3_ef

    # 从环境变量加载配置，无配置则使用默认值
    # 本地有可以使用本地地址！ 没有使用 "BAAI/bge-m3" 会自动下载！ 如果云端部署也可以使用url地址！
    model_name = embedding_config.bge_m3_path or "BAAI/bge-m3"
    device = embedding_config.bge_device or "cpu"
    use_fp16 = embedding_config.bge_fp16 or False

    # 打印模型初始化配置，便于问题排查
    logger.info(
        "开始初始化BGE-M3模型",
        extra={
            "model_name": model_name,
            "device": device,
            "use_fp16": use_fp16,
            "normalize_embeddings": True
        }
    )

    try:
        # 初始化BGE-M3模型，开启原生L2归一化（适配Milvus IP内积检索）
        _bge_m3_ef = BGEM3EmbeddingFunction(
            model_name=model_name,
            device=device,
            use_fp16=use_fp16,
            normalize_embeddings=True  # 模型原生对稠密+稀疏向量做L2归一化
        )
        logger.success("BGE-M3模型初始化成功，已开启原生L2归一化")
        # “它把所有向量拉伸到统一长度（模长为1），让我们能在数据库中放心使用最快的内积（IP）检索，既提速又不丢精度。”
        return _bge_m3_ef
    except Exception as e:
        logger.error(f"BGE-M3模型初始化失败：{str(e)}", exc_info=True)
        raise  # 向上抛出异常，由调用方处理


def generate_embeddings(texts):
    """
    为文本列表生成稠密+稀疏混合向量嵌入（模型原生L2归一化）
    :param texts: 要生成嵌入的文本列表，单文本也需封装为列表
    :return: 字典格式的向量结果，key为dense/sparse，对应嵌套列表/字典列表
    :raise: 向量生成过程中的异常，由调用方捕获处理
    """
    # 入参合法性校验
    if not isinstance(texts, list) or len(texts) == 0:
        logger.warning("生成向量入参不合法，texts必须为非空列表")
        raise ValueError("参数texts必须是包含文本的非空列表")

    logger.info(f"开始为{len(texts)}条文本生成混合向量嵌入")
    try:
        # 加载BGE-M3模型单例
        model = get_bge_m3_ef()
        # 模型编码生成向量，返回dense（稠密向量）+sparse（CSR格式稀疏向量）
        embeddings = model.encode_documents(texts)
        logger.debug(f"模型编码完成，开始解析稀疏向量格式，共{len(texts)}条")

        # 初始化稀疏向量处理结果，解析为字典格式（适配序列化/存储）
        processed_sparse = []
        for i in range(len(texts)):
            # 提取第i个文本的稀疏向量索引：np.int64 → Python int（满足字典key可哈希要求）
            sparse_indices = embeddings["sparse"].indices[
                embeddings["sparse"].indptr[i]:embeddings["sparse"].indptr[i + 1]
            ].tolist()
            # 提取第i个文本的稀疏向量权重：np.float32 → Python float（适配JSON序列化/接口返回）
            sparse_data = embeddings["sparse"].data[
                embeddings["sparse"].indptr[i]:embeddings["sparse"].indptr[i + 1]
            ].tolist()
            # 构造{特征索引: 归一化权重}的稀疏向量字典
            sparse_dict = {k: v for k, v in zip(sparse_indices, sparse_data)}
            processed_sparse.append(sparse_dict)

        # 构造最终返回结果，稠密向量转列表（解决numpy数组不可序列化问题）
        result = {
            "dense": [emb.tolist() for emb in embeddings["dense"]],  # 嵌套列表，与输入文本一一对应
            "sparse": processed_sparse  # 字典列表，模型已做L2归一化
        }
        logger.success(f"{len(texts)}条文本向量生成完成，格式已适配工业级使用")
        return result

    except Exception as e:
        logger.error(f"文本向量生成失败：{str(e)}", exc_info=True)
        raise  # 不吞异常，向上传递让调用方做重试/降级处理


"""
核心设计亮点&适配说明：
1. 模型原生归一化：开启normalize_embeddings = True，自动对稠密+稀疏向量做L2归一化，完美适配Milvus IP内积检索（单位化后IP等价于余弦，计算更快）；
2. 彻底解决NumPy类型做key问题：sparse_indices加.tolist()，将np.int64转为Python原生int，满足字典key的可哈希要求，无报错风险；
3. 稀疏值适配序列化：sparse_data加.tolist()，将np.float32转为Python原生float，支持JSON写入/接口返回/Milvus入库等所有场景；
4. 单例模式优化：模型仅初始化一次，避免重复加载耗时耗资源，提升批量处理效率；
5. 格式匹配业务调用：返回dense嵌套列表、sparse字典列表，与vector_result["dense"][0]/sparse_vector["sparse"][0]取值逻辑完美契合；
6. 分级日志覆盖：从模型初始化、向量生成到异常报错，全流程日志记录，便于生产环境问题排查；
7. 入参合法性校验：防止空列表/非列表入参导致的内部报错，提升工具类健壮性。
"""
```

#### 4. 准备Milvues向量数据库和工具

##### 4.1 安装 Milvus 并完成连接测试

- 操作系统：Linux（CentOS/RHEL/Ubuntu 通用，`yum` 命令适用于 CentOS/RHEL，Ubuntu 需替换为 `apt-get`）
- 核心目标：编译安装 Python3.8（Milvus 客户端适配）+ 部署 Milvus 2.4.11 单机版 + 解决 MinIO 端口冲突 + 部署 Attu 可视化客户端
- 前置要求：服务器已安装 `docker` + `docker compose`（未安装可先执行：`yum install -y docker docker-compose-plugin && systemctl start docker && systemctl enable docker`）

**第一步：Python3.8 环境编译安装（客户端基础 ！使用Docker安装无需要此步骤）**

```bash
# 1. 安装 Python 编译必备的工具和依赖库
yum install -y zlib-devel bzip2-devel openssl-devel ncurses-devel sqlite-devel readline-devel tk-devel gcc make libffi-devel

# 2. 创建 Python3.8 专属安装目录，避免和系统Python冲突
mkdir -p /usr/local/python3.8

# 3. 下载 Python3.8.16 源码包（稳定版，适配Milvus客户端）
wget https://www.python.org/ftp/python/3.8.16/Python-3.8.16.tgz

# 4. 解压源码包
tar -zxvf Python-3.8.16.tgz

# 5. 进入解压目录，配置编译参数（指定安装路径+关联openssl）
cd Python-3.8.16
./configure --prefix=/usr/local/python3.8 --with-openssl=/usr/local/openssl

# 6. 多线程编译并安装（-j $(nproc) 调用所有CPU核心，加速编译）
make -j $(nproc) && make install

# 7. 验证安装成功（输出版本号即成功，若提示命令不存在，需配置环境变量：ln -s /usr/local/python3.8/bin/python3 /usr/bin/python3）
python3 --version
```

> 注：Ubuntu 系统替换第一步命令为：`apt-get update && apt-get install -y zlib1g-dev libbz2-dev libssl-dev libncurses5-dev libsqlite3-dev libreadline-dev libtk8.6 libgdm-dev libdb4o-cil-dev libffi-dev gcc make`

**第二步：部署 Milvus 2.4.11 单机版（从旧版本升级 / 全新部署通用）**

```bash
# 1. 创建并进入Milvus工作目录（无则新建，有则进入原有目录）
mkdir -p ~/milvus && cd ~/milvus

# 2. 停止当前运行的旧版Milvus（全新部署执行此命令无影响）
docker compose down

# 3. 备份原有数据（关键！防止数据丢失，若为全新部署，无volumes目录可跳过此步）
mv volumes volumes.bak_2.3.5

# 4. 下载 Milvus 2.4.11 官方单机版docker-compose配置文件（覆盖原有文件）
wget https://github.com/milvus-io/milvus/releases/download/v2.4.11/milvus-standalone-docker-compose.yml -O docker-compose.yml

# 5. 启动 Milvus 2.4.11（-d 后台运行）
docker compose up -d

# 6. 检查Milvus运行状态（等待3-5秒，所有容器状态为 Up 即启动成功）
docker compose ps

# 【常用运维命令】后续管理Milvus可使用
# 停止Milvus：docker compose stop
# 重启Milvus：docker compose restart
# 查看运行日志（排查问题用）：docker compose logs milvus-standalone
```

**第三步：解决 MinIO 端口冲突问题（修改 docker-compose.yml）**

Milvus 内置 MinIO 用于存储向量数据，默认端口 `9000/9001` 若被本地服务占用，需修改映射端口，**编辑 `~/milvus/docker-compose.yml`**，找到 `minio` 节点，修改 ports 配置：

```yml
minio:
    container_name: milvus-minio
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    environment:
      MINIO_ACCESS_KEY: minioadmin  # 内置账号，无需修改
      MINIO_SECRET_KEY: minioadmin  # 内置密码，无需修改
    ports:
      - "9003:9001"  # 控制台端口：原9001→改为9003（避开占用）
      - "9002:9000"  # 数据端口：原9000→改为9002（避开占用）
    volumes:
      - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/minio:/minio_data  # 数据持久化目录
    command: minio server /minio_data --console-address ":9001"  # 容器内端口不变，仅改宿主机映射
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
```

> 改完端口后，需重启 Milvus 生效：`cd ~/milvus && docker compose restart`

**第四步：部署 Attu 2.4.0 可视化客户端（适配 Milvus 2.4.11）**

```bash
# 1. 先删除旧版Attu（若未安装，此命令无影响）
docker rm -f attu

# 2. 启动新版Attu 2.4.0（适配Milvus 2.4.11，后台运行）
# 关键：MILVUS_URL 填写Milvus服务器的IP+默认端口19530（本地部署填127.0.0.1:19530，远程服务器填公网/内网IP）
docker run -d --name attu \
    -p 8000:3000 \  # 宿主机8000端口映射容器3000端口
    -e MILVUS_URL=47.94.86.115:19530 \
    zilliz/attu:v2.4.0
```

**第五步：Attu 连接测试（验证 Milvus 部署成功）**

1. 服务器开放端口：若为云服务器 / 防火墙开启状态，需放行 8000 端口（Milvus 默认 19530 端口无需外部访问，Attu 用 8000 端口）

   ```
   # CentOS 放行8000端口
   firewall-cmd --add-port=8000/tcp --permanent
   firewall-cmd --reload
   ```

2. 浏览器访问：打开本地浏览器，输入地址

   ```
   http://<Linux服务器IP>:8000
   ```

    - 本地虚拟机 / 服务器本地访问：`http://127.0.0.1:8000`
    - 远程服务器访问：`http://服务器公网/内网IP:8000`

3. 连接 Milvus：页面无需输入账号密码，直接点击「Connect」按钮，若能进入 Attu 可视化界面，即**Milvus 部署 + Attu 连接全部成功**。

##### 4.2 定义Milvus客户端工具类

**步骤1：定义.env配置参数**

文件：`.env`

```ini
# Milvus 配置
# 切换成你milvus的url地址
MILVUS_URL=http://47.94.86.115:19530
# 存储切片集合
CHUNKS_COLLECTION=kb_chunks
# 预留
ENTITY_NAME_COLLECTION=kb_graph_entity_names
# 存储每个文档对应的实体类
ITEM_NAME_COLLECTION=kb_item_names
```

**步骤2：读取配置参数**

文件：`app.config.milvus_config.py`

```python
# 导入核心依赖（和其他配置类共用，只需导入一次）
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# 提前加载.env配置文件（全局执行一次即可，无需重复写）
load_dotenv()

# ===================== 其他配置类（LLM/Embedding）可放在上方，保持原有代码不变 =====================
# ... 你的LLMConfig、EmbeddingConfig代码 ...

# 定义Milvus向量数据库配置类
@dataclass
class MilvusConfig:
    milvus_url: str          # Milvus服务端连接地址
    chunks_collection: str   # 存储切片的集合名称
    entity_name_collection: str  # 预留-实体名称集合
    item_name_collection: str    # 存储文档对应实体类的集合名称

# 实例化Milvus配置对象（和其他配置对象命名风格统一）
milvus_config = MilvusConfig(
    milvus_url=os.getenv("MILVUS_URL"),
    chunks_collection=os.getenv("CHUNKS_COLLECTION"),
    entity_name_collection=os.getenv("ENTITY_NAME_COLLECTION"),
    item_name_collection=os.getenv("ITEM_NAME_COLLECTION")
)
```

**步骤3：定义Milvus客户端类**

```python
import os
from pymilvus import MilvusClient, AnnSearchRequest, WeightedRanker
from app.conf.milvus_config import milvus_config
from app.core.logger import logger

# 全局Milvus客户端实例，实现单例复用
_milvus_client = None


def get_milvus_client():
    """
    Milvus客户端单例获取方法
    实现客户端连接复用，避免重复创建连接消耗资源
    :return: MilvusClient实例，连接失败返回None
    """
    try:
        global _milvus_client
        # 单例判断：未初始化则创建新连接
        if _milvus_client is None:
            milvus_uri = milvus_config.milvus_url
            # 校验Milvus连接地址配置
            if not milvus_uri:
                logger.error("Milvus客户端连接失败：缺少MILVUS_URL环境变量配置")
                return None
            # 初始化Milvus客户端
            _milvus_client = MilvusClient(uri=milvus_uri)
            logger.info("Milvus客户端连接成功")
        return _milvus_client
    except Exception as e:
        logger.error(f"Milvus客户端连接异常：{str(e)}", exc_info=True)
        return None


def _coerce_int64_ids(ids):
    """
    转换chunk_id为Milvus要求的INT64类型（主键字段schema为INT64）
    过滤无效ID，分离可转换/不可转换的ID
    :param ids: 待转换的chunk_id列表
    :return: 元组(ok_ids, bad_ids)，ok_ids为可转换的int64类型ID列表，bad_ids为无效ID列表
    """
    ok, bad = [], []
    for x in (ids or []):
        if x is None:
            continue
        try:
            ok.append(int(x))
        except Exception:
            bad.append(x)
    return ok, bad


def fetch_chunks_by_chunk_ids(
        client,
        collection_name: str,
        chunk_ids,
        *,
        output_fields=None,
        batch_size: int = 100,
):
    """
    通过chunk_id主键批量查询Milvus中的切片数据
    用于补全「仅拥有chunk_id无文本内容」场景的切片信息
    优先使用get方法（主键直查，性能最优），失败则回退query过滤查询
    :param client: MilvusClient实例
    :param collection_name: 集合名称
    :param chunk_ids: 待查询的chunk_id列表
    :param output_fields: 需要返回的字段列表，默认返回核心切片字段
    :param batch_size: 分批查询大小，避免单次查询数据量过大，默认100
    :return: List[dict]，Milvus实体字典列表，查询失败返回空列表
    """
    # 前置校验：客户端/集合名无效直接返回空
    if client is None:
        return []
    if not collection_name:
        return []
    # 默认返回字段：核心切片标识与内容字段
    if output_fields is None:
        output_fields = ["chunk_id", "content", "title", "parent_title", "item_name"]

    # 转换ID为INT64类型，分离有效/无效ID
    ok_ids, bad_ids = _coerce_int64_ids(chunk_ids)
    if bad_ids:
        # 记录无效ID，跳过查询
        logger.warning(f"存在无法转换为INT64的chunk_id，将跳过查询：{bad_ids}")

    # 无有效ID直接返回空
    if not ok_ids:
        return []

    results = []
    # 分批查询：按batch_size切分有效ID，循环查询
    for i in range(0, len(ok_ids), batch_size):
        batch = ok_ids[i: i + batch_size]

        # 方式1：优先使用主键get方法查询（性能最优）
        if hasattr(client, "get"):
            try:
                got = client.get(collection_name=collection_name, ids=batch, output_fields=output_fields)
                if got:
                    results.extend(got)
                continue
            except Exception as e:
                logger.warning(f"Milvus get方法查询失败，将回退至query方法：{str(e)}")

        # 方式2：get方法失败，回退使用filter过滤查询
        try:
            expr = f"chunk_id in [{', '.join(str(x) for x in batch)}]"
            q = client.query(collection_name=collection_name, filter=expr, output_fields=output_fields)
            if q:
                results.extend(q)
        except Exception as e:
            logger.error(f"Milvus query方法批量查询chunk_id失败：{str(e)}", exc_info=True)

    return results


def create_hybrid_search_requests(dense_vector, sparse_vector, dense_params=None, sparse_params=None, expr=None,
                                  limit=5):
    """
    构建Milvus混合搜索请求对象
    分别创建稠密/稀疏向量的搜索请求，用于后续混合搜索融合
    :param dense_vector: 文本生成的稠密向量
    :param sparse_vector: 文本生成的稀疏向量
    :param dense_params: 稠密向量搜索参数，默认使用余弦相似度
    :param sparse_params: 稀疏向量搜索参数，默认使用内积相似度
    :param expr: 搜索过滤表达式，用于精准筛选数据
    :param limit: 单向量搜索返回结果数量，默认5
    :return: 搜索请求列表，包含[dense_req, sparse_req]
    """
    # 稠密向量默认搜索参数：余弦相似度（COSINE），适配BGE-M3稠密向量
    if dense_params is None:
        dense_params = {"metric_type": "COSINE"}
    # 稀疏向量默认搜索参数：内积（IP），适配BGE-M3稀疏向量
    if sparse_params is None:
        sparse_params = {"metric_type": "IP"}

    # 构建稠密向量搜索请求，关联Milvus的dense_vector字段
    dense_req = AnnSearchRequest(
        data=[dense_vector],
        anns_field="dense_vector",
        param=dense_params,
        expr=expr,
        limit=limit
    )

    # 构建稀疏向量搜索请求，关联Milvus的sparse_vector字段
    sparse_req = AnnSearchRequest(
        data=[sparse_vector],
        anns_field="sparse_vector",
        param=sparse_params,
        expr=expr,
        limit=limit
    )

    return [dense_req, sparse_req]


def hybrid_search(client, collection_name, reqs, ranker_weights=(0.5, 0.5), norm_score=False, limit=5,
                  output_fields=None, search_params=None):
    """
    执行Milvus稠密+稀疏向量混合搜索
    基于WeightedRanker实现双向量搜索结果加权融合，提升检索准确性
    :param client: MilvusClient实例
    :param collection_name: 集合名称
    :param reqs: 搜索请求列表，固定为[dense_req, sparse_req]
    :param ranker_weights: 加权融合权重，默认(0.5,0.5)，依次对应稠密/稀疏向量
    :param norm_score: 是否归一化评分后再融合，避免评分量级差异导致权重失效
    :param limit: 混合搜索最终返回结果数量，默认5
    :param output_fields: 需要返回的字段列表，默认返回item_name
    :param search_params: 搜索参数，如ef/topk等，默认None
    :return: 混合搜索结果列表，搜索失败返回None
    """
    try:
        # 初始化加权排名器：按权重融合稠密/稀疏向量的搜索结果
        # norm_score=True：先将两个向量评分归一化到0~1区间，再加权计算
        rerank = WeightedRanker(ranker_weights[0], ranker_weights[1], norm_score=norm_score)

        # 默认返回字段：文档标识字段
        if output_fields is None:
            output_fields = ["item_name"]

        # 执行混合搜索：融合稠密+稀疏向量结果，按权重重新排序
        res = client.hybrid_search(
            collection_name=collection_name,
            reqs=reqs,
            ranker=rerank,
            limit=limit,
            output_fields=output_fields,
            search_params=search_params
        )

        logger.info(f"Milvus混合搜索完成，集合[{collection_name}]共检索到{len(res[0])}条结果")
        return res
    except Exception as e:
        logger.error(f"Milvus混合搜索执行失败，集合[{collection_name}]：{str(e)}", exc_info=True)
        return None
```

#### 5. 导入与配置

引入必要的依赖库，并定义默认配置参数。

```python
# 导入基础库：系统、路径、类型注解（类型注解提升代码可读性和可维护性）
import os
import sys
from typing import List, Dict, Any, Tuple

# 导入Milvus客户端（向量数据库核心操作）、数据类型枚举（定义集合Schema）
from pymilvus import MilvusClient, DataType
# 导入LangChain消息类（标准化大模型对话消息格式）
from langchain_core.messages import SystemMessage, HumanMessage

# 导入自定义模块：
# 1. 流程状态载体：ImportGraphState为LangGraph流程的统一状态管理对象
from app.import_process.agent.state import ImportGraphState
# 2. Milvus工具：获取单例Milvus客户端，实现连接复用
from app.clients.milvus_utils import get_milvus_client
# 3. 大模型工具：获取大模型客户端，统一模型调用入口
from app.lm.lm_utils import get_llm_client
# 4. 向量工具：BGE-M3模型实例、向量生成方法（稠密+稀疏向量）
from app.lm.embedding_utils import get_bge_m3_ef, generate_embeddings
# 5. 稀疏向量工具：归一化处理，保证向量长度为1，提升检索准确性
from app.utils.normalize_sparse_vector import normalize_sparse_vector
# 6. 任务工具：更新任务运行状态，用于任务监控和管理
from app.utils.task_utils import add_running_task
# 7. 日志工具：项目统一日志入口，分级输出（info/warning/error）
from app.core.logger import logger
# 8. 提示词工具：加载本地prompt模板，实现提示词与代码解耦
from app.core.load_prompt import load_prompt

from app.utils.escape_milvus_string_utils import escape_milvus_string

# --- 配置参数 (Configuration) ---
# 大模型识别商品名称的上下文切片数：取前5个切片，避免上下文过长导致大模型输入超限
DEFAULT_ITEM_NAME_CHUNK_K = 5
# 单个切片内容截断长度：防止单切片内容过长，占满大模型上下文
SINGLE_CHUNK_CONTENT_MAX_LEN = 800
# 大模型上下文总字符数上限：适配主流大模型输入限制，默认2500
CONTEXT_TOTAL_MAX_CHARS = 2500
```

#### 6. 核心辅助函数

处理 Milvus 字符串转义等底层逻辑。

```python
from app.utils.escape_milvus_string_utils import escape_milvus_string
```

#### 7. 主流程定义

LangGraph 节点的入口函数，负责串联所有步骤。

```python
def node_item_name_recognition(state: ImportGraphState) -> ImportGraphState:
    """
    【核心节点】商品主体名称识别（node_item_name_recognition）
    整体流程：提取输入→构建上下文→大模型识别→回填数据→生成向量→存入Milvus
    核心目的：利用大模型从文档切片中精准识别商品/主体名称，并生成双路向量（稠密+稀疏）存入数据库
    后续扩展点：支持多主体识别、增加商品属性提取、对接其他向量库等
    :param state: 项目状态字典（ImportGraphState），必须包含chunks/file_title/task_id
    :return: 更新后的状态字典，新增item_name键，且chunks列表中每个元素新增item_name字段
    """
    # 初始化当前节点信息，用于任务监控和日志溯源
    node_name = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行核心节点：【商品名称识别】{node_name}")
    # 将当前节点加入运行中任务，更新全局任务状态
    add_running_task(state.get("task_id", ""), node_name)

    try:
        # ===================================== 步骤1：提取并校验输入数据 =====================================
        # 作用：从状态字典提取文件标题和切片列表，校验数据完整性
        # 输出：文件标题、切片列表；若无切片则抛出异常或终止
        file_title, chunks = step_1_get_inputs(state)
        if not chunks:
            logger.warning(f">>> 节点执行警告：{node_name}（无有效切片数据），跳过识别")
            return state

        # ===================================== 步骤2：构建大模型识别上下文 =====================================
        # 作用：截取前N个切片的内容，拼接成大模型可阅读的上下文，用于辅助识别
        # 输出：拼接后的上下文字符串
        context = step_2_build_context(chunks)

        # ===================================== 步骤3：调用大模型识别商品名称 =====================================
        # 作用：构造Prompt，调用LLM从上下文和标题中提取最核心的商品名称
        # 输出：识别出的商品名称字符串（如 "iPhone 15 Pro"）
        item_name = step_3_call_llm(file_title, context)

        # ===================================== 步骤4：回填商品名称到状态和切片 =====================================
        # 作用：将识别结果写入状态字典，并同步更新到每一个Chunk对象的元数据中
        # 输出：状态字典新增item_name，chunks列表被就地修改
        step_4_update_chunks(state, chunks, item_name)

        # ===================================== 步骤5：生成双路向量（稠密+稀疏） =====================================
        # 作用：调用BGE-M3模型，为商品名称生成稠密语义向量和稀疏关键词向量
        # 输出：dense_vector（List[float]）、sparse_vector（Dict[int, float]）
        dense_vector, sparse_vector = step_5_generate_vectors(item_name)

        # ===================================== 步骤6：存入Milvus向量数据库 =====================================
        # 作用：将商品名称及其双路向量存入Milvus的 item_names 集合，用于后续检索
        # 输出：无返回值，数据已持久化
        step_6_save_to_milvus(state, file_title, item_name, dense_vector, sparse_vector)

        # 节点执行完成日志
        logger.info(f">>> 核心节点执行完成：【商品名称识别】{node_name}，识别结果：{item_name}，已存入Milvus")

    except Exception as e:
        # 全局异常捕获：保证节点执行失败不崩溃整个流程，记录详细错误日志便于排查
        logger.error(f">>> 核心节点执行失败：【商品名称识别】{node_name}，错误信息：{str(e)}", exc_info=True)
        # 可选：失败时设置默认值或标记状态
        state["item_name"] = "未知商品"

    # 返回更新后的状态（供下游节点使用）
    return state
```

#### 8. 步骤 1: 获取输入

从 State 中提取文件名和切片数据，并进行基础校验。

```python
def step_1_get_inputs(state: ImportGraphState) -> Tuple[str, List[Dict]]:
    """
    步骤 1: 接收并校验流程输入（商品名称识别的前置数据处理）
    核心作用：
        1. 从流程状态中提取文件标题、文本切片核心数据
        2. 做多层空值兜底，避免后续流程因空值报错
        3. 基础数据类型校验，保证下游流程输入有效性
    依赖的状态数据（上游节点产出）：
        - state["file_title"]: 上游提取的文件标题（优先使用）
        - state["file_name"]: 原始文件名（file_title为空时兜底）
        - state["chunks"]: 文本切片列表（每个切片为字典，含title/content等字段）
    返回值：
        Tuple[str, List[Dict]]: (处理后的文件标题, 校验后的文本切片列表)
    """
    # 多层兜底获取文件标题：优先file_title → 其次file_name → 空字符串
    file_title = state.get("file_title", "") or state.get("file_name", "")
    # 获取文本切片列表：空值时返回空列表，避免后续遍历报错
    chunks = state.get("chunks") or []

    # 二次兜底：file_title仍为空时，尝试从第一个有效切片中提取
    if not file_title:
        if chunks and isinstance(chunks[0], dict):
            file_title = chunks[0].get("file_title", "")
            logger.warning("state中无有效file_title，已从第一个切片中提取兜底标题")

    # 空值日志提示：文件标题为空时不中断流程，仅记录警告
    if not file_title:
        logger.warning("state中缺少file_title和file_name，后续大模型识别可能精度下降")

    # 数据类型校验：确保chunks为有效非空列表，否则返回空列表
    if not isinstance(chunks, list) or not chunks:
        logger.warning("state中chunks为空或非列表类型，无法进行商品名称识别")
        return file_title, []

    logger.info(f"步骤1：输入校验完成，获取到{len(chunks)}个有效文本切片")
    return file_title, chunks
```

#### 9. 步骤 2: 构建上下文

截取文档的前 K 个切片，拼接成用于 LLM 识别的 Context。

```python
def step_2_build_context(chunks: List[Dict], k: int = DEFAULT_ITEM_NAME_CHUNK_K, max_chars: int = CONTEXT_TOTAL_MAX_CHARS) -> str:
    """
    步骤 2: 构造大模型商品名称识别的标准化上下文
    核心作用：
        1. 限制切片数量：仅取前k个切片，避免上下文过长
        2. 限制字符长度：单切片+总上下文双重字符限制，适配大模型输入上限
        3. 格式化内容：带序号的结构化格式，提升大模型识别精度
        4. 过滤无效切片：跳过空内容/非字典类型切片，保证上下文有效性
    参数说明：
        chunks: 文本切片列表（每个元素为字典，需包含"title"和"content"键）
        k: 最大取片数，默认5个（可通过配置调整）
        max_chars: 上下文总字符数上限，默认2500（适配大模型输入限制）
    返回值：
        str: 格式化后的上下文字符串（直接传给大模型，空切片时返回空字符串）
    """
    # 空切片直接返回空字符串，无需后续处理
    if not chunks:
        return ""

    # 存储格式化后的切片片段，保证上下文结构化
    parts: List[str] = []
    # 统计已拼接字符数，用于控制总长度不超限
    total_chars = 0

    # 遍历前k个切片，避免上下文过长
    for idx, chunk in enumerate(chunks[:k]):
        # 跳过非字典类型切片，防止键取值报错
        if not isinstance(chunk, dict):
            logger.debug(f"第{idx+1}个切片非字典类型，已过滤")
            continue

        # 提取切片标题和内容，去首尾空格，过滤无效字符
        chunk_title = chunk.get("title", "").strip()
        chunk_content = chunk.get("content", "").strip()

        # 标题和内容均为空，跳过该无效切片
        if not (chunk_title or chunk_content):
            logger.debug(f"第{idx+1}个切片为空白内容，已过滤")
            continue

        # 单切片内容截断：防止单个切片内容过长占满上下文
        if len(chunk_content) > SINGLE_CHUNK_CONTENT_MAX_LEN:
            chunk_content = chunk_content[:SINGLE_CHUNK_CONTENT_MAX_LEN]
            logger.debug(f"第{idx+1}个切片内容过长，已截断至{SINGLE_CHUNK_CONTENT_MAX_LEN}字符")

        # 结构化格式化切片：带序号+标题+内容，提升大模型识别效率
        piece = f"【切片{idx + 1}】\n标题：{chunk_title} \n内容：{chunk_content}"
        parts.append(piece)
        # 累计字符数，包含分隔符
        total_chars += len(piece)

        # 总字符数超限时立即停止拼接，避免大模型输入超限
        if total_chars > max_chars:
            logger.info(f"上下文总字符数即将超限（{max_chars}），已停止拼接后续切片")
            break

    # 用空行分隔切片片段，拼接为最终上下文，最后一次去重空格
    context = "\n\n".join(parts).strip()
    # 最终二次截断，确保绝对不超限
    final_context = context[:max_chars]
    logger.info(f"步骤2：上下文构建完成，最终长度{len(final_context)}字符")
    return final_context
```

#### 10. 步骤 3: 调用

构造 Prompt 并调用大模型，识别商品名称。

```python
def step_3_call_llm(file_title: str, context: str) -> str:
    """
    步骤 3: 调用大模型实现商品名称/型号精准识别
    核心逻辑：
        1. 上下文为空 → 直接返回file_title（兜底，无需调用大模型）
        2. 上下文非空 → 加载标准化prompt模板，构建大模型对话消息
        3. 调用大模型后对返回结果做清洗，过滤无效字符
        4. 大模型返回空/调用异常 → 均返回file_title兜底，保证流程不中断
    核心特性：
        - 提示词解耦：通过load_prompt加载本地模板，无需硬编码
        - 格式兼容：兼容不同LLM客户端返回格式，防止属性报错
        - 异常兜底：全异常捕获，大模型服务不可用时不影响主流程
    参数：
        file_title: 处理后的文件标题（异常/空值时的兜底值）
        context: 步骤2构建的结构化切片上下文（大模型识别的核心依据）
    返回值：
        str: 清洗后的商品名称（异常/空值时返回原始file_title）
    """
    logger.info("开始执行步骤3：调用大模型识别商品名称")

    # 上下文为空时，直接返回文件标题，跳过大模型调用
    if not context:
        logger.warning("上下文为空，跳过大模型调用，直接使用文件标题作为商品名称")
        return file_title

    try:
        # 加载商品名称识别prompt模板，动态传入文件标题和上下文
        human_prompt = load_prompt("item_name_recognition", file_title=file_title, context=context)
        # 加载系统提示词，定义大模型角色（商品识别专家，仅返回纯结果）
        system_prompt = load_prompt("product_recognition_system")
        logger.debug(f"大模型调用提示词构建完成，系统提示词长度{len(system_prompt)}，人类提示词长度{len(human_prompt)}")

        # 获取大模型客户端：json_mode=False，要求返回纯文本而非JSON格式
        llm = get_llm_client(json_mode=False)
        if not llm:
            logger.error("大模型客户端获取失败，使用文件标题兜底")
            return file_title

        # 标准化构建大模型对话消息：SystemMessage定义角色 + HumanMessage传递业务请求
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ]
        # 调用大模型并获取返回结果
        resp = llm.invoke(messages)

        # 兼容不同LLM客户端返回格式：优先取content字段，无则返回空字符串
        item_name = getattr(resp, "content", "").strip()
        # 清洗返回结果：过滤空格、换行、回车、制表符等无效字符
        item_name = item_name.replace(" ", "").replace("\n", "").replace("\r", "").replace("\t", "")

        # 清洗后结果为空，使用文件标题兜底
        if not item_name:
            logger.warning("大模型返回空内容，使用文件标题作为商品名称兜底")
            return file_title

        logger.info(f"步骤3：大模型识别商品名称成功，结果为：{item_name}")
        return item_name

    # 捕获所有异常：大模型调用超时、网络错误、格式错误等，均不中断主流程
    except Exception as e:
        logger.error(f"步骤3：大模型调用失败，原因：{str(e)}", exc_info=True)
        # 异常时返回文件标题兜底，保证流程继续执行
        return file_title
```

#### 11. 步骤 4: 回填数据

将识别到的 `item_name` 回填到 State 和 Chunks 中。

```python
def step_4_update_chunks(state: ImportGraphState, chunks: List[Dict], item_name: str):
    """
    步骤 4: 回填商品名称到流程状态和所有文本切片
    核心作用：
        1. 全局状态更新：将item_name存入state，供下游所有节点直接使用
        2. 切片数据补全：为每个切片添加item_name字段，保证数据一致性
        3. 状态同步：更新state中的chunks，确保切片修改全局生效
    设计思路：
        所有切片关联同一商品名称，保证后续向量入库、检索时的维度一致性
    参数：
        state: 流程状态对象（ImportGraphState），全局数据载体
        chunks: 校验后的文本切片列表（步骤1输出）
        item_name: 步骤3识别并清洗后的商品名称
    """
    # 将商品名称存入全局状态，供下游节点调用
    state["item_name"] = item_name
    # 遍历所有切片，为每个切片添加商品名字段，保证数据全链路一致
    for chunk in chunks:
        chunk["item_name"] = item_name
    # 同步更新state中的切片列表，确保修改全局生效
    state["chunks"] = chunks
    logger.info(f"步骤4：商品名称回填完成，共为{len(chunks)}个切片添加item_name字段，值为：{item_name}")
```

#### 12. 步骤 5: 生成向量

使用 Embedding 模型为商品名称生成向量。

BGE-M3 模型同时输出这两种向量，结合使用能兼顾 “语义理解” 和 “精准匹配”。

```python
def step_5_generate_vectors(item_name: str) -> Tuple[Any, Any]:
    """
    步骤 5: 为商品名称生成BGE-M3稠密+稀疏双向量（Milvus向量检索核心）
    核心说明：
        - 稠密向量（dense_vector）：BGE-M3固定1024维，记录文本深层语义信息
        - 稀疏向量（sparse_vector）：变长键值对，记录文本关键词/特征位置信息
    依赖工具：
        generate_embeddings：封装BGE-M3模型，批量生成双向量，兼容单条/批量输入
    参数：
        item_name: 步骤3识别的商品名称（非空，空值时直接返回空向量）
    返回值：
        Tuple[Any, Any]: (稠密向量列表, 稀疏向量字典)，空值/异常时返回(None, None)
    """
    logger.info(f"开始执行步骤5：为商品名称[{item_name}]生成BGE-M3双向量")

    # 商品名称为空，直接返回空向量，跳过模型调用
    if not item_name:
        logger.warning("商品名称为空，跳过向量生成，返回空向量")
        return None, None

    try:
        # 调用向量生成工具：传入列表支持批量生成，单条数据仍用列表保证格式统一
        vector_result = generate_embeddings([item_name])

        # 向量生成结果非空，才进行后续解析
        if vector_result and "dense" in vector_result and "sparse" in vector_result:
            # 稠密向量解析：取批量结果第一个，为Python列表（Milvus存储要求）
            dense_vector = vector_result["dense"][0]
            # 稀疏向量解析：取批量结果第一个，CSR矩阵解析为字典格式
            sparse_vector = vector_result["sparse"][0]
            logger.info("步骤5：BGE-M3稠密+稀疏向量生成成功")
        else:
            logger.warning("步骤5：向量生成工具返回空结果，无法提取双向量")
            dense_vector, sparse_vector = None, None

    # 捕获所有异常：模型加载失败、向量生成超时、格式错误等
    except Exception as e:
        logger.error(f"步骤5：向量生成失败，原因：{str(e)}", exc_info=True)
        dense_vector, sparse_vector = None, None

    return dense_vector, sparse_vector
```

#### 13. 步骤 6: 保存结果

将识别结果及向量保存到 Milvus 数据库。

```python
def step_6_save_to_milvus(state: ImportGraphState, file_title: str, item_name: str, dense_vector, sparse_vector):
    """
    步骤 6: 将商品名称、文件标题、双向量持久化到Milvus向量数据库
    核心逻辑：
        1. 配置校验：检查Milvus连接地址和集合名配置，缺失则跳过
        2. 客户端获取：获取单例Milvus客户端，连接失败则跳过
        3. 集合初始化：无集合则创建（定义Schema+索引），有集合则直接使用（保留原有配置）
        4. 幂等性处理：删除同名商品数据，避免重复存储
        5. 数据插入：构造符合Schema的数据，非空向量才添加
        6. 集合加载：插入后强制加载集合，确保数据立即可查/Attu可见
    参数：
        state: 流程状态对象，用于最终状态同步
        file_title: 处理后的文件标题
        item_name: 识别后的商品名称（主键去重依据）
        dense_vector: 步骤5生成的稠密向量（1024维列表）
        sparse_vector: 步骤5生成的稀疏向量（字典格式）
    """
    # 从环境变量读取Milvus核心配置，与MilvusConfig配置类保持一致
    milvus_uri = os.environ.get("MILVUS_URL")
    collection_name = os.environ.get("ITEM_NAME_COLLECTION")

    # 配置缺失校验：任一配置为空则跳过Milvus存储，记录警告
    if not all([milvus_uri, collection_name]):
        logger.warning("Milvus配置缺失（MILVUS_URL/ITEM_NAME_COLLECTION），跳过数据保存")
        return

    logger.info(f"开始执行步骤6：将商品名称[{item_name}]保存到Milvus集合[{collection_name}]")

    try:
        # 获取Milvus单例客户端，连接失败则直接返回
        client = get_milvus_client()
        if not client:
            logger.error("无法获取Milvus客户端（连接失败），跳过数据保存")
            return

        # 集合初始化：不存在则创建（定义Schema+索引），存在则直接使用
        if not client.has_collection(collection_name=collection_name):
            logger.info(f"Milvus集合[{collection_name}]不存在，开始创建Schema和索引")
            # 创建集合Schema：自增主键+动态字段，适配灵活的数据存储
            schema = client.create_schema(auto_id=True, enable_dynamic_field=True)
            # 添加自增主键字段：INT64类型，唯一标识每条数据
            schema.add_field(
                field_name="pk",
                datatype=DataType.INT64,
                is_primary=True,
                auto_id=True
            )
            # 添加文件标题字段：VARCHAR类型，最大长度65535，适配长标题
            schema.add_field(
                field_name="file_title",
                datatype=DataType.VARCHAR,
                max_length=65535
            )
            # 添加商品名字段：VARCHAR类型，最大长度65535，去重依据
            schema.add_field(
                field_name="item_name",
                datatype=DataType.VARCHAR,
                max_length=65535
            )
            # 添加稠密向量字段：FLOAT_VECTOR，1024维（BGE-M3固定维度）
            schema.add_field(
                field_name="dense_vector",
                datatype=DataType.FLOAT_VECTOR,
                dim=1024
            )
            # 添加稀疏向量字段：SPARSE_FLOAT_VECTOR，变长
            schema.add_field(
                field_name="sparse_vector",
                datatype=DataType.SPARSE_FLOAT_VECTOR
            )

            # 构建索引参数：为向量字段创建索引，提升检索性能
            index_params = client.prepare_index_params()
            # 优化版稠密向量索引：HNSW + COSINE (恢复最佳性能配置)
            index_params.add_index(
                field_name="dense_vector",
                index_name="dense_vector_index",
                # HNSW (Hierarchical Navigable Small World) 是目前性能最好、最常用的基于图的索引，检索速度极快，精度极高。
                index_type="HNSW",
                # 使用 COSINE 作为稠密向量相似度计算方式
                metric_type="COSINE",
                # M: 图中每个节点的最大连接数(常用16-64)
                # efConstruction: 构建索引时的搜索范围(越大建索引越慢，但精度越高，常用100-200)
                # 不同数据体量的推荐建议(万级)：
                # 10000 条数据：M=16, efConstruction=200
                # 50000 条数据：M=32, efConstruction=300
                # 100000 条数据：M=64, efConstruction=400
                params={"M": 16, "efConstruction": 200}
            )

            # 稀疏向量索引：专用SPARSE_INVERTED_INDEX+IP，关闭量化保证精度
            index_params.add_index(
                field_name="sparse_vector",
                index_name="sparse_vector_index",
                # 稀疏倒排索引 专门为稀疏向量（比如文本的 TF-IDF 向量、关键词权重向量，特点是大部分元素为 0，只有少数维度有值）设计的倒排索引，是稀疏向量检索的标配索引类型。
                index_type="SPARSE_INVERTED_INDEX",
                # IP（内积，Inner Product）如果向量是 “文本语义向量 + 关键词权重”，长度代表文本与主题的关联强度，此时用 IP 能同时体现 “语义匹配度” 和 “关联强度”。
                metric_type="IP",
                # DAAT_MAXSCORE：稀疏向量检索时，只计算可能得高分的维度，跳过大量0值，速度更快。
                # quantization="none"：稀疏向量里的权重是小数，不做压缩，保证精度不丢。
                params={"inverted_index_algo": "DAAT_MAXSCORE", "quantization": "none"}
            )

            # 创建集合：Schema + 索引参数
            client.create_collection(collection_name=collection_name, schema=schema, index_params=index_params)
            logger.info(f"Milvus集合[{collection_name}]创建成功，包含Schema和向量索引")

        # 幂等性处理：删除同名商品数据，避免重复存储（核心：先加载集合才能删除）
        clean_item_name = (item_name or "").strip()
        if clean_item_name:
            client.load_collection(collection_name=collection_name)
            # 商品名称转义，防止特殊字符导致过滤表达式解析失败
            safe_item_name = escape_milvus_string(clean_item_name)
            filter_expr = f'item_name=="{safe_item_name}"'
            # 执行删除操作
            client.delete(collection_name=collection_name, filter=filter_expr)
            logger.info(f"Milvus幂等性处理完成，已删除集合中[{clean_item_name}]的历史数据")

        # 构造插入Milvus的数据：基础字段+非空向量字段
        data = {
            "file_title": file_title,
            "item_name": item_name
        }
        # 稠密向量非空才添加，避免空值入库报错
        if dense_vector is not None:
            data["dense_vector"] = dense_vector
        # 稀疏向量非空则归一化后添加，保证检索准确性
        if sparse_vector is not None:
            data["sparse_vector"] = sparse_vector

        # 插入数据：列表格式支持批量插入，单条数据保持格式统一
        client.insert(collection_name=collection_name, data=[data])
        # 插入后强制加载集合，确保数据立即可查、Attu可视化界面可见
        client.load_collection(collection_name=collection_name)

        # 最终同步商品名称到全局状态
        state["item_name"] = item_name
        logger.info(f"步骤6：商品名称[{item_name}]成功存入Milvus集合[{collection_name}]，数据：{list(data.keys())}")

    # 捕获所有Milvus操作异常：连接中断、入库失败、索引错误等，不中断主流程
    except Exception as e:
        logger.error(f"步骤6：数据存入Milvus失败，原因：{str(e)}", exc_info=True)
```

#### 15. 单元测试

模拟数据测试核心流程。

```python
# ===================== 本地测试方法（直接运行调试，无需启动LangGraph） =====================
def test_node_item_name_recognition():
    """
    商品名称识别节点本地测试方法
    功能：模拟LangGraph流程输入，独立测试node_item_name_recognition节点全链路逻辑
    适用场景：本地开发、调试、单节点功能验证，无需启动整个LangGraph流程
    测试前准备：
        1. 确保项目环境变量配置完成（MILVUS_URL/ITEM_NAME_COLLECTION等）
        2. 确保大模型、Milvus、BGE-M3服务均可正常访问
        3. 确保prompt模板（item_name_recognition/product_recognition_system）已存在
    使用方法：
        直接运行该函数：if __name__ == "__main__": test_node_item_name_recognition()
    """
    logger.info("=== 开始执行商品名称识别节点本地测试 ===")
    try:
        # 1. 构造模拟的ImportGraphState状态（模拟上游节点产出数据）
        mock_state = ImportGraphState({
            "task_id": "test_task_123456",  # 测试任务ID
            "file_title": "华为Mate60 Pro手机使用说明书",  # 模拟文件标题
            "file_name": "华为Mate60Pro说明书.pdf",  # 模拟原始文件名（兜底用）
            # 模拟文本切片列表（上游切片节点产出，含title/content字段）
            "chunks": [
                {
                    "title": "产品简介",
                    "content": "华为Mate60 Pro是华为公司2023年发布的旗舰智能手机，搭载麒麟9000S芯片，支持卫星通话功能，屏幕尺寸6.82英寸，分辨率2700×1224。"
                },
                {
                    "title": "拍照功能",
                    "content": "华为Mate60 Pro后置5000万像素超光变摄像头+1200万像素超广角摄像头+4800万像素长焦摄像头，支持5倍光学变焦，100倍数字变焦。"
                },
                {
                    "title": "电池参数",
                    "content": "电池容量5000mAh，支持88W有线超级快充，50W无线超级快充，反向无线充电功能。"
                }
            ]
        })

        # 2. 调用商品名称识别核心节点
        result_state = node_item_name_recognition(mock_state)

        # 3. 打印测试结果（调试用）
        logger.info("=== 商品名称识别节点本地测试完成 ===")
        logger.info(f"测试任务ID：{result_state.get('task_id')}")
        logger.info(f"最终识别商品名称：{result_state.get('item_name')}")
        logger.info(f"切片数量：{len(result_state.get('chunks', []))}")
        logger.info(f"第一个切片商品名称：{result_state.get('chunks', [{}])[0].get('item_name')}")

        # 4. 验证Milvus存储（可选）
        milvus_client = get_milvus_client()
        collection_name = os.environ.get("ITEM_NAME_COLLECTION")
        if milvus_client and collection_name:
            milvus_client.load_collection(collection_name)
            # 检索测试结果
            item_name = result_state.get('item_name')
            safe_name = _escape_milvus_string(item_name)
            res = milvus_client.query(
                collection_name=collection_name,
                filter=f'item_name=="{safe_name}"',
                output_fields=["file_title", "item_name"]
            )
            logger.info(f"Milvus中检索到的数据：{res}")

    except Exception as e:
        logger.error(f"商品名称识别节点本地测试失败，原因：{str(e)}", exc_info=True)


# 测试方法运行入口：直接执行该文件即可触发测试
if __name__ == "__main__":
    # 执行本地测试
    test_node_item_name_recognition()
```

