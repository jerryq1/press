---
title: ReportFlow 周报月报生成器
date: 2026-02-24
abstract: 大模型结合提示词完成周报月报生成器小项目
tags:
- Ai
- Serverless
---

# ReportFlow 周报月报生成器

![](images/20260415131913_131_179.png)

访问地址:https://report-flow-ld9w.vercel.app/

基于 AI 驱动的轻量级工作汇报生成器，致力将琐碎记录转化为专业文档。

##  工作流程
1. **配置**：本地存储 API Key (由阿里云百炼提供)。
2. **输入**：罗列工作事项原始要点。
3. **加工**：AI 润色，生成结构化的 Markdown 报告。

##  技术栈
| 分类 | 选型 | 说明 |
| :--- | :--- | :--- |
| **框架** | Next.js 16 | App Router 架构 & Turbopack |
| **语言** | TypeScript | 全栈类型安全 |
| **视图** | React 19 + CSS Modules | 无第三方 UI 库，极致性能 |
| **AI 模型** | DeepSeek-V3 | 部署于阿里云百炼平台 |
| **解析器** | React-Markdown | 专业的 Markdown 渲染引擎 |

##  核心技术要点
- **零数据库依赖**：API Key 仅存储于用户浏览器的 `localStorage` 中，100% 隐私保护。
- **自定义 Markdown 渲染**：利用 `react-markdown` 深度定制组件，解决 `div` 嵌套 `p` 等 HTML 合规性与水合问题。
- **智能交互系统**：
    - **图片预览**：基于 React 状态管理的 `ClientGuide` 组件实现图片点击全屏放大。
- **第三方核心库**：
    - `remark-gfm`: 扩展支持 Markdown 表格、任务列表等高级语法。

---
**快速开始**：`npm install && npm run dev`
