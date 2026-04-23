---
title: uv 快手上手（5分钟上手）
date: 2026-04-23
abstract: uv 快手上手（5分钟上手）
tags:
- Ai
- python
---

# uv 快手上手（5分钟上手）

## 🚀 一、安装 uv（30秒）

**Windows (PowerShell)**
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**macOS / Linux**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

验证安装：`uv --version`

---

## 📁 二、创建新项目（1分钟）

```bash
# 创建项目文件夹并进入
mkdir my-project && cd my-project

# 初始化项目（生成 pyproject.toml）
uv init

# 创建虚拟环境并同步依赖
uv sync
```

> **现在你的项目结构：**
> ```
> my-project/
> ├── .venv/          # 虚拟环境（自动创建）
> ├── .python-version # Python 版本锁定
> ├── pyproject.toml  # 项目配置
> ├── README.md       # 项目说明
> └── main.py         # 示例代码
> ```

---

## 📦 三、管理依赖（1分钟）

```bash
# 安装依赖包
uv add requests

# 安装开发依赖（如 pytest）
uv add pytest --dev

# 移除依赖
uv remove requests

# 查看已安装的包
uv pip list
```

---

## ▶️ 四、运行代码（30秒）

```bash
# 在项目环境中运行 Python 脚本
uv run python main.py

# 运行测试
uv run pytest

# 临时运行工具（不安装到项目）
uvx ruff check .
```

---

## 🔧 五、IDE 配置（1分钟）

### VS Code
1. 按 `Ctrl+Shift+P` → `Python: Select Interpreter`
2. 选择 `./.venv` 开头的解释器

### PyCharm
1. `Settings` → `Project` → `Python Interpreter`
2. 点击 `Add Interpreter` → `Existing` → 选择项目根目录下的 `.venv` 文件夹

---

## 📝 六、日常工作流

```bash
# 1. 拉取同事代码后
git pull
uv sync                    # 自动安装/更新依赖

# 2. 添加新依赖
uv add pandas

# 3. 运行主程序
uv run python app.py

# 4. 移除不需要的依赖
uv remove pandas
```

---

## 🎯 核心速查表

| 你想做什么 | 用什么命令 |
|---------|----------|
| 创建新项目 | `uv init` |
| 安装包 | `uv add <包名>` |
| 卸载包 | `uv remove <包名>` |
| 运行脚本 | `uv run python 脚本.py` |
| 同步环境 | `uv sync` |
| 临时运行工具 | `uvx <工具名>` |
| 固定 Python 版本 | `uv python pin 3.12` |

---

## 💡 记住这 3 个核心点

1. **不需要手动激活虚拟环境** - `uv run` 自动处理
2. **所有包命令都用 `uv` 开头** - 替代 `pip` 和 `python -m`
3. **`.venv` 在项目根目录** - IDE 直接选择它作为解释器

---

## 🎬 试试看

在你的终端执行这几条命令，体验完整流程：

```bash
# 一键体验
mkdir demo && cd demo
uv init
echo 'print("Hello, uv!")' > main.py
uv add requests
uv run python main.py
```

完成后你会看到：虚拟环境自动创建 → 依赖自动安装 → 代码成功运行 ✨



