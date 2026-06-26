title: 导入数据节点实现与测试(node_entry)
date: 2026-06-15
abstract: 导入数据节点实现与测试(node_entry)
tags:
- Ai实战项目
---

# 导入数据节点实现与测试(node_entry)

## 5. 导入数据节点实现与测试

### 5.1 入口与类型判断 (node_entry)

**文件**: `app/import_process/agent/nodes/node_entry.py`
**相关工具类位置**: `app/utils/task_utils.py`

#### 节点作用与实现思路

**节点作用**: 作为数据加载流程的“总调度员”，负责接收外部输入的文件，识别文件类型（PDF或Markdown），并根据类型开启相应的处理分支。同时，它提取文件名作为全局元数据，并初始化任务追踪状态，确保后续流程可追溯、可监控。

**实现思路**:

1.  **路由分发**: 采用轻量级的条件判断逻辑，通过文件后缀 (`.pdf` / `.md`) 决定激活 `is_pdf_read_enabled` 还是 `is_md_read_enabled` 状态位，实现不同格式文件的差异化处理。
2.  **元数据提取**: 在入口处统一提取文件名 (`file_title`)，作为贯穿整个知识库构建流程的唯一标识，避免后续节点重复解析。
3.  **任务监控初始化**: 集成 `task_utils`，记录当前任务 ID 和初始状态，为前端提供实时的进度反馈。

#### 步骤分解

1.  **接收状态**: 获取 `local_file_path`。
2.  **判断类型**: 检查文件后缀是 `.pdf` 还是 `.md`。
3.  **设置标记**: 更新 state 中的 `is_pdf_read_enabled` 或 `is_md_read_enabled`，供主图路由使用。
4.  **提取标题**: 从文件名中提取 `file_title`，后续作为元数据。

####  工具类解读：任务追踪

**文件**: `app/utils/task_utils.py`

**实现思路**:

1.  **内存管理**: 使用简单的内存字典 `_tasks_running_list` 和 `_tasks_done_list` 记录任务状态，轻量高效。
2.  **状态映射**: 维护 `_NODE_NAME_TO_CN` 字典，将技术性的节点名称（如 `node_entry`）映射为用户友好的中文名称（如 `检查文件`），方便前端展示。
3.  **SSE 集成**: 集成 SSE (Server-Sent Events) 推送机制，允许实时将任务进度推送到前端。
4.  **操作封装**: 提供 `add_running_task` 和 `add_done_task` 接口，方便各节点调用，屏蔽底层状态管理细节。

#### 代码实现

```python
import os
import sys
from os.path import splitext

from app.core.logger import logger
from app.import_process.agent.state import ImportGraphState, create_default_state
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
    else:
        logger.warning(f"【{func_name}】文件类型校验失败：{document_path} → 不支持的格式，仅支持.pdf/.md")

    # 3. 提取文件无后缀纯名称，作为全局业务标识
    file_name = os.path.basename(document_path)
    state["file_title"] = splitext(file_name)[0]
    logger.info(f"【{func_name}】文件业务标识提取完成：file_title = {state['file_title']}")

    # 结束：记录节点运行状态
    add_done_task(state["task_id"], func_name)

    # 节点完成日志，打印当前工作流状态
    logger.debug(f"【{func_name}】节点执行完成，\n更新后工作流状态：{format_state(state)}")

    return state
```

关键语法补充说明

| 语法 / 函数                       | 具体作用                            | 执行示例                                        |
| :-------------------------------- | :---------------------------------- | :---------------------------------------------- |
| `os.path.basename(document_path)` | 从完整路径提取文件名                | `/data/kb/test.pdf` → `test.pdf` p.stem         |
| `splitext(file_name)`             | 拆分文件名和后缀                    | `test.pdf` → `('test', '.pdf')`                 |
| `state.get("key", "")`            | 安全提取状态值，无 key 时返回默认值 | `state.get("a", "")` → 无 "a" 则返回 ""         |
| `sys._getframe().f_code.co_name`  | 动态获取当前函数名                  | 本节点中返回 `node_entry`                       |
| `add_running_task/add_done_task`  | 记录任务的节点运行状态              | 用于任务监控面板，展示节点执行进度(fastapi使用) |

#### 单元测试

您可以在 `node_entry.py` 文件底部直接运行以下测试代码：

```python
if __name__ == '__main__':

    # 单元测试：覆盖不支持类型、MD、PDF三种场景
    logger.info("===== 开始node_entry节点单元测试 =====")

    # 测试1: 不支持的TXT文件
    test_state1 = create_default_state(
        task_id="test_task_001",
        local_file_path="联想海豚用户手册.txt"
    )
    node_entry(test_state1)

    # 测试2: MD文件
    test_state2 = create_default_state(
        task_id="test_task_002",
        local_file_path="小米用户手册.md"
    )
    node_entry(test_state2)

    # 测试3: PDF文件
    test_state3 = create_default_state(
        task_id="test_task_003",
        local_file_path="万用表的使用.pdf"
    )
    node_entry(test_state3)

    logger.info("===== 结束node_entry节点单元测试 =====")
```



