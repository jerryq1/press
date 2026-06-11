---
title: Python 虚拟环境激活
date: 2026-04-27
abstract: Python 虚拟环境激活
tags:
- Ai实战项目
---

## Python 虚拟环境激活

### 为什么要激活虚拟环境？

虚拟环境为每个项目提供**独立的 Python 运行空间**：

| 问题 | 不激活的后果 | 激活后 |
|------|-------------|--------|
| 依赖冲突 | 项目 A 需要 `requests==1.0`，项目 B 需要 `requests==2.0`，全局安装会互相覆盖 | 每个项目使用自己的依赖版本，互不干扰 |
| 权限问题 | 全局安装可能需要 `sudo` | 虚拟环境装在自己项目目录，无需管理员权限 |
| 环境混乱 | 分不清某个包是哪个项目安装的 | `pip list` 只显示当前项目的包 |

**本质**：激活就是把虚拟环境的 `python` 和 `pip` 设为当前终端的第一优先级。

---

### 终端激活命令

```bash
# 进入项目目录
cd /path/to/your/project

# 使用uv创建虚拟环境
uv venv --python 3.12

# 激活虚拟环境（macOS/Linux）
source .venv/bin/activate

# 激活后，终端提示符会显示环境名
(.venv) jerry@192 project %

# 退出虚拟环境
deactivate
```

| 操作系统 | 激活命令 |
|---------|---------|
| macOS / Linux | `source .venv/bin/activate` |
| Windows | `.venv\Scripts\activate` |

---

### VS Code 设置虚拟环境

#### 方法一：通过命令面板（推荐）

1. `Cmd+Shift+P` 打开命令面板
2. 输入 `Python: Select Interpreter`
3. 选择 `./venv/bin/python`（显示为 `Python 3.x.x ('venv': venv)`）

#### 方法二：快捷键

- `Cmd+Shift+P` → 输入 `Python: Select Interpreter` → 选择虚拟环境

#### 验证是否设置成功

- VS Code 左下角会显示 `Python 3.x.x ('venv')`
- 新建终端会自动激活虚拟环境（终端提示符显示 `(.venv)`）

---

### 快速检查清单

```bash
# 检查当前使用的是哪个 Python
which python

# 正确输出（已激活虚拟环境）
/Users/xxx/project/.venv/bin/python

# 错误输出（使用全局 Python）
/usr/bin/python
```
