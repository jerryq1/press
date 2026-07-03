---
title: 导入阶段流程import_process总结
date: 2026-06-20
abstract: 整个导入阶段流程import_process的流程总结
tags:
- Ai实战项目
---


# 导入阶段流程import_process总结

---

## 1. 代码依赖关系图


这是本项目文件导入工作流（`import_process`）的整体节点执行目录与核心调用关系说明：

### 导入流程大纲目录

*   **节点 1: 入口节点 ([node_entry.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_entry.py))**
    *   **流程 1.1**: 参数非空校验，从全局状态中获取输入文件路径 `local_file_path` 与任务标识 `task_id`。
    *   **流程 1.2**: 格式检测，依据文件后缀激活对应的读取模式布尔开关（如激活 `is_pdf_read_enabled`）。
    *   **流程 1.3**: 提取无后缀的纯文件名作为业务标识 `file_title`，并根据文件类型分流路由跳转到对应的并行解析节点。

*   **并行解析分流节点（根据文件类型选择其中一个执行）**：
    *   **节点 2: PDF 解析节点 ([node_pdf_to_md.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_pdf_to_md.py))**
        *   **流程 2.1**: 校验输入 PDF 路径及输出本地缓存目录。
        *   **流程 2.2**: 异步上传文件至 MinerU 平台，获取任务标识，并设置 10 分钟超时轮询状态直至解析完成。
        *   **流程 2.3**: 自动下载解析结果 ZIP，清理旧目录，解压并提取优先级最高的 Markdown 文件，统一重命名。
    *   **节点 3: Word 解析节点 ([node_docx_to_md.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_docx_to_md.py))**
        *   **流程 3.1**: 路径和本地输出目录合法性验证。
        *   **流程 3.2**: 配置图片过滤器，拦截提取文档内大于 2KB 的内嵌图片，并存放到指定图片目录中。
        *   **流程 3.3**: 使用 `mammoth` 库执行 Word 到 Markdown 的语义化转译，并保存解析后的纯文本。
    *   **节点 4: Excel 解析节点 ([node_xlsx_to_md.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_xlsx_to_md.py))**
        *   **流程 4.1**: 进行常规路径及本地缓存目录校验。
        *   **流程 4.2**: 利用 `pandas` 加载工作簿中所有可用的 Sheet 工作表。
        *   **流程 4.3**: 遍历 Sheet 并调用 `to_markdown` 将表格数据直接转化为规范 Markdown 表格文本。

*   **节点 5: 图片处理节点 ([node_md_img.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_md_img.py))**
    *   **流程 5.1**: 扫描并匹配 Markdown 纯文本中所有本地相对图片引用的路径。
    *   **流程 5.2**: 将本地图片二进制数据上传至 MinIO/OSS 对象存储服务器。
    *   **流程 5.3**: 获取云端可访问 of HTTP URL，并原地替换 Markdown 文本中的本地路径，打通跨平台图片访问。
*   **节点 6: 文档切分节点 ([node_document_split.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_document_split.py))**
    *   **流程 6.1**: 对 Markdown 进行规范化处理（如统一换行符），按标题（`#`）进行非代码块章节初次粗切分。
    *   **流程 6.2**: 对超长切片按照段落和句子进行递归二次切分，控制每个切片在最大字数内。
    *   **流程 6.3**: 合并属于同父章节、且长度低于最小阈值（防止碎片化）的相邻短切片，并自动补全 `parent_title` 字段。
*   **节点 7: 商品识别节点 ([node_item_name_recognition.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_item_name_recognition.py))**
    *   **流程 7.1**: 提取切片头部文本段落，构造严格的命名提炼 Prompt。
    *   **流程 7.2**: 调用大语言模型（LLM）提取这篇文档的核心商品/主题名称。
    *   **流程 7.3**: 将识别到的商品名作为 `item_name` 反向注入到所有切片字典中。
    *   **流程 7.4**: 计算该商品名的混合向量，并存入 Milvus 的主数据集合 `kb_item_names`，实现多文件物理隔离。
*   **节点 8: 向量化节点 ([node_bge_embedding.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_bge_embedding.py))**
    *   **流程 8.1**: 进行输入数据非空及数据类型校验。
    *   **流程 8.2**: 采用单例模式全局仅加载一次本地 BGE-M3 模型，防显存重复占用。
    *   **流程 8.3**: 按 Batch=5 对切片进行分批向量化，同时计算稠密（Dense）和稀疏（Sparse）特征向量并绑定。
*   **节点 9: Milvus 入库节点 ([node_import_milvus.py](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_import_milvus.py))**
    *   **流程 9.1**: 校验并提取向量维度，初始化 Milvus 客户端。
    *   **流程 9.2**: 若表不存在则动态建表，为稠密向量绑定 HNSW 索引，为稀疏向量绑定 SPARSE_INVERTED_INDEX 索引。
    *   **流程 9.3**: 幂等清理，在插入前根据切片中的 `item_name` 清空向量库中历史已存的同商品切片，避免重复。
    *   **流程 9.4**: 剔除临时 `chunk_id` 键，将处理好的切片批量写入，并将 Milvus 自动分配的自增 ID 回填到内存字典。

### 代码依赖调用关系图

```
                +-------------------+
                |     node_entry    |
                +---------+---------+
                          | (条件路由分流)
        +-----------------+-----------------+
        |                 |                 |
+-------v-------+ +-------v-------+ +-------v-------+
| node_pdf_to_md| |node_docx_to_md| |node_xlsx_to_md|
+-------+-------+ +-------+-------+ +-------+-------+
        |                 |                 |
        +-----------------+-----------------+
                          |
                +---------v---------+
                |    node_md_img    |
                +---------+---------+
                          |
                +---------v---------+
                |node_document_split|
                +---------+---------+
                          |
                +---------v---------+
                |  node_item_name_  |
                |    recognition    |
                +---------+---------+
                          |
                +---------v---------+
                |node_bge_embedding |
                +---------+---------+
                          |
                +---------v---------+
                |node_import_milvus |
                +-------------------+
```

---

## 2. 工作流程说明


下面是该文件导入工作流（LangGraph）的完整工作流闭环流程图：

```
[ 用户或 API 传入待导入文件路径及任务参数 ]
                  |
                  v
       +--------------------+
       |     node_entry     |  <-- 参数校验，根据后缀跳转分支路由
       +---------+----------+
                 |
                 +-------------------> (如果是 PDF) ---> +--------------------+
                 |                                      |   node_pdf_to_md   | <-- 异步上传并轮询 MinerU 接口获取结果
                 |                                      +---------+----------+
                 |                                                |
                 +-------------------> (如果是 Word) --> +--------------------+
                 |                                      |  node_docx_to_md   | <-- 使用 mammoth 在本地实现语义转译及图片提取
                 |                                      +---------+----------+
                 |                                                |
                 +-------------------> (如果是 Excel) -> +--------------------+
                                                        |  node_xlsx_to_md   | <-- 利用 pandas 将数据表转化为 MD 表格文本
                                                        +---------+----------+
                                                                  |
         +--------------------------------------------------------+
         |
         v
+------------------+
|   node_md_img    |  <-- 提取本地图片，自动上传到 MinIO 并回填公网可访问 HTTP 地址
+--------+---------+
         |
         v
+------------------+
|node_document_split <-- 按标题分级初切，长文档二次分片，过短块自动合并并补齐 parent_title
+--------+---------+
         |
         v
+------------------+
| node_item_name_  |  <-- 调用大语言模型（LLM）从正文中智能提取商品标识，向量化并存储于主表
|   recognition    |
+--------+---------+
         |
         v
+------------------+
|node_bge_embedding|  <-- 获取 BGE-M3 单例，按 Batch 分批并发生成（Dense & Sparse）双路混合向量
+--------+---------+
         |
         v
+------------------+
|node_import_milvus|  <-- 建立 HNSW 及倒排索引，根据商品名执行幂等清理，批量写入并回填自增 ID 闭环
+--------+---------+
         |
         v
[ 工作流结束，回传最终更新后的全局 ImportGraphState ]
```

---

## 3. 完整代码展示与逐行代码解析

在深入到具体的处理节点之前，我们首先需要理解整个导入流程（LangGraph）的**全局状态定义（State Schema）**以及**工作流图结构（Graph Assembly）**是如何构建和接入的：

### app/import_process/agentTest/state.py

```python
from typing import TypedDict
import copy
from app.core.logger import logger



class ImportGraphState(TypedDict):
    """
    图的状态定义，包含所有节点产生和消费的数据字段。
    TypedDict 让我们在代码中能有自动补全和类型检查。
    使用字典式访问（如state["session_id"]、state.get("embedding_chunks")）
    """

    task_id: str  # 任务ID，用于日志追踪和任务管理
    local_dir: str        # 当前工作目录或输出目录
    local_file_path: str  # 原始输入文件路径


    # 文件识别节点
    is_md_read_enabled: bool # 是否启动markdown读取
    is_pdf_read_enabled: bool # 是否启动pdf读取
    is_docx_read_enabled: bool # 是否启动docx读取
    is_xlsx_read_enabled: bool # 是否启动xlsx读取
    pdf_path: str # pdf文件路径
    md_path: str # md文件路径
    docx_path: str # docx文件路径
    xlsx_path: str # xlsx文件路径
    file_title:str # 文件标题

    # 图片识别节点
    md_content:str # md内容


    # 智能文档切割节点
    # [{title:str,content:str,file_title:str}]
    chunks:list[dict[str,str]]

    # 主体提取节点
    item_name: str # 主体名称
    
     # --- 数据库相关 ---
    embeddings_content: list # 包含向量数据的列表，准备写入 Milvus



    # 建议定一个初始化对象，方便后续使用
    # 定义图状态的默认初始值
    


graph_default_state: ImportGraphState = {
        "task_id":"",
        "is_pdf_read_enabled": False,
        "is_md_read_enabled": False,
        "is_docx_read_enabled": False,
        "is_xlsx_read_enabled": False,
        "local_dir": "",
        "local_file_path": "",
        "pdf_path": "",
        "md_path": "",
        "docx_path": "",
        "xlsx_path": "",
        "file_title": "",
        "md_content": "",
        "chunks": [],
        "item_name": "",
        "embeddings_content": []
}


def create_default_state(**overrides) -> ImportGraphState:
    """
    创建默认状态，支持覆盖

    Args:
        **overrides: 要覆盖的字段（关键字参数解包）

    Returns:
        新的状态实例

    Examples:
        state = create_default_state(task_id="task_001", local_file_path="doc.pdf")
    """

    # 默认状态
    state = copy.deepcopy(graph_default_state)
    # 用 overrides 覆盖默认值
    state.update(overrides)
    # 返回创建好的状态字典实例
    return state

def get_default_state() -> ImportGraphState:
    """
    返回一个新的状态实例，避免全局变量污染
    """
    return copy.deepcopy(graph_default_state)


if __name__ == "__main__":
    """
    测试
    """
    # 创建默认状态
    state = create_default_state(local_file_path="万用表RS-12的使用.pdf")
    logger.info(state)
```

#### 逐行解析：

*   **Line 7-12：全局工作流状态 TypedDict 定义**
    ```python
    class ImportGraphState(TypedDict):
    ```
    *   **深度解析**：这是整个 LangGraph 图的全局状态定义。它继承自 Python 3.8+ 的 `TypedDict`，定义了工作流节点间传输和消费的所有共享字段。相比传统的面向对象 State，`TypedDict` 在字典式灵活访问的同时，为 IDE 提供了强类型校验和字段联想，避免拼写错误造成的状态流转故障。

*   **Line 51-68：定义状态零值 graph_default_state**
    ```python
    graph_default_state: ImportGraphState = {
            "task_id":"",
            "is_pdf_read_enabled": False,
            "is_md_read_enabled": False,
            ...
    }
    ```
    *   **深度解析**：定义全局静态默认状态，防止由于节点内部使用 `.get()` 时遇到缺失字段而引发 KeyError 异常。所有标志开关（如 `is_pdf_read_enabled`）默认均初始化为 `False`。

*   **Line 71-90：包含深拷贝保护的 create_default_state 工厂函数**
    ```python
    def create_default_state(**overrides) -> ImportGraphState:
        state = copy.deepcopy(graph_default_state)
        state.update(overrides)
        return state
    ```
    *   **深度解析**：状态初始化入口。通过 `copy.deepcopy` 对零值字典执行深度克隆，规避了并发环境下多线程共享同一份默认状态指针造成的竞态写数据污染。支持通过 kwargs 参数传入初始变量进行动态字段覆盖。

---

### app/import_process/agentTest/main_graph.py

```python
# 加载环境变量
from dotenv import load_dotenv,find_dotenv

# 导入langgraph核心依赖
from langgraph.graph import StateGraph, END, START

# 引入state
from app.import_process.agentTest.state import ImportGraphState,create_default_state

# 引入自定义业务节点
from app.import_process.agentTest.nodes.node_entry import node_entry
from app.import_process.agentTest.nodes.node_pdf_to_md import node_pdf_to_md
from app.import_process.agentTest.nodes.node_docx_to_md import node_docx_to_md
from app.import_process.agentTest.nodes.node_xlsx_to_md import node_xlsx_to_md
from app.import_process.agentTest.nodes.node_md_img import node_md_img
from app.import_process.agentTest.nodes.node_document_split import node_document_split
from app.import_process.agentTest.nodes.node_item_name_recognition import node_item_name_recognition
from app.import_process.agentTest.nodes.node_bge_embedding import node_bge_embedding
from app.import_process.agentTest.nodes.node_import_milvus import node_import_milvus

from app.core.logger import logger

# 初始化环境变量
load_dotenv(find_dotenv())

# 初始化langgraph状态图
workflow = StateGraph(ImportGraphState)
# 注册所有节点
workflow.add_node("node_entry",node_entry)
workflow.add_node("node_pdf_to_md",node_pdf_to_md)
workflow.add_node("node_docx_to_md",node_docx_to_md)
workflow.add_node("node_xlsx_to_md",node_xlsx_to_md)
workflow.add_node("node_md_img",node_md_img)
workflow.add_node("node_document_split",node_document_split)
workflow.add_node("node_item_name_recognition",node_item_name_recognition)
workflow.add_node("node_bge_embedding",node_bge_embedding)
workflow.add_node("node_import_milvus",node_import_milvus)

# 设置入口节点
workflow.set_entry_point("node_entry")

# 定义条件边
def route_after_entry(state: ImportGraphState) -> str:
    """
    根据文件类型判定第二个节点的路线
    :param state: is_md_read_enabled is_pdf_read_enabled is_docx_read_enabled is_xlsx_read_enabled
    :return:  node_pdf_to_md | node_docx_to_md | node_xlsx_to_md | node_md_img | END
    """
    if state.get("is_pdf_read_enabled"):
        return "node_pdf_to_md"
    elif state.get("is_docx_read_enabled"):
        return "node_docx_to_md"
    elif state.get("is_xlsx_read_enabled"):
        return "node_xlsx_to_md"
    elif state["is_md_read_enabled"]:
        return "node_md_img"
    else:
        return END

workflow.add_conditional_edges(
    "node_entry",
    route_after_entry,
    {
        "node_pdf_to_md": "node_pdf_to_md",
        "node_docx_to_md": "node_docx_to_md",
        "node_xlsx_to_md": "node_xlsx_to_md",
        "node_md_img": "node_md_img",
        END: END
    }
)

# 定义静态边
workflow.add_edge("node_pdf_to_md","node_md_img")
workflow.add_edge("node_docx_to_md","node_md_img")
workflow.add_edge("node_xlsx_to_md","node_md_img")
workflow.add_edge("node_md_img","node_document_split")
workflow.add_edge("node_document_split","node_item_name_recognition")
workflow.add_edge("node_item_name_recognition","node_bge_embedding")
workflow.add_edge("node_bge_embedding","node_import_milvus")
workflow.add_edge("node_import_milvus",END)

# 编译图节点对象
import_app = workflow.compile()


if __name__ == "__main__":
    from app.utils.path_util import PROJECT_ROOT
    import os

    # 全流程测试：验证PDF导入→Milvus入库→KG导入完整链路
    logger.info("===== 开始执行知识图谱导入全流程测试 =====")
    # 1. 构造测试文件路径（复用你项目的doc目录，和pdf2md测试文件一致）
    test_pdf_name = os.path.join("doc", "徐展宏-5年-前端.docx")
    test_pdf_path = os.path.join(PROJECT_ROOT, test_pdf_name)
    # 2. 构造输出目录（存放MD/图片等中间文件）
    test_output_dir = os.path.join(PROJECT_ROOT, "output")
    os.makedirs(test_output_dir, exist_ok=True)  # 不存在则创建

    # 3. 校验测试PDF文件是否存在
    if not os.path.exists(test_pdf_path):
        logger.error(f"全流程测试失败：测试PDF文件不存在，路径：{test_pdf_path}")
        logger.info("请检查文件路径，或手动将测试文件放入项目根目录的doc文件夹中")
    else:
        # 4. 构造测试状态（通过 create_default_state 进行完整状态初始化）
        test_state = create_default_state(
            task_id="test_kg_import_workflow_001",  # 测试任务ID
            user_id="test_user",  # 测试用户ID
            local_file_path=test_pdf_path,  # 测试PDF文件路径
            local_dir=test_output_dir,  # 中间文件输出目录
        )
        try:
            logger.info(f"测试任务启动，PDF文件路径：{test_pdf_path}")
            logger.info(f"中间文件输出目录：{test_output_dir}")
            logger.info("开始执行全流程节点，依次执行：entry→pdf2md→md_img→split→item_name→embedding→milvus→kg")

            # 5. 执行LangGraph全流程（流式执行，打印节点执行进度）
            final_state = None
            for event in import_app.stream(test_state):
                for node_name, state_update in event.items():
                    logger.info(f"✅ 节点执行完成：{node_name}")
                    final_state = state_update  # 保存当前节点的更新状态

            # 6. 全流程执行完成，结果预览和核心指标打印
            if final_state:
                logger.info("-" * 80)
                logger.info("===== 全流程测试执行成功，核心结果预览 =====")
                # 提取核心结果指标
                chunks = final_state.get("chunks", [])
                chunk_count = len(chunks)
                md_content = final_state.get("md_content", "")[:150]  # MD内容前150字符
                has_embedding = all("dense_vector" in c and "sparse_vector" in c for c in chunks) if chunks else False
                has_chunk_id = all("chunk_id" in c for c in chunks) if chunks else False
                kg_id = final_state.get("kg_id", "未生成")  # KG导入生成的ID（按实际业务字段调整）

                # 打印核心指标
                logger.info(f"📄 PDF转MD内容预览（前150字符）：{md_content}...")
                logger.info(f"📝 文档切分总切片数：{chunk_count}")
                logger.info(f"🔍 所有切片是否完成向量化：{'是' if has_embedding else '否'}")
                logger.info(f"🗄️  所有切片是否完成Milvus入库（含chunk_id）：{'是' if has_chunk_id else '否'}")
                logger.info(f"🧠 知识图谱导入ID：{kg_id}")
                logger.info(f"📂 最终状态包含的核心键：{list(final_state.keys())}")
                logger.info("-" * 80)
        except Exception as e:
            logger.exception(f"===== 全流程测试运行失败 =====")
    logger.info("===== 知识图谱导入全流程测试结束 =====")
```

#### 逐行解析：

*   **Line 27：StateGraph 图模型实例化**
    ```python
    workflow = StateGraph(ImportGraphState)
    ```
    *   **深度解析**：传入我们刚才定义的 `ImportGraphState` 类来实例化状态图结构。LangGraph 会按照该 Schema 来初始化并在节点之间流转和约束全局状态数据包。

*   **Line 29-37：将独立的处理类/函数注册为 Graph 节点**
    ```python
    workflow.add_node("node_entry", node_entry)
    workflow.add_node("node_pdf_to_md", node_pdf_to_md)
    # ...
    ```
    *   **深度解析**：将我们后面逐个讲解的 9 个核心节点函数（如入口分发、PDF 解析、分片、向量化等）注册至 Graph 中。注册时需要绑定节点字符串别名，后续所有连线逻辑都将通过别名识别。

*   **Line 43-58：动态条件路由判定算法 route_after_entry**
    ```python
    def route_after_entry(state: ImportGraphState) -> str:
        if state["is_pdf_read_enabled"]:
            return "node_pdf_to_md"
        ...
        else:
            return END
    ```
    *   **深度解析**：核心条件路由逻辑。读取 state 字典中的布尔指示器，判定进入哪个具体的文件解析管道。若均未激活或匹配失败，则直接走向 `END` 终止流程。

*   **Line 60-70：绑定条件分流路由边**
    ```python
    workflow.add_conditional_edges(
        "node_entry",
        route_after_entry,
        {
            "node_pdf_to_md": "node_pdf_to_md",
            "node_docx_to_md": "node_docx_to_md",
            ...
        }
    )
    ```
    *   **深度解析**：在 LangGraph 中声明：在 `node_entry` 节点运行结束后，必须自动执行 `route_after_entry` 条件路由判断，并依据返回值动态跳转到对应的分支，开启 PDF、Word、Excel 或 MD 的独立转换路线。

*   **Line 73-80：声明静态顺序依赖边**
    ```python
    workflow.add_edge("node_pdf_to_md", "node_md_img")
    workflow.add_edge("node_md_img", "node_document_split")
    # ...
    workflow.add_edge("node_import_milvus", END)
    ```
    *   **深度解析**：声明图内部的静态依赖单向连线。不同格式的分支节点最终会被“汇聚”到图片 MinIO 上传节点 `node_md_img` 中，随后串行地完成分片、LLM识别、向量化与入库，直至走向 `END` 终点节点。

*   **Line 114-117：使用 Stream 流式生成器模式调用并执行图流程**
    ```python
    for event in import_app.stream(initial_state):
        for key, value in event.items():
            logger.info(f"已执行节点: {key}")
            final_state = value
    ```
    *   **深度解析**：以生成器模式运行工作流。当每一次状态图节点更新并返回新状态时，`.stream` 会实时 Yield 出包含该节点执行结果的数据。这对于高并发系统或者带有进度条提示的 API 端点非常有价值，能向前端实时汇报当前的导入所处于的特定节点状态。

---


下面展示选定核心文件的完整源码，并附带逐行解析。

### app/import_process/agentTest/nodes/node_entry.py

```python
import os
import sys
from os.path import splitext

from app.core.logger import logger
from app.import_process.agentTest.state import ImportGraphState, create_default_state
from app.utils.format_utils import format_state
from app.utils.task_utils import add_running_task, add_done_task

def node_entry(state: ImportGraphState) -> ImportGraphState:
    """
    LangGraph知识库导入工作流 - 入口节点
    核心职责：初始化参数校验 | 自动判断文件类型(PDF/MD) | 设置解析开关 | 提取业务标识
    入参：ImportGraphState - 必须包含 local_file_path(文件路径)、task_id(任务ID)
    出参：ImportGraphState - 新增/更新 is_pdf_read_enabled/is_md_read_enabled/pdf_path/md_path/file_title
    执行链路：__start__ → 本节点 → route_after_entry(条件路由) → 对应解析节点/流程终止
    """

    # 动态获取函数名避免硬编码
    func_name = sys._getframe().f_code.co_name

    # 节点启动日志，打印当前工作流状态
    logger.debug(f"【{func_name}】节点启动，\n当前工作流状态：{format_state(state)}")

    # 开始：记录节点运行状态
    add_running_task(state["task_id"], func_name)


    # 1. 核心参数提取与非空校验
    document_path = state.get("local_file_path", "")
    if not document_path:
        logger.error(f"【{func_name}】核心参数缺失：工作流状态中未配置local_file_path，文件路径为空")
        return state

    # 2. 根据文件后缀判断类型，设置对应解析开关
    if document_path.endswith(".pdf"):
        logger.info(f"【{func_name}】文件类型校验通过：{document_path} → PDF格式，开启PDF解析流程")
        state["is_pdf_read_enabled"] = True
        state["pdf_path"] = document_path
    elif document_path.endswith(".md"):
        logger.info(f"【{func_name}】文件类型校验通过：{document_path} → MD格式，开启MD解析流程")
        state["is_md_read_enabled"] = True
        state["md_path"] = document_path
    elif document_path.endswith(".docx"):
        logger.info(f"【{func_name}】文件类型校验通过：{document_path} → DOCX格式，开启DOCX解析流程")
        state["is_docx_read_enabled"] = True
        state["docx_path"] = document_path
    elif document_path.endswith(".xlsx"):
        logger.info(f"【{func_name}】文件类型校验通过：{document_path} → XLSX格式，开启XLSX解析流程")
        state["is_xlsx_read_enabled"] = True
        state["xlsx_path"] = document_path
    else:
        logger.warning(f"【{func_name}】文件类型校验失败：{document_path} → 不支持的格式，仅支持.pdf/.md/.docx/.xlsx")

    # 3. 提取文件无前缀纯文件名称，作为全局业务标识
    """
        # 示例1：绝对路径
        document_path = "/Users/jerry/Desktop/AI/rag_agent/data/工作报告.pdf"
        file_name = os.path.basename(document_path)
        print(file_name)  # 输出: 工作报告.pdf

        # 示例2：相对路径
        document_path = "./app/import_process/test.txt"
        file_name = os.path.basename(document_path)
        print(file_name)  # 输出: test.txt
    """
    # os.path.basename() 获取路径中的文件名（带后缀）
    # splitext() 将文件名分割为 [前缀, 后缀]，并取第 0 个元素
    file_name = os.path.basename(document_path)
    state["file_title"] = splitext(file_name)[0]
    logger.info(f"【{func_name}】文件业务标识提取完成：file_title = {state['file_title']}")

    # 结束：记录节点运行状态
    add_done_task(state["task_id"], func_name)

    # 节点完成日志，打印当前工作流状态
    logger.debug(f"【{func_name}】节点执行完成，\n更新后工作流状态：{format_state(state)}")

    return state
```

#### 逐行解析：

*   **Line 5-8：核心类型定义与外部依赖导入**
    ```python
    from app.import_process.agentTest.state import ImportGraphState, create_default_state
    from app.utils.task_utils import add_running_task, add_done_task
    ```
    *   **深度解析**：引入 `ImportGraphState` 作为流程全局状态字典，它继承自 `TypedDict`，能够在代码编写时提供拼写检查和 IDE 的智能字段联想。同时引入 `add_running_task` 与 `add_done_task` 用于跟踪更新当前节点的状态。

*   **Line 29-33：输入参数的非空与有效性校验**
    ```python
    document_path = state.get("local_file_path", "")
    if not document_path:
        logger.error(f"【{func_name}】核心参数缺失：工作流状态中未配置local_file_path，文件路径为空")
        return state
    ```
    *   **深度解析**：前置拦截器逻辑。从全局状态字典中获取 `local_file_path`。如果路径为空，立即打出错误日志并直接退出节点，防止程序后续触发空指针/路径未找到等级联崩溃。

*   **Line 60-78：基于文件后缀的条件路由开关激活**
    ```python
    if document_path.endswith(".pdf"):
        state["is_pdf_read_enabled"] = True
        state["pdf_path"] = document_path
    elif document_path.endswith(".md"):
        state["is_md_read_enabled"] = True
        state["md_path"] = document_path
    elif document_path.endswith(".docx"):
        state["is_docx_read_enabled"] = True
        state["docx_path"] = document_path
    elif document_path.endswith(".xlsx"):
        state["is_xlsx_read_enabled"] = True
        state["xlsx_path"] = document_path
    ```
    *   **深度解析**：工作流多路路由分发器的核心依据。根据输入文件格式的后缀，分别激活 `state` 中对应的控制开关（如 PDF 的 `is_pdf_read_enabled` 或 Word 的 `is_docx_read_enabled`）。这些开关在 LangGraph 的条件路由（Conditional Router）中起决定性作用，用于实现灵活的任务分流路由。

*   **Line 94-96：无后缀文件名提取与业务主键绑定**
    ```python
    file_name = os.path.basename(document_path)
    state["file_title"] = splitext(file_name)[0]
    ```
    *   **深度解析**：业务唯一性标识提取。使用 `os.path.basename` 和 `splitext` 切分出没有任何路径前缀和格式后缀的纯文字文件名（例如 `"澳洲学生公寓国内社交媒体推广执行计划书1"`），作为 `file_title` 写入全局状态。该标识后续会在 MinIO 物理文件夹分类、Milvus 幂等性清理中被广泛应用。


---

### app/import_process/agentTest/nodes/node_pdf_to_md.py

```python
# 系统库
import os
import sys
import time
import requests
import zipfile
import shutil
from pathlib import Path

# 项目内部库
from app.import_process.agentTest.state import ImportGraphState,create_default_state
from app.utils.task_utils import add_running_task, add_done_task
from app.conf.mineru_config import mineru_config
from app.core.logger import logger  # 统一日志工具
from app.utils.format_utils import format_state

# MinerU配置（缓存配置信息）
MINERU_BASE_URL = mineru_config.base_url
MINERU_API_TOKEN = mineru_config.api_token


# class ImportGraphState(TypedDict):
#     """
#     图的状态定义，包含所有节点产生和消费的数据字段。
#     TypedDict 让我们在代码中能有自动补全和类型检查。
#     使用字典式访问（如state["session_id"]、state.get("embedding_chunks")）
#     """

#     task_id: str  # 任务ID，用于日志追踪和任务管理
#     local_dir: str        # 当前工作目录或输出目录
#     local_file_path: str  # 原始输入文件路径


#     # 文件识别节点
#     is_md_read_enabled: bool # 是否启动markdown读取
#     is_pdf_read_enabled: bool # 是否启动pdf读取
#     pdf_path: str # pdf文件路径
#     md_path: str # md文件路径
#     file_title:str # 文件标题

#     # 图片识别节点
#     md_content:str # md内容


#     # 智能文档切割节点
#     # [{title:str,content:str,file_title:str}]
#     chunks:list[dict[str,str]]

#     # 主体提取节点
#     item_name: str # 主体名称
    
#      # --- 数据库相关 ---
#     embeddings_content: list # 包含向量数据的列表，准备写入 Milvus


# 1.校验PDF路径和输出目录
def step_1_validate_paths(state: ImportGraphState) -> tuple[Path, Path]:
    """
    步骤1：校验PDF路径和输出目录

    参数:
        state: ImportGraphState，工作流状态，必须包含 pdf_path (PDF文件路径)

    返回:
        tuple[Path, Path]：包含 PDF 路径对象和输出目录对象

    异常:
        ValueError: 如果 pdf_path 为空
        FileNotFoundError: 如果 PDF 文件不存在
    """
    log_prefix = "[step_1_validate_paths] "

    # 从工作流状态提取 PDF 路径和本地目录,strip()去除首尾空白字符
    pdf_path = state.get("pdf_path", "").strip()
    local_dir = state.get("local_dir", "").strip()    

     # 参数非空校验
    if not pdf_path:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：pdf_path，当前值：{repr(pdf_path)}")
    if not local_dir:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：local_dir，当前值：{repr(local_dir)}")


    # 转换为Path对象统一处理路径
    pdf_path_obj = Path(pdf_path)
    output_dir_obj = Path(local_dir)

    # PDF文件有效性校验（存在且为文件，非目录）
    if not pdf_path_obj.exists():
        raise FileNotFoundError(f"{log_prefix}PDF文件不存在，绝对路径：{pdf_path_obj.absolute()}")
    if not pdf_path_obj.is_file():
        raise FileNotFoundError(f"{log_prefix}指定路径非文件（是目录），绝对路径：{pdf_path_obj.absolute()}")

    # 确保输出目录存在，不存在则递归创建
    if not output_dir_obj.exists():
        logger.info(f"{log_prefix}输出目录不存在，自动创建：{output_dir_obj.absolute()}")
        output_dir_obj.mkdir(parents=True, exist_ok=True)

    # 返回 Path 对象元组，供后续步骤使用
    return pdf_path_obj, output_dir_obj

# 2.上传PDF至MinerU并轮询解析结果
def step_2_upload_and_poll(pdf_path_obj: Path, output_dir_obj: Path) -> str:
    """
    步骤2：上传PDF至MinerU并轮询解析任务状态
    核心流程：配置校验 → 获取上传链接 → 文件上传（含重试） → 任务轮询（直至完成/失败/超时）
    参数：pdf_path_obj-已校验的PDF Path对象；output_dir_obj-输出目录Path对象
    返回：解析结果ZIP包下载链接full_zip_url
    异常：ValueError(配置缺失)、RuntimeError(请求/上传失败)、TimeoutError(任务超时)
    """

    # 前置配置校验，拦截无效配置
    if not MINERU_BASE_URL or not MINERU_API_TOKEN:
        raise ValueError("MinerU配置缺失：请在.env中正确配置MINERU_BASE_URL和MINERU_API_TOKEN")
        logger.info(f"[配置校验] MinerU基础配置加载成功，开始处理文件：{pdf_path_obj.name}")

    # 构造请求头（符合HTTP规范，Bearer鉴权）
    request_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MINERU_API_TOKEN}"
    }

        # 1. 调用批量接口，获取上传Signed URL和任务batch_id
    url_get_upload = f"{MINERU_BASE_URL}/file-urls/batch"
    req_data = {
        "files": [{"name": pdf_path_obj.name}],
        "model_version": "vlm"  # 官方推荐解析模型
    }
    logger.debug(f"[获取上传链接] 调用接口：{url_get_upload}，请求参数：{req_data}")
    resp = requests.post(url=url_get_upload, headers=request_headers, json=req_data, timeout=30)

    # 响应校验：先验HTTP状态，再验业务返回码
    if resp.status_code != 200:
        raise RuntimeError(f"[获取上传链接] 网络请求失败，状态码：{resp.status_code}，响应内容：{resp.text}")

    resp_data = resp.json()
    if resp_data["code"] != 0:
        raise RuntimeError(f"[获取上传链接] API业务错误，返回数据：{resp_data}")

    # 提取核心数据：上传链接和任务唯一标识
    signed_url = resp_data["data"]["file_urls"][0]
    batch_id = resp_data["data"]["batch_id"]
    logger.info(f"[获取上传链接] 成功，batch_id：{batch_id}，上传链接已生成")

    # 2. 读取PDF二进制数据，准备上传
    logger.info(f"[文件上传] 开始读取PDF文件：{pdf_path_obj.name}")
    with open(pdf_path_obj, "rb") as f:
        file_data = f.read()

    # 创建Session（复用TCP连接，禁用代理避免签名验证失败）
    upload_session = requests.Session()
    upload_session.trust_env = False
    

    try:
        # 首次上传：自动识别文件类型
        put_resp = upload_session.put(url=signed_url, data=file_data, timeout=60)
        # 重试逻辑：首次失败则强制指定PDF的Content-Type
        if put_resp.status_code != 200:
            logger.warning(f"[文件上传] 首次上传失败（状态码：{put_resp.status_code}），强制指定PDF类型重试")
            pdf_headers = {"Content-Type": "application/pdf"}
            put_resp = upload_session.put(url=signed_url, data=file_data, headers=pdf_headers, timeout=60)
            # 重试仍失败则抛出异常
            if put_resp.status_code != 200:
                raise RuntimeError(f"[文件上传] 重试后仍失败，状态码：{put_resp.status_code}，响应内容：{put_resp.text}")
        logger.info(f"[文件上传] 成功，文件{pdf_path_obj.name}已存入云存储")
    except Exception as e:
        raise RuntimeError(f"[文件上传] 网络异常导致上传失败，错误信息：{str(e)}")
    finally:
        # 无论成败，关闭Session释放网络连接，避免资源泄漏
        upload_session.close()


    # 3. 根据batch_id轮询任务状态，直至完成/失败/超时
    poll_url = f"{MINERU_BASE_URL}/extract-results/batch/{batch_id}"
    start_time = time.time()
    timeout_seconds = 600  # 最大超时时间10分钟（适配600页内PDF）
    poll_interval = 3      # 轮询间隔3秒（平衡查询频率和服务端压力）
    logger.info(f"[任务轮询] 开始监控任务状态，batch_id：{batch_id}，最大超时：{timeout_seconds}s")

    while True:
        # 超时检查：超过最大时间直接终止轮询
        elapsed_time = time.time() - start_time
        if elapsed_time > timeout_seconds:
            raise TimeoutError(f"[任务轮询] 超时！任务处理超{int(timeout_seconds)}秒，batch_id：{batch_id}")

        # 发起轮询请求，短超时10秒，异常则重试
        try:
            poll_resp = requests.get(url=poll_url, headers=request_headers, timeout=10)
        except Exception as e:
            logger.warning(f"[任务轮询] 网络请求异常，{poll_interval}秒后重试：{str(e)}")
            time.sleep(poll_interval)
            continue

        # 处理HTTP响应错误：5xx服务端繁忙则重试，其他错误直接抛出
        if poll_resp.status_code != 200:
            if 500 <= poll_resp.status_code < 600:
                logger.warning(f"[任务轮询] 服务端繁忙（状态码：{poll_resp.status_code}），{poll_interval}秒后重试")
                time.sleep(poll_interval)
                continue
            else:
                raise RuntimeError(f"[任务轮询] HTTP请求失败，状态码：{poll_resp.status_code}，响应内容：{poll_resp.text}")

        # 解析轮询结果，校验业务状态
        poll_data = poll_resp.json()
        if poll_data["code"] != 0:
            raise RuntimeError(f"[任务轮询] API业务错误，返回数据：{poll_data}")

        extract_results = poll_data["data"]["extract_result"]
        # 结果暂空，继续轮询
        if not extract_results:
            logger.debug(f"[任务轮询] 结果暂为空，已耗时{int(elapsed_time)}s，继续等待")
            time.sleep(poll_interval)
            continue

        # 解析任务状态，分支处理
        result_item = extract_results[0]
        state_status = result_item["state"]
        # 状态1：任务完成，提取ZIP下载链接
        if state_status == "done":
            logger.info(f"[任务轮询] 解析任务完成！总耗时：{int(elapsed_time)}s，batch_id：{batch_id}")
            full_zip_url = result_item.get("full_zip_url")
            if not full_zip_url:
                raise RuntimeError("[任务轮询] 任务完成但未返回ZIP包下载链接，batch_id：{batch_id}")
            logger.info(f"[任务轮询] 结果ZIP包下载链接：{full_zip_url}...")
            return full_zip_url
        # 状态2：任务失败，提取错误信息抛出
        elif state_status == "failed":
            err_msg = result_item.get("err_msg", "未知错误，无具体信息")
            raise RuntimeError(f"[任务轮询] 解析任务失败，batch_id：{batch_id}，错误信息：{err_msg}")
        # 状态3：处理中，实时打印进度（覆盖当前行）
        else:
            logger.debug(
                f"[任务轮询] 处理中（已耗时{int(elapsed_time)}s），状态：{state_status} | 刷新间隔{poll_interval}s",
                end="\r"
            )
            time.sleep(poll_interval)
            continue        

# 3.下载ZIP包并提取MD文件
def step_3_download_and_extract(zip_url: str, output_dir_obj: Path, pdf_stem: str) -> str:
    """
    步骤3：下载MinerU解析结果ZIP包并解压，提取目标MD文件（重命名统一规范）
    核心流程：下载ZIP → 清理旧目录并解压 → 查找MD文件（按优先级） → 重命名统一为PDF同名
    参数：zip_url-ZIP包下载链接；output_dir_obj-输出目录Path；pdf_stem-PDF无后缀纯名称
    返回：最终MD文件的字符串格式绝对路径
    异常：RuntimeError(下载失败)、FileNotFoundError(无MD文件)
    """
    logger.info(f"===== 开始处理[{pdf_stem}]的MinerU解析结果 =====")

    # 1. 下载解析结果ZIP包，120秒超时适配大文件
    logger.info(f"[步骤1/4] 开始下载ZIP包，链接：{zip_url}...")
    resp = requests.get(zip_url, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"[步骤1/4] ZIP包下载失败，HTTP状态码：{resp.status_code}")

    # 拼接ZIP包保存路径，按PDF名称唯一命名
    zip_save_path = output_dir_obj / f"{pdf_stem}_result.zip"
    with open(zip_save_path, "wb") as f:
        f.write(resp.content)
    logger.info(f"[步骤1/4] ZIP包下载成功，保存路径：{zip_save_path}")

    # 2. 清理旧解压目录并解压ZIP包（避免旧文件干扰，为每个PDF创建专属目录）
    logger.info(f"[步骤2/4] 开始解压ZIP包...")
    extract_target_dir = output_dir_obj / pdf_stem

    # 清理旧目录，异常则警告不终止
    if extract_target_dir.exists():
        try:
            # 递归删除整个目录树，包括目录本身及其所有子目录和文件。
            shutil.rmtree(extract_target_dir)
            logger.info(f"[步骤2/4] 已清理旧的解压目录：{extract_target_dir}")
        except Exception as e:
            logger.warning(f"[步骤2/4] 清理旧目录失败，可能不影响新文件解压：{str(e)}")

    # 重新创建解压目录
    extract_target_dir.mkdir(parents=True, exist_ok=True)

    # 核心解压操作，保留原目录结构
    with zipfile.ZipFile(zip_save_path, 'r') as zip_file_obj:
        zip_file_obj.extractall(extract_target_dir)
    logger.info(f"[步骤2/4] ZIP包解压完成，解压目录：{extract_target_dir}")

    # 3. 递归查找解压目录下所有MD文件（适配子目录结构）
    logger.info(f"[步骤3/4] 开始查找解压目录中的MD文件...")
    md_file_list = list(extract_target_dir.rglob("*.md"))
    if not md_file_list:
        raise FileNotFoundError(f"[步骤3/4] 解压目录中未找到任何.md格式文件：{extract_target_dir}")
    logger.info(f"[步骤3/4] 共找到{len(md_file_list)}个MD文件，按优先级匹配目标文件")

    # 4. 按优先级匹配目标MD文件（同名→full.md→第一个，兜底避免流程中断）
    target_md_file = None
    # 优先级1：与PDF纯名称完全同名的MD文件
    for md_file in md_file_list:
        if md_file.stem == pdf_stem:
            target_md_file = md_file
            logger.info(f"[步骤4/4] 匹配到优先级1目标：与PDF同名的MD文件 {target_md_file.name}")
            break
    # 优先级2：MinerU默认生成的full.md（不区分大小写）
    if not target_md_file:
        for md_file in md_file_list:
            if md_file.name.lower() == "full.md":
                target_md_file = md_file
                logger.info(f"[步骤4/4] 匹配到优先级2目标：MinerU默认文件 {target_md_file.name}")
                break
    # 优先级3：兜底取第一个MD文件
    if not target_md_file:
        target_md_file = md_file_list[0]
        logger.info(f"[步骤4/4] 未匹配到前两级目标，兜底取第一个MD文件 {target_md_file.name}")

    # 重命名MD文件：统一为PDF纯名称，便于后续流程处理（仅不同名时执行）
    if target_md_file.stem != pdf_stem:
        logger.info(f"[步骤4/4] 开始重命名MD文件，统一为PDF同名：{pdf_stem}.md")
        new_md_path = target_md_file.with_name(f"{pdf_stem}.md")
        try:
            # 将磁盘上的文件进行重命名
            target_md_file.rename(new_md_path)
            # 更新变量引用
            target_md_file = new_md_path
            logger.info(f"[步骤4/4] MD文件重命名成功：{pdf_stem}.md")
        except OSError as e:
            logger.warning(f"[步骤4/4] MD文件重命名失败，将使用原文件名继续流程：{str(e)}")

    # 转换为字符串绝对路径返回，适配后续仅支持字符串路径的函数
    final_md_path = str(target_md_file.absolute())
    logger.info(f"===== [{pdf_stem}]解析结果处理完成，最终MD文件路径：{final_md_path} =====")
    return final_md_path



def node_pdf_to_md(state: ImportGraphState) -> ImportGraphState:
    """
    节点: PDF转Markdown (node_pdf_to_md)
    为什么叫这个名字: 核心任务是将 PDF 非结构化数据转换为 Markdown 结构化数据。
    未来要实现:
    1. 调用 MinerU (magic-pdf) 工具。
    2. 将 PDF 转换成 Markdown 格式。
    3. 将结果保存到 state["md_content"]。
    """

    # 动态获取函数名避免硬编码
    func_name = sys._getframe().f_code.co_name

    # 节点启动日志，打印当前工作流状态
    logger.debug(f"【{func_name}】节点启动，\n当前工作流状态：{format_state(state)}")

    # 开始：记录节点运行状态
    add_running_task(state["task_id"], func_name)

    try:
        # 步骤1：校验PDF路径和输出目录
        pdf_path_obj, output_dir_obj = step_1_validate_paths(state)

        # 步骤2：上传PDF至MinerU并轮询解析结果
        zip_url = step_2_upload_and_poll(pdf_path_obj, output_dir_obj)

        # 步骤3：下载ZIP包并提取MD文件
        md_path = step_3_download_and_extract(zip_url, output_dir_obj, pdf_path_obj.stem)

        # 更新工作流状态：记录MD文件路径和内容
        state["md_path"] = md_path
        logger.info(f"【{func_name}】MD文件生成成功，路径：{md_path}")

        # 读取MD文件内容，捕获异常仅警告不终止
        try:
            with open(md_path, "r", encoding="utf-8") as f:
                state["md_content"] = f.read()
            logger.debug(f"【{func_name}】MD文件内容读取成功，内容长度：{len(state['md_content'])}字符")
        except Exception as e:
            logger.error(f"【{func_name}】读取MD文件内容失败：{str(e)}")

        logger.info(f"【{func_name}】节点执行完成，更新后工作流状态键：{list(state.keys())}")

    except Exception as e:
        # 异常日志分级，精准提示配置问题
        logger.error(f"【{func_name}】PDF转MD流程执行失败：{str(e)}", exc_info=True)
        raise  # 抛出异常，终止工作流
    finally:

        # 结束：记录节点运行状态
        add_done_task(state["task_id"], func_name)

        # 节点完成日志，打印当前工作流状态
        logger.debug(f"【{func_name}】节点执行完成，\n更新后工作流状态：{format_state(state)}")

    return state

if __name__ == "__main__":

    # 单元测试：验证PDF转MD全流程
    logger.info("===== 开始node_pdf_to_md节点单元测试 =====")

    from app.utils.path_util import PROJECT_ROOT
    logger.info(f"测试获取根地址：{PROJECT_ROOT}")

    test_pdf_name = os.path.join("doc", "澳洲学生公寓国内社交媒体推广执行计划书1.pdf")
    test_pdf_path = os.path.join(PROJECT_ROOT, test_pdf_name)

    # 构造测试状态
    test_state = create_default_state(
        task_id="test_pdf2md_task_001",
        pdf_path=test_pdf_path,
        local_dir=os.path.join(PROJECT_ROOT, "output")
    )

    node_pdf_to_md(test_state)

    logger.info("===== 结束node_pdf_to_md节点单元测试 =====")
```

#### 逐行解析：

*   **Line 173-191：PDF路径和本地目录的前置格式校验**
    ```python
    pdf_path = state.get("pdf_path", "").strip()
    local_dir = state.get("local_dir", "").strip()    
    if not pdf_path:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：pdf_path...")
    ```
    *   **深度解析**：这里对 PDF 文件的输入路径和输出目录进行了严格的前置校验。使用 `Path` 对象封装路径，并做 `exists()` 和 `is_file()` 存在性与文件类型防御校验，能够防止无效文件强行进入转换程序而产生空转。

*   **Line 239-258：调用 MinerU 批量上传接口获取 Signed URL 与 Batch ID**
    ```python
    url_get_upload = f"{MINERU_BASE_URL}/file-urls/batch"
    req_data = {
        "files": [{"name": pdf_path_obj.name}],
        "model_version": "vlm"
    }
    resp = requests.post(url=url_get_upload, headers=request_headers, json=req_data, timeout=30)
    ```
    *   **深度解析**：与云端 MinerU 解析服务对接的核心步骤。首先发送文件基本信息（如文件名）到接口，获取专属的 S3 临时上传链接 `signed_url` 以及用于追踪该任务的全局唯一标识 `batch_id`。

*   **Line 271-282：云端数据二进制 PUT 传输与类型异常重试**
    ```python
    put_resp = upload_session.put(url=signed_url, data=file_data, timeout=60)
    if put_resp.status_code != 200:
        pdf_headers = {"Content-Type": "application/pdf"}
        put_resp = upload_session.put(url=signed_url, data=file_data, headers=pdf_headers, timeout=60)
    ```
    *   **深度解析**：文件上传模块。直接将 PDF 二进制数据 `PUT` 写入云存储的临时 URL。此处包含了一个精细的重试逻辑：如果因为部分环境代理未指定 MIME 类型被拒绝（400/403），则强制设定 `Content-Type: application/pdf` 重新发起传输，大幅提升了在特殊网络和系统下的环境兼容度。

*   **Line 297-345：任务状态的轮询监控与 10 分钟超时防御**
    ```python
    while True:
        elapsed_time = time.time() - start_time
        if elapsed_time > timeout_seconds:
            raise TimeoutError(...)
        poll_resp = requests.get(url=poll_url, headers=request_headers, timeout=10)
        state_status = result_item["state"]
        if state_status == "done":
            return result_item.get("full_zip_url")
    ```
    *   **深度解析**：由于 PDF 转 Markdown 涉及繁重的 OCR 识别与版面还原，属于慢速异步任务。这里编写了一个 `while True` 循环以 3 秒为间隔向平台轮询任务状态，当检测到 `"done"` 时提取 ZIP 下载链接并返回。同时添加了 10 分钟的物理超时熔断，防止由于云端崩溃而导致主线程被无限期挂起死锁。

*   **Line 384-400：残留旧目录物理清理与新解析包解压**
    ```python
    if extract_target_dir.exists():
        shutil.rmtree(extract_target_dir)
    with zipfile.ZipFile(zip_save_path, 'r') as zip_file_obj:
        zip_file_obj.extractall(extract_target_dir)
    ```
    *   **深度解析**：解压模块。在解压前通过 `shutil.rmtree` 强制清空之前同文件名所对应的物理文件夹，确保解压环境的绝对纯净度。然后使用 `extractall` 展开 MinerU 返回的排版结果，包含排版图片和 Markdown 纯文本。

*   **Line 408-426：基于优先级的文件匹配与规范化命名**
    ```python
    for md_file in md_file_list:
        if md_file.stem == pdf_stem:
            target_md_file = md_file
            break
    ```
    *   **深度解析**：结果文档甄别逻辑。因为解压包内可能含有多个子级的 `.md` 文件，这里设计了三层匹配过滤机制：优先取与 PDF 同名的文件 -> 其次取默认的主文件 `full.md` -> 最终取第一个匹配的文件。匹配成功后将其重命名为标准名称，打通后续的逻辑数据归档。


---

### app/import_process/agentTest/nodes/node_docx_to_md.py

```python
import os
import sys
import shutil
from pathlib import Path
import mammoth

from app.import_process.agentTest.state import ImportGraphState, create_default_state
from app.utils.task_utils import add_running_task, add_done_task
from app.core.logger import logger
from app.utils.format_utils import format_state

def step_1_validate_paths(state: ImportGraphState) -> tuple[Path, Path]:
    """
    步骤1：校验DOCX路径和输出目录
    """
    log_prefix = "[step_1_validate_paths] "
    docx_path = state.get("docx_path", "").strip()
    local_dir = state.get("local_dir", "").strip()

    if not docx_path:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：docx_path")
    if not local_dir:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：local_dir")

    docx_path_obj = Path(docx_path)
    output_dir_obj = Path(local_dir)

    if not docx_path_obj.exists():
        raise FileNotFoundError(f"{log_prefix}DOCX文件不存在：{docx_path_obj.absolute()}")
    if not docx_path_obj.is_file():
        raise FileNotFoundError(f"{log_prefix}指定路径非文件：{docx_path_obj.absolute()}")

    if not output_dir_obj.exists():
        logger.info(f"{log_prefix}输出目录不存在，自动创建：{output_dir_obj.absolute()}")
        output_dir_obj.mkdir(parents=True, exist_ok=True)

    return docx_path_obj, output_dir_obj

# 全局图片计数器
image_counter = 0

def create_image_handler(output_dir: Path):
    """
    创建并返回 mammoth 图片转换处理器。
    它拦截 DOCX 中的图片，如果图片大于 2KB，则保存为物理文件；
    如果是小于 2KB 的小图（通常为排版点、空白占位图），则自动过滤忽略。
    """
    def convert_image(image):
        global image_counter
        
        # 读取二进制数据
        with image.open() as image_bytes:
            data = image_bytes.read()
            
        # 判定是否为微小占位图/分割线（小于 2KB 则直接忽略）
        if len(data) < 2048:
            logger.info(f"【convert_image】图片大小为 {len(data)} 字节（小于 2KB），判定为微小排版图，已自动忽略")
            return {
                "src": ""
            }
            
        image_counter += 1
        
        # 1. 创建专属图片目录
        img_dir = output_dir / "images"
        img_dir.mkdir(parents=True, exist_ok=True)
        
        # 2. 判断图片格式后缀
        content_type = image.content_type or "image/png"
        ext = content_type.split("/")[-1]
        
        img_filename = f"image_{image_counter}.{ext}"
        img_path = img_dir / img_filename
        
        # 3. 将二进制流写入本地图片文件
        with open(img_path, "wb") as f:
            f.write(data)
                
        # 4. 返回在 Markdown 中所要生成并替换的 src 相对路径属性
        return {
            "src": f"images/{img_filename}"
        }
    return convert_image

def node_docx_to_md(state: ImportGraphState) -> ImportGraphState:
    """
    节点: Word转Markdown (node_docx_to_md)
    核心任务：在本地快速将 Word (.docx) 转换为 Markdown，并提取文档内的图片。
    """
    func_name = sys._getframe().f_code.co_name
    logger.debug(f"【{func_name}】节点启动，\n当前工作流状态：{format_state(state)}")

    # 开始：记录节点运行状态
    add_running_task(state["task_id"], func_name)

    try:
        docx_path_obj, output_dir_obj = step_1_validate_paths(state)
        
        file_title = state.get("file_title") or docx_path_obj.stem
        docx_output_dir = output_dir_obj / file_title
        
        # 清理已存在的旧目录以实现完全覆盖，防止图片等旧文件残留
        if docx_output_dir.exists():
            try:
                shutil.rmtree(docx_output_dir)
                logger.info(f"【{func_name}】清理已存在的旧目录：{docx_output_dir}")
            except Exception as e:
                logger.warning(f"【{func_name}】清理旧目录失败：{e}")
                
        docx_output_dir.mkdir(parents=True, exist_ok=True)
        md_file_path = docx_output_dir / f"{file_title}.md"
        
        logger.info(f"【{func_name}】开始本地解析Word文件：{docx_path_obj.name}")
        
        # 重置图片计数器
        global image_counter
        image_counter = 0
        
        # 使用 mammoth 将 docx 转换为 markdown 并提取图片
        with open(docx_path_obj, "rb") as docx_file:
            result = mammoth.convert_to_markdown(
                docx_file,
                convert_image=mammoth.images.img_element(create_image_handler(docx_output_dir))
            )
            md_content = result.value
            
            if result.messages:
                logger.warning(f"【{func_name}】Word本地解析警告: {result.messages}")
                
        # 将解析后的 markdown 写入文件
        with open(md_file_path, "w", encoding="utf-8") as f:
            f.write(md_content)
            
        logger.info(f"【{func_name}】Word本地解析并保存成功，路径：{md_file_path}")
        
        # 更新状态中的 md 路径和 md 内容
        state["md_path"] = str(md_file_path.absolute())
        state["md_content"] = md_content

    except Exception as e:
        logger.error(f"【{func_name}】DOCX转MD流程执行失败：{str(e)}", exc_info=True)
        raise
    finally:
        # 结束：记录节点运行状态
        add_done_task(state["task_id"], func_name)
        logger.debug(f"【{func_name}】节点执行完成，\n更新后工作流状态：{format_state(state)}")

    return state


if __name__ == "__main__":

    # 单元测试：验证docx转MD全流程
    logger.info("===== 开始node_docx_to_md节点单元测试 =====")

    from app.utils.path_util import PROJECT_ROOT
    logger.info(f"测试获取根地址：{PROJECT_ROOT}")

    test_docx_name = os.path.join("doc", "徐展宏-5年-前端.docx")
    test_docx_path = os.path.join(PROJECT_ROOT, test_docx_name)

    # 构造测试状态
    test_state = create_default_state(
        task_id="test_docx2md_task_001",
        docx_path=test_docx_path,
        local_dir=os.path.join(PROJECT_ROOT, "output")
    )

    try:
        node_docx_to_md(test_state)
    except Exception as e:
        logger.error(f"单元测试运行失败 (文件可能不存在或解析失败): {e}")

    logger.info("===== 结束node_docx_to_md节点单元测试 =====")

```

#### 逐行解析：

*   **Line 20-36：DOCX输入路径与输出目录校验**
    ```python
    docx_path = state.get("docx_path", "").strip()
    local_dir = state.get("local_dir", "").strip()
    if not docx_path_obj.exists():
        raise FileNotFoundError(...)
    ```
    *   **深度解析**：前置校验。利用 Python 的 `Path` 对象确保 `.docx` 文件路径有效且文件在本地磁盘中真实存在，同时如果输出文件夹不存在，则递归进行创建。

*   **Line 48-60：Mammoth 内嵌图片大小过滤器回调**
    ```python
    def convert_image(image):
        with image.open() as image_bytes:
            data = image_bytes.read()
        if len(data) < 2048:
            logger.info("图片大小小于 2KB，判定为微小排版图，已自动忽略")
            return {"src": ""}
    ```
    *   **深度解析**：该函数是 Mammoth 解析器遇到图片元素时的核心拦截回调。如果图片小于 2KB，程序会自动忽略（不返回 src，不保存）。这样可以从源头上阻断排版用的小图标、无意义的线条和装饰性空白图片进入向量库，起到了数据过滤清洗的作用。

*   **Line 65-83：大图本地转存与 Markdown 内联标签地址重写**
    ```python
    img_filename = f"image_{image_counter}.{ext}"
    img_path = img_dir / img_filename
    with open(img_path, "wb") as f:
        f.write(data)
    return {"src": f"images/{img_filename}"}
    ```
    *   **深度解析**：如果图片大小符合大于 2KB 的标准，则在本地创建 `images` 专属目录，并将图片的二进制字节流写入为一个独立的物理文件。最后，将 Markdown 中的标签 `src` 重写为 `images/image_x.png` 相对路径，以便 Mammoth 生成正确的本地图像标签。

*   **Line 103-110：覆盖写入模式下的历史解压目录强制清理**
    ```python
    if docx_output_dir.exists():
        shutil.rmtree(docx_output_dir)
    docx_output_dir.mkdir(parents=True, exist_ok=True)
    ```
    *   **深度解析**：幂等性文件清理。为了防止多次转换同一个 docx 导致本地 images 目录下的图片重复积累，在创建文件夹前，强制删除之前生成的旧文件夹，确保每次转译都是完全覆写的最新纯净数据。

*   **Line 120-128：调用 Mammoth 执行 Word 到 Markdown 的语义化转译**
    ```python
    with open(docx_path_obj, "rb") as docx_file:
        result = mammoth.convert_to_markdown(
            docx_file,
            convert_image=mammoth.images.img_element(create_image_handler(docx_output_dir))
        )
        md_content = result.value
    ```
    *   **深度解析**：转换核心。利用 mammoth 的 `convert_to_markdown` 方法读取 Word 二进制文档，并利用先前配置好的图片拦截处理器完成图文转换，最终获取包含排版相对路径图片的 Markdown 纯文本。


---

### app/import_process/agentTest/nodes/node_xlsx_to_md.py

```python
import os
import sys
import shutil
from pathlib import Path
import pandas as pd

from app.import_process.agentTest.state import ImportGraphState, create_default_state
from app.utils.task_utils import add_running_task, add_done_task
from app.core.logger import logger
from app.utils.format_utils import format_state

def step_1_validate_paths(state: ImportGraphState) -> tuple[Path, Path]:
    """
    步骤1：校验XLSX路径和输出目录
    """
    log_prefix = "[step_1_validate_paths] "
    xlsx_path = state.get("xlsx_path", "").strip()
    local_dir = state.get("local_dir", "").strip()

    if not xlsx_path:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：xlsx_path")
    if not local_dir:
        raise ValueError(f"{log_prefix}工作流状态缺失有效参数：local_dir")

    xlsx_path_obj = Path(xlsx_path)
    output_dir_obj = Path(local_dir)

    if not xlsx_path_obj.exists():
        raise FileNotFoundError(f"{log_prefix}XLSX文件不存在：{xlsx_path_obj.absolute()}")
    if not xlsx_path_obj.is_file():
        raise FileNotFoundError(f"{log_prefix}指定路径非文件：{xlsx_path_obj.absolute()}")

    if not output_dir_obj.exists():
        logger.info(f"{log_prefix}输出目录不存在，自动创建：{output_dir_obj.absolute()}")
        output_dir_obj.mkdir(parents=True, exist_ok=True)

    return xlsx_path_obj, output_dir_obj

def node_xlsx_to_md(state: ImportGraphState) -> ImportGraphState:
    """
    节点: Excel转Markdown (node_xlsx_to_md)
    核心任务：在本地将 Excel (.xlsx) 的工作表转换为 Markdown 表格格式。
    """
    func_name = sys._getframe().f_code.co_name
    logger.debug(f"【{func_name}】节点启动，\n当前工作流状态：{format_state(state)}")

    # 开始：记录节点运行状态
    add_running_task(state["task_id"], func_name)

    try:
        xlsx_path_obj, output_dir_obj = step_1_validate_paths(state)
        
        file_title = state.get("file_title") or xlsx_path_obj.stem
        xlsx_output_dir = output_dir_obj / file_title
        
        # 清理已存在的旧目录以实现完全覆盖，防止旧文件残留
        if xlsx_output_dir.exists():
            try:
                shutil.rmtree(xlsx_output_dir)
                logger.info(f"【{func_name}】清理已存在的旧目录：{xlsx_output_dir}")
            except Exception as e:
                logger.warning(f"【{func_name}】清理旧目录失败：{e}")
                
        xlsx_output_dir.mkdir(parents=True, exist_ok=True)
        md_file_path = xlsx_output_dir / f"{file_title}.md"
        
        logger.info(f"【{func_name}】开始本地解析Excel文件：{xlsx_path_obj.name}")
        
        # 使用 pandas 读取 Excel 工作簿的所有 Sheet
        xls = pd.ExcelFile(xlsx_path_obj, engine="openpyxl")
        md_sheets = []
        
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xlsx_path_obj, sheet_name=sheet_name, engine="openpyxl")
            
            # 如果 sheet 为空，就不打印空表或者提示一下
            if df.empty:
                markdown_table = "*该工作表无数据*"
            else:
                # 转换成 Markdown 格式的表格
                markdown_table = df.to_markdown(index=False)
                
            md_sheets.append(f"## 工作表: {sheet_name}\n\n{markdown_table}")
            
        md_content = "\n\n".join(md_sheets)
        
        # 将解析后的 markdown 写入文件
        with open(md_file_path, "w", encoding="utf-8") as f:
            f.write(md_content)
            
        logger.info(f"【{func_name}】Excel本地解析并保存成功，路径：{md_file_path}")
        
        # 更新状态中的 md 路径和 md 内容
        state["md_path"] = str(md_file_path.absolute())
        state["md_content"] = md_content

    except Exception as e:
        logger.error(f"【{func_name}】XLSX转MD流程执行失败：{str(e)}", exc_info=True)
        raise
    finally:
        # 结束：记录节点运行状态
        add_done_task(state["task_id"], func_name)
        logger.debug(f"【{func_name}】节点执行完成，\n更新后工作流状态：{format_state(state)}")

    return state


if __name__ == "__main__":

    # 单元测试：验证xlsx转MD全流程
    logger.info("===== 开始node_xlsx_to_md节点单元测试 =====")

    from app.utils.path_util import PROJECT_ROOT
    logger.info(f"测试获取根地址：{PROJECT_ROOT}")

    test_xlsx_name = os.path.join("doc", "2026股票交易记录.xlsx")
    test_xlsx_path = os.path.join(PROJECT_ROOT, test_xlsx_name)

    # 构造测试状态
    test_state = create_default_state(
        task_id="test_xlsx2md_task_001",
        xlsx_path=test_xlsx_path,
        local_dir=os.path.join(PROJECT_ROOT, "output")
    )

    try:
        node_xlsx_to_md(test_state)
    except Exception as e:
        logger.error(f"单元测试运行失败 (文件可能不存在或解析失败): {e}")

    logger.info("===== 结束node_xlsx_to_md节点单元测试 =====")
```

#### 逐行解析：

*   **Line 12-36：XLSX 路径与输出目录参数校验**
    ```python
    xlsx_path = state.get("xlsx_path", "").strip()
    local_dir = state.get("local_dir", "").strip()
    if not xlsx_path_obj.exists():
        raise FileNotFoundError(...)
    ```
    *   **深度解析**：前置格式及路径拦截逻辑。确保状态字典中声明了 Excel 文件的地址，且文件并非目录，以防底层读取时发生 IO 类型错误导致服务停摆。

*   **Line 57-64：删除本地历史同名解析目录以防止脏数据干扰**
    ```python
    if xlsx_output_dir.exists():
        shutil.rmtree(xlsx_output_dir)
    xlsx_output_dir.mkdir(parents=True, exist_ok=True)
    ```
    *   **深度解析**：文件归档层面的幂等设计。每次解析前清空与本文件名同名的历史解析目录，确保多次运行时生成的 md 和中间产物绝对干净，实现完全覆盖式写入。

*   **Line 70：实例化 Pandas 引擎并读取多工作簿列表**
    ```python
    xls = pd.ExcelFile(xlsx_path_obj, engine="openpyxl")
    ```
    *   **深度解析**：表格解析准备。使用 Pandas 包装器配合 `openpyxl` 作为后端引擎，获取 Excel 文件内所有的 Sheet 名称列表，从而为后续的循环读取铺平道路。

*   **Line 73-85：Sheet 二维数据表结构化读取与 Markdown 语法化表格转换**
    ```python
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xlsx_path_obj, sheet_name=sheet_name, engine="openpyxl")
        if df.empty:
            markdown_table = "*该工作表无数据*"
        else:
            markdown_table = df.to_markdown(index=False)
        md_sheets.append(f"## 工作表: {sheet_name}\n\n{markdown_table}")
    ```
    *   **深度解析**：该节点最核心的算法逻辑。逐个提取工作簿的 Sheet 并实例化为 pandas DataFrame 对象。若为空表则插入斜体警告，否则使用 `df.to_markdown(index=False)` 直接将 Excel 二维网格转换为符合 Markdown 标准对齐排版的文本表格。这能够最大程度保留表格的行列业务特征，使其作为文本片段极易被向量检索并还原出清晰的数据格式。


---

### app/import_process/agentTest/nodes/node_md_img.py

```python

from app.core.logger import logger
import os,sys,re
import base64
from pathlib import Path
from typing import Dict, List, Tuple
from collections import deque
import urllib.parse

# MinIO相关依赖
from minio import Minio
from minio.deleteobjects import DeleteObject

# 【核心改造1：移除原生OpenAI，导入LangChain工具类和多模态消息模块】
from app.clients.minio_utils import get_minio_client
from app.import_process.agentTest.state import ImportGraphState
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

        # 处理路径特殊字符，进行 URL 编码（包含中文字符和反斜杠的转义）
        encoded_object_name = urllib.parse.quote(object_name.replace("\\", "/"), safe='/')
        
        # 根据配置选择HTTP/HTTPS协议
        protocol = "https" if minio_config.minio_secure else "http"
        # 构造MinIO基础访问URL
        base_url = f"{protocol}://{minio_config.endpoint}/{minio_config.bucket_name}"
        # 拼接完整图片访问URL
        img_url = f"{base_url}{encoded_object_name}"
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

def node_md_img(state: ImportGraphState) -> ImportGraphState:
    """
    节点: 图片处理 (node_md_img)
    为什么叫这个名字: 处理 Markdown 中的图片资源 (Image)。
    未来要实现:
    1. 扫描 Markdown 中的图片链接。
    2. 将图片上传到 MinIO 对象存储。
    3. (可选) 调用多模态模型生成图片描述。
    4. 替换 Markdown 中的图片链接为 MinIO URL。
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


if __name__ == "__main__":
    """本地测试入口：单独运行该文件时，执行MD图片处理全流程测试"""
    from app.utils.path_util import PROJECT_ROOT
    logger.info(f"本地测试 - 项目根目录：{PROJECT_ROOT}")

        # 测试MD文件路径（需手动将测试文件放入对应目录）
    test_md_name = os.path.join("output", "徐展宏-5年-前端", "徐展宏-5年-前端.md")
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

#### 逐行解析：

*   **Line 38-62：获取内容并校验 MD 路径和 images 同级目录**
    ```python
    md_file_path = state["md_path"]
    if not md_file_path:
        raise FileNotFoundError(...)
    path_obj = Path(md_file_path)
    images_dir = path_obj.parent / "images"
    ```
    *   **深度解析**：初始化数据提取。检验 MD 文件物理路径，并在其同级目录下自动推导出本地临时存放图片的 `images` 专属路径对象。

*   **Line 81-95：编译正则表达式寻找 MD 文本中的本地图片标签**
    ```python
    pattern = re.compile(r"!\[.*?\]\(.*?" + re.escape(image_filename) + r".*?\)")
    ```
    *   **深度解析**：由于转换出的 Markdown 文件包含形如 `![图片](images/image_1.png)` 的相对地址，需要用正则表达式寻找其所在的具体段落（前后各抓 100 字符上下文，用于后续多模态大模型的 Prompt 输入）。使用 `re.escape` 转义文件名中的特殊符号，能够防御匹配时的正则解析崩溃。

*   **Line 112-132：遍历图片文件夹筛选已被引用的有效文件**
    ```python
    for image_file in os.listdir(images_dir):
        if not is_supported_image(image_file):
            continue
        context_list = find_image_in_md(md_content, image_file)
        if not context_list:
            continue
        targets.append((image_file, img_path, context_list[0]))
    ```
    *   **深度解析**：筛选优化机制。遍历本地 `images` 文件夹，若图片并非受支持的后缀或在 Markdown 正文中根本没被引用（属于垃圾文件），则跳过；只有同时满足“是图片”且“在 Markdown 中有引用”的图片，才加入待处理列表并捕获其上下文。

*   **Line 135-144：将图片二进制文件转化为 Base64 编码字符串**
    ```python
    with open(image_path, "rb") as img_file:
        base64_str = base64.b64encode(img_file.read()).decode("utf-8")
    ```
    *   **深度解析**：为后面的多模态生成摘要提供支持。将图片读取为二进制格式，并对其进行 base64 算法编码，生成符合标准的 Base64 字符串。

*   **Line 156-196：通过 LangChain 统一调用视觉大模型生成 50 字内摘要**
    ```python
    lvm_client = get_llm_client(model=lm_config.lv_model)
    messages = [
        HumanMessage(content=[
            {"type": "text", "text": prompt_text},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
        ])
    ]
    response = lvm_client.invoke(messages)
    ```
    *   **深度解析**：多模态技术实现。此处利用 LangChain 的 `HumanMessage` 结构组装文字提示词与图片 Base64，调用千问多模态模型进行视觉内容提取。让 LVM 识别图片中的文字或内容并提取 50 字内中文摘要，作为 Markdown 的图片 Alt 描述。

*   **Line 254-281：清理该文档在 MinIO 上的旧归档目录**
    ```python
    objects_to_delete = minio_client.list_objects(bucket_name, prefix=prefix, recursive=True)
    delete_list = [DeleteObject(obj.object_name) for obj in objects_to_delete]
    if delete_list:
        minio_client.remove_objects(minio_config.bucket_name, delete_list)
    ```
    *   **深度解析**：对象存储幂等性清理。在向 MinIO 写入图片前，列出该文件专属目录下原先已存的旧对象列表，通过 `remove_objects` 进行批量递归清除，保证在对象存储层数据绝不产生混淆或空间泄漏。

*   **Line 319-330：调用 fput_object 接口执行本地图片至 MinIO 的二进制上传**
    ```python
    minio_client.fput_object(
        bucket_name=minio_config.bucket_name,
        object_name=object_name,
        file_path=local_path,
        content_type=f"image/{os.path.splitext(local_path)[1][1:]}"
    )
    ```
    *   **深度解析**：MinIO 物理上传。此处使用 `fput_object` 文件流上传接口（支持大文件传输），并利用 `os.path.splitext` 动态截取文件名后缀作为 HTTP `Content-Type` 写入，确保浏览器加载该图片 URL 时能被识别为图像直接渲染，而非触发文件下载。

*   **Line 332-340：构建 MinIO HTTP URL 并进行编码处理**
    ```python
    encoded_object_name = urllib.parse.quote(object_name.replace("\\", "/"), safe='/')
    img_url = f"{base_url}{encoded_object_name}"
    ```
    *   **深度解析**：网络 URL 构造。由于 MinIO 的存储前缀可能带有反斜杠或中文字符，此处将其统一格式化为正斜杠，并通过 `urllib.parse.quote` 实施标准的 URL 编码转换，以防止生成的网络链接在被客户端请求时因为特殊字符导致 400 编码错误。

*   **Line 370-385：利用正则 sub 方法将 Markdown 中匹配的本地路径替换为 MinIO 的云端 URL**
    ```python
    pattern = re.compile(r"!\[.*?\]\(.*?(" + re.escape(img_filename) + r").*?\)", re.IGNORECASE)
    md_content = pattern.sub(f"![{summary}]({new_url})", md_content)
    ```
    *   **深度解析**：利用正则的 `sub` 对 Markdown 文件进行文本级替换。将本地引用路径和原有的空图片描述，一举替换为 LVM 生成的中文内容摘要和 MinIO 永久云端 HTTP 地址，完成图像的外链云端化。


---

### app/import_process/agentTest/nodes/node_document_split.py

```python
import re
import json
import os
import sys
# 统一类型注解，避免混用any/Any
from typing import List, Dict, Any, Tuple
# LangChain文本分割器（标注核心用途，便于理解）
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 项目内部工具/状态/日志导入（保持原有路径）
from app.utils.task_utils import add_running_task
from app.import_process.agentTest.state import ImportGraphState
from app.core.logger import logger  # 项目统一日志工具，核心替换print

# --- 配置参数 (Configuration) ---
# 单个Chunk最大字符长度：超过则触发二次切分（适配大模型上下文窗口）
DEFAULT_MAX_CONTENT_LENGTH = 2000
# 短Chunk合并阈值：同父标题的短Chunk会被合并，减少碎片化
MIN_CONTENT_LENGTH = 500

def step_6_backup(state: ImportGraphState, sections: List[Dict[str, Any]]) -> None:
    """
    【步骤6】Chunk结果本地JSON备份（便于调试/问题排查，保留处理结果）
    :param state: 项目状态字典，需包含local_dir（备份目录）
    :param sections: 最终处理后的Chunk列表
    """
    # 提取备份目录：无则直接返回，不执行备份
    local_dir = state.get("local_dir")
    if not local_dir:
        logger.warning("步骤6：未配置备份目录（local_dir），跳过Chunk结果备份")
        return

    try:
        # 创建备份目录：已存在则不报错（exist_ok=True）
        os.makedirs(local_dir, exist_ok=True)
        # 拼接备份文件路径：local_dir + chunks.json（固定文件名，便于查找）
        backup_path = os.path.join(local_dir, "chunks.json")
        # 写入JSON文件：保留中文/格式化缩进，便于人工查看
        with open(backup_path, "w", encoding="utf-8") as f:
            """
            sections是Python 嵌套数据结构（List[Dict[str, Any]]，列表里装字典，字典里可能嵌套字符串 / 数字等），而普通文件写入
            （如f.write(sections)）仅支持写入字符串，直接写 Python 数据结构会报错。
            json.dump的核心作用就是：将 Python 原生数据结构（列表、字典、字符串、数字等）直接序列化并写入 JSON 文件，无需手动转换为字符串，
            同时保证数据格式规范、可跨语言 / 跨场景读取，完美适配「Chunk 列表备份」的需求。
            """
            json.dump(
                sections,
                f,
                #开启 True："title": "\u4e00\u7ea7\u6807\u9898"（乱码，无法直接看）；
                #开启 False："title": "一级标题"（正常中文，人工可直接阅读）。
                ensure_ascii=False,  # 保留中文，不转义为\u编码
                indent=2             # 格式化缩进，便于阅读
            )
        logger.info(f"步骤6：Chunk结果备份成功，备份文件路径：{backup_path}")
    except Exception as e:
        # 备份失败仅记录日志，不终止主流程
        logger.error(f"步骤6：Chunk结果备份失败，错误信息：{str(e)}", exc_info=False)


def step_5_print_stats(lines_count: int, sections: List[Dict[str, Any]]) -> None:
    """
    【步骤5】输出文档切分统计信息（日志记录，便于监控/调试）
    :param lines_count: MD原始文本总行数
    :param sections: 最终处理后的Chunk列表
    """
    chunk_num = len(sections)
    # 输出核心统计信息：原始行数/最终Chunk数/首个Chunk预览
    logger.info("-" * 50 + " 文档切分统计信息 " + "-" * 50)
    logger.info(f"MD原始文本总行数：{lines_count}")
    logger.info(f"最终生成Chunk数量：{chunk_num}")
    if sections:
        first_title = sections[0].get("title", "无标题")
        logger.info(f"首个Chunk标题预览：{first_title}")
    logger.info("-" * 110)

def _split_long_section(section: Dict[str, Any], max_length: int = DEFAULT_MAX_CONTENT_LENGTH) -> List[Dict[str, Any]]:
    """
    【辅助函数】超长章节二次切分（核心适配LangChain分割器）
    功能：单个章节内容超限时，按「段落→句子→空格」从粗到细切分，保留语义
    切分规则：1.先按空行(段落) 2.再按换行 3.最后按中英文标点/空格
    :param section: 原始章节字典，必须包含content键，可选title/file_title等
    :param max_length: 单个Chunk最大字符长度，默认使用全局配置
    :return: 切分后的子章节列表，每个子章节带父标题/序号等元信息
    """
    # 内容空值兜底：无内容直接返回原章节
    content = section.get("content", "") or ""
    # 长度未超限，无需切分，直接返回原章节（列表格式保持统一）
    if len(content) <= max_length:
        return [section]

    # 标准化预处理：统一换行符，避免不同系统(\r\n/\n)导致的切分异常
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    # 提取章节标题，用于组装子Chunk前缀（保留标题上下文）
    title = section.get("title", "") or ""
    # 标题前缀：带空行分隔，与正文区分开
    prefix = f"{title}\n\n" if title else ""
    # 计算正文可用长度：总长度 - 标题前缀长度（避免标题占满Chunk额度）
    available_len = max_length - len(prefix)
    # 极端情况：标题长度超过阈值，无法切分，返回原章节
    if available_len <= 0:
        logger.warning(f"章节标题过长，无法切分：{title[:20]}...")
        return [section]

    # 清理正文重复标题：避免原章节中正文开头重复标题，导致子Chunk内容冗余
    body = content
    if title and body.lstrip().startswith(title):
        body = body[body.find(title) + len(title):].lstrip()

    # 初始化LangChain递归分割器（核心工具：按优先级分隔符切分，保留语义）
    # separators：分割符优先级（从粗到细），优先按大语义单元切分，最后才硬拆
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=available_len,  # 正文部分最大长度（已扣除标题）
        chunk_overlap=0,           # 无重叠：按标题切分后语义完整，无需重叠
        # 分割符优先级：空行(段落)→换行→中文标点→英文标点→空格，最后硬拆
        separators=["\n\n", "\n", "。", "！", "？", "；", ".", "!", "?", ";", " "],
    )

    # 切分正文并组装子章节（带完整元信息，便于溯源）
    sub_sections = []
    for idx, chunk in enumerate(splitter.split_text(body), start=1):
        # 清理空内容：跳过切分后的空字符串
        text = chunk.strip()
        if not text:
            continue
        # 组装子Chunk完整内容：标题前缀 + 切分后的正文
        full_text = (prefix + text).strip()
        # 子章节元信息：保留父级关联，添加序号，便于后续检索/溯源
        sub_sections.append({
            "title": f"{title}-{idx}" if title else f"chunk-{idx}",  # 子Chunk标题（带序号）
            "content": full_text,                                     # 切分后的完整内容
            "parent_title": title,                                    # 父章节标题（用于后续合并）
            "part": idx,                                              # 子Chunk序号
            "file_title": section.get("file_title"),                  # 所属文件标题
        })

    logger.debug(f"超长章节切分完成：{title} → 生成{len(sub_sections)}个子Chunk")
    return sub_sections

def _merge_short_sections(sections: List[Dict[str, Any]], min_length: int = MIN_CONTENT_LENGTH) -> List[Dict[str, Any]]:
    """
    【辅助函数】过短章节合并（减少碎片化，提升检索效果）
    核心规则：仅合并「同父标题」且「当前块长度不足阈值」的相邻Chunk，避免跨章节合并
    :param sections: 待合并的Chunk列表（通常是_split_long_section切分后的结果）
    :param min_length: 最小长度阈值，低于此值的Chunk会被合并
    :return: 合并后的Chunk列表，长度适中，保留元信息
    """
    # 边界处理：空列表直接返回，避免后续索引报错
    if not sections:
        logger.debug("待合并Chunk列表为空，直接返回")
        return []

    merged_sections = []  # 最终合并结果
    current_chunk = None  # 迭代累加器：保存当前待合并的Chunk

    for sec in sections:
        # 初始化：第一个Chunk直接作为当前待合并块
        if current_chunk is None:
            current_chunk = sec
            continue

        # 合并条件：1.当前块长度不足阈值 2.与下一块同父标题（同属一个原章节）
        is_current_short = len(current_chunk["content"]) < min_length
        is_same_parent = current_chunk.get("parent_title") == sec.get("parent_title")

        if is_current_short and is_same_parent:
            # 合并前清理：去掉下一块开头重复的父标题，避免内容冗余
            parent_title = sec.get("parent_title", "")
            next_content = sec["content"]
            if parent_title and next_content.startswith(parent_title):
                next_content = next_content[len(parent_title):].lstrip()
            # 合并内容：空行分隔，保证格式整洁
            current_chunk["content"] += "\n\n" + next_content
            # 更新子Chunk序号：保留最新序号，便于溯源
            if "part" in sec:
                current_chunk["part"] = sec["part"]
            logger.debug(f"合并短Chunk：{current_chunk.get('parent_title')} → 累计长度{len(current_chunk['content'])}")
        else:
            # 不满足合并条件：将当前块加入结果，切换为新的待合并块
            merged_sections.append(current_chunk)
            current_chunk = sec

    # 循环结束后，将最后一个待合并块加入结果
    if current_chunk is not None:
        merged_sections.append(current_chunk)

    logger.debug(f"短Chunk合并完成：原{len(sections)}个 → 合并后{len(merged_sections)}个")
    return merged_sections

def step_4_refine_chunks(sections: List[Dict[str, Any]], max_len: int) -> List[Dict[str, Any]]:
    """
    【步骤4】Chunk精细化处理（核心：长切短合，适配大模型/检索）
    执行流程：1.切分超长章节 2.合并过短章节 3.父标题兜底（适配Milvus向量库schema）
    :param sections: 步骤3处理后的章节列表
    :param max_len: 单个Chunk最大字符长度
    :return: 长度适中、低碎片化的最终Chunk列表
    """
    # 边界处理：最大长度无效（空/≤0），直接返回原章节，避免切分异常
    if not max_len or max_len <= 0:
        logger.warning(f"步骤4：Chunk最大长度配置无效（{max_len}），跳过精细化处理")
        return sections

    # 阶段1：切分超长章节 → 所有章节长度控制在max_len内
    refined_split = []
    for sec in sections:
        # 对每个章节执行超长切分，结果平铺加入列表（避免嵌套）
        # extend 的作用就是： 把另一个列表（或可迭代对象）里的“元素”，一个个拆出来，直接追加到当前列表的尾部
        refined_split.extend(_split_long_section(sec, max_len))
    logger.info(f"步骤4-1：超长章节切分完成，共生成{len(refined_split)}个初始子Chunk")

    # 阶段2：合并过短章节 → 减少碎片化，提升后续检索/大模型调用效果
    final_sections = _merge_short_sections(refined_split)
    logger.info(f"步骤4-2：过短章节合并完成，最终得到{len(final_sections)}个Chunk")

    # 阶段3：父标题兜底 → 适配Milvus向量库schema（parent_title为必填字段）
    # 兜底规则：无parent_title则用自身title，title也无则填空字符串
    for sec in final_sections:
        if not isinstance(sec, dict):
            continue
        
        # 补全缺失的part字段（默认1，表示第1部分），适配Milvus schema
        if "part" not in sec:
            sec["part"] = 1
            
        if not sec.get("parent_title"):
            sec["parent_title"] = sec.get("title") or ""
    logger.debug(f"步骤4-3：父标题兜底完成，所有Chunk均包含parent_title字段")

    return final_sections

def step_3_handle_no_title(content: str, sections: List[Dict[str, Any]], title_count: int, file_title: str) -> List[Dict[str, Any]]:
    """
    【步骤3】无标题兜底处理
    功能：若MD中未识别到任何标题，将全文作为一个整体处理，避免后续逻辑异常
    :param content: 标准化后的MD完整内容
    :param sections: 步骤2切分后的章节列表
    :param title_count: 步骤2识别的有效标题数量
    :param file_title: 所属文件标题
    :return: 兜底后的章节列表
    """
    if title_count == 0:
        # 无标题情况：替换为单章节，标题为"无标题"
        logger.warning(f"步骤3：未识别到任何MD标题，将全文作为单个章节处理，文件：{file_title}")
        return [{"title": "无标题", "content": content, "file_title": file_title}]
    # 有标题情况：直接返回步骤2的结果
    logger.debug(f"步骤3：检测到{title_count}个有效标题，无需兜底处理")
    return sections

def step_2_split_by_titles(content: str, file_title: str) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    【步骤2】按Markdown标题初次切分（核心：按#分级切分，跳过代码块内标题）
    LangChain前置预处理：将整份MD按标题拆分为独立章节，为后续精细化切分做基础
    :param content: 标准化后的MD完整内容（字符串）
    :param file_title: 所属文件标题，用于标记章节归属
    :return: 切分后的章节列表/有效标题数量/原始文本总行数
    """
    # 正则匹配Markdown 1-6级标题（核心规则，适配缩进/标准格式）
    # ^\s*：行首允许0/多个空格/Tab（兼容缩进的标题）
    # #{1,6}：匹配1-6个#（对应MD1-6级标题）
    # \s+：#后必须有至少1个空格（区分#是标题还是普通文本）
    # .+：标题文字至少1个字符（避免空标题）
    title_pattern = r'^\s*#{1,6}\s+.+'

    # 将MD内容按换行符拆分为行列表，逐行处理
    lines = content.split("\n")
    sections = []  # 最终切分的章节列表
    current_title = ""  # 当前章节标题
    current_lines = []  # 当前章节的行缓存
    title_count = 0  # 有效标题数量（非代码块内）
    in_code_block = False  # 代码块标记：避免误判代码块内的#为标题

    def _flush_section():
        """内部辅助函数：将当前缓存的章节写入sections，空缓存则跳过"""
        if not current_lines:
            return
        sections.append({
            "title": current_title,
            # 每段时间使用 \n换行区分
            "content": "\n".join(current_lines),
            "file_title": file_title,
        })

    # 逐行遍历，识别标题并切分章节
    for line in lines:
        stripped_line = line.strip()
        # 识别代码块边界（```/~~~）：进入/退出代码块时翻转状态
        if stripped_line.startswith("```") or stripped_line.startswith("~~~"):
            in_code_block = not in_code_block
            current_lines.append(line)
            continue

        # 判断是否为有效标题：非代码块内 + 匹配标题正则
        is_valid_title = (not in_code_block) and re.match(title_pattern, line)
        if is_valid_title:
            # 遇到新标题：先将上一个章节写入结果，再初始化新章节
            _flush_section()
            current_title = line.strip()  # 清理标题前后空格
            current_lines = [current_title]  # 新章节从标题开始
            title_count += 1
            logger.debug(f"识别到MD标题：{current_title}")
        else:
            # 普通行：追加到当前章节的行缓存
            current_lines.append(line)

    # 处理最后一个章节：循环结束后，将最后一个缓存的章节写入结果
    _flush_section()
    logger.info(f"步骤2：MD标题切分完成，识别到{title_count}个有效标题，原始文本共{len(lines)}行")
    return sections, title_count, len(lines)

def step_1_get_inputs(state: ImportGraphState) -> Tuple[Any, str, int]:
    """
    【步骤1】获取并预处理输入数据
    功能：从状态字典中提取MD内容/文件标题/最大长度，做基础标准化
    :param state: 项目状态字典（ImportGraphState），包含md_content等核心键
    :return: 标准化后的MD内容/文件标题/单个Chunk最大长度（无内容则返回None,None,None）
    """
    # 从状态中提取MD原始内容
    content = state.get("md_content")
    # 空内容兜底：无MD内容则直接返回，终止后续处理
    if not content:
        logger.warning("状态字典中无有效MD内容，终止文档切分")
        return None, None, None

    # 基础标准化：统一换行符，避免Windows/Linux换行符差异导致的后续处理异常
    # 原始混合换行："# HL3070说明书\r\n## 产品概述\nHL3070是扫描枪\r\n\r\n### 操作步骤"
    # 统一后："# HL3070说明书\n## 产品概述\nHL3070是扫描枪\n\n### 操作步骤"
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    # 提取文件标题：有则用，无则默认"Unknown File"
    file_title = state.get("file_title", "Unknown File")
    # 提取最大Chunk长度：有则用状态中的配置，无则用全局默认值
    max_len = DEFAULT_MAX_CONTENT_LENGTH

    logger.info(f"步骤1：输入数据加载完成，文件标题：{file_title}，最大Chunk长度：{max_len}")
    return content, file_title, max_len

def node_document_split(state: ImportGraphState) -> ImportGraphState:
    """
    【核心节点】文档切分主节点（node_document_split）
    整体流程：加载输入→按MD标题初切→无标题兜底→长切短合→统计输出→结果备份
    核心目的：将长MD文档切分为长度适中的Chunk，适配大模型上下文窗口和向量检索
    后续扩展点：可在各步骤间新增Chunk元信息补充、自定义切分规则、向量入库前置处理等
    :param state: 项目状态字典（ImportGraphState），必须包含md_content/task_id；可选local_dir/max_content_length/file_title
    :return: 更新后的状态字典，新增chunks键（存储最终处理后的Chunk列表，每个Chunk为含title/content/parent_title的字典）
    """
    # 初始化当前节点信息，用于任务监控和日志溯源
    node_name = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行核心节点：【文档切分】{node_name}")
    # 将当前节点加入运行中任务，更新全局任务状态
    add_running_task(state["task_id"], node_name)

    try:
        # ===================================== 步骤1：加载并标准化输入数据 =====================================
        # 作用：从状态字典提取MD内容/文件标题/Chunk最大长度，统一换行符消除系统差异，做空值兜底
        # 输出：标准化后的md_content、文件标题、单个Chunk最大长度；无有效MD内容则直接终止节点执行
        content, file_title, max_len = step_1_get_inputs(state)
        if content is None:
            logger.info(f">>> 节点执行终止：{node_name}（无有效MD内容）")
            return state

        # ===================================== 步骤2：按MD标题进行初次切分 =====================================
        # 作用：基于Markdown标题（#/##/###）切分文档为独立章节，自动跳过代码块内的伪标题，保证章节语义完整     #  
        # 输出：初切后的章节列表、识别到的有效标题数量、MD原始文本总行数（为后续统计/日志使用）
        sections, title_count, lines_count = step_2_split_by_titles(content, file_title)

        # ===================================== 步骤3：无标题场景兜底处理 =====================================
        # 作用：解决MD文档无任何标题的边界情况，避免后续切分逻辑异常
        # 输出：有标题则返回步骤2的章节列表；无标题则将全文封装为单个「无标题」章节，保证数据格式统一
        sections = step_3_handle_no_title(content, sections, title_count, file_title)

        # ===================================== 步骤4：Chunk精细化处理（长切短合） =====================================
        # 作用：核心切分逻辑，先将超长章节按「段落→句子」二次切分，再合并同父标题的过短章节，减少碎片化
        # 额外处理：对所有Chunk做parent_title兜底，适配Milvus向量库必填字段要求
        # 输出：长度适中、语义完整、低碎片化的最终Chunk列表（可直接用于向量入库/大模型调用）
        sections = step_4_refine_chunks(sections, max_len)

        # ===================================== 步骤5：输出文档切分统计信息 =====================================
        # 作用：打印核心统计数据，便于监控切分效果、调试问题（原始行数/最终Chunk数/首个Chunk预览）
        # 输出：无返回值，仅通过logger输出标准化统计日志
        step_5_print_stats(lines_count, sections)

        # ===================================== 步骤6：Chunk结果本地JSON备份 + 状态更新 =====================================
        # 作用1：将最终Chunk列表备份到local_dir目录的chunks.json，便于后续问题排查、数据复用
        # 作用2：将Chunk列表写入状态字典，传递给下一个节点（如向量入库、大模型摘要等）
        # 输出：状态字典新增chunks键；无local_dir则跳过备份，不影响主流程
        state["chunks"] = sections
        step_6_backup(state, sections)

        # 节点执行完成日志
        logger.info(f">>> 核心节点执行完成：【文档切分】{node_name}，已生成{len(sections)}个有效Chunk，结果已写入状态字典")

    except Exception as e:
        # 全局异常捕获：保证节点执行失败不崩溃整个流程，记录详细错误日志便于排查
        logger.error(f">>> 核心节点执行失败：【文档切分】{node_name}，错误信息：{str(e)}", exc_info=True)

    # 返回更新后的状态字典，传递Chunk结果到下游节点
    return state


if __name__ == '__main__':
    """
    单元测试：联合node_md_img（图片处理节点）进行集成测试
    测试条件：1.已配置.env（MinIO/大模型环境） 2.存在测试MD文件 3.能导入node_md_img
    测试流程：先运行图片处理→再运行文档切分，验证端到端流程
    """

    """本地测试入口：单独运行该文件时，执行MD图片处理全流程测试"""
    from app.utils.path_util import PROJECT_ROOT
    from app.import_process.agentTest.nodes.node_md_img import node_md_img

    logger.info(f"本地测试 - 项目根目录：{PROJECT_ROOT}")

    test_md_name = os.path.join("output", "澳洲学生公寓国内社交媒体推广执行计划书1", "澳洲学生公寓国内社交媒体推广执行计划书1.md")
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
            "md_content": "",
            "file_title": "澳洲学生公寓国内社交媒体推广执行计划书1",
            "local_dir":os.path.join(PROJECT_ROOT, "output"),
        }
        logger.info("开始本地测试 - MD图片处理全流程")
        # 执行核心处理流程
        result_state = node_md_img(test_state)
        logger.info(f"本地测试完成 - 处理结果状态：{result_state}")
        logger.info("\n=== 开始执行文档切分节点集成测试 ===")

        logger.info(">> 开始运行当前节点：node_document_split（文档切分）")
        final_state = node_document_split(result_state)
        final_chunks = final_state.get("chunks", [])
        logger.info(f"✅ 测试成功：最终生成{len(final_chunks)}个有效Chunk{final_chunks}")   
```

#### 逐行解析：

*   **Line 110-137：RecursiveCharacterTextSplitter 递归细切分机制配置**
    ```python
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=available_len,
        separators=["\n\n", "\n", "。", "！", "？", "；", ".", "!", "?", ";", " "],
    )
    for idx, chunk in enumerate(splitter.split_text(body), start=1):
        # ...
    ```
    *   **深度解析**：切分算法核心。当原文档的某个章节内容超过了单块设定的最大长度（2000字符），系统会配置 LangChain 分割器。它根据分割符优先级进行细粒度拆分，能保证拆开的子分片不仅控制在可用字符限额内，还最大程度维持了原有段落的完整性。

*   **Line 139-187：智能合并同级短切片以避免检索碎片化**
    ```python
    is_current_short = len(current_chunk["content"]) < min_length
    is_same_parent = current_chunk.get("parent_title") == sec.get("parent_title")
    if is_current_short and is_same_parent:
        current_chunk["content"] += "\n\n" + next_content
    ```
    *   **深度解析**：短切片合并算法。为解决过短段落产生的检索语义碎片化问题，代码实现了一个滑动累加器。当当前分片的字符长度低于下限（500字符），且与紧邻的下一个切片属于相同的上一级标题下，则强制用两个空行拼接到当前分片中，防止跨章节语义污染的同时保持切片的语义密度。

*   **Line 220-226：切片字段补齐与 parent_title 的兜底策略**
    ```python
    if "part" not in sec:
        sec["part"] = 1
    if not sec.get("parent_title"):
        sec["parent_title"] = sec.get("title") or ""
    ```
    *   **深度解析**：Schema 完整性填充。如果解析分片缺失 `parent_title`，则将本级标题作为父标题，并默认为 `part=1`。这能确保所有切片字典中都包含 RAG 底层表结构所必需的字段，保证下游 Milvus 不因 Schema 缺失而拒绝落库。

*   **Line 260-307：按 H1-H6 标题级别粗切正文与代码块伪标题防误判**
    ```python
    title_pattern = r'^\s*#{1,6}\s+.+'
    for line in lines:
        if stripped_line.startswith("```") or stripped_line.startswith("~~~"):
            in_code_block = not in_code_block
        is_valid_title = (not in_code_block) and re.match(title_pattern, line)
    ```
    *   **深度解析**：粗切分阶段。按行读取原始 Markdown 内容，运用正则表达式 `^\s*#{1,6}\s+.+` 匹配 1 到 6 级标题进行章节拆分。此处使用布尔变量 `in_code_block` 持续跟踪，一旦发现目前处于代码块内部（比如有 python 的注释 `#`），则直接忽视其标题匹配，避免了对源码内部注释标题的错误识别。

*   **Line 309-333：获取输入内容并进行统一换行符标准化**
    ```python
    content = state.get("md_content")
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    ```
    *   **深度解析**：数据清洗标准化。由于不同操作系统（Windows / Unix）对换行符的识别差异（`
        ` 与 `
        `），可能会造成后续正则表达式匹配和按行遍历行首时产生语义漏判。此处统一格式化为标准 Unix 的 `
        `，大幅提升了切分质量的稳定性。


---

### app/import_process/agentTest/nodes/node_item_name_recognition.py

```python
# app/import_process/agentTest/nodes/node_item_name_recognition.py
import os
import sys
from typing import List, Dict, Any, Tuple

# 导入 Milvus 类型定义与客户端
from pymilvus import DataType

# 导入 LangChain 消息对象
from langchain_core.messages import SystemMessage, HumanMessage

# 导入项目内部已有的服务与工具
from app.import_process.agentTest.state import ImportGraphState
from app.core.logger import logger
from app.core.load_prompt import load_prompt
from app.lm.lm_utils import get_llm_client
from app.lm.embedding_utils import generate_embeddings
from app.clients.milvus_utils import get_milvus_client
from app.utils.escape_milvus_string_utils import escape_milvus_string
from app.utils.task_utils import add_running_task

# --- 全局常量配置 ---
# 大模型识别商品名称的上下文切片数：取前 5 个切片，避免上下文过长
DEFAULT_ITEM_NAME_CHUNK_K = 5
# 单个切片内容截断长度：防止单个切片过长占满大模型上下文
SINGLE_CHUNK_CONTENT_MAX_LEN = 800
# 大模型上下文总字符数上限：2500 字符
CONTEXT_TOTAL_MAX_CHARS = 2500


def step_1_get_inputs(state: ImportGraphState) -> Tuple[str, List[Dict]]:
    """
    步骤 1: 提取并校验流程输入
    """
    # 优先取 file_title，其次用 file_name，最后空字符
    file_title = state.get("file_title", "") or state.get("file_name", "")
    chunks = state.get("chunks") or []

    # 如果标题为空，尝试从第一个有效切片中提取
    if not file_title and chunks and isinstance(chunks[0], dict):
        file_title = chunks[0].get("file_title", "")
        logger.warning("state 中无有效 file_title，已从第一个切片中提取兜底标题")

    if not file_title:
        logger.warning("缺少 file_title，后续大模型识别精度可能下降")

    if not isinstance(chunks, list) or not chunks:
        logger.warning("chunks 为空，无法进行商品名称识别")
        return file_title, []

    logger.info(f"步骤1：输入校验完成，获取到 {len(chunks)} 个有效文本切片")
    return file_title, chunks


def step_2_build_context(chunks: List[Dict], k: int = DEFAULT_ITEM_NAME_CHUNK_K, max_chars: int = CONTEXT_TOTAL_MAX_CHARS) -> str:
    """
    步骤 2: 截取前 K 个切片，构建用于 LLM 识别的结构化上下文
    """
    if not chunks:
        return ""

    parts: List[str] = []
    total_chars = 0

    for idx, chunk in enumerate(chunks[:k]):
        if not isinstance(chunk, dict):
            continue

        chunk_title = chunk.get("title", "").strip()
        chunk_content = chunk.get("content", "").strip()

        if not (chunk_title or chunk_content):
            continue

        # 单切片字符数截断
        if len(chunk_content) > SINGLE_CHUNK_CONTENT_MAX_LEN:
            chunk_content = chunk_content[:SINGLE_CHUNK_CONTENT_MAX_LEN]

        # 结构化组合
        piece = f"【切片{idx + 1}】\n标题：{chunk_title} \n内容：{chunk_content}"
        parts.append(piece)
        total_chars += len(piece)

        # 长度防爆
        if total_chars > max_chars:
            logger.info(f"上下文总字符数已达到上限 {max_chars}，停止拼接后续切片")
            break

    context = "\n\n".join(parts).strip()
    return context[:max_chars]


def step_3_call_llm(file_title: str, context: str) -> str:
    """
    步骤 3: 构造 Prompt 调用大模型，精准提取商品名/型号
    """
    logger.info("开始执行步骤3：调用大模型识别商品名称")

    if not context:
        logger.warning("正文上下文为空，跳过大模型调用，直接使用文件标题作为商品名称")
        return file_title

    try:
        # 装载本地提示词模板 (从 prompts/ 目录读取)
        human_prompt = load_prompt("item_name_recognition", file_title=file_title, context=context)
        system_prompt = load_prompt("product_recognition_system")

        # 获取大模型客户端 (默认使用 .env 中配置的阿里百炼 Qwen 模型)
        llm = get_llm_client(json_mode=False)
        if not llm:
            logger.error("大模型客户端获取失败，使用文件标题作为兜底")
            return file_title

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ]

        resp = llm.invoke(messages)
        item_name = getattr(resp, "content", "").strip()

        # 清洗换行符和空格
        item_name = item_name.replace(" ", "").replace("\n", "").replace("\r", "").replace("\t", "")

        if not item_name:
            logger.warning("大模型返回空，使用文件标题兜底")
            return file_title

        logger.info(f"步骤3：大模型识别名称成功，结果为：{item_name}")
        return item_name

    except Exception as e:
        logger.error(f"步骤3：大模型调用失败，原因：{str(e)}", exc_info=True)
        return file_title


def step_4_update_chunks(state: ImportGraphState, chunks: List[Dict], item_name: str) -> None:
    """
    步骤 4: 回填商品名称到 State 和每个切片字典中
    """
    state["item_name"] = item_name
    for chunk in chunks:
        chunk["item_name"] = item_name
    state["chunks"] = chunks
    logger.info(f"步骤4：商品名称回填完成，已为所有切片注入 item_name: {item_name}")


def step_5_generate_vectors(item_name: str) -> Tuple[List[float], Dict[int, float]]:
    """
    步骤 5: 利用本地 BGE-M3 模型生成 Dense + Sparse 向量
    """
    logger.info(f"开始执行步骤5：为商品名称 [{item_name}] 生成双路向量")
    if not item_name:
        return None, None

    try:
        # 调用本地 BGE-M3 (MPS GPU 硬件加速) 生成向量
        vector_result = generate_embeddings([item_name])

        if vector_result and "dense" in vector_result and "sparse" in vector_result:
            dense_vector = vector_result["dense"][0]
            sparse_vector = vector_result["sparse"][0]
            logger.info("步骤5：BGE-M3 稠密+稀疏向量生成成功")
            return dense_vector, sparse_vector
        else:
            logger.warning("步骤5：向量生成工具返回结果格式不匹配")
            return None, None
    except Exception as e:
        logger.error(f"步骤5：向量生成失败，原因：{str(e)}", exc_info=True)
        return None, None


def step_6_save_to_milvus(state: ImportGraphState, file_title: str, item_name: str, dense_vector, sparse_vector) -> None:
    """
    步骤 6: 将结果存入 Milvus，并进行幂等性处理（清理旧同名商品数据）
    """
    # 读环境变量配置
    milvus_uri = os.environ.get("MILVUS_URL")
    collection_name = os.environ.get("ITEM_NAME_COLLECTION", "kb_item_names")

    if not milvus_uri:
        logger.warning("MILVUS_URL 环境变量未配置，跳过 Milvus 保存步骤")
        return

    logger.info(f"开始执行步骤6：将商品名称 [{item_name}] 保存到 Milvus [{collection_name}]")

    try:
        # 获取 Milvus 客户端单例
        client = get_milvus_client()
        if not client:
            logger.error("无法连接到 Milvus 数据库，保存失败")
            return

        # 集合初始化：不存在则创建（定义模式 + 构建 HNSW 及倒排索引）
        if not client.has_collection(collection_name=collection_name):
            logger.info(f"Milvus 集合 [{collection_name}] 不存在，开始初始化建表...")
            schema = client.create_schema(auto_id=True, enable_dynamic_field=True)
            
            # 主键
            schema.add_field(field_name="pk", datatype=DataType.INT64, is_primary=True, auto_id=True)
            # 基础字段
            schema.add_field(field_name="file_title", datatype=DataType.VARCHAR, max_length=65535)
            schema.add_field(field_name="item_name", datatype=DataType.VARCHAR, max_length=65535)
            # 双路向量字段
            schema.add_field(field_name="dense_vector", datatype=DataType.FLOAT_VECTOR, dim=1024)
            schema.add_field(field_name="sparse_vector", datatype=DataType.SPARSE_FLOAT_VECTOR)

            # 配置索引参数
            index_params = client.prepare_index_params()
            
            # 稠密向量索引 (HNSW)
            index_params.add_index(
                field_name="dense_vector",
                index_name="dense_vector_index",
                index_type="HNSW",
                metric_type="COSINE",
                params={"M": 16, "efConstruction": 200}
            )
            # 稀疏向量索引 (倒排索引)
            index_params.add_index(
                field_name="sparse_vector",
                index_name="sparse_vector_index",
                index_type="SPARSE_INVERTED_INDEX",
                metric_type="IP",
                params={"inverted_index_algo": "DAAT_MAXSCORE", "quantization": "none"}
            )

            client.create_collection(collection_name=collection_name, schema=schema, index_params=index_params)
            logger.info(f"Milvus 集合 [{collection_name}] 初始化及索引配置成功！")

        # 幂等性清理：基于文件标题进行删除，防止同一个文件重复导入产生冗余
        clean_file_title = (file_title or "").strip()
        if clean_file_title:
            client.load_collection(collection_name=collection_name)
            # 转义文件标题中的敏感字符，防 SQL 注入式过滤报错
            safe_file_title = escape_milvus_string(clean_file_title)
            filter_expr = f'file_title=="{safe_file_title}"'
            client.delete(collection_name=collection_name, filter=filter_expr)
            logger.info(f"幂等性过滤完成：已按文件名清理历史数据 (Filter: {filter_expr})")

        # 组装数据并插入
        data = {
            "file_title": file_title,
            "item_name": item_name
        }
        if dense_vector is not None:
            data["dense_vector"] = dense_vector
        if sparse_vector is not None:
            data["sparse_vector"] = sparse_vector

        client.insert(collection_name=collection_name, data=[data])
        # 强制 load 加载进内存，使插入的数据在 Attu 可视化管理后台中立即可视、可查
        client.load_collection(collection_name=collection_name)
        logger.info(f"步骤6：数据成功持久化至 Milvus 集合 [{collection_name}]")

    except Exception as e:
        logger.error(f"步骤6：Milvus 存储异常，原因：{str(e)}", exc_info=True)


def node_item_name_recognition(state: ImportGraphState) -> ImportGraphState:
    """
    【主节点入口】商品主体名称识别节点
    """
    node_name = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行核心节点：【商品名称识别】{node_name}")
    add_running_task(state.get("task_id", ""), node_name)

    try:
        # 1. 提取并校验输入
        file_title, chunks = step_1_get_inputs(state)
        if not chunks:
            logger.warning("未接收到有效分片数据，跳过识别")
            return state

        # 2. 构建大模型识别上下文 (取前 K 个分片)
        context = step_2_build_context(chunks)

        # 3. 调用大模型识别商品名称
        item_name = step_3_call_llm(file_title, context)

        # 4. 回填数据到 State 与所有 Chunks
        step_4_update_chunks(state, chunks, item_name)

        # 5. 生成 BGE-M3 稠密 + 稀疏双路向量
        dense_vector, sparse_vector = step_5_generate_vectors(item_name)

        # 6. 保存数据并做幂等性处理入库 Milvus
        step_6_save_to_milvus(state, file_title, item_name, dense_vector, sparse_vector)

        logger.info(f">>> 商品名称识别节点执行成功：当前文档主体为 [{item_name}]")

    except Exception as e:
        logger.error(f">>> 商品名称识别节点执行失败，错误：{str(e)}", exc_info=True)
        # 兜底设置
        state["item_name"] = state.get("file_title", "未知商品")

    return state


# ===================== 本地单元测试入口 =====================
def test_node_item_name_recognition():
    """
    单元测试：独立运行此脚本，验证大模型提取与 Milvus/BGE 写入的完整逻辑
    """
    logger.info("=== 开始执行商品名称识别节点本地测试 ===")
    
    # 模拟上游分片节点产生的状态字典
    mock_state = ImportGraphState({
            "task_id": "test_item_name_task_888",
            "file_title": "澳洲学生公寓国内社交媒体推广执行计划书1",
            "file_name": "澳洲学生公寓推广计划书.pdf",
            "chunks": [
                {
                    "title": "# 澳洲学生公寓国内社交媒体推广执行计划书",
                    "content": "## 一、项目目标\n利用小红书、抖音、闲鱼三大平台，精准触达中国境内的潜在留学生及家长群体，建立品牌信任，高效引流咨询，最终完成公寓租赁签约。\n## 二、分平台执行策略\n1. 小红书（深度种草）：以'澳洲留学生活伙伴'人设，提供干货与公寓实拍。"
                },
                {
                    "title": "## 三、需要您提供的核心物料与流程支持",
                    "content": "为确保内容真实、专业，我们需要您提供：1.公寓素材包（外观、房型、周边），2.标准答疑与租赁流程文档，3.双路径签约合同。"
                }
            ]
    })

    # 执行节点逻辑
    result_state = node_item_name_recognition(mock_state)

    logger.info("=== 本地单元测试运行结束 ===")
    logger.info(f"最终提取到的商品/主体名：{result_state.get('item_name')}")
    
    # 检查 Milvus 数据库内容
    client = get_milvus_client()
    col_name = os.environ.get("ITEM_NAME_COLLECTION", "kb_item_names")
    if client and client.has_collection(col_name):
        client.load_collection(col_name)
        res = client.query(
            collection_name=col_name,
            filter=f'item_name == "{escape_milvus_string(result_state.get("item_name"))}"',
            output_fields=["file_title", "item_name"]
        )
        logger.info(f"📝 Milvus 查询验证结果: {res}")


if __name__ == "__main__":
    test_node_item_name_recognition()
```

#### 逐行解析：

*   **Line 31-52：输入校验与缺失 file_title 时切片兜底提取**
    ```python
    file_title = state.get("file_title", "") or state.get("file_name", "")
    if not file_title and chunks:
        file_title = chunks[0].get("file_title", "")
    ```
    *   **深度解析**：前置容错校验。由于后续大模型提炼商品名时需要关联文件名作为背景信息，如果 state 中由于某些原因没带入 `file_title`，会自动在提取出的第一个文本分片元数据中去读取兜底，避免产生业务缺失。

*   **Line 55-90：截取前 K 个文本分片并设立 2500 字符上下文防爆策略**
    ```python
    for idx, chunk in enumerate(chunks[:k]):
        if total_chars > max_chars:
            logger.info(f"上下文总字符数已达到上限 {max_chars}，停止拼接后续切片")
            break
    ```
    *   **深度解析**：上下文组装算法。本节点旨在识别整篇文档的主体商品名，所以只需阅读文档的前面部分即可（文章头部通常包含核心定义）。这里截取前 5 个切片进行结构化文本拼接，并且添加了 2500 字符的硬限额拦截，有效控制了调用大模型时的 Token 开销，并显著降低了首尾注意力的发散。

*   **Line 97-130：装载 Prompts 模板并以 0.1 极低温度请求大模型提炼实体**
    ```python
    llm = get_llm_client(json_mode=False)
    resp = llm.invoke(messages)
    item_name = getattr(resp, "content", "").strip()
    item_name = item_name.replace(" ", "").replace("\n", "")
    ```
    *   **深度解析**：LLM 提取核心。从 local_prompt 中读取预设的提示词，向大模型请求主体提取。这里特意在客户端将 `temperature` 参数控制为极低的 0.1，以最大化限制大模型胡编乱造（幻觉）的概率，保证输出的商品/主题名称是绝对客观的实体词。

*   **Line 137-145：将识别到的 `item_name` 原地回填至 chunks**
    ```python
    for chunk in chunks:
        chunk["item_name"] = item_name
    ```
    *   **深度解析**：内存状态原地注入。得到 LLM 的确定性提取名字后，循环所有分片，将 `item_name` 作为新的元数据键名，追加进每一个切片字典中，以供给下游入库节点作为幂等性删除与检索的过滤依据。

*   **Line 194-228：创建 kb_item_names 主表 Schema 及双路索引定义**
    ```python
    schema = client.create_schema(auto_id=True, enable_dynamic_field=True)
    schema.add_field(field_name="dense_vector", datatype=DataType.FLOAT_VECTOR, dim=1024)
    index_params.add_index(field_name="dense_vector", index_type="HNSW", metric_type="COSINE")
    index_params.add_index(field_name="sparse_vector", index_type="SPARSE_INVERTED_INDEX", metric_type="IP")
    ```
    *   **深度解析**：向量库 Schema 定义。定义了商品主键映射表 `kb_item_names`。声明其包含 `dense_vector`（1024维度）与 `sparse_vector`。分别为它们创建用于相似度匹配的 HNSW（余弦距离）索引和专门针对稀疏倒排计算的倒排索引（DAAT算法），实现了高效的检索通道。

*   **Line 231-240：对 file_title 执行格式安全转义并完成商品名主表幂等清理**
    ```python
    safe_file_title = escape_milvus_string(clean_file_title)
    filter_expr = f'file_title=="{safe_file_title}"'
    client.delete(collection_name=collection_name, filter=filter_expr)
    ```
    *   **深度解析**：写前删除的幂等操作。在此步骤中，首先利用 `escape_milvus_string` 函数对可能含有双引号或反斜杠的 `file_title` 执行安全字符转义，防止产生 SQL 注入式的表达式崩溃。随后在写入前调用 `delete` 清空该文件原先对应的所有商品记录，保证主表在重新导入文件时数据绝不重叠。


---

### app/import_process/agentTest/nodes/node_bge_embedding.py

```python
from dotenv import load_dotenv
import sys
import os
from typing import Any, List, Dict

from app.import_process.agentTest.state import ImportGraphState
from app.lm.embedding_utils import get_bge_m3_ef, generate_embeddings
from app.utils.task_utils import add_running_task,add_done_task
from app.core.logger import logger


#### 4. 步骤 1: 校验输入
def step_1_validate_input(state: ImportGraphState) -> List[Dict[str, Any]]:
    """
    向量化前置步骤1：输入数据有效性校验
    核心作用：
        1. 从全局状态提取待向量化的chunks切片列表
        2. 严格校验chunks类型和非空性，无有效数据则终止向量化
    参数：
        state: ImportGraphState - 流程全局状态对象
    返回：
        List[Dict[str, Any]] - 校验通过的文本切片列表
    异常：
        若chunks非列表/为空，抛出ValueError，终止当前向量化流程
    """
    # 从状态中提取切片数据
    texts_to_embed = state.get("chunks")
    # 校验：必须是非空列表，否则无法进行向量化
    if not isinstance(texts_to_embed, list) or not texts_to_embed:
        logger.error("向量化输入校验失败：chunks字段为空或非有效列表")
        raise ValueError("错误: 无有效文本切片数据，无法执行向量化处理")

    logger.info(f"向量化输入校验通过，待处理文本切片数量：{len(texts_to_embed)}")
    return texts_to_embed

#### 5. 步骤 2: 初始化模型


def step_2_init_model():
    """
    向量化步骤2：初始化BGE-M3模型实例（单例模式）
    核心作用：
        1. 调用单例函数get_bge_m3_ef，确保模型全局仅加载一次
        2. 校验模型实例有效性，加载失败则抛出明确异常
    返回：
        Any - 有效BGE-M3模型实例（embedding function）
    异常：
        模型加载失败（路径错误/显存不足/依赖缺失）时，抛出ValueError并提示配置问题
    """
    try:
        # 获取单例模型实例，避免重复加载浪费资源
        ef = get_bge_m3_ef()
        # 校验模型实例是否有效
        if ef is None:
            raise ValueError("BGE-M3模型实例为None：pymilvus.model模块未找到或模型加载失败")

        logger.info("BGE-M3模型实例初始化成功（单例模式）")
        return ef
    except Exception as e:
        # 包装异常信息，明确错误原因和排查方向
        error_msg = f"BGE-M3模型初始化失败：{e}，请检查模型路径/环境变量配置是否正确"
        logger.error(error_msg)
        raise ValueError(error_msg)

#### 6. 步骤 3: 批量生成向量


def step_3_generate_embeddings(texts_to_embed: List[Dict[str, Any]], bge_m3_ef: Any) -> List[Dict[str, Any]]:
    """
    向量化核心步骤3：批量生成稠密/稀疏双向量
    核心逻辑（分批执行，每批独立异常处理）：
        1. 文本拼接：item_name（商品名）+ 换行 + content（切片内容），强化核心特征
        2. 批量调用：传入拼接后的文本，生成批量双向量
        3. 向量绑定：为每个切片复制原数据，新增dense_vector/sparse_vector字段
        4. 异常兜底：单批次失败则保留原切片数据，继续处理下一批次
    参数：
        texts_to_embed: List[Dict[str, Any]] - 校验通过的文本切片列表，含item_name/content字段
        bge_m3_ef: Any - 步骤2初始化的BGE-M3模型实例
    返回：
        List[Dict[str, Any]] - 带向量字段的文本切片列表，异常批次保留原数据
    关键配置：
        batch_size: 每批处理5条，可根据服务器显存大小调整（显存大则调大，反之调小）
    """
    # 初始化结果列表，存储带向量的切片数据
    output_data = []
    # 批次大小配置：平衡显存占用和处理效率，建议根据实际环境调整
    batch_size = 5

    # 按批次遍历，避免一次性处理过多数据导致显存溢出（OOM）
    total = len(texts_to_embed)
    for i in range(0, total, batch_size):
        # 截取当前批次的切片，最后一批自动适配剩余数量【每次获取5个】
        batch_texts = texts_to_embed[i:i + batch_size]
        # 计算当前批次的起止索引，用于日志展示（方便看从1开始，也不获取下标，没有影响）
        start_idx, end_idx = i + 1, min(i + len(batch_texts), total)

        try:
            # 构造模型输入文本：拼接商品名+切片内容，增强核心特征
            input_texts = []
            for doc in batch_texts:
                item_name = doc["item_name"]
                content = doc["content"]
                # 有商品名则拼接（换行分隔提升模型识别效率），无则直接使用内容
                # 几乎所有的 Embedding 模型（尤其是基于 BERT 架构的），对前 128 个 token 的注意力是最集中的。越往后的词，对最终向量方向的拉扯力越弱。
                # **“核心词前置”**的原则
                # 方案 1：用强标点代替换行（最简单、最推荐）
                # 优化前：苹果手机\n性能很好...
                # 优化后：苹果手机。性能很好...
                # 方案2：加一点“微量”的语义胶水（适合属性明确的场景）
                text = f"商品：{item_name}，介绍：{content}" if item_name else content
                # Embedding 模型是个强迫症，你给它喂中文，就用全套中文标点伺候；给它喂英文，就用全套英文标点。保持 语境纯粹 ，生成的向量质量最高！
                input_texts.append(text)


            # 调用封装函数生成批量向量，返回格式：{"dense": [稠密向量列表], "sparse": [稀疏向量列表]}
            docs_embeddings = generate_embeddings(input_texts)
            if not docs_embeddings:
                logger.warning(f"第{start_idx}-{end_idx}条切片：向量生成返回空，保留原数据")
                output_data.extend(batch_texts)
                continue

            # 为当前批次每个切片绑定对应向量，复制原数据避免修改上游源数据
            for j, doc in enumerate(batch_texts):
                item = doc.copy()
                item["dense_vector"] = docs_embeddings["dense"][j]  # 绑定稠密向量
                item["sparse_vector"] = docs_embeddings["sparse"][j]  # 绑定稀疏向量（已归一化）
                output_data.append(item)

            logger.info(f"第{start_idx}-{end_idx}条切片：双向量生成成功")

        except Exception as e:
            # 捕获单批次所有异常，记录错误堆栈，不终止整体批量处理
            logger.error(
                f"第{start_idx}-{end_idx}条切片：向量生成失败，保留原数据 | 错误原因：{str(e)}",
                exc_info=True
            )
            # 异常批次保留原切片数据，保证数据完整性，后续可人工排查
            output_data.extend(batch_texts)
            continue

    return output_data
def node_bge_embedding(state: ImportGraphState) -> ImportGraphState:
    """
    LangGraph核心节点：BGE-M3文本向量化处理
    主流程（串行执行，全流程异常隔离）：
        1. 输入校验：验证chunks有效性，核心数据缺失则终止当前节点
        2. 模型初始化：获取BGE-M3单例模型实例，避免重复加载
        3. 批量向量化：分批拼接文本、生成双向量，为切片绑定向量字段
        4. 状态更新：将带向量的chunks更新回全局状态，供下游Milvus入库节点使用
    参数：
        state: ImportGraphState - 流程全局状态对象，包含上游传入的chunks、task_id等数据
    返回：
        ImportGraphState - 更新后的状态对象，chunks字段新增dense_vector/sparse_vector
    异常处理：
        节点内所有异常均捕获，不终止整体LangGraph流程，仅记录错误日志
    """
    # 获取当前节点名称，用于日志和任务状态记录
    current_node = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行LangGraph节点：{current_node}")

    # 标记任务运行状态，用于任务监控/前端进度展示
    add_running_task(state.get("task_id", ""), current_node)
    logger.info("--- BGE-M3 文本向量化处理启动 ---")

    try:
        # 步骤1：输入数据校验，核心chunks无效则抛出异常
        texts_to_embed = step_1_validate_input(state)

        # 步骤2：初始化BGE-M3模型（单例模式，仅加载一次）
        bge_m3_ef = step_2_init_model()

        # 步骤3：批量生成双向量，为切片绑定向量字段
        output_data = step_3_generate_embeddings(texts_to_embed, bge_m3_ef)

        # 步骤4：更新全局状态，将带向量的chunks回传下游
        state['chunks'] = output_data
        logger.info(f"--- BGE-M3 向量化处理完成，共处理 {len(output_data)} 条文本切片 ---")
        add_done_task(state.get("task_id", ""), current_node)
    except Exception as e:
        # 捕获节点所有异常，记录错误堆栈，不中断整体流程
        logger.error(f"BGE-M3向量化节点执行失败：{str(e)}", exc_info=True)

    # 返回更新后的状态对象，传递至下游节点
    return state


# ==========================================
# 本地单元测试入口
# 功能：独立验证向量化节点全链路逻辑，无需启动整个LangGraph流程
# 适用场景：本地开发、调试、模型有效性验证
# ==========================================
if __name__ == '__main__':
    # 加载环境变量：定位项目根目录下的.env，读取模型路径/设备等配置
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(current_dir))
    load_dotenv(os.path.join(project_root, ".env"))

    # 构造模拟测试状态：模拟上游节点输出的chunks数据，贴合真实业务场景
    test_state = ImportGraphState({
        "task_id": "test_task_embedding_001",  # 测试任务ID
        "chunks": [  # 模拟带item_name的文本切片（上游商品名称识别节点产出）
            {
                "content": "这是一个测试文档的内容，用于验证向量化是否成功。",
                "title": "测试文档标题",
                "item_name": "测试项目",
                "file_title": "测试文件.pdf"
            },
            {
                "content": "这是第二个测试文档的内容，用于验证批量处理逻辑。",
                "title": "测试文档标题2",
                "item_name": "测试项目",
                "file_title": "测试文件.pdf"
            }
        ]
    })

    # 执行本地测试
    logger.info("=== BGE-M3向量化节点本地单元测试启动 ===")
    try:
        # 调用核心节点函数
        result_state = node_bge_embedding(test_state)
        # 提取测试结果
        result_chunks = result_state.get("chunks", [])

        # 打印测试结果统计
        logger.info(f"=== 向量化节点本地测试完成 ===")
        logger.info(f"测试任务ID：{test_state.get('task_id')}")
        logger.info(f"待处理切片数：2 | 实际处理切片数：{len(result_chunks)}")
        logger.info(f"result_chunks: {result_chunks}")
        # 验证向量生成结果（打印向量字段是否存在）
        for idx, chunk in enumerate(result_chunks):
            has_dense = "dense_vector" in chunk
            has_sparse = "sparse_vector" in chunk
            logger.info(
                f"第{idx + 1}条切片：稠密向量生成{'' if has_dense else '未'}成功 | 稀疏向量生成{'' if has_sparse else '未'}成功")

    except Exception as e:
        logger.error(f"=== 向量化节点本地测试失败 ===" f"错误原因：{str(e)}", exc_info=True)
        # 新手友好提示：给出核心排查方向
        logger.warning("排查提示：请检查BGE-M3模型路径、显存是否充足、环境变量配置是否正确")    
```

#### 逐行解析：

*   **Line 51-57：本地 BGE-M3 模型函数的单例初始化（Singleton Protection）**
    ```python
    ef = get_bge_m3_ef()
    ```
    *   **深度解析**：模型加载优化。BGE-M3 属于重型深度学习模型，初始化涉及将大权重载入显存。这里通过单例模式封装函数，确保程序在运行工作流或测试时，模型全局只会被物理加载一次，彻底规避了多次重复调用节点导致的显存泄漏和 OOM 崩溃。

*   **Line 89-95：Batch=5 分批滑动窗口切流**
    ```python
    for i in range(0, total, batch_size):
        batch_texts = texts_to_embed[i:i + batch_size]
    ```
    *   **深度解析**：分批防爆机制。考虑到大文档切片可能成百上千，如果一次性将所有切片送入向量模型，极易导致显存溢出。这里采取了按批次（5个为一组）进行滑动窗口切流，逐步迭代生成。

*   **Line 98-112：特征前置与微量语义标点处理**
    ```python
    text = f"商品：{item_name}，介绍：{content}" if item_name else content
    input_texts.append(text)
    ```
    *   **深度解析**：向量检索优化策略。鉴于所有基于 BERT/Transformer 的向量模型对文本最前方的 128 个 Token 拥有最集中的权重注意力，代码在这里引入了“核心词前置”逻辑。在每一个切片正文前强行拼接 `商品：{item_name}，介绍：` 这一段微量“语义胶水”前缀，强化了商品关键词在向量空间中的朝向拉力。

*   **Line 122-127：双路向量（Dense & Sparse）并行回填绑定**
    ```python
    item["dense_vector"] = docs_embeddings["dense"][j]
    item["sparse_vector"] = docs_embeddings["sparse"][j]
    ```
    *   **深度解析**：多特征回写。从模型生成接口拿回数据后，循环当前批次，为每个切片分别绑定用于语义搜索的 1024 维 `dense_vector`（稠密）以及用于字面匹配的 `sparse_vector`（稀疏字典），为下游 Milvus 多路检索打下完备的数据基础。

*   **Line 131-139：单批次报错隔离与兜底逻辑**
    ```python
    except Exception as e:
        logger.error(f"向量生成失败，保留原数据 | 错误：{e}")
        output_data.extend(batch_texts)
        continue
    ```
    *   **深度解析**：高稳定性容错设计。若某一波文本因为特殊异常字符导致模型生成向量失败，该异常会被 `try-except` 捕获隔离，仅输出错误日志并保留其原始纯文本数据后继续下一批次，确保了局部报错绝不拖垮整条长流水线，具备极强的工业容灾抗性。


---

### app/import_process/agentTest/nodes/node_import_milvus.py

```python
import os
import sys
from typing import List, Dict, Any
# 导入Milvus相关依赖
from pymilvus import DataType
# 导入自定义模块
from app.import_process.agentTest.state import ImportGraphState
from app.clients.milvus_utils import get_milvus_client
from app.utils.task_utils import add_running_task
from app.core.logger import logger
from app.conf.milvus_config import milvus_config
from app.utils.escape_milvus_string_utils import escape_milvus_string
# 从配置文件读取切片集合名称，与配置解耦，便于环境切换
CHUNKS_COLLECTION_NAME = milvus_config.chunks_collection

def step_1_check_input(state: Dict[str, Any]) -> tuple[List[Dict[str, Any]], int]:
    """
    步骤1：输入数据有效性校验（入库前置必检）
    核心校验项：
        1. chunks非空且为列表类型
        2. 切片包含dense_vector核心字段（上游向量化节点必输）
        3. 提取向量维度，为集合创建/索引构建提供依据
    参数：
        state: Dict[str, Any] - 流程状态对象，包含上游传入的chunks数据
    返回：
        tuple - (校验通过的切片列表, 稠密向量维度)
    异常：
        任一校验项不通过，抛出ValueError终止入库流程，避免脏数据处理
    """
    # 提取待入库的切片数据
    chunks_json_data = state.get("chunks")
    # 校验1：chunks非空
    if not chunks_json_data:
        logger.error("Milvus入库校验失败：state中chunks字段为空")
        raise ValueError("错误: chunks为空，无法执行Milvus入库")
    # 校验2：chunks为非空列表
    if not isinstance(chunks_json_data, list) or len(chunks_json_data) == 0:
        logger.error("Milvus入库校验失败：chunks非列表类型或为空列表")
        raise ValueError("错误: chunks数据格式不正确，必须为非空列表")
    # 校验3：切片包含dense_vector字段（向量化节点核心产出）
    first_chunk = chunks_json_data[0]
    if 'dense_vector' not in first_chunk:
        logger.error("Milvus入库校验失败：切片缺失dense_vector字段，上游向量化节点可能执行失败")
        raise ValueError("错误: 数据中缺失dense_vector字段，请检查上游向量化节点执行状态")

    # 提取向量维度和商品名称，用于后续集合创建/日志展示
    vector_dimension = len(first_chunk['dense_vector'])
    item_name = first_chunk.get('item_name', '未知商品名')
    logger.info(
        f"Milvus入库校验通过，待入库切片数：{len(chunks_json_data)} | 向量维度：{vector_dimension} | 商品名称：{item_name}")

    return chunks_json_data, vector_dimension

#### 5. 步骤 2: 准备集合 


def create_collection(client, collection_name: str, vector_dimension: int):
    """
    辅助函数：Milvus集合+索引自动创建
    核心逻辑：
        1. 定义集合Schema：包含业务字段+双向量字段，自增主键chunk_id
        2. 构建向量索引：稠密向量用AUTOINDEX（Milvus自动选最优索引），稀疏向量用专用索引
    参数：
        client - MilvusClient实例（已连接）
        collection_name: str - 要创建的集合名称
        vector_dimension: int - 稠密向量维度（与向量化模型保持一致）
    """
    # 1. 创建Schema：自增主键+支持动态字段，适配灵活的业务扩展
    schema = client.create_schema(auto_id=True, enable_dynamic_fields=True)

    # 2. 新增字段：业务字段+主键+双向量字段，字段类型/长度适配业务场景
    schema.add_field(field_name="chunk_id", datatype=DataType.INT64, is_primary=True, auto_id=True)
    schema.add_field(field_name="content", datatype=DataType.VARCHAR, max_length=65535)  # 切片内容
    schema.add_field(field_name="title", datatype=DataType.VARCHAR, max_length=65535)  # 切片标题
    schema.add_field(field_name="parent_title", datatype=DataType.VARCHAR, max_length=65535)  # 父标题
    schema.add_field(field_name="part", datatype=DataType.INT8)  # 分片编号
    schema.add_field(field_name="file_title", datatype=DataType.VARCHAR, max_length=65535)  # 源文件标题
    schema.add_field(field_name="item_name", datatype=DataType.VARCHAR, max_length=65535)  # 商品名称（幂等性依据）
    schema.add_field(field_name="sparse_vector", datatype=DataType.SPARSE_FLOAT_VECTOR)  # 稀疏向量
    schema.add_field(field_name="dense_vector", datatype=DataType.FLOAT_VECTOR, dim=vector_dimension)  # 稠密向量
    # 对于 BGE-M3 模型 ：
    # 它的输出维度是固定的 1024 。
    # 所以你的代码里必须是：
    # ```
    # vector_dimension=必须是1024，不能改！
    # schema.add_field(...,dim=vector_dimension)
    # ``` (如果你用的是 BGE-base ，那就是 768； BGE-small 是 384。这完全由模型架构决定。)
    # 3. 构建索引参数：为向量字段创建索引，提升检索性能
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
        # 不同数据体量的推荐建议万级：
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

    # 4. 创建集合：Schema+索引参数结合，一次性完成初始化
    client.create_collection(collection_name=collection_name, schema=schema, index_params=index_params)
    logger.info(f"Milvus集合创建成功：{collection_name}，向量维度：{vector_dimension}")


def step_2_prepare_collection(vector_dimension: int):
    """
    步骤2：Milvus客户端连接+集合准备
    核心逻辑：
        1. 获取Milvus单例客户端，验证连接有效性
        2. 集合不存在则自动创建（Schema+索引），存在则直接复用
    参数：
        vector_dimension: int - 稠密向量维度（步骤1提取）
    返回：
        MilvusClient - 已连接、集合准备完成的客户端实例
    异常：
        客户端获取失败/集合名称未配置，抛出ValueError终止流程
    """
    logger.info(f"开始准备Milvus环境，目标集合：{CHUNKS_COLLECTION_NAME}")
    # 1. 获取Milvus单例客户端，验证连接
    client = get_milvus_client()
    if client is None:
        logger.error("Milvus客户端获取失败：get_milvus_client()返回空，连接可能异常")
        raise ValueError("Milvus 连接失败：get_milvus_client() 返回空")
    # 2. 验证集合名称配置
    if not CHUNKS_COLLECTION_NAME:
        logger.error("Milvus集合名称未配置：CHUNKS_COLLECTION_NAME为空")
        raise ValueError("未配置CHUNKS_COLLECTION集合名称")

    # 3. 集合不存在则自动创建
    if not client.has_collection(collection_name=CHUNKS_COLLECTION_NAME):
        logger.info(f"Milvus集合{CHUNKS_COLLECTION_NAME}不存在，开始自动创建Schema和索引")
        create_collection(client, CHUNKS_COLLECTION_NAME, vector_dimension)
    else:
        logger.info(f"Milvus集合{CHUNKS_COLLECTION_NAME}已存在，直接复用")

    return client

#### 6. 步骤 3: 清理旧数据 


def step_3_clean_old_data(client, chunks_json_data: List[Dict[str, Any]]):
    """
    步骤3：幂等性处理 - 基于item_name清理旧数据
    核心设计：
        插入新数据前删除同item_name的所有旧切片，确保多次执行仅保留最新数据
        支持多item_name批量清理，自动去重避免重复操作
    参数：
        client - MilvusClient实例
        chunks_json_data: List[Dict[str, Any]] - 待入库的切片列表
    """
    # 提取并去重item_name，避免重复清理同一商品数据
    # - 顺序 ：先循环 ( for ) -> 再判断 ( if ) -> 最后产出 ( name )。
    # - 海象操作符 ( := ) 的作用 ：它在第 ② 步判断的时候，顺手把处理好的字符串塞进了 name 变量里。如果 name 是空字符串 ""
    # （在 Python 里等同于 False）， if 条件不成立，第 ③ 步就不会执行，这个空值就被扔掉了。
    item_names = sorted(
    {   name  # ③ 最后一步：如果没被 if 拦住，把 name 丢进篮子里
        for x in chunks_json_data or []  # ① 第一步：开始循环，拿到 x
        if (name := str(x.get("item_name", "")).strip())  # ② 第二步：提取 -> 去空格 -> 赋值给 name -> 判断 name 是否为空
    })

    # 无有效item_name则跳过清理
    if not item_names:
        logger.warning("Milvus幂等性清理跳过：切片中无有效item_name")
        return
    # 多item_name提示日志
    if len(item_names) > 1:
        logger.warning(f"Milvus幂等性清理：本次检测到多个item_name，将逐个清理：{item_names}")

    # 遍历item_name，逐个清理旧数据
    for i_name in item_names:
        _clear_chunks_by_item_name(client, CHUNKS_COLLECTION_NAME, i_name)


def _clear_chunks_by_item_name(client, collection_name: str, item_name: str):
    """
    内部核心函数：根据item_name删除Milvus中的旧切片数据
    参数：
        client - MilvusClient实例
        collection_name: str - 集合名称
        item_name: str - 要清理的商品名称
    异常：
        清理失败抛出ValueError，终止整个入库流程（保证幂等性）
    """
    # 预处理：去除空格，空值直接返回
    i_name = (item_name or "").strip()
    if not i_name:
        logger.warning("Milvus单商品清理跳过：item_name为空")
        return
    if not collection_name:
        logger.warning("Milvus单商品清理跳过：集合名称未配置")
        return

    try:
        # 集合不存在则无需清理
        if not client.has_collection(collection_name=collection_name):
            logger.info(f"Milvus单商品清理跳过：集合{collection_name}不存在")
            return

        # 1. 商品名称安全转义，避免filter表达式报错
        safe_item_name = escape_milvus_string(i_name)
        filter_expr = f'item_name == "{safe_item_name}"'
        logger.info(f"Milvus幂等性清理：开始删除集合{collection_name}中item_name={i_name}的旧数据")

        # 2. 执行删除操作
        client.delete(collection_name=collection_name, filter=filter_expr)

        # 3. 强制flush，确保删除操作立即生效（避免Milvus异步延迟）
        if hasattr(client, "flush"):
            try:
                client.flush(collection_name=collection_name)
            except Exception as e:
                logger.warning(f"Milvus幂等性清理：flush操作失败，不影响主流程 | 错误：{str(e)}")

        logger.info(f"Milvus幂等性清理完成：成功删除item_name={i_name}的旧数据")
    except Exception as e:
        logger.error(f"Milvus幂等性清理失败：item_name={i_name} | 错误：{str(e)}", exc_info=True)
        raise ValueError(f"幂等清理失败（item_name={i_name}）: {e}")

#### 7. 步骤 4: 插入数据


def step_4_insert_data(client, chunks_json_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    步骤4：批量插入切片数据到Milvus+主键回填
    核心逻辑：
        1. 移除手动chunk_id：因auto_id=True，Milvus自动生成主键，避免冲突
        2. 批量插入数据：提升入库效率，减少Milvus连接次数
        3. 回填chunk_id：将Milvus生成的自增主键回填到切片，供下游业务使用
    参数：
        client - MilvusClient实例
        chunks_json_data: List[Dict[str, Any]] - 待入库的切片列表
    返回：
        List[Dict[str, Any]] - 回填了chunk_id的切片列表
    """
    # 1. 预处理数据：移除手动chunk_id，避免与Milvus自增主键冲突
    data_to_insert = []
    for item in chunks_json_data:
        item_copy = item.copy()
        if isinstance(item_copy, dict) and "chunk_id" in item_copy:
            item_copy.pop("chunk_id", None)
        data_to_insert.append(item_copy)

    logger.info(f"Milvus数据插入：准备{len(data_to_insert)}条切片数据，开始批量插入")
    # 2. 执行批量插入
    insert_result = client.insert(collection_name=CHUNKS_COLLECTION_NAME, data=data_to_insert)
    insert_count = insert_result.get('insert_count', 0)
    logger.info(f"Milvus数据插入完成：成功插入{insert_count}条数据，插入结果：{insert_result}")

    # 3. 主键回填：将Milvus生成的chunk_id回填到原始切片
    inserted_ids = insert_result.get('ids', [])
    if inserted_ids and len(inserted_ids) == len(chunks_json_data):
        logger.info(f"Milvus主键回填：开始将{len(inserted_ids)}个自增chunk_id回填到切片")
        for idx, item in enumerate(chunks_json_data):
            item['chunk_id'] = str(inserted_ids[idx])
        logger.info("Milvus主键回填完成：所有切片已绑定chunk_id")
    else:
        logger.warning(f"Milvus主键回填失败：生成ID数量({len(inserted_ids)})与切片数量({len(chunks_json_data)})不一致")

    return chunks_json_data

def node_import_milvus(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph核心节点：Milvus切片数据入库主流程
    执行流程（串行执行，一步一校验，保证数据一致性）：
        1. 输入校验：验证切片有效性、向量字段完整性，提取向量维度
        2. 环境准备：连接Milvus，集合不存在则自动创建Schema+索引
        3. 幂等清理：删除同item_name旧数据，避免重复存储
        4. 批量插入：预处理数据后批量入库，回填Milvus自增chunk_id
        5. 状态更新：将回填了chunk_id的切片更新回全局状态，供下游使用
    参数：
        state: Dict[str, Any] - 流程全局状态对象，包含chunks、task_id等数据
    返回：
        Dict[str, Any] - 更新后的状态对象，chunks字段回填chunk_id
    异常处理：
        任一步骤失败抛出ValueError，终止节点执行，保证数据不脏写
    """
    # 获取当前节点名称，用于任务监控和日志标识
    current_node = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行LangGraph节点：{current_node}（Milvus切片数据入库）")
    # 标记任务运行状态，用于前端进度展示/任务监控
    add_running_task(state["task_id"], current_node)
    logger.info("--- Milvus切片数据入库流程启动 ---")

    try:
        # 步骤1：输入数据有效性校验
        chunks_json_data, vector_dimension = step_1_check_input(state)
        # 步骤2：Milvus客户端连接+集合准备（自动建表）
        client = step_2_prepare_collection(vector_dimension)
        # 步骤3：幂等性处理 - 清理同item_name旧数据
        step_3_clean_old_data(client, chunks_json_data)
        # 步骤4：批量插入数据+主键chunk_id回填
        updated_chunks = step_4_insert_data(client, chunks_json_data)
        # 步骤5：更新全局状态，将回填后的切片回传下游
        state["chunks"] = updated_chunks

        logger.info("--- Milvus切片数据入库流程完成 ---")
    except Exception as e:
        logger.error(f"Milvus切片数据入库节点执行失败：{str(e)}", exc_info=True)
        raise ValueError(f"Milvus 导入过程中发生错误: {e}")

    return state

def step_1_check_input(state: Dict[str, Any]) -> tuple[List[Dict[str, Any]], int]:
    """
    步骤1：输入数据有效性校验（入库前置必检）
    核心校验项：
        1. chunks非空且为列表类型
        2. 切片包含dense_vector核心字段（上游向量化节点必输）
        3. 提取向量维度，为集合创建/索引构建提供依据
    参数：
        state: Dict[str, Any] - 流程状态对象，包含上游传入的chunks数据
    返回：
        tuple - (校验通过的切片列表, 稠密向量维度)
    异常：
        任一校验项不通过，抛出ValueError终止入库流程，避免脏数据处理
    """
    # 提取待入库的切片数据
    chunks_json_data = state.get("chunks")
    # 校验1：chunks非空
    if not chunks_json_data:
        logger.error("Milvus入库校验失败：state中chunks字段为空")
        raise ValueError("错误: chunks为空，无法执行Milvus入库")
    # 校验2：chunks为非空列表
    if not isinstance(chunks_json_data, list) or len(chunks_json_data) == 0:
        logger.error("Milvus入库校验失败：chunks非列表类型或为空列表")
        raise ValueError("错误: chunks数据格式不正确，必须为非空列表")
    # 校验3：切片包含dense_vector字段（向量化节点核心产出）
    first_chunk = chunks_json_data[0]
    if 'dense_vector' not in first_chunk:
        logger.error("Milvus入库校验失败：切片缺失dense_vector字段，上游向量化节点可能执行失败")
        raise ValueError("错误: 数据中缺失dense_vector字段，请检查上游向量化节点执行状态")

    # 提取向量维度和商品名称，用于后续集合创建/日志展示
    vector_dimension = len(first_chunk['dense_vector'])
    item_name = first_chunk.get('item_name', '未知商品名')
    logger.info(
        f"Milvus入库校验通过，待入库切片数：{len(chunks_json_data)} | 向量维度：{vector_dimension} | 商品名称：{item_name}")

    return chunks_json_data, vector_dimension


#### 8. 单元测试


if __name__ == '__main__':
    # --- 单元测试 ---
    # 目的：验证 Milvus 导入节点的完整流程，包括连接、创建集合、清理旧数据和插入新数据。
    import sys
    import os
    from dotenv import load_dotenv

    # 加载环境变量 (自动寻找项目根目录的 .env)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(current_dir))
    load_dotenv(os.path.join(project_root, ".env"))

    # 构造测试数据
    dim = 1024
    test_state = {
        "task_id": "test_milvus_task",
        "chunks": [
            {
                "content": "Milvus 测试文本 1",
                "title": "测试标题",
                "item_name": "测试项目_Milvus",  # 必须有 item_name，用于幂等清理
                "parent_title":"test.pdf",
                "part":1,
                "file_title": "test.pdf",
                "dense_vector": [0.1] * dim,  # 模拟 Dense Vector
                "sparse_vector": {1: 0.5, 10: 0.8}  # 模拟 Sparse Vector
            }
        ]
    }

    print("正在执行 Milvus 导入节点测试...")
    try:
        # 检查必要的环境变量
        if not os.getenv("MILVUS_URL"):
            print("❌ 未设置 MILVUS_URL，无法连接 Milvus")
        elif not os.getenv("CHUNKS_COLLECTION"):
            print("❌ 未设置 CHUNKS_COLLECTION")
        else:
            # 执行节点函数
            result_state = node_import_milvus(test_state)

            # 验证结果
            chunks = result_state.get("chunks", [])
            if chunks and chunks[0].get("chunk_id"):
                print(f"✅ Milvus 导入测试通过，生成 ID: {chunks[0]['chunk_id']}")
            else:
                print("❌ 测试失败：未能获取 chunk_id")

    except Exception as e:
        print(f"❌ 测试失败: {e}")    
```

#### 逐行解析：

*   **Line 100-116：动态 Schema 定义与 auto_id 自增主键设置**
    ```python
    schema = client.create_schema(auto_id=True, enable_dynamic_fields=True)
    schema.add_field(field_name="chunk_id", datatype=DataType.INT64, is_primary=True, auto_id=True)
    ```
    *   **深度解析**：Milvus 库表设计。将 `chunk_id` 设置为主键且为 `DataType.INT64` 类型，同时开启自增 `auto_id=True`（由向量库内核分配全局唯一 ID，免除了客户端生成并发重合的问题）。

*   **Line 123-149：构建 HNSW（余弦）索引与倒排稀疏索引（DAAT 算法）**
    ```python
    index_params.add_index(field_name="dense_vector", index_type="HNSW", metric_type="COSINE")
    index_params.add_index(field_name="sparse_vector", index_type="SPARSE_INVERTED_INDEX", metric_type="IP")
    ```
    *   **深度解析**：数据库检索优化。为稠密向量绑定目前检索效率最高的图索引 `HNSW`，并指定 Metric 为余弦夹角相似度（COSINE）；为稀疏向量绑定针对海量零值倒排设计的倒排索引 `SPARSE_INVERTED_INDEX`，Metric 设定为内积（IP）并设定非量化模式，保障了多路相似度打分精度。

*   **Line 183-188：双重 item_name 列表去重过滤**
    ```python
    item_names = sorted({
        name
        for x in chunks_json_data or []
        if (name := str(x.get("item_name", "")).strip())
    })
    ```
    *   **深度解析**：海象操作符去重提取。为了对这次入库的文件进行覆盖式清洗，通过推导式循环，在条件语句中使用海象操作符 `name := ...` 提取并剥离空格，最终使用集合 `set` 和 `sorted` 完成去重，提取出本批次所有唯一的商品名标识，为后续的幂等大扫除精准定位。

*   **Line 212-225：调用安全转义并批量幂等清理旧商品分片**
    ```python
    safe_item_name = escape_milvus_string(i_name)
    filter_expr = f'item_name == "{safe_item_name}"'
    client.delete(collection_name=collection_name, filter=filter_expr)
    ```
    *   **深度解析**：数据的幂等性防御逻辑。每次执行入库写入前，先获取转义安全的商品名 `safe_item_name`（防止特殊字符导致 filter 语句报 SQL 异常），随后下达 `delete` 命令扫除库里同名商品的历史切片，确保多次录入只有最新的唯一一份，彻底消除冗余垃圾块。

*   **Line 255-261：拷贝数据并 pop 剔除 chunk_id 规避自增主键 Schema 冲突**
    ```python
    item_copy = item.copy()
    if isinstance(item_copy, dict) and "chunk_id" in item_copy:
        item_copy.pop("chunk_id", None)
    ```
    *   **深度解析**：**核心工程细节**。由于该表被设置为了 `auto_id=True`，如果在批量 insert 的数据字典中存在 `chunk_id` 这个 Key（哪怕其值为 None 或历史 ID），Milvus 的底层数据校验机制会判定为非法传参并直接拒绝整批写入。所以在此处，代码克隆了数据并使用 `pop` 将可能残留的历史 ID 强制擦除，保障了 Milvus 写入的安全通过。

*   **Line 269-277：批量插入执行与自增物理 ID 的反向原地回填（Backfill）**
    ```python
    insert_result = client.insert(collection_name=CHUNKS_COLLECTION_NAME, data=data_to_insert)
    inserted_ids = insert_result.get('ids', [])
    if inserted_ids and len(inserted_ids) == len(chunks_json_data):
        for idx, item in enumerate(chunks_json_data):
            item['chunk_id'] = str(inserted_ids[idx])
    ```
    *   **深度解析**：数据回填的一致性保障。在 `client.insert` 执行完毕后，Milvus 内核会自动分配全局唯一的物理自增 IDs 并返回（`ids`）。我们提取这串 IDs，并将其反向遍历原地绑定回原始的内存对象 `chunks_json_data`（例如写入其 `chunk_id` 键），这就达成了内存中的 state、下游持久化中间 JSON 备份以及数据库主键三者完美同步的一致性闭环。


---

## 4. 复杂知识点 + 生活比喻


本项目的 RAG 文档导入工作流（`import_process`）中展现了多项重要的工程技术机制，其对应概念与精彩的生活比喻如下：

*   **知识点一：双路混合向量检索（Dense & Sparse Hybrid Search）**
    *   **官方描述**：混合检索将传统的稠密向量匹配（Dense Vector Search）与稀疏倒排索引匹配（Sparse Vector Search）相结合，通过重排融合（RRF）获取最优的相似度排序结果，达到语义理解与关键词精确匹配的双重效果。
    *   **生活比喻**：就如同我们在大型图书馆里找书。**稠密向量**就像是“根据你的阅读兴趣和模糊偏好推荐一批同类型的科幻小说”（注重的是语义相似）；而**稀疏向量**就像是“利用书名中的关键字如 ‘三体’ 进行精确检索”（注重的是字面精准对齐）。两者结合能让你既不会漏掉相关概念的小说，也不会因为找错人而空手而归。
    *   **代码对应**：[node_bge_embedding.py:Line 122-126](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_bge_embedding.py#L122-L126)，将模型生成的 `dense` 和 `sparse` 向量分别绑定至切片字段。
*   **知识点二：单例加载保护模式（Singleton Pattern）**
    *   **官方描述**：单例模式是一种创建型设计模式，确保一个类只有一个实例，并提供一个全局访问点。这对于需要大量资源进行初始化且仅需单个全局访问控制的模块（如大模型加载、连接池等）至关重要。
    *   **生活比喻**：就如同小镇上的唯一一辆公共汽车。虽然有很多乘客（多个文本解析批次）需要乘车出行，但小镇并不需要给每一位乘客单独配一辆大巴，那样很快就导致马路瘫痪（内存显存崩溃）。大家全局共用唯一的一辆公共汽车，车子在早上发动后（模型加载完毕），一直为后续的乘客提供周到的分批接送服务。
    *   **代码对应**：[node_bge_embedding.py:Line 51-57](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_bge_embedding.py#L51-L57)，通过 `get_bge_m3_ef()` 的单例机制保护本地模型仅在全局加载一次。
*   **知识点三：幂等性清理删除（Idempotent Clean）**
    *   **官方描述**：幂等操作指的是任意多次执行所产生的副作用与单次执行完全相同。在数据导入任务中，为了防止因重试或重复执行导致数据库中插入大量重复记录，通常在插入前根据唯一的业务标识进行预清理删除。
    *   **生活比喻**：就像是重新整理衣柜。如果你买了新的折叠衣物要放入衣柜，第一步不是直接塞进去（否则衣柜会被挤爆），而是先把衣柜里之前同款的旧衣服全部拿出来扔掉（清理旧数据），然后再把新整理好的衣服放进去。这样不论你重复整理多少次，衣柜里同款衣服永远只有最新的一份。
    *   **代码对应**：[node_import_milvus.py:Line 183-195](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_import_milvus.py#L183-L195)，根据商品名称 `item_name` 清理旧切片数据。
*   **知识点四：自增主键反向回写（Auto-ID Backfilling）**
    *   **官方描述**：当数据库配置主键自增时，客户端将不带主键标识的数据包发送至服务器，服务器在分配全局唯一 ID 后返回给客户端。客户端必须将该 ID 更新回本地实体对象，以实现业务上的后续追踪与精确关联。
    *   **生活比喻**：就像我们去餐厅吃饭排队领号。你（客户端）不需要自己给自己编个号，你直接向服务台（数据库）申请，服务台打印出一张带号的凭证（自增 ID）给你，你把这张凭证塞进钱包（回填到内存状态），后续服务员喊号（修改、删除或精确定位数据）时，你就直接拿出这张凭证进行对比。
    *   **代码对应**：[node_import_milvus.py:Line 270-275](file:///Users/jerry/Desktop/AI/rag_agent/app/import_process/agentTest/nodes/node_import_milvus.py#L270-L275)。

---

## 5. 核心闭环总结


在整个 RAG 知识库文件导入的生命周期中，工作流以 `task_id`（任务ID）和 `item_name`（商品或主题标识名称）为核心主线，实现了完美的闭环流转。在工作流的入口处，`task_id` 标识着整个导入事件的链路追踪。当文档进入解析和智能切片后，AI 大模型根据全文上下文语义动态提取出该文档的业务名 `item_name` 并回写。在向量化和向量数据库导入时，依靠 `item_name` 对向量库进行幂等性的旧文档数据预删除，接着将数据批量 insert 到 Milvus 中，最后捕获自增主键 `chunk_id` 逐一回填（Backfill）到内存状态的 `chunks` 中。这一连串动作将非结构化文件最终转化为绑定了全局唯一 ID、物理归档以及可双路混合检索的向量实体，完美完成了数据的高效导入与一致性闭环。

---

## 6. 关键数据结构/状态变量说明


下面是工作流全局状态容器 `ImportGraphState` 内的核心状态变量及数据结构说明：

| 状态变量名 | 数据类型 | 存储内容描述 | 修改时机 / 修改节点 | 读取时机 / 消费节点 |
| :--- | :--- | :--- | :--- | :--- |
| `task_id` | `str` | 导入任务的唯一标识 ID，用于链路日志追踪。 | 流程初始化创建 | 全流程节点、日志记录、任务状态服务 |
| `local_file_path` | `str` | 待解析文档在本地存放的物理路径。 | 流程初始化创建 | [node_entry]（根据其后缀路由分支） |
| `file_title` | `str` | 提取出来的无后缀纯文件名称，作为全局业务标识。 | [node_entry] 提取后缀前文本 | [node_pdf_to_md] 等解析节点，作为专属文件夹命名依赖 |
| `md_content` | `str` | 解析与转换完毕后的 Markdown 格式纯文本内容。 | PDF/Word/Excel 各自解析节点生成回写 | [node_md_img] 拦截图片；[node_document_split] 执行切分 |
| `chunks` | `list[dict]` | 文档切分出的一组文本切片列表。每一个切片都是一个字典。 | [node_document_split] 切分并初始化列表 | [node_item_name_recognition] 识别主体并注入；[node_bge_embedding] 计算向量；[node_import_milvus] 导入 |
| `item_name` | `str` | 大模型（LLM）从全文中识别出的核心商品/主题名称。 | [node_item_name_recognition] 提取并保存 | [node_import_milvus] 进行历史数据幂等性清理 |

---

## 7. 异常情况处理说明


为了保证能够在高并发、不稳定网络或复杂服务器环境下稳定运行，工作流设计了以下容错与异常防护机制：

1.  **超时控制与主动熔断（Timeout Check & Poll Active Break）**
    *   在调用 MinerU 异步转换平台时，网络请求设置了单次 API 短时超时。同时，在轮询获取 ZIP 包的 `while` 循环内部，添加了硬超时（600秒）保护。如果任务在规定时间内未完成，程序将主动引发 `TimeoutError` 并触发熔断保护，防止工作流工作线程处于无尽的死锁挂起状态。
2.  **分批切流与显存溢出预防（Batching Slide Window）**
    *   在为切片计算稠密及稀疏向量时，调用 BGE-M3 的过程按 `batch_size = 5` 进行切流。这种设计有效缓解了在大文件向量化时一次性推送给模型所引发的 GPU 显存溢出（OOM）问题。如果某一批次发生网络断连或崩溃，程序会通过 `try-except` 捕获异常，并在记录错误日志后跳过当前批次以保存其余完好批次的数据，防止局部崩溃引发整条导入流水线夭折。
3.  **连接复用与单例锁（Connection Reuse & Singleton）**
    *   通过 `requests.Session()` 在多次文件上传与接口交互中保持长连接复用（Keep-Alive），节省了频繁建立 TCP 握手的资源开销。同时，对 BGE-M3 模型使用单例锁模式进行全局唯一实力保护，防止高并发节点调用导致多次重复初始化模型，将系统死锁和显存崩坏扼杀在摇篮里。
4.  **接口上传容错与重试机制（MIME Enforce Retry）**
    *   在向 MinerU 传输大二进制流时，如果因为代理设置或签名失效导致 `Session` 上传 400 失败，捕获之后会自动强制添加标准 PDF header 后重新发起上传，具备极好的自愈能力。

---

## 8. 常见问题 FAQ


以下是结合本项目的工程实践提炼出的 4 个高价值、面试级的 FAQ 深度解答：

*   **Q1: 在 Milvus 中，为什么要采用 Dense Vector（稠密向量）与 Sparse Vector（稀疏向量）进行混合检索（Hybrid Search）？只用其中一种可以吗？**
    *   **A**: 只用一种是不行的，因为它们擅长的维度完全不同。**稠密向量**（来自 BGE-M3 语义映射）代表高维语义空间，擅长“同义词匹配”和“概念检索”（比如搜索“计算机”，能拉出带有“电脑”或“Macbook”的切片），但如果用户搜索的是极其精准的型号、SKU 或人名（如 "RS-12" 或 "徐展宏"），稠密向量往往会失焦；而**稀疏向量**（权重倒排索引）则极度擅长“精确字面对齐”。将两者结合进行 Hybrid Search，既能保证语义泛化，又兼顾了精准定位的刚性需求，是生产环境的刚性配置。
*   **Q2: 为什么在 node_import_milvus.py 节点入库前，一定要对 chunks 执行 pop("chunk_id", None)？如果留下这个 ID 会发生什么？**
    *   **A**: 这是因为 Milvus 集合在定义时将主键 `chunk_id` 配置为了自增（`auto_id=True`）。在自增主键模式下，Milvus 强制要求插入的每一行字典中不能包含主键的 key（哪怕值为 `None` 或 `""`），如果带有该主键 Key，Milvus 的底层协议校验会直接拦截并抛出 schema 校验冲突异常。因此，为了支持“失败重试运行”或“原地数据再次入库”，必须在插入的前一刻复制字典并 `pop` 掉 `chunk_id`，等待写入成功返回 S3 自增主键后，再进行内存状态回写。
*   **Q3: 原 Word 文档中有清晰的标题，为什么通过 node_docx_to_md.py 转换后，切片节点 node_document_split.py 却报告“未匹配到标题”，甚至把整份文档划分到了“无标题-1”中？**
    *   **A**: 这是由 mammoth 转换器与排版规范共同导致的。`mammoth` 转换器只认 Word 中定义为“标题 1”（Heading 1）或“标题 2”（Heading 2）的**语义段落样式**。如果用户排版时只是手动把文字加粗、调大字号，虽然在视觉上看起来是“标题”，但在 XML 的 DOM 树中它仍然是普通的 `p`（段落）元素。为了修复这种情况，应当在源文档中应用标准标题样式，或在 `mammoth` 转换时通过 `style_map` 进行强制字体和样式的隐式声明映射。
*   **Q4: 在高并发文档导入场景下，基于 item_name 物理删除旧数据的幂等性设计可能会面临什么风险？如何做并发安全防护？**
    *   **A**: 当两个任务在极短时间内对同一个 `item_name`（如同一个商品名）的文档进行导入时，由于 Milvus 的 `delete` 动作和 `insert` 动作在分布式集群中可能存在读写可见性延迟，可能会发生：任务 A 刚 delete 完正准备 insert，任务 B 就完成了 delete 并执行了 insert，随后任务 A 再执行 insert。这就导致两份数据同时落库形成冗余。在生产环境中，必须在工作流的上游引入**分布式红锁（Distributed Lock，如基于 Redis 的 Redlock）**，对同一 `item_name` 的写入任务在入口处进行互斥排队，从而保障数据落库的原子性。

---

## 9. 动手实验/验证方法


下面是为你设计的 2 套完全可复制并直接在本地运行的机制验证脚本：

#### 实验一：向量余弦相似度与精确文本匹配对比实验

本脚本演示了稠密向量（余弦距离）在概念近似上的泛化性，以及其在极小特定字符串识别上的局限。

在 `scratch/test_vector_similarity.py` 写入以下代码并执行：
```python
import numpy as np

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

# 模拟 3 个文档切片的稠密向量 (3 维)
# doc_1: "这里有一个高级前端开发工程师简历"
# doc_2: "招聘一位软件架构师"
# doc_3: "购买了一台家用电冰箱"
doc_1 = np.array([0.9, 0.1, 0.05])
doc_2 = np.array([0.8, 0.15, 0.02])
doc_3 = np.array([0.05, 0.1, 0.95])

# 查询词: "前端工程专家" (语义非常接近 doc_1)
query_1 = np.array([0.85, 0.08, 0.04])

print("--- 实验一：稠密空间余弦距离测试 ---")
sim_1_1 = cosine_similarity(query_1, doc_1)
sim_1_3 = cosine_similarity(query_1, doc_3)
print(f"语义相似度 [前端工程专家] vs [前端简历]: {sim_1_1:.4f} (高匹配)")
print(f"语义相似度 [前端工程专家] vs [冰箱]: {sim_1_3:.4f} (极低匹配)")
```

#### 实验二：多线程并发环境下的数据隔离与竞态冲突模拟

此脚本模拟了如果系统错误地使用了“全局共享状态变量”而不是独立的 Graph State 时，在高并发导入多个文件时会发生严重的“数据串台”故障。

在 `scratch/test_race_condition.py` 写入以下代码并执行：
```python
import threading
import time
import random

# 模拟错误的设计：使用全局全局变量存储解析内容
global_shared_state = {}

def buggy_node_parse(file_name, content):
    global global_shared_state
    print(f"[线程 {file_name}] 开始解析...")
    global_shared_state["file_title"] = file_name
    time.sleep(random.uniform(0.1, 0.3))
    print(f"❌ [线程 {file_name}] 解析完成，读取到的全局 file_title 是: '{global_shared_state['file_title']}' (期望值: '{file_name}')")

print("--- 实验二：并发冲突模拟（验证隔离性） ---")
t1 = threading.Thread(target=buggy_node_parse, args=("徐展宏简历.docx", "前端工程师内容"))
t2 = threading.Thread(target=buggy_node_parse, args=("窗式空调说明书.pdf", "制冷技术内容"))

t1.start()
t2.start()
t1.join()
t2.join()
```

---

## 10. 整体迁移指南


为了使整个文件导入框架可以便捷地移植到其他需要数据结构化和向量化导入的项目中，我们将核心流转控制抽象成一个通用的骨架模版。

你可以使用此模板开箱即用地在项目中接入新的节点：

```python
# new_node_template.py
import sys
from typing import Dict, Any
from app.core.logger import logger
from app.import_process.agentTest.state import ImportGraphState
from app.utils.task_utils import add_running_task, add_done_task

def node_custom_handler(state: ImportGraphState) -> ImportGraphState:
    # 1. 初始化及链路状态挂载
    node_name = sys._getframe().f_code.co_name
    logger.info(f">>> 开始执行自定义节点: {node_name}")
    add_running_task(state.get("task_id", "default_task"), node_name)
    
    try:
        # 2. 从 state 中消费上游数据
        file_path = state.get("local_file_path", "")
        logger.info(f"正在处理待导入文件: {file_path}")
        
        # ==========================================================
        # 这里编写你自定义的业务代码（例如：读写、数据清洗、正则重构等）
        # ==========================================================
        parsed_markdown = "# 业务自定义标题\n\n这里是经过节点抽取转换出的纯文本内容。"
        
        # 3. 回写状态结果到 state 字典
        state["md_content"] = parsed_markdown
        logger.info("自定义内容解析回写成功！")
        
    except Exception as e:
        logger.error(f"自定义节点 {node_name} 运行异常: {str(e)}", exc_info=True)
        raise ValueError(f"节点 {node_name} 执行失败: {e}")
        
    finally:
        # 4. 链路状态卸载与日志落盘
        add_done_task(state.get("task_id", "default_task"), node_name)
        logger.info(f"<<< 自定义节点 {node_name} 执行完毕")
        
    return state
```

---

## 11. 学习检查清单


在你完成本文档的阅读和实践学习后，建议使用以下检查清单来检验你对整个导入工作流（`import_process`）原理的掌握程度：

- [ ] **Q1**: 我能清楚地指出为什么在向量库配置了 `auto_id=True` 时，入库前必须要执行 `pop("chunk_id")` 操作。
- [ ] **Q2**: 我理解了 `node_entry` 中是如何根据 `local_file_path` 的后缀名动态判定并激活后续条件路由开关的。
- [ ] **Q3**: 我了解了 `mammoth` 库的解析原理，并能解释为什么普通的段落文本加粗无法被 mammoth 直接识别为 Markdown 中的 `#` 标题。
- [ ] **Q4**: 我能熟练解释 `node_md_img` 是如何利用正则表达式检测出本地图片，并将其无缝上传到云端 OSS 然后进行 URL 替换的。
- [ ] **Q5**: 我知道 `node_document_split` 节点在切片长度控制中，同时使用长切分（Recursive）与短合并（Merge）的业务出发点各是什么。
- [ ] **Q6**: 我掌握了 BGE-M3 模型双路向量生成中稠密向量（Dense）与稀疏向量（Sparse）各自的优劣势和互补价值。
- [ ] **Q7**: 我明白了 `node_import_milvus` 中在执行大批量插入（insert）前，必须依靠 `item_name` 进行旧数据删除（delete）的幂等性设计初衷。
- [ ] **Q8**: 我清楚在分布式高并发写入同一个 `item_name` 文档时可能产生的并发竞态问题，并知道如何引入分布式锁进行保障。
- [ ] **Q9**: 我通过本地的“线程并发模拟”实验，深刻认识到了在编写 LangGraph 各个节点时，严禁使用全局共享状态变量的架构底线。
- [ ] **Q10**: 我能通过对 DataFrame 执行 `to_markdown` 函数，快速将 Excel 数据表转换为大模型友好阅读的 Markdown 表格格式。
