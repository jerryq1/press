---
title: Agent Skills (技能扩展)
date: 2026-06-05
abstract: langchain家族DeepAgents-Agent Skills (技能扩展)
tags:
- Ai
- DeepAgents
---

# Agent Skills (技能扩展)

## 1.10 Agent Skills (技能扩展)

> **💡 打个比方**：想象一下，你的Agent是一位万能工匠，而Skills就是他随取随用的"专业工具箱"。每个工具箱里都有一本"说明书"（SKILL.md）和配套工具，让工匠无需改变自身，就能瞬间变身为代码审查专家或数据处理大师。

DeepAgents 提供的 **Skills（技能）** 机制，是为智能体（Agent）注入领域知识与专业能力的核心方式。Skills 本质是可复用、可插拔的 "能力包"，核心由指令文档（SKILL.md）及配套资源构成，能让 Agent 在运行过程中，根据任务场景的实际需求动态加载、调用对应的技能知识，无需修改 Agent 核心逻辑即可快速扩展专业能力。

https://skillsmp.com/zh

> 📌 注：上方链接为 Skills 官方文档网站，供参考学习。

---

**核心概念：**

- **SKILL.md**：技能的核心描述文件，是 Agent 学习和使用该技能的 "说明书"。文件整体分为两部分 —— 头部的**元数据（Frontmatter）**（以 YAML 格式定义 name 和 description）和正文的**具体指令**（以 Markdown 格式编写），Agent 会通过解析该文件掌握技能的使用方法、适用场景及操作流程。

- **渐进式披露**：Skills 机制的核心优化策略，用于解决大模型上下文窗口有限的问题。

  > **📖 生活比喻**：这就像一个高效的图书管理员：他不会一次性把所有书都堆在桌子上（占用上下文），而是先扫描书架上的"书名和标签"（元数据）。只有当你说"我要借关于Python数据清洗的书"时，他才会走过去把那本书（具体指令）拿下来给你。

  Agent 启动时仅读取所有技能的元数据（轻量信息，占用极少上下文），仅记录 "技能名称、适用场景、触发关键词" 等基础信息；只有当用户任务匹配某一技能的触发条件时，Agent 才会加载该技能的详细指令内容，有效避免无关信息占用上下文，提升任务执行效率。


  ![image-20260312165423918](images/image-20260312165423918.png)


---

**标准技能目录结构：**

一个完整的 DeepAgents 技能包遵循标准化的文件目录结构，不同文件各司其职，确保技能可复用、易维护，典型结构如下：

```cmd
skill-xxx/                # 技能根目录（命名规范：skill-技能名，小写+短横线）
├── SKILL.md              # 核心：技能描述文件（必选）
├── requirements.txt      # 依赖声明文件（可选）
├── resources/            # 配套资源目录（可选）
│   ├── template/         # 模板文件（如报表模板、代码模板）
│   ├── examples/         # 示例文件（如技能使用的输入/输出示例）
│   └── config/           # 配置文件（如工具调用的默认参数、规则配置）
└── scripts/              # 辅助脚本目录（可选）
    └── helper.py         # 技能配套的辅助脚本（如复杂逻辑的封装、数据预处理）
```

各文件 / 目录的具体功能：

1. **SKILL.md（必选）**

   技能的核心载体，是 Agent 唯一需要解析的文件，典型结构如下：

   ```markdown
   ---
   # === 核心字段（Agent启动时必读，用于匹配任务）===
   name: 数据清洗          # 技能唯一ID（建议使用英文小写+短横线，如 data-cleaning）
   description: 用于CSV/Excel数据的去重、缺失值处理、格式标准化等操作  # 【关键】Agent根据此描述判断是否触发该技能
   
   # === 扩展字段（可选，用于版本管理和精细化控制）===
   version: 1.0            # 技能版本
   trigger: ["清洗数据", "处理CSV", "缺失值填充"]  # 【可选】辅助关键词，与description配合使用
   tools: ["pandas", "read_csv", "write_csv"]     # 依赖工具声明
   author: xxx             # 技能作者
   ---
   # 具体指令（Agent 触发技能时读取）
   ## 技能说明
   本技能适用于结构化数据清洗，支持CSV/Excel格式，包含基础清洗和高级规整两类操作。
   
   ## 操作步骤
   1. 调用 read_csv 工具读取数据，指定编码为 utf-8；
   2. 执行去重操作：df.drop_duplicates(subset=["主键列"], keep="first")；
   3. 缺失值处理：数值列用均值填充，文本列用空字符串填充；
   4. 调用 write_csv 工具保存清洗后的数据，关闭索引输出。
   
   ## 注意事项
   - 若文件编码异常，尝试切换为 gbk 编码；
   - 缺失值占比超50%的列建议直接删除。
   ```

2. **requirements.txt（可选）**

   声明技能运行所需的第三方依赖包及版本，例如：

   ```cmd
   pandas>=2.0.0
   openpyxl>=3.1.0  # 支持Excel文件处理
   ```

   作用：部署技能时可一键安装依赖，避免因环境缺失导致技能执行失败。

3. **resources/（可选）**

   > **📖 生活比喻**：这就像给"说明书"配的"图示与模板"。Agent在执行时可以直接套用这些模板生成报告，或参考示例理解输入输出格式。

   存放技能配套的静态资源，按用途细分：

    - `template/`：存放各类模板文件，如 "数据清洗报告模板.md""财务报表模板.xlsx"，Agent 可调用模板快速生成标准化输出；
    - `examples/`：存放技能使用示例，如 "原始数据示例.csv""清洗后数据示例.csv"，帮助 Agent 理解技能的预期输入 / 输出；
    - `config/`：存放配置文件（如 JSON/YAML 格式），如 "数据清洗规则.json"，定义固定规则（如日期格式、字段映射），避免硬编码在 SKILL.md 中。

4. **scripts/（可选）**

   > **📖 生活比喻**：这就像将"复杂维修步骤"封装成一个"一键启动按钮"。SKILL.md 只需按下按钮（调用函数），而不必重写所有复杂逻辑，使得指令更简洁。

   存放技能配套的辅助脚本，封装复杂逻辑或工具调用细节，例如：

    - `helper.py`：编写 `fill_missing_value()` 函数封装缺失值填充逻辑，SKILL.md 中只需调用该函数，无需写完整代码；
    - 脚本可被 Agent 调用的工具函数引用，简化 SKILL.md 中的指令复杂度，提升技能执行效率。

**补充说明**

- 技能包的核心是 `SKILL.md`，其余文件均为辅助，可根据技能复杂度选择是否添加；
- 所有文件需遵循 "轻量化" 原则，尤其是 SKILL.md 的详细指令部分，避免内容过长导致上下文超限；
- 技能包支持动态加载 / 卸载，可通过 DeepAgents 的 API 将技能注册到 Agent，也可在运行时移除无需使用的技能；
- **命名规范**：技能包目录名与 SKILL.md 中的 `name` 字段建议保持一致，便于维护和检索；`name` 字段建议使用英文小写+短横线格式（如 `data-cleaning`），避免中文或特殊字符。

---

**SKILL.md 标准格式示例：**

文件路径：`base/skills/code-reviewer/SKILL.md`

```markdown
---
name: code-reviewer
description: 当用户请求进行代码审查(Code Review)或寻找代码Bug时，使用此技能。
---
# Code Reviewer Skill (代码审查专家技能)

## 角色定义
你是一位拥有10年经验的资深架构师，以严谨、犀利著称。

## 审查标准 (Instructions)
在审查用户提供的代码时，必须严格遵循以下步骤：

1.  **安全性检查**：
    - 检查是否有 SQL 注入、硬编码密钥、路径遍历等安全风险。
    - 如果发现，必须用【高危】标签醒目标注。

2.  **性能优化**：
    - 检查是否有重复计算、无效循环或过大的内存占用。
    - 给出具体的优化代码建议。

3.  **代码风格 (PEP 8)**：
    - 检查变量命名是否规范。
    - 检查是否缺少必要的注释。

4.  **输出格式**：
    - 使用 Markdown 表格列出所有问题。
    - 评分：给代码打分 (0-100)。
```

> **⚠️ 注意**：Agent加载此技能后，将完全遵循上文的"角色定义"和"审查标准"来组织回复，尤其是强制要求的"输出格式"（Markdown表格+评分）。

---

**代码示例：加载外部 Skills 文件**

```python
import os
from pathlib import Path
from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langgraph.checkpoint.memory import MemorySaver
from dotenv import load_dotenv, find_dotenv

# 加载环境变量
load_dotenv(find_dotenv())

# ======================== 1. 设置 Backend ========================
# 物理路径映射示例：
#   - Unix/macOS: /Users/your_project/base/  (current_dir)
#   - Windows: C:/Users/your_project/base/
# 虚拟路径（Agent视角）: /  (FilesystemBackend的根)
current_dir = Path(__file__).parent.resolve()
fs_backend = FilesystemBackend(root_dir=current_dir)

# ======================== 2. 初始化 Agent ========================
llm = init_chat_model(
    model="qwen-max",
    model_provider="openai"
)

# 创建带 Skill 的 Agent
# 关键点：告诉Agent去虚拟路径下的 /skills/ 目录找技能包
# 物理路径映射：/skills/ -> /Users/your_project/base/skills/ (Unix)
#               /skills/ -> C:/Users/your_project/base/skills/ (Windows)
agent = create_deep_agent(
    model=llm,
    # 关键点1：注入文件系统后端
    backend=fs_backend,
    # 关键点2：告诉 Agent 在 /skills/ 目录下查找技能
    skills=["skills"],
    checkpointer=MemorySaver(),
    # System Prompt 可以很通用，具体的专业指令由 Skill 提供
    system_prompt="你是一个有用的 AI 助手。"
)

# ======================== 3. 运行演示 ========================

def run_demo():
    print("\n=== 场景：用户提供一段有问题的代码求审查 ===")
    
    bad_code = """
        def get_user(user_id):
            # 连接数据库
            import sqlite3
            conn = sqlite3.connect('test.db')
            cursor = conn.cursor()
            # 直接拼接 SQL，有注入风险！
            sql = "SELECT * FROM users WHERE id = " + user_id
            cursor.execute(sql)
            return cursor.fetchall()
    """
    
    print(f"用户代码片段:\n{bad_code}\n")
    print(">>> Agent 正在思考并匹配技能...\n")

    # 用户的提问触发了 SKILL.md 中的 description ("当用户请求进行代码审查...")
    # Agent 会自动读取 SKILL.md 的内容，并按里面的步骤执行。
    result = agent.invoke({
        "messages": [
            {"role": "user", "content": f"请使用 code-reviewer 技能帮我 Review 一下这段代码：\n{bad_code}"}
        ],
    }, config={"configurable": {"thread_id": "skill_demo_v3"}})

    print("=== Agent 回复 (基于 code-reviewer 技能) ===")
    print(result["messages"][-1].content)

if __name__ == "__main__":
    run_demo()
```

**关键点：**

1. **物理存储**：将 `SKILL.md` 存放在实际的文件目录中 (`base/skills/code-reviewer/`)
2. **FilesystemBackend**：使用 `FilesystemBackend` 将本地目录挂载到 Agent 的虚拟文件系统中。
3. **Skills 路径映射**：`skills=["skills"]` 指向的是虚拟路径，Agent 会通过 Backend 自动映射到物理路径。

---

### 最佳实践速查表

> **💡 行动建议**：以下是使用 Skills 机制的核心要点，建议收藏备忘。

- 🎯 **描述要精准**：`description` 字段是Agent触发技能的"钥匙"，应清晰描述技能适用场景（如"当用户请求代码审查时使用"），而非功能本身。
- 📦 **保持轻量**：SKILL.md 正文内容越长，占用的上下文越多。超过5000字应考虑拆分到 `resources/` 或 `scripts/` 中。
- 🧪 **显式调用**：建议在用户提示词中**明确提及技能名称**（如"请使用 code-reviewer 技能"），以提高触发准确率，避免Agent凭"感觉"误判。
- 🔄 **版本管理**：为技能包设置 `version` 字段，并在更新时同步修改，便于回溯和排查问题。
- 🔍 **调试技巧**：如果技能未被触发，依次检查：
    1. `description` 是否清晰描述了触发场景；
    2. 用户提示词是否与描述匹配；
    3. `skills` 路径配置是否正确；
    4. SKILL.md 文件是否放置在正确的目录结构中。

---
