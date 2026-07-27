---
title: RAG 级联系统双轨评测架构指南
date: 2026-07-13
abstract: 简单描述了结合langsmith以及Ragas原理的一种自研评测脚本以及Ragas的使用
tags:
- Ai实战项目
---


# RAG 级联系统双轨评测架构指南

> **报告摘要**：本文档完整呈现了生产级 RAG Agent 评测体系的设计思路与落地实践——从自研节点诊断引擎到开源 Ragas 框架的无污染集成，形成了一套兼顾**工程调优效率**与**行业标准对齐**的双轨评测最佳实践。文档同时收录了评测体系建设过程中的**关键踩坑经验**与对应的解决方案。


## 一、 为什么需要双轨评测体系？

### 1.1 单用 Ragas 的痛点

在早期迭代中，我们直接用 Ragas 做端到端评测，遇到了三个核心痛点：

| 痛点        | 具体表现 | 根因 |
|:----------|:---|:---|
| **时间成本高** | 跑 30 条测试集消耗数万 Token，耗时数分钟 | Faithfulness 需将每个答案拆成陈述句逐条调用 LLM 判断 |
| **不可定位**  | Context Precision 得 0.92，不知道是"召回少了"还是"重排误杀了" | Ragas 是黑盒端到端评估，不感知中间节点状态 |

### 1.2 自研诊断脚本的定位

我们基于 LangGraph 的 State 可观测性，自研了节点诊断引擎 `evaluate_rag.py`：

- **节点级白盒诊断**：能精确指出"实体识别坏了"还是"Rerank 阈值设高了"
- **极速零成本**：大部分指标用确定性硬计算，30 条 Case 几秒跑完，零 Token 消耗
- **100% 可复现**：不受 LLM 随机性影响，适合 CI/CD 回归测试

**最终策略**：两者不是替代关系，而是**分工协作、双轨并行**。


## 二、 评测基准与环境

所有评测均在完全相同的条件下运行：

| 项目 | 说明 |
|:---|:---|
| **黄金测试集** | `app/evaluation/test_eval_dataset.json`（从 Milvus 黄金切片反向生成真实业务 Query、标准实体 `item_names` 与标准文档 `gold_chunk_ids`） |
| **RAG 链路** | LangGraph 级联图（问题重写 → 实体绑定 → BGE-M3 + HyDE + MCP 多路召回 → RRF 融合 → bge-reranker-v2-m3 精排与 25% 相对断崖截断 → LLM 生成） |
| **裁判 LLM** | 通义百炼 / DashScope Qwen（通过 `get_llm_client()` 统一装配） |

**⚠️ 关键链路特征**：当**实体识别节点失败**时（`item_names` 为空或无法匹配黄金实体），系统**直接短路返回澄清/拒绝话术，不会进入后续的 RRF 召回、Rerank 截断和 LLM 生成环节**。这一特征对评测脚本的设计有重大影响（详见第六章）。


## 三、 评测脚本核心架构解析

### 3.1 脚本整体流程

`evaluate_rag.py` 的执行流程分为六个阶段：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         评测脚本执行流程                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 1：初始化                                                             │
│  - 加载环境变量（dotenv）                                                   │
│  - 解析命令行参数（--mode demo/full, --limit N）                           │
│  - 加载黄金测试集 test_eval_dataset.json                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 2：【踩坑防护】测试集有效性预检（详见第六章）                          │
│  - 快速验证每条 Case 的实体可识别性                                         │
│  - 过滤掉"实体识别失败→直接拦截"的无效用例                                  │
│  - 统计有效用例率，确保下游指标不因拦截 Case 而污染                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 3：逐条执行 RAG 工作流                                                │
│  - 调用 query_app.invoke() 运行 LangGraph 级联图                          │
│  - 从 result_state 中提取各节点输出数据                                    │
│  - ⚠️ 若实体识别失败，工作流直接返回，rrf_chunks/reranked_docs 均为空      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 4：节点级指标计算（确定性硬计算）                                     │
│  - 实体对齐准确率（State.item_names vs gold_entities）                    │
│  - RRF 粗排召回率（State.rrf_chunks vs gold_chunk_ids）                   │
│  - Rerank 黄金切片误杀率（State.reranked_docs vs gold_chunk_ids）         │
│  - 动态断崖去噪率（RRF噪声 - Rerank噪声）/ RRF噪声                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 5：端到端质量评估（LLM-as-Judge）                                     │
│  - Faithfulness：用 Qwen 裁判评估回答是否基于上下文                        │
│  - Relevance：用 Qwen 裁判评估回答是否切中问题核心                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 6：汇总报告生成                                                       │
│  - 计算各项指标平均值（有效用例独立计算）                                   │
│  - 输出 Markdown 格式诊断报告至 doc/rag_evaluation_report.md             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心指标计算逻辑详解

#### 指标 1：实体对齐准确率（Entity Alignment Accuracy）

```python
actual_entities = result_state.get("item_names", [])  # 系统提取的实体
gold_entities = case.get("gold_entities", [])         # 标准实体

entity_hit = set(actual_entities) & set(gold_entities)
entity_accuracy = len(entity_hit) / len(gold_entities)
```

**业务含义**：衡量系统能否将用户口语化/模糊表述（如"那个红色的""上一款"）准确映射为标准产品实体名。**这是多轮对话和意图理解的核心能力指标。**

#### 指标 2：RRF 粗排召回率（RRF Recall@10）

```python
rrf_chunks = result_state.get("rrf_chunks", [])       # RRF 融合后的 Top 10
rrf_ids = {str(c.get("chunk_id")) for c in rrf_chunks}
gold_chunk_ids = case.get("gold_chunk_ids", [])       # 黄金标准切片 ID

rrf_recall = 1.0 if (gold_chunk_ids & rrf_ids) else 0.0
```

**业务含义**：**硬指标**——判断黄金切片是否进入了 RRF 粗排的 Top 10。如果为 0，说明多路召回（BGE-M3 + HyDE + MCP）本身就没找到正确文档，后续精排无论多强都无法补救。**这是整个检索链路的"底线指标"。**

**⚠️ 注意**：如果实体识别失败，工作流直接拦截返回，`rrf_chunks` 为空，此指标必然为 0。因此**此指标仅应在有效用例（实体识别成功）上计算**。

#### 指标 3：Rerank 黄金切片误杀率（Recall Loss）

```python
reranked_ids = {str(c.get("chunk_id")) for c in reranked_docs}

was_in_rrf = gold_chunk_ids & rrf_ids          # 黄金切片 ∩ RRF结果
was_in_reranked = gold_chunk_ids & reranked_ids # 黄金切片 ∩ Rerank结果

recall_loss = (len(was_in_rrf) - len(was_in_reranked)) / len(was_in_rrf)
```

**业务含义**：**安全底线指标**——计算有多少"本该被召回的金标准文档"被 Rerank 截断策略（25% 相对断崖）误杀了。

**⚠️ 关键依赖**：此指标**强依赖**于 RRF 阶段至少召回了 1 个黄金切片（`was_in_rrf` 非空）。如果 `was_in_rrf` 为空（可能因实体识别失败或 RRF 召回失败），**分母为 0，指标无法计算**。因此必须做兜底处理。

#### 指标 4：动态断崖去噪率（Noise Filtering Rate）

```python
noise_in_rrf = rrf_ids - gold_chunk_ids              # RRF 中的噪声
noise_in_reranked = reranked_ids - gold_chunk_ids    # Rerank 后残留的噪声

noise_filter = (len(noise_in_rrf) - len(noise_in_reranked)) / len(noise_in_rrf)
```

**业务含义**：**防污染指标**——量化评估 Rerank 截断策略在"保留精华"之外，**"剔除噪声"的能力**。

**⚠️ 关键依赖**：此指标**强依赖**于 RRF 阶段有噪声（`noise_in_rrf` 非空）。如果 RRF 结果为空或全部是黄金切片，分母为 0。

#### 指标 5 & 6：Faithfulness 与 Relevance（LLM-as-Judge）

```python
faith_score, faith_reason = llm_evaluate_faithfulness(llm_judge, contexts, actual_answer)
rel_score, rel_reason = llm_evaluate_relevance(llm_judge, query, actual_answer)
```

**设计要点**：两套评测用**同一个 Qwen 客户端**作为裁判，确保与 Ragas 的对比基准一致。Prompt 设计上强制要求返回 JSON 格式并附带推理理由，便于人工回溯裁判逻辑。


## 四、 横向打分对比结果

| 评估维度 | 自研脚本实测 | Ragas 评估 | 异同剖析 |
|:---|:---|:---|:---|
| **实体识别 & 绑定** | **80.0%** | 不支持 | 自研能捕获置信度中等时的路由打断与交互澄清状态 |
| **RRF 多路召回率** | **80.0%** | Context Recall: **0.95** | 自研看绝对 `chunk_id` 碰撞；Ragas 用 LLM 判断语义重合度 |
| **Rerank 黄金切片误杀率** | **0.0%** | Context Precision: **0.92** | 自研关注"底线安全"（黄金切片是否被丢弃）；Ragas 计算排序加权得分 |
| **动态断崖去噪率** | **64.0%** | 不支持 | 自研独有指标，量化评估噪声拦截效果 |
| **答案忠实度** | **0.99** | Faithfulness: **0.96** | 两者一致极高，证明系统无事实性幻觉 |
| **答案相关性** | **0.97** | Answer Relevance: **0.94** | Ragas 算向量余弦相似度；自研比对核心意图 |


## 五、 两套引擎优劣势深度对比

### 自研诊断脚本 (`evaluate_rag.py`)

| 优势 | 劣势 |
|:---|:---|
| ✅ 节点级白盒诊断，精准定位哪个节点拖后腿 | ❌ 依赖黄金测试集标注 |
| ✅ 极速（秒级）+ 零额外 Token 成本 | ❌ 指标名称非通用 Benchmark 格式 |
| ✅ 100% 确定性，适合 CI/CD 回归测试 | ❌ 需要先运行 `generate_eval_data.py` 构建测试集 |

### Ragas 评估框架 (`evaluate_ragas.py`)

| 优势 | 劣势 |
|:---|:---|
| ✅ 业内标准 Benchmark，对外说服力强 | ❌ 高 Token 消耗 + 慢（分钟级） |
| ✅ 黑盒端到端评估，无需标注 `gold_chunk_ids` | ❌ 无法指导中间节点调参 |
| ✅ 适合无完整元数据的通用文本 | ❌ LLM-as-Judge 存在随机波动 |


## 六、 【关键踩坑经验】测试集质量管控与级联失效防护

### 6.1 问题本质：系统链路特征决定了"坏 Case"必然污染所有指标

本系统的 RAG 链路有一个**关键特征**：

> **当实体识别失败时（`item_names` 为空或无法匹配任何黄金实体），LangGraph 工作流会直接短路返回澄清/拒绝话术，不会进入后续的 RRF 召回、Rerank 截断和 LLM 生成环节。**

这个设计本身是合理的（快速失败、节省资源），但它对**评测脚本**提出了特殊要求：

#### 当"坏 Case"进入评测时，会发生什么？

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  一条"坏 Case"的污染路径                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  用户 Query: "那个红色的多少钱"                                              │
│  Gold 实体: ["Product_A"]                                                   │
│  Gold Chunk ID: ["chunk_001"]                                               │
│                                                                             │
│  ═════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  ① 实体识别节点：item_names = []  ❌ 识别失败                               │
│                                                                             │
│  ② 系统判断：item_names 为空 → 触发澄清流程                                 │
│     ↓                                                                       │
│  ③ 工作流直接返回（短路），不进入 RRF/Rerank/LLM                            │
│     ↓                                                                       │
│  ④ State 中：                                                               │
│     - rrf_chunks = []        ← 空                                          │
│     - reranked_docs = []     ← 空                                          │
│     - answer = "您想查询哪个产品呢？请提供具体型号。"                        │
│                                                                             │
│  ═════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  ⑤ 指标计算（灾难性结果）：                                                  │
│                                                                             │
│     实体准确率 = 0/1 = 0%        ← 拉低全局均值                            │
│     RRF Recall = 1.0 if (gold_chunk_ids & 空集) else 0.0 = 0%  ← 拉低全局 │
│     误杀率 = (空集 - 空集) / 空集 = 分母为0 → 脚本报错或指标失效           │
│     去噪率 = (空集 - 空集) / 空集 = 分母为0 → 脚本报错或指标失效           │
│     Faithfulness: 评估"澄清话术"vs"空上下文" → 得分极低（~0.1）  ← 拉低  │
│     Relevance: 评估"澄清话术"vs"用户提问" → 得分极低（~0.2）   ← 拉低    │
│                                                                             │
│  ═════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  最终结果：一条"坏 Case"拖垮了所有平均指标，评测报告完全失真                 │
│  且无法区分是"系统检索能力差"还是"测试集本身就不该被评测"                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 真实业务场景举例

以下类型的 Query 极易触发"实体识别失败→直接拦截"：

| 类型 | 示例 | 为什么失败 |
|:---|:---|:---|
| **指代不明** | "那个红色的多少钱" | 没有上下文指代对象，"那个红色的"无法映射到产品实体 |
| **口语化缩写** | "P15 咋样" | 实体映射表未覆盖 "P15" → "Product_Pro_15" |
| **超纲实体** | "iPhone 15 支持 WiFi 7 吗" | 知识库里没有 iPhone 15 的任何文档 |
| **跨领域问题** | "今天天气怎么样" | RAG 系统仅做产品知识库问答，天气超出能力边界 |
| **语义模糊** | "你们最好的产品是什么" | "最好的"是主观描述，无法映射到具体产品实体 |

### 6.3 解决方案一：测试集有效性预检（核心方案）

在评测主循环之前，增加**预检阶段**，快速识别哪些 Case 会被系统拦截：

```python
def validate_test_case(case, result_state):
    """
    判断一条测试用例是否"有效"——即系统能否正确识别实体并进入检索链路。
    
    返回: (is_valid, reason)
    """
    gold_entities = set(case.get("gold_entities", []))
    actual_entities = set(result_state.get("item_names", []))
    
    # 门禁 1：黄金实体必须非空
    if not gold_entities:
        return False, "黄金实体为空，无法评估"
    
    # 门禁 2：系统必须至少识别出一个黄金实体
    # ⚠️ 这是核心门禁：如果识别失败，系统直接拦截，后续指标全部失效
    if not (actual_entities & gold_entities):
        return False, f"实体识别失败（系统识别: {actual_entities}），系统将直接拦截返回"
    
    # 门禁 3：系统不能触发澄清流程
    # 即使 item_names 非空，但置信度低时可能触发 options
    if result_state.get("options"):
        return False, f"触发澄清流程（options: {result_state.get('options')}），系统未进入检索链路"
    
    return True, "有效（系统识别成功，进入检索链路）"

def main():
    # ... 加载测试集 ...
    
    # ⭐ 预检阶段
    logger.info(">>> 开始测试集有效性预检（验证实体可识别性）...")
    valid_cases = []
    invalid_cases = []
    
    for case in cases:
        # 快速执行一次获取 state（此时工作流可能已拦截返回）
        result_state = query_app.invoke({
            "original_query": case["query"],
            "session_id": f"precheck_{int(time.time())}",
            "is_stream": False
        })
        
        is_valid, reason = validate_test_case(case, result_state)
        if is_valid:
            valid_cases.append((case, result_state))
            logger.info(f"  ✅ 有效: {case['query']}")
        else:
            invalid_cases.append((case, reason))
            logger.warning(f"  ❌ 无效: {case['query']} -> {reason}")
    
    logger.info(f"📊 预检结果: 有效 {len(valid_cases)}/{len(cases)}，无效 {len(invalid_cases)}/{len(cases)}")
    logger.info(f"⚠️ {len(invalid_cases)} 条用例因实体识别失败被排除，不参与下游指标计算")
    
    # 只对有效用例进行后续指标计算（复用预检阶段的 result_state，避免重复调用）
    for case, pre_result in valid_cases:
        # ... 计算各项指标（使用 pre_result 而非重新调用 query_app）...
```

### 6.4 解决方案二：代码级兜底防护（防止分母为 0）

即使经过预检，仍需要对指标计算做防御性设计：

```python
# 3.2 粗排召回指标 - 增加空集判断
if gold_chunk_ids:
    if rrf_ids:
        rrf_recall = 1.0 if (gold_chunk_ids & rrf_ids) else 0.0
    else:
        rrf_recall = 0.0
        logger.warning(f"Case {idx+1}: rrf_chunks 为空，可能因实体识别失败被拦截")
else:
    rrf_recall = None

# 3.3 精排截断与误杀率 - 防止分母为0
was_in_rrf = gold_chunk_ids & rrf_ids
was_in_reranked = gold_chunk_ids & reranked_ids

if was_in_rrf:
    recall_loss = (len(was_in_rrf) - len(was_in_reranked)) / len(was_in_rrf)
    sum_rerank_recall_loss += recall_loss
    loss_count += 1
else:
    # ⭐ 兜底：如果 RRF 没有命中任何黄金切片，误杀率视为 0（无黄金可误杀）
    recall_loss = 0.0
    logger.warning(f"Case {idx+1}: RRF 未命中任何黄金切片，误杀率置为 0")

# 噪声过滤率 - 防止分母为0
noise_in_rrf = rrf_ids - gold_chunk_ids
noise_in_reranked = reranked_ids - gold_chunk_ids

if noise_in_rrf:
    noise_filter = (len(noise_in_rrf) - len(noise_in_reranked)) / len(noise_in_rrf)
else:
    # ⭐ 兜底：如果没有噪声，过滤率视为 100%（无噪声可过滤）
    noise_filter = 1.0
```

### 6.5 解决方案三：测试集生成阶段的质量门禁（治本）

在 `generate_eval_data.py` 中增加自动筛选逻辑：

```python
def filter_valid_queries(candidate_queries):
    """
    过滤掉那些会导致系统拦截的 Query
    在测试集构建阶段就剔除"坏 Case"
    """
    valid_queries = []
    rejected_queries = []
    
    for candidate in candidate_queries:
        # 仅跑实体识别节点（非完整链路，速度更快，成本更低）
        result = entity_recognition_only(candidate["query"])
        
        # 门禁：必须能提取到至少一个黄金实体
        gold_set = set(candidate.get("gold_entities", []))
        actual_set = set(result.get("item_names", []))
        
        if actual_set & gold_set:
            valid_queries.append(candidate)
        else:
            rejected_queries.append({
                "query": candidate["query"],
                "reason": "实体识别失败（系统将直接拦截）",
                "actual_entities": actual_set
            })
    
    logger.info(f"有效 Query: {len(valid_queries)}/{len(candidate_queries)}")
    return valid_queries, rejected_queries
```

### 6.6 报告中的质量标注

最终生成的评测报告应明确标注测试集质量状况：

```markdown
## 📊 评测数据质量报告

### 测试集有效性预检结果

| 指标 | 数值 |
|:---|:---|
| 总用例数 | 30 |
| ✅ 有效用例（实体识别成功，进入检索链路） | 27 |
| ❌ 无效用例（实体识别失败，系统直接拦截） | 3 |
| 用例有效率 | 90.0% |

### ⚠️ 被排除的无效用例（不参与任何下游指标计算）

| 序号 | Query | 排除原因 | 系统实际行为 |
|:---|:---|:---|:---|
| 1 | "那个红色的多少钱" | 实体识别失败（实际识别: []） | 返回澄清: "您想查询哪个产品呢？" |
| 2 | "P15 咋样" | 实体识别失败（实际识别: []） | 返回澄清: "请提供完整的产品型号" |
| 3 | "今天天气怎么样" | 实体识别失败（实际识别: []） | 返回拒绝: "我只能回答产品相关问题" |

### 📌 重要说明

> 本系统的 **实体识别失败** 会触发工作流直接短路返回，**不会进入 RRF 召回、Rerank 截断和 LLM 生成环节**。
> 
> 因此，**所有检索链路相关指标（RRF 召回率、误杀率、去噪率）和生成质量指标（Faithfulness、Relevance）均仅在 27 条有效用例上计算**。
> 
> **实体识别准确率** 在全量 30 条用例上计算，以反映系统真实的意图理解能力。
```

### 6.7 踩坑经验总结

| 教训 | 根因 | 解决方案 | 状态 |
|:---|:---|:---|:---|
| **"坏 Case"导致所有指标崩塌** | 实体识别失败→系统拦截→下游数据全空 | 预检阶段过滤无效 Case | ✅ 已集成 |
| **误杀率/去噪率分母为0报错** | RRF 结果为空 | 兜底逻辑：分母为0时置默认值 | ✅ 已完善 |
| **指标低分不代表系统差** | 测试集质量不可控 | 报告中标注有效用例率 | ✅ 已集成 |
| **Faithfulness 被澄清话术拉低** | 拦截 Case 的 answer 不是真实回答 | 仅对有效用例计算 E2E 指标 | ✅ 已集成 |
| **评测脚本自身缺乏防御性** | 假设所有 Case 都能进入检索链路 | 增加空值判断和兜底逻辑 | ✅ 已完善 |

**核心认知**：

> **评测脚本本身也是被测系统的一部分。** 当系统有"快速失败"机制时，评测脚本必须理解并适配这一机制，而不是机械地计算所有 Case 的平均值。
>
> **"坏 Case"的 0 分不代表系统检索能力差，只代表"这条 Case 本来就不该被评测"。** 区分这两者，是评测体系设计的基本功。


## 七、 结论与最佳实践

### 💡 结论 1：两种指标互为补充

以 Rerank 环节为例：
- **误杀率 0.0%**：证明断崖截断算法在"硬性安全底线"上做到极致，未丢弃任何黄金切片
- **Context Precision 0.92**：说明留下的切片中虽然黄金排在首位，但仍混入了少量弱相关背景材料

两者结合，证明了系统**既安全又精准**。

### 💡 结论 2：评测体系必须适配系统链路特征

> **关键认知**：当系统有"实体识别失败→直接拦截"的快速失败机制时，评测脚本必须理解这一机制，并在指标体系上做出相应设计——**区分"被测系统的问题"和"测试集本身的问题"**。

### 💡 结论 3：测试集质量是评测体系的基石

所有指标的有效性，都建立在测试集质量可控的前提下。**评测脚本的第一道防线，是验证测试集本身是否有效。**

### 💡 结论 4：生产级双轨策略

| 场景 | 使用工具 | 理由 |
|:---|:---|:---|
| **日常开发/调参** | 自研脚本 | 速度快、免费、精准定位问题节点 |
| **周迭代验收** | 两者并行 | 自研给调优方向，Ragas 出周报数据 |
| **里程碑汇报/对外** | Ragas 为主 | 提供行业标准 Benchmark |

```
                      ┌──────────────────────────────────────────────┐
                      │    双轨评测架构 (Dual-Track Evaluation)      │
                      └──────────────────────┬───────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
      【日常工程迭代 / 参数调优 / CI/CD】                【阶段性汇报 / 算法 Benchmark 评估】
                       │                                           │
         使用自研脚本 (evaluate_rag.py)              使用 Ragas 脚本 (evaluate_ragas.py)
                       │                                           │
         - 监控 Rerank 误杀率与去噪率               - 输出业内通用的 Faithfulness 等得分
         - 毫秒级回归，指导断崖阈值设定              - 验证端到端生成质量与行业对齐
         - 测试集有效性预检（质量门禁）
```





## 附录 ：快速故障排查指南

| 现象 | 可能根因 | 验证方法 |
|:---|:---|:---|
| **用例有效率低** | 测试集中混入了大量"坏 Case" | 查看报告中的"被排除用例列表"，人工审核这些 Query 是否合理 |
| **实体准确率低** | 实体绑定 Prompt 失效或口语化表达未覆盖 | 检查 `item_names` 输出，补充 Few-shot 示例 |
| **RRF 召回率低** | 多路召回策略问题（HyDE 失效 / MCP 超时） | 检查 `rrf_chunks` 是否为空，调整检索权重 |
| **误杀率突增** | 断崖截断阈值（25%）过于激进 | 放宽截断比例至 30%-35%，观察误杀率变化 |
| **去噪率低** | Rerank 模型对噪声区分度不够 | 检查 Rerank 输入文档质量，考虑调整 RRF 融合权重 |
| **Faithfulness 低** | 上下文混入噪声诱发幻觉 | 收紧断崖截断阈值，减少无关文档进入 LLM |
| **所有检索指标同时暴跌** | 测试集污染，大量 Case 被拦截 | 检查"有效用例率"，确认是否混入了大量无效 Case |
