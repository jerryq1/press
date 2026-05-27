---
title: RentAgent项目总结
date: 2026-05-27
abstract: 项目总结
tags:
- Ai实战项目
---

# RentAgent 项目总结

**RentAgent** 是一个基于大模型 (LLM) 驱动的垂直领域 (澳洲租房) 智能数据分析 Agent。它致力于将用户的自然语言查询（如"悉尼可以养宠物的两居室平均周租金多少？"）通过一系列严密的图灵完备逻辑流转，转化为精准的 SQL 并在数据仓库中执行，最终实时返回结构化数据给用户。

本文档将系统性地梳理该项目所涉及的业务逻辑、系统架构、AI 核心技术点，并提供由浅入深的深度剖析。

---

## 一、核心技术栈全景图

| 技术领域 | 选型 | 核心作用与优势说明 |
| :--- | :--- | :--- |
| **Agent 框架** | LangGraph | 提供带状态的有向图执行引擎，支持容错与循环重试（相较于传统 LangChain 单向流更加灵活且稳定） |
| **后端框架** | Python 3.12+ / FastAPI | 提供高性能的异步 API 接口服务，以及对 AI 生态的原生最佳支持。选用 3.12 以获取更好的运行性能。 |
| **底层大模型** | DeepSeek-V3 / GPT-4o / Claude | 核心推理引擎，用于理解意图、分解步骤以及生成高质 SQL |
| **向量化模型 (Embedding)** | bge-large-zh-v1.5 + TEI | 使用 HuggingFace 的 Text Embeddings Inference (TEI) 暴露 REST API，配合 BGE 模型进行极速的中文语义向量化，完全私有化部署。 |
| **关系型数据库** | MySQL 8.0 | `dw` (数据仓库，存储租房业务数据)；`meta_db` (元数据库，存储表结构、列信息和指标定义) |
| **向量数据库** | Qdrant | 用于存储和检索元数据的 Embedding，支持语义相似度检索 (Semantic Search) |
| **全文搜索引擎** | Elasticsearch (ES) | 用于处理基于倒排索引的精确关键词匹配和值召回 (Keyword Search) |
| **包管理工具** | `uv` | 替代传统 pip，提供极速的依赖解析与虚拟环境管理 |

---

## 二、项目结构树与高价值模块示例

了解项目的目录结构是理解复杂系统的前提。以下是本项目的核心结构树，针对高价值的代码区域，我们提供了直接的源码示例解析：

```text
rent-agent/
├── app/
│   ├── agent/         # 价值极高：LangGraph 核心编排（包含 graph.py 及所有的 nodes/）
│   ├── api/           # FastAPI 路由入口与依赖注入 (dependencies.py)
│   ├── clients/       # 价值极高：基础客户端封装，如 embedding_client_manager
│   ├── conf/          # YAML 配置及其 Pydantic 模型解析
│   ├── core/          # 核心基础设施（Loguru 日志组件等）
│   ├── entities/      # 领域驱动设计 (DDD) 中的实体类（如 ColumnInfo, TableInfo）
│   ├── prompt/        # prompt_loader.py 提示词加载器
│   ├── repositories/  # 数据访问层（分离了 MySQL、Qdrant、ES 的底层 CRUD 操作）
│   ├── scripts/       # 价值极高：离线数据流转脚本（如 build_meta_knowledge.py）
│   └── services/      # 价值极高：业务逻辑层（MetaKnowledgeService）
├── docker/            # 完整的生产环境部署文件（包含 ES 内存限制与向量模型容器）
├── prompts/           # 价值极高：所有 Agent 的 "灵魂"，即各个节点的 System Prompts
```

### 价值极高 1：`app/agent/` (LangGraph 核心编排)
这是整个数据大脑的“神经中枢”。它通过节点(Node)与边(Edge)的定义，实现了遇到 SQL 报错时自我纠错并循环重试的机制：
```python
# 节选自: app/agent/graph.py
graph_builder = StateGraph(state_schema=DataAgentState, context_schema=DataAgentContext)

# 1. 挂载所有处理节点 (工人)
graph_builder.add_node("recall_column", recall_column)
graph_builder.add_node("generate_sql", generate_sql)
graph_builder.add_node("validate_sql", validate_sql)
graph_builder.add_node("correct_sql", correct_sql)
graph_builder.add_node("run_sql", run_sql)

# 2. 编排流水线顺序
graph_builder.add_edge("generate_sql", "validate_sql")

# 3. 条件边判断：纠错机制的灵魂
def validate_sql_result_condition(state: DataAgentState) -> str:
    # 只要验证不通过（有错误信息），就把状态传给 correct_sql 节点，否则直接运行 SQL
    return "run_sql" if state["error"] is None else "correct_sql"

graph_builder.add_conditional_edges(
    "validate_sql", 
    validate_sql_result_condition, 
    ["correct_sql", "run_sql"]
)
graph_builder.add_edge("correct_sql", "run_sql") # 纠错后重新尝试运行

data_agent_graph = graph_builder.compile()
```

### 价值极高 2：`app/clients/` (底层高性能并发封装)
在处理上万个维度的向量化时，LangChain 原生的 OpenAIEmbeddings 组件容易在并发时触发 `502 Bad Gateway`。项目中直接抛弃了重度封装，转而使用异步 Http 客户端对接私有化 TEI 模型接口：
```python
# 节选自: app/clients/embedding_client_manager.py
async def embed(self, text: str) -> list:
    """直接调用 TEI REST API，每次新建连接，避免连接复用导致的 502"""
    import httpx
    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.post(
            self._embed_url,
            json={"model": self._model, "input": text},
            headers={"Authorization": "Bearer -"},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
```

### 价值极高 3：`app/services/` (物理数仓转知识语义仓)
这是把普通关系型数据库转化为能被大模型“检索”和“理解”的 Meta 库的魔法脚本：
```python
# 节选自: app/services/meta_knowledge_service.py
async def _save_embddding_to_qdrant(self, column_infos: list[ColumnInfo]):
    points = []
    for column_info in column_infos:
        # 为每一个物理列的名称、描述、甚至别名单独建立检索目标
        points.append({
            "id": uuid.uuid4(),
            "embedding_text": column_info.name,
            "payload": asdict(column_info),
        })
        points.append({
            "id": uuid.uuid4(),
            "embedding_text": column_info.description,
            "payload": asdict(column_info),
        })

    # 通过我们刚刚编写的异步客户端获取语义向量
    embeddings = []
    for text in [p['embedding_text'] for p in points]:
        embedding = await self.embedding_client.embed(text)
        embeddings.append(embedding)

    # 存入 Qdrant 向量库，供后续 RAG 环节使用
    ids = [point['id'] for point in points]
    payloads = [point['payload'] for point in points]
    await self.column_qdrant_repository.upsert(ids, embeddings, payloads)
```

### 价值极高 4：`prompts/` (系统防御提示词)
提示词是控制大模型的准绳。在 SQL 生成节点中，我们需要极度严格地限定大模型的权限和输出格式：
```text
# 节选自: prompts/generate_sql.prompt
【任务要求】
1. 仅允许使用数据表信息中真实存在的表与字段名称，禁止编造、猜测或引入未提供的表和字段。
2. 若指标信息中存在相关指标定义，必须严格遵循其业务口径、计算逻辑、过滤规则与时间口径。
3. 生成的SQL只能用于查询，不能涉及数据写入、更新、删除等操作（绝对安全隔离）。
...
8. 当用户查询意图是列出或查询某种实体时，SELECT 投影列中应当且仅应当返回该实体的 8 个核心维度属性且必须全部都返回，不可以缺少其中任何一个（即 product_id, product_name, property_type, bedrooms, bathrooms, price, is_pet_friendly 及其关联的 region_name）。
```

---

## 三、全盘业务流程解析

整个 RentAgent 从用户提问到拿到最终数据，经历了以下宏观业务闭环：

1. **用户输入**：用户在前端输入“帮我找悉尼价格在600左右的公寓”。
2. **API 接收**：FastAPI `/api/query` 接收到请求，并交由 `QueryService` 处理。
3. **图引擎启动 (LangGraph)**：将用户的问题作为初始状态 (`State`) 注入图执行环境。
4. **元数据召回 (混合检索)**：在图中，Agent 自动根据关键词去 Elasticsearch 查“悉尼”，去 Qdrant 查“价格”。
5. **SQL 生成与执行**：大模型结合找出的字段拼接生成真实的 SQL，并去 `dw` (数据仓库) 执行。
6. **SSE 流式返回**：在上述每一个节点执行完毕时，通过 Server-Sent Events (SSE) 向前端推送实时进度（“正在召回字段...”、“正在生成SQL...”），最后将数据结果一并推给前端渲染表格。

---

## 四、核心架构与技术解析 (深入浅出)

### 1. 将物理 DW 转化为 Meta 知识仓的“黑魔法”
物理数据仓库 (`dw`) 是冰冷的，只有 `suburb_name`, `weekly_rent` 这种英文字段。为了让大模型“懂业务”，我们需要将其转换为元数据库 (`meta_db`)。

**具体转化过程**：
1. **清理旧数据**：读取 `meta_config.yaml`，清空 MySQL 中旧的元数据。
2. **提取物理层 (DW) 信息**：遍历 DW 中的表，通过 SQL 动态获取字段的真实数据类型，并抽取 Top 数据作为 `examples`（例如提取 `suburb_name` 的值为 "Chatswood", "Burwood"）。
3. **写入逻辑层 (Meta MySQL)**：将结合了描述和示例的 `TableInfo` 和 `ColumnInfo` 保存到 MySQL 关系型元数据库。
4. **构建向量语义层 (Qdrant)**：使用 `bge-large-zh-v1.5` 将列的名称 (`name`)、描述 (`description`)、别名 (`alias`) 进行 Embedding 向量化，存储到 Qdrant。（详见本文档第二部分的源码解析）
5. **构建精确字典层 (Elasticsearch)**：遍历 DW 中指定同步的列（如地理位置、房产类型），抽出最多 100,000 条去重后的明细值，灌入 ES 的倒排索引。

**[代码示例：基于元数据的检索召回节点]**
```python
# 节选自: app/agent/nodes/recall_column.py
async def recall_column(state: DataAgentState, runtime: Runtime[DataAgentContext]) -> DataAgentState:
    keywords = state['keywords']
    column_qdrant_repository = runtime.context["column_qdrant_repository"]
    embedding_client = runtime.context["embedding_client"]

    column_info_map = {}
    # 借助向量检索引擎，逐个将关键词与 Meta 库中的字段进行高维匹配
    for keyword in keywords:
        embedding = await embedding_client.embed(keyword)
        current_column_infos = await column_qdrant_repository.search(embedding)
        for column_info in current_column_infos:
            if column_info.id not in column_info_map:
                column_info_map[column_info.id] = column_info

    retrieved_column_infos = list(column_info_map.values())
    return {"retrived_column_infos": retrieved_column_infos}
```

> **价值总结**：这段机制彻底解耦了“大模型”与“业务数据库”。大模型无需面对几亿条真实业务数据，它只需要面对我们精简后的“元数据字典”即可完成复杂的推理。

### 2. 状态机驱动的 LangGraph 节点工作流

**[官方描述]**
LangGraph 是一个用于构建带状态的、多参与者 Agent 的库。它基于图理论建模，相较于 LangChain 的单向流，它原生支持循环（Cycles），允许我们在遇到错误时进行自我修正。

**[生活比喻]**
你可以把 LangGraph 想象成一家**高级餐厅的标准化后厨流水线**。点菜单放在托盘（`State`）上传递：
配菜工 (召回节点) 去冷库拿菜 -> 主厨 (生成节点) 炒菜 -> 质检员 (SQL验证)。如果质检员发现太咸（SQL有语法错误），他不会端给客人，而是把菜打回给主厨（纠错节点/循环），要求重新炒。

**[代码示例：纠错节点的自我演进逻辑]**
```python
# 节选自: app/agent/nodes/correct_sql.py
async def correct_sql(state: DataAgentState, runtime: Runtime[DataAgentContext]) -> DataAgentState:
    sql = state["sql"]
    error = state["error"] # 上一节点执行捕捉到的真实报错信息
    query = state["query"]
    
    # 组装包含报错信息的 Prompt，命令大模型修复
    prompt = PromptTemplate(template=load_prompt("correct_sql"), input_variables=["query", "metric_infos"])
    chain = prompt | get_llm("校正SQL") | StrOutputParser()

    result = await chain.ainvoke({
        "query": query,
        "sql": sql,
        "error": error,
        "table_infos": yaml.dump(state["table_infos"]),
        "db_info": yaml.dump(state["db_info"])
    })
    
    # 覆盖原状态的 sql 并重抛回循环
    return {"sql": result}
```

### 3. SSE 服务器发送事件 (Server-Sent Events)

**[官方描述]**
SSE (Server-Sent Events) 是一种允许服务器在一个长连接中单向、实时向客户端流式推送事件的技术，非常适合解决 LLM 响应缓慢带来的前端假死问题。

**[生活比喻]**
普通的 HTTP 请求就像**发电子邮件**：发信后死等半小时才收到全量回复。
SSE 就像**打电话转播足球赛**：电话不挂断，对方不断汇报“现在在召回数据...”、“现在在纠正SQL...”、“找到了！”。你随时都能知道最新进展，毫无等待焦虑。

**[代码示例：通过 astream 推送流数据]**
```python
# 节选自: app/services/query_service.py
async def query(self, query: str):
    context = DataAgentContext(...) # 注入所有的 Repository 资源
    state = DataAgentState(query=query)
    
    try:
        # 使用 astream 和 custom 模式，获取图流转过程中的每一个实时切片
        async for chunk in data_agent_graph.astream(input=state, context=context, stream_mode="custom"):
            # 以标准的 SSE 数据格式 yield 出去，确保前端能不断连接接收并实时渲染
            yield f"data: {json.dumps(chunk, ensure_ascii=False, default=str)}\n\n" 
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
```

---

## 五、企业级进阶设计与架构演进

如果想要将系统从现在的优秀级别提升至**卓越的生产级别**，以下是我们规划的演进方向：

### 1. 探索 LlamaIndex 替代原生混合检索
目前，我们在 `recall_column` 等节点中，是手动编写 Python 代码分别请求 Qdrant (向量) 和 ES (关键词)，并自行做分数合并（Reciprocal Rank Fusion 等）。
**进阶建议**：可以考虑引入 **LlamaIndex** 重构底层的 RAG 检索引擎。LlamaIndex 提供了高度封装的 `VectorStoreIndex`、`KeywordTableIndex` 以及高级的 `RouterQueryEngine`。它不仅能利用大模型进行智能路由（自动判断用什么检索），且内置丰富的后处理能力，能大幅削减 `MetaKnowledgeService` 和 Node 中的样板代码。

### 2. 语义缓存 (Semantic Caching)
- **痛点**：若用户反复查询“悉尼大学附近单人房”，每次都触发 LLM 生成 SQL，浪费 Token 且延迟极高。
- **方案**：引入 `Redis` + `向量计算`。将问题 Embedding 后与最近缓存库对比，相似度 大于 95% 则直接短路图引擎，返回历史生成的 SQL 乃至数据。可将响应从 5000ms 降至 50ms。

### 3. 防范 Prompt 注入与防御性编程
- **大模型层防注入**：在 `generate_sql.prompt` 中包裹防御指令：`只能执行 SELECT，绝对禁止生成 DROP/UPDATE。`
- **代码层白名单**：执行 SQL 的模块中，使用正则表达式强制拦截非 `SELECT` 开头的语句，确保数据绝对安全。

### 4. Token 计费与可观测审计
提取 LLM 返回的 `usage: {prompt_tokens, completion_tokens}`，在图的终点节点与当前 `user_id` 一起异步写入 MySQL 的 `token_audit_log`，在前端 Dashboard 展现成本大盘。
