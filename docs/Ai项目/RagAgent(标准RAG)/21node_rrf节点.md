---
title: 结果融合重排（node_rrf）
date: 2026-07-08
abstract: 对同源数据进行rrf重排
tags:
- Ai实战项目
---

## 9. 检索数据节点实现与测试

### 9.5 结果融合重排（node_rrf）

#### RRF介绍

融合重排 (Reciprocal Rank Fusion) 做**去重+融合打分**，输出一个统一的 TopN 列表 `rrf_chunks` 供后续回答/重排使用。

**目标**：为多路召回的同一数据源（向量数据库两路）的切片进行排序筛选。

**核心策略**：就是把统一切片每一路排名的倒数和该路权重相乘作为累加起来，然后把多路的切片汇总排序截取前 n 名。

也就是说出现次数越多分越高，排名越高分越多，该路权重越大分越高。

**核心代码：**

`score_map.get(chunk_id, 0.0) + 1.0 / (k + pos) * weight`

**其中**：

*   `score_map` 保存每个切片的累计分数。
*   `pos` 就是该路的当前排名。
*   `weight` 是该路的权重。
*   `k` 是一个衰减系数，越小则排名越重要，越大则出现次数越重要，这里默认值为 60，则偏大认为多次出现更加重要。

**处理流程**

**1）获取上游检索节点返回的文档**

**2）为不同来源设置权重**

#### 节点代码实现

##### 步骤1：导入基础依赖

```python
import sys
from typing import List, Dict, Any
from app.utils.task_utils import add_running_task, add_done_task
from app.core.logger import logger
```

##### 步骤2：主流程编写

```python
# ================================
# LangGraph RRF 融合节点
# 功能：接收多路向量检索结果 → 统一格式 → 加权融合 → 输出最终排序列表
# ================================
def node_rrf(state):
    """
    RRF (Reciprocal Rank Fusion) 倒数排名融合节点

    功能：
    将来自不同检索源（如 Embedding 检索、HyDE 检索、知识图谱检索等）的结果进行融合排序。
    RRF 是一种无需训练的算法，仅根据文档在不同列表中的排名来计算最终得分。

    步骤：
    1. 提取各路检索结果：从 state 中获取 embedding_chunks 和 hyde_embedding_chunks。
    2. 结果标准化：将不同格式的检索结果统一转换为包含 chunk_id 的实体列表。
    3. 设置权重：为不同来源分配权重（当前配置：Embedding=1.0, HyDE=1.0）。
    4. 执行 RRF：计算融合分数并重新排序。
    5. 结果截断：保留 Top K 个结果。
    6. 更新状态：将融合后的结果存入 state["rrf_chunks"]。
    """
    logger.info("---RRF (倒数排名融合) 开始处理---")
    add_running_task(state["session_id"], sys._getframe().f_code.co_name, state.get("is_stream"))

    # ==============================================
    # 步骤1：从 state 取出两路召回结果
    # ==============================================
    embedding_chunks = _as_entity_list(state.get("embedding_chunks"))
    hyde_embedding_chunks = _as_entity_list(state.get("hyde_embedding_chunks"))

    logger.info(f"RRF 输入统计: Embedding源={len(embedding_chunks)}条, HyDE源={len(hyde_embedding_chunks)}条")

    # Debug：打印前5条ID便于核对
    if embedding_chunks:
        logger.debug(f"Embedding源 chunk_ids (前5个): {[c.get('chunk_id') for c in embedding_chunks[:5]]}")
    if hyde_embedding_chunks:
        logger.debug(f"HyDE源 chunk_ids (前5个): {[c.get('chunk_id') for c in hyde_embedding_chunks[:5]]}")

    # ==============================================
    # 步骤2：配置多路权重（可根据业务调整）
    # ==============================================
    source_weights = [
        (embedding_chunks, 1.0),
        (hyde_embedding_chunks, 1.0)
    ]

    # ==============================================
    # 步骤3：执行 RRF 融合排序
    # ==============================================
    rrf_res = reciprocal_rank_fusion(source_weights, k=60, max_results=10)

    # ==============================================
    # 步骤4：提取最终文档列表
    # ==============================================
    rrf_chunks = [doc for doc, score in rrf_res]

    # 任务完成标记
    add_done_task(state['session_id'], sys._getframe().f_code.co_name, state.get("is_stream"))

    # 把融合结果存入 state
    return {"rrf_chunks": rrf_chunks}
```

##### 步骤3：编写解析向量数据库结果函数

```python
# ================================
# 工具函数：统一格式化检索结果
# 功能：将不同来源（Milvus Hit/字典/自定义对象）统一转为标准实体列表
# ================================
def _as_entity_list(state_list) -> List[Dict[str, Any]]:
    """
    将上游节点输出统一规整为 entity dict 列表。
    兼容：
    - dict: {"entity": {..属性名和对应的字.}, "distance": ...} 或直接就是 {...}
    - pymilvus Hit: 不是 dict，但通常支持 hit.get("entity") 或 hit.entity
    - 其他：当作 chunk_id
    """
    out: List[Dict[str, Any]] = []
    for doc in (state_list or []):
        if not doc:
            continue

        final_ent = {}

        # ==============================================
        # 情况A：处理 Milvus 返回的 Hit 对象（含 entity、id、distance）
        # ==============================================
        if hasattr(doc, "entity") and hasattr(doc, "id"):
            # 提取 entity 内容（支持对象转字典 / 直接是字典）
            entity_content = doc.entity
            if hasattr(entity_content, "to_dict"):
                final_ent = entity_content.to_dict()
            elif isinstance(entity_content, dict):
                final_ent = entity_content.copy()
            else:
                # 尝试强转字典，兼容不同 SDK 版本
                try:
                    final_ent = dict(entity_content)
                except:
                    pass

            # 补充唯一 ID（优先用内部 chunk_id，没有则补外层 id）
            if "id" not in final_ent and "chunk_id" not in final_ent:
                final_ent["id"] = doc.id

            # 补充相似度分数
            if hasattr(doc, "distance"):
                final_ent["score"] = doc.distance

        # ==============================================
        # 情况B：doc 已经是字典（模拟数据 / 已格式化数据）
        # ==============================================
        elif isinstance(doc, dict):
            # 子情况：字典嵌套 entity 结构 {entity:{...}, id:...}
            if "entity" in doc:
                ent = doc["entity"]
                if isinstance(ent, dict):
                    final_ent = ent.copy()
                # 补充 ID 和分数
                if "id" in doc and "id" not in final_ent:
                    final_ent["id"] = doc["id"]
                if "distance" in doc:
                    final_ent["score"] = doc["distance"]
            else:
                # 扁平字典，直接使用
                final_ent = doc

        # ==============================================
        # 情况C：支持 .get() 方法的其他对象
        # ==============================================
        elif hasattr(doc, "get"):
            ent = doc.get("entity") or doc
            if isinstance(ent, dict):
                final_ent = ent

        # 只保留合法非空字典
        if final_ent and isinstance(final_ent, dict):
            out.append(final_ent)

    return out
```

##### 步骤4：通用带权重的RRF算法实现

该代码实现的是**带权重的倒数排名融合（Reciprocal Rank Fusion, RRF）** 算法，核心作用是将**多个不同来源的文档排序结果**，结合各来源的权重进行融合，最终输出一个综合所有来源排序信息、按融合得分降序排列的统一文档列表，解决多来源排序结果的融合与重排序问题。

输入参数

1. source_weights：核心输入，列表类型，每个元素是(来源文档列表, 权重)的元组。其中：
    - 来源文档列表：单个来源对文档的排序结果（有序，靠前的文档在该来源中相关性更高）；
    - 权重：该来源的重要性系数（权重越高，该来源的排序结果对最终融合的影响越大）。
2. `k`：RRF 算法专属常数（默认 60），用于平衡文档排名对得分的影响，避免排名过前的文档得分无限制偏高，是 RRF 的标准超参数。
3. `max_results`：可选参数，限制最终返回的文档数量，`None`表示返回全部融合结果。

输出结果

列表类型，每个元素是`(文档对象, RRF融合得分)`的元组，**按融合得分降序排列**，得分越高表示文档在综合所有来源后的相关性越强。

```python
# ================================
# RRF 核心算法：倒数排序融合
# 作用：把多路召回结果按排名加权融合，自动去重、重新排序
# ================================
def reciprocal_rank_fusion(
        source_weights: list,
        k: int = 60,
        max_results: int = None,
) -> List[tuple]:
    """
    通用带权重的RRF算法实现
    :param source_weights:  列表，每个元素是(来源文档列表, 权重)的元组
                            例如: [([doc1, doc2], 1.0), ([doc2, doc3], 0.8)]
    :param k:     RRF 常数，默认 60。用于平滑排名影响，避免高排名文档占据过大优势。
    :param max_results: 只返回前 N 个，None 表示全部
    :return:      [(元素, RRF 得分), ...] 按得分降序排列
    """
    # 存储每个文档的总得分
    score_map = {}
    # 存储每个文档完整内容
    chunk_map = {}

    # ==============================================
    # 遍历每一路召回结果，计算 RRF 分数
    # ==============================================
    for docs, weight in source_weights:
        # rank 从 1 开始（第一名=1，第二名=2...）
        for rank, item in enumerate(docs, start=1):
            # 获取文档唯一标识（chunk_id 优先，否则用 id）
            chunk_id = item.get("chunk_id") or item.get("id")

            if not chunk_id:
                logger.warning(
                    f"RRF Warning: item missing chunk_id/id: {list(item.keys()) if isinstance(item, dict) else item}")
                continue

            # ====================
            # RRF 公式核心
            # score += 权重 * (1 / (k + rank))
            # ====================
            score_map[chunk_id] = score_map.get(chunk_id, 0.0) + weight * (1.0 / (k + rank))

            # 只保存第一次出现的文档（去重）
            chunk_map.setdefault(chunk_id, item)
    # ==============================================
    # 按 RRF 总分排序
    # ==============================================
    merged = []
    for chunk_id, score in score_map.items():
        doc_item = chunk_map[chunk_id]
        merged.append((doc_item, score))

    # 得分从高到低排序
    merged.sort(key=lambda x: x[1], reverse=True)

    # 截断最多返回 N 条
    if max_results is not None:
        merged = merged[:max_results]

    return merged
```

**关键细节：**

1. 排名`pos`从 1 开始：符合实际排序逻辑（第 1 名、第 2 名...），而非程序默认的 0 索引；
2. 唯一标识`chunk_id`：作为文档的 “唯一键”，实现**跨来源的文档匹配**（不同来源的同一文档，通过`chunk_id`累计得分）；
3. 核心得分公式：1.0 / (k + pos) * weight
    - 基础项`1/(k+pos)`：RRF 算法的核心，排名越靠前（pos 越小），该项值越大，且通过`k`平滑排名的影响（避免 pos=1 时得分过大）；
    - 权重项`* weight`：实现 “带权重融合”，重要来源的排序结果，对文档最终得分的贡献成比例放大。
4. 得分累加逻辑：同一文档出现在多个来源中，或在单个来源中出现多次（极少情况），其得分会通过`score_map.get(chunk_id, 0.0)`持续累加。

**`k` 的核心作用**

`k` 是 RRF 算法的**核心超参数**（行业通用默认值 60，也可根据业务调整），**核心作用是对排名的影响做「平滑 / 缓冲」，避免排名的微小差异导致得分剧烈波动，同时防止极端值（如 pos=1）主导总得分**，具体解决 2 个关键问题：

问题 1：避免`pos=1`时得分无限制偏高，压制其他来源的贡献

* 如果没有`k`，公式会变成`1/pos`，此时：pos=1：得分 = 1.0；pos=2：得分 = 0.5；pos=3：得分≈0.33；

  第 1 名的得分是第 2 名的 2 倍、第 3 名的 3 倍，单个来源的第 1 名会直接主导总得分，其他来源的排名信息几乎被忽略，失去 “多来源融合” 的意义。

* 加入`k=60`后，公式为`1/(60+pos)`：pos=1：≈0.0164；pos=2：≈0.0162；pos=3：≈0.0160；

​		前几名的得分差异被大幅缩小，单个来源的排名无法独断总得分，必须结合多个来源的排名才能获得高总得		分，符合多来源融合的核心目标。

问题 2：平衡排名的 “边际效应”，让排名靠后的文档也有合理贡献

* 没有`k`时，排名靠后的文档得分会快速趋近于 0（如`pos=100`，`1/100=0.01`），几乎没有贡献；

* 加入`k=60`后，`pos=100`的得分 = 1/(60+100)=0.00625，与`pos=50`的得分（1/110≈0.0091）差异更小，**排名靠后的文档仍能为总得分提供合理贡献**，避免直接被 “抛弃”。

简单总结`k`的作用：**让排名对得分的影响更 “温和”，保证多来源排名信息都能有效参与融合，而非少数高排名文档垄断得分**。

#### 主流程测试

```python
# ================================
# 本地测试入口
# ================================
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print(">>> 启动 node_rrf 本地测试")
    print("=" * 50)

    mock_state = {
        "session_id": "test_rrf_session",
        "is_stream": False,
        "original_query": "HAK 180 烫金机怎么操作？",
        "rewritten_query": "HAK 180 烫金机的具体操作步骤是什么？",
        "item_names": ["HAK 180 烫金机"]
    }

    try:
        from app.query_process.agent.nodes.node_search_embedding import node_search_embedding
        from app.query_process.agent.nodes.node_search_embedding_hyde import node_search_embedding_hyde

        emb_res = node_search_embedding(mock_state)
        hyde_res = node_search_embedding_hyde(mock_state)
        mock_state['embedding_chunks'] = emb_res.get("embedding_chunks") or []
        mock_state['hyde_embedding_chunks'] = hyde_res.get("hyde_embedding_chunks") or []

        result = node_rrf(mock_state)
        rrf_chunks = result.get("rrf_chunks", [])

        emb_cnt = len(mock_state.get("embedding_chunks") or [])
        hyde_cnt = len(mock_state.get("hyde_embedding_chunks") or [])

        print("\n" + "=" * 50)
        print(">>> 测试结果摘要:")
        print(f"输入数量: Embedding={emb_cnt}, HyDE={hyde_cnt}")
        print(f"输出数量: {len(rrf_chunks)}")
        print("-" * 30)

        print("最终排名:")
        for i, doc in enumerate(rrf_chunks, 1):
            doc_id = doc.get("chunk_id") or doc.get("id")
            content = (doc.get("content") or "")[:20]
            print(f"Rank {i}: ID={doc_id}, Content={content}...")

        print("=" * 50)

    except Exception as e:
        logger.exception(f"测试运行期间发生未捕获异常: {e}")
```

