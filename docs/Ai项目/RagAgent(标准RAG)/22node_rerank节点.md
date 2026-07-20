---
title: Rerank重排序(node_rerank)
date: 2026-07-09
abstract: 对非同源数据进行rerank精排以及使用动态topK过滤数据
tags:
- Ai实战项目
---


## 9. 检索数据节点实现与测试

### 9.6 Rerank重排序(node_rerank)

#### 9.6.1 重排序介绍

**核心目标**：将来自不同来源的检索结果合并，根据语义利用专业的打分模型进行重新评分，并根据评分再次进行筛选。

**场景**：由于 RRF 只能对于同源的检索结果进行打分筛选，但应对**不同源**的（比如：本地切片与网页搜索结果）就力不从心了。这时就需要 Rerank 出场了。

**机制**：相对 RRF 这种只依靠一个简单排名公式就能融合打分，Rerank 就比较复杂耗时了。Rerank 是一种依靠深度学习模型对句对进行语义精读打分的机制，它会仔细阅读提问与文章正文得出语义相关性评分，这与大模型的注意力机制非常接近。

#### 9.6.2 Rerank模型的下载

在 `tools` 中加入 `app/tool/download_reranker.py` 并执行，将模型提取下载到指定位置。我们项目采用的是北京人工智能研究院发布的新一代 **BGE-Reranker-V2-M3** 多语言重排序模型，相比 V1 版本，其在多语言召回、长文本排序及复杂表格语义对齐上拥有更高的精度。

```python
# modelscope：魔搭 AI 社区（国内主流的开源模型仓库，类似 Hugging Face，适配国内网络环境提速）
from modelscope.hub.snapshot_download import snapshot_download

# =====================================================================
# 💡 系统差异配置提示（Mac 与 Windows 路径）：
# Windows 原文路径：local_dir = r"D:\ai_models\modelscope_cache\models\rerank"
# macOS 实际路径：采用 POSIX 斜杠，直接指向项目根目录下的 models 文件夹。
# =====================================================================
local_dir = r"/Users/jerry/Desktop/AI/rag_agent/models"

snapshot_download(
  # 北京人工智能研究院（BAAI）发布的 BGE 重排序 V2 多语言模型，专为跨语言、精细化文本相关性排序设计
  model_id="BAAI/bge-reranker-v2-m3",
  cache_dir=local_dir,
)

print("下载完成，模型目录：", local_dir)
```

#### 9.6.3 处理步骤

**1）合并文档**：把 RRF 得到的切片集合和搜索结果进行合并。

**2）利用 Reranker 模型对文档进行打分、重排**。

**3）根据相关性性评分，用动态 TopK 算法进行截取。**

**动态TopK**：与固定的 TopN 排名最大的区别就是不会定死录取名次。而是通过一个分数断崖落差把好差区分，选择优势明显的前 N 名。比如前 5 名分别为 95、93、89、77、71。明显前三名断崖领先后两名所以就只取前三名，避免低分文档混入候选。

#### 9.6.4 代码实现

##### 9.6.4.1 定义`reranker_utils.py`

`BAAI/bge-reranker-v2-m3` 是北京人工智能研究院（BAAI）发布的**重排序模型本体**（包含模型权重、配置文件等核心文件），而 `FlagReranker` 是 `FlagEmbedding` 库中专门为**BGE 系列重排序模型**设计的**封装运行类**，用于简化该模型的加载、初始化和推理调用流程。

更通俗的理解:
- `BAAI/bge-reranker-v2-m3`：相当于 “一台高性能的发动机”（模型核心，提供重排序的核心能力）；
- `FlagReranker`：相当于 “发动机的专用启动 / 控制装置”（封装了模型加载、设备适配、精度设置、推理逻辑等，让开发者无需关注模型底层细节，直接调用即可实现文本相关性打分）。

使用 `FlagReranker` 加载 `BAAI/bge-reranker-v2-m3`，**核心只需安装 `FlagEmbedding` 包**，该包会自动依赖安装模型运行所需的 PyTorch、Transformers、Sentence-Transformers 等底层依赖，无需手动逐个安装。

```cmd
# 基础安装（官方源，国内可替换为清华/阿里镜像）
uv add FlagEmbedding

# 国内镜像提速安装（推荐，解决下载慢问题）
uv add FlagEmbedding -i https://pypi.tuna.tsinghua.edu.cn/simple
```

准备配置文件 `.env`

> [!IMPORTANT]
> **💻 Windows 与 macOS 因系统硬件差异而产生的参数配置说明：**
>
> 1. **模型本地路径 (`BGE_RERANKER_LARGE`)**：
     >    * **Windows**：常以盘符开头，如 `D:\models\BAAI\bge-reranker-v2-m3`。
>    * **macOS**：必须使用类 Unix 的绝对路径，如 `/Users/jerry/Desktop/AI/rag_agent/models/BAAI/bge-reranker-v2-m3`。
> 2. **硬件运行设备 (`BGE_RERANKER_DEVICE`)**：
     >    * **Windows / Linux**：若有 NVIDIA 独立显卡，应设为 `cuda:0` 或 `cuda`；无显卡则回退到 `cpu`。
>    * **macOS**：针对 Apple Silicon (M1/M2/M3 系列芯片)，使用 **`mps`**（Metal Performance Shaders）进行物理显卡硬件加速推理；若为 Intel 芯片的旧款 Mac，则设为 `cpu`。
> 3. **半精度推理开关 (`BGE_RERANKER_FP16`)**：
     >    * **Windows / Linux**：英伟达 CUDA 核心原生完美支持 FP16 计算，设为 `1` (True) 可大幅降低显存占用并提升近一倍的检索速度。
>    * **macOS**：由于 PyTorch 的 MPS 驱动层在当前版本下对半精度浮点算子（Half-precision）的支持存在兼容性限制，开启 FP16 极易抛出 `RuntimeError: "LayerNormKernelImpl" not implemented for 'Half'` 等运行时异常。因此在 Mac 环境下**必须设为 `0` (False)**，采用标准的单精度 FP32 推理以确保程序 100% 稳定运行。

```ini
# 重排序模型配置（指向本地绝对路径）
BGE_RERANKER_LARGE=/Users/jerry/Desktop/AI/rag_agent/models/BAAI/bge-reranker-v2-m3
# Mac 芯片下使用 mps 进行显卡硬件加速，NVIDIA 显卡下使用 cuda:0，无显卡使用 cpu
BGE_RERANKER_DEVICE=mps
# 是否开启半精度推理（Mac MPS 硬件加速下建议关闭，设为 0，防止算子报错；Windows CUDA 下建议设为 1）
BGE_RERANKER_FP16=0
```

加载配置参数

位置：`app/conf/reranker_config.py`

```python
# 导入核心依赖：数据类、环境变量读取、路径处理
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# 提前加载.env配置文件（保持和原代码一致，只需执行一次）
load_dotenv()

@dataclass
class RerankerConfig:
    bge_reranker_large: str    # 本地模型路径
    bge_reranker_device: str   # 模型硬件运行设备
    bge_reranker_fp16: bool    # 是否开启半精度（1=True/0=False）

# 实例化配置对象，和原代码lm_config风格保持一致
reranker_config = RerankerConfig(
    bge_reranker_large=os.getenv("BGE_RERANKER_LARGE"),
    bge_reranker_device=os.getenv("BGE_RERANKER_DEVICE"),
    # 特殊处理：将.env中的1/0转为布尔值，兼容常见的数字/字符串格式
    reranker_config_fp16=os.getenv("BGE_RERANKER_FP16") in ("1", "True", "true", 1)
)
```

定义工具方法（位置：`app/lm/reranker_utils.py`）

```python
from FlagEmbedding import FlagReranker
from app.conf.reranker_config import reranker_config

_reranker_model = None

def get_reranker_model():
    global _reranker_model  
    if _reranker_model is None:
        # FlagReranker 会在此处根据配置自动进行设备转移与显存分配
        _reranker_model = FlagReranker(
            model_name_or_path=reranker_config.bge_reranker_large,
            device=reranker_config.bge_reranker_device,
            use_fp16=reranker_config.bge_reranker_fp16  # macOS环境在此处传入 False
        )
    return _reranker_model
```

**了解两种主流远程仓库配置示例**

示例 1：从**Hugging Face Hub**加载（官方源，模型标识：`BAAI/bge-reranker-v2-m3`）

```python
from FlagEmbedding import FlagReranker

# 直接指定Hugging Face仓库标识，自动远程下载+缓存
model = FlagReranker(
    model_name_or_path="BAAI/bge-reranker-v2-m3",  # HF远程模型标识
    device="mps",      # macOS 平台加速标识为 mps，Windows/Linux 为 cuda
    use_fp16=False     # macOS 平台建议设为 False
)
```

示例 2：从**魔搭 ModelScope**加载（国内源，模型标识：`BAAI/bge-reranker-v2-m3`）

魔搭上的 BGE 重排序模型标识可以直接和 HF 保持一致，国内网络下载速度更快：

```python
from FlagEmbedding import FlagReranker

# 直接指定魔搭远程模型标识，国内自动提速下载
model = FlagReranker(
    model_name_or_path="BAAI/bge-reranker-v2-m3",  # 魔搭/HF远程模型标识
    device="mps",      # macOS 平台为 mps
    use_fp16=False     # macOS 平台为 False
)
```

远程模型的本地缓存路径

首次远程下载的模型会自动保存到以下默认缓存目录，后续调用直接加载：

- Windows：`C:\Users\你的用户名\.cache\FlagEmbedding`
- Linux/Mac：`~/.cache/FlagEmbedding`

##### 9.6.4.2 导入与常量定义

```python
import sys
from app.utils.task_utils import *

from dotenv import load_dotenv
import sys
from app.lm.reranker_utils import get_reranker_model
from app.utils.task_utils import add_running_task

load_dotenv()

# -----------------------------
# Rerank / TopK 全局常量（不从 state 读取）
# -----------------------------
# 动态 TopK 硬上限：最多取前 N 条（<=10）
RERANK_MAX_TOPK: int = 10
# 最小 TopK：至少保留前 N 条（>=1，且 <= RERANK_MAX_TOPK）
RERANK_MIN_TOPK: int = 1
# 断崖阈值（相对）
RERANK_GAP_RATIO: float = 0.25
# 断崖阈值（绝对）
RERANK_GAP_ABS: float = 0.5
```

##### 9.6.4.3 节点主流程 (`node_rerank`)

```python
# Rerank节点（工作流入口）
def node_rerank(state):
  """
  Rerank节点
  对检索到的文档进行重新排序，提高相关性
  """
  print("---Rerank---")
  add_running_task(state["session_id"], sys._getframe().f_code.co_name, state.get("is_stream"))

  # 阶段一：合并文档
  doc_items = step_1_merge_docs(state)
  # 阶段二：对文档进行重排序
  scored_docs = step_2_rerank_docs(state, doc_items)
  # 阶段三：动态 TopK
  topk_docs = step_3_topk(scored_docs)
  print("最终文档:",  topk_docs )

  add_done_task(state['session_id'], sys._getframe().f_code.co_name, state.get("is_stream"))
  return {"reranked_docs": topk_docs}
```

##### 9.6.4.4 **合并文档 (`step_1_merge_docs`)**

```python
def step_1_merge_docs(state):
    """
    阶段一：文档合并与标准化
    
    目标：将多路召回（本地知识库 + 联网搜索）的异构数据，统一合并为 Reranker 模型可处理的标准格式。
    
    输入来源：
    1. rrf_chunks (List[Dict]): 本地知识库检索结果（经 RRF 融合排序）。
       - 结构：包含 Milvus entity 信息的复杂字典或对象。
       - 关键字段：chunk_id, content, title/item_name。
    2. web_search_docs (List[Dict]): 联网搜索结果（经 MCP 搜索返回）。
       - 结构：包含搜索摘要的扁平字典。
       - 关键字段：snippet, title, url。
       
    输出结果 (List[Dict]):
    - 标准化文档列表，每项包含：
      - text: 用于重排序的核心文本（content 或 snippet）
      - title: 标题（用于增强语义或展示）
      - doc_id/chunk_id: 唯一标识（本地文档有，联网文档为 None）
      - url: 来源链接（本地为空，联网文档有）
      - source: 来源标记 ("local" 或 "web")
    """
    
    # 1. 提取输入源
    rrf_docs = state.get("rrf_chunks") or []
    web_docs = state.get("web_search_docs") or []
    
    logger.info(f"Step 1: 开始合并文档 - 本地RRF源: {len(rrf_docs)}条, 联网Web源: {len(web_docs)}条")
    doc_items = []
    # ---------------------------------------------------------
    # 2. 处理本地知识库文档 (rrf_chunks)
    # ---------------------------------------------------------
    for i, doc in enumerate(rrf_docs):
        # 兼容性处理：优先取 'entity' 字段（防守式编程），若无则视为 doc 本身即 entity
        entity = doc.get("entity") if isinstance(doc, dict) and "entity" in doc else doc
        
        # 提取核心文本 (content)，这是重排序的依据
        if not isinstance(entity, dict):
            logger.warning(f"本地文档格式异常 (index={i}): {type(entity)}")
            continue
            
        content = entity.get("content")
        if not content:
            logger.debug(f"跳过无内容文档 (index={i}, keys={list(entity.keys())})")
            continue

        # 提取元数据 (使用 .get 链式回退)
        doc_id = entity.get("chunk_id") or entity.get("id")
        title = entity.get("title") or entity.get("item_name") or ""

        # 组装标准化对象
        doc_items.append({
            "text": content,
            "doc_id": doc_id,
            "chunk_id": doc_id,  # 兼容旧逻辑
            "title": title,
            "url": "",
            "source": "local",
        })

    # ---------------------------------------------------------
    # 3. 处理联网搜索文档 (web_search_docs)
    # ---------------------------------------------------------
    for i, doc in enumerate(web_docs):
        text = (doc.get("snippet") or doc.get("content") or "").strip()
        url = (doc.get("url") or "").strip()
        title = (doc.get("title") or "").strip()
        
        if not text:
            logger.debug(f"跳过无内容联网结果 (index={i})")
            continue
            
        doc_items.append({
            "text": text,
            "doc_id": None,
            "chunk_id": None,
            "title": title,
            "url": url,
            "source": "web",
        })

    logger.info(f"Step 1: 文档合并完成，共输出 {len(doc_items)} 条标准化文档")
    return doc_items
```

##### **9.6.4.5 重排序 (`step_2_rerank_docs`)**

```python
def step_2_rerank_docs(state, doc_items):
    """
    阶段二：对文档进行重排序
    - 输入 doc_items：[{ text,doc_id}, ...]
    - 输出：按 score 降序的标准化文档字典列表
    """
    question = state.get("rewritten_query") or state.get("original_query") or ""

    if not doc_items or not question:
        logger.warning("Step 2: 跳过重排序 (无文档或无问题)")
        return []

    logger.info(f"Step 2: 开始重排序 (Rerank), 待排序文档数: {len(doc_items)}")
    
    texts = [x["text"] for x in doc_items]
    try:
        reranker = get_reranker_model()

        # 格式：列表，每个元素是二元元组 / 列表，严格遵循 (query, passage) 顺序
        sentence_pairs = [[question, t] for t in texts]
        logger.info("Step 2: 正在计算相关性得分...")
        scores = reranker.compute_score(sentence_pairs)
        
        scored_docs = []
        for item, text, score in zip(doc_items, texts, scores):
            score_val = float(score)
            scored_docs.append(
                {
                    "text": text,
                    "score": score_val,
                    "source": item.get("source") or "",
                    "chunk_id": item.get("chunk_id"),
                    "doc_id": item.get("doc_id"),
                    "url": item.get("url") or "",
                    "title": item.get("title") or "",
                }
            )
        # 按分数降序排序
        scored_docs.sort(key=lambda x: x["score"], reverse=True)
        return scored_docs
    except Exception as e:
        logger.error(f"Step 2: 重排序过程发生异常: {e}", exc_info=True)
        # 异常降级兜底
        fallback_docs = [
            {
                "text": x.get("text"),
                "score": 0.0,
                "source": x.get("source") or "",
                "chunk_id": x.get("chunk_id"),
                "doc_id": x.get("doc_id"),
                "url": x.get("url") or "",
                "title": x.get("title") or "",
            }
            for x in doc_items
        ]
        return fallback_docs
```

##### **9.6.4.6 动态 TopK (`step_3_topk`)**

```python
def step_3_topk(scored_docs):
    """
    阶段三：动态 TopK
    基于得分断崖过滤非相关切片，保留高置信度集合
    """
    max_topk = min(RERANK_MAX_TOPK, len(scored_docs))
    min_topk = RERANK_MIN_TOPK
    gap_ratio = RERANK_GAP_RATIO
    gap_abs = RERANK_GAP_ABS

    topk = max_topk
    if topk > min_topk:
        # 遍历 i 从 min_topk - 1 到 max_topk - 2
        for i in range(min_topk - 1, max_topk - 1):
            s1 = scored_docs[i].get("score")
            s2 = scored_docs[i + 1].get("score")

            gap = s1 - s2
            rel = gap / (abs(s1) + 1e-6)
            
            # 判断断崖：绝对差大于值，或变化比例大于相对比例
            if gap >= gap_abs or rel >= gap_ratio:
                logger.info(f"Step 3: 触发断崖截断 @ index={i} (Score {s1:.4f} -> {s2:.4f}, Gap={gap:.4f})")
                topk = i + 1
                break

    topk_docs = scored_docs[:topk]
    logger.info(f"Step 3: 截断完成，保留前 {len(topk_docs)} 条文档 (TopK={topk})")
    
    if topk_docs:
        preview = ", ".join([f"{d.get('chunk_id') or 'Web'}({d.get('score'):.3f})" for d in topk_docs[:3]])
        logger.debug(f"Step 3: Top3 文档预览: {preview}")
        
    return topk_docs
```

##### **9.6.4.7 节点主流程测试 (`node_rerank`)**

```python
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print(">>> 启动 node_rerank 本地测试")
    print("=" * 50)

    # 1. 模拟数据
    # 1.1 RRF 本地文档数据
    mock_rrf_chunks = [
        {"entity":{"chunk_id": "local_1", "content": "RRF是一种倒数排名融合算法", "title": "算法介绍", "score": 0.9}},
        {"entity":{"chunk_id": "local_2", "content": "BGE是一个强大的重排序模型", "title": "模型介绍", "score": 0.8}},
        {"entity":{"chunk_id": "local_3", "content": "无关的测试文档内容", "title": "测试文档", "score": 0.1}}  # 预期低分
    ]

    # 1.2 MCP 联网搜索数据
    mock_web_docs = [
        {"title": "Rerank技术详解", "url": "http://web.com/1", "snippet": "Rerank即重排序，常用于RAG系统的第二阶段"},
        {"title": "无关网页", "url": "http://web.com/2", "snippet": "今天天气不错，适合出去游玩"}  # 预期低分
    ]

    mock_state = {
        "session_id": "test_rerank_session",
        "rewritten_query": "什么是RRF和Rerank？",  # 查询意图
        "rrf_chunks": mock_rrf_chunks,
        "web_search_docs": mock_web_docs,
        "is_stream": False
    }

    try:
        # 运行节点
        result = node_rerank(mock_state)
        reranked = result.get("reranked_docs", [])

        print("\n" + "=" * 50)
        print(">>> 测试结果摘要:")
        print(f"输入文档总数: {len(mock_rrf_chunks) + len(mock_web_docs)}")
        print(f"输出文档总数: {len(reranked)}")
        print("-" * 30)

        print("最终排名:")
        for i, doc in enumerate(reranked, 1):
            print(f"Rank {i}: Source={doc.get('source')}, Score={doc.get('score'):.4f}, Text={doc.get('text')[:20]}...")

        top1_score = reranked[0].get("score")
        if top1_score > 0:
            print("\n[PASS] Rerank 打分正常")
        else:
            print("\n[FAIL] Rerank 打分异常 (均为0或负数)")

        print("=" * 50)

    except Exception as e:
        logger.exception(f"测试运行期间发生未捕获异常: {e}")
```
