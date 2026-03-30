---
title: TypeScript tsconfig.json 配置
date: 2026-03-30
abstract: TS的tsconfig.json 配置
tags:
- TypeScript
---

# TypeScript tsconfig.json 配置详解

`tsconfig.json` 是 TypeScript 项目的根目录文件，用于指定编译项目所需的根文件和编译器选项。

## 1. tsconfig.json 的作用

1.  **定义根目录**：标识当前目录为 TS 项目。
2.  **控制编译行为**：告诉 `tsc` 如何将 `.ts` 文件转换为 `.js`。
3.  **配置编辑器支持**：现代 IDE（如 VSCode）通过读取此文件来提供实时的类型检查和语法高亮。

---

## 2. 常用编译选项 (compilerOptions)

| 选项 | 描述 |
| :--- | :--- |
| `target` | 指定编译后的 JavaScript 版本（如 `ES5`, `ES6`, `ESNext`）。 |
| `module` | 生成代码的模块标准（如 `CommonJS`, `ESNext`, `UMD`）。 |
| `lib` | 编译过程中需要引入的库文件列表（如 `DOM`, `ES2015`）。 |
| `outDir` | 指定编译输出目录（如 `./dist`）。 |
| `strict` | 启用所有严格类型的检查规则（推荐开启）。 |

---

## 3. 严格模式与精细化选项

开启 `strict: true` 后，会自动开启以下核心选项：

- **`strictNullChecks`**：不允许将 `null` 或 `undefined` 赋值给非空类型。
- **`strictFunctionTypes`**：对函数参数进行更严格的逆变检查。
- **`noImplicitAny`**：禁止隐式的 `any` 类型声明。

**【面试口白】**：
> "在项目初期，开启 `strict: true` 是最佳实践。这能让错误在编译期就被捕捉，极大减少运行时的 `undefined is not a function` 错误。如果是在老项目迁移，可以先关闭 `strict` 然后逐个开启这些精细化选项来平滑过渡。"

---

## 4. 路径映射 (Path Mapping)

用于简化 `import` 路径，避免层级过深的 `../../`。

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## 5. 项目引用 (Project References)

允许将大型 TypeScript 程序拆分为更小的独立项目，有助于减少编译时间。

```json
{
  "references": [
    { "path": "./src/common" },
    { "path": "./src/api" }
  ]
}
```

**【面试口白】**：
> "路径映射 `paths` 必须配合 `baseUrl` 才能生效。在 Webpack 或 Vite 项目中，通常还需要在构建工具（如 `vite.config.ts`）中配置对应的别名。而项目引用 `references` 则是 Monorepo 或大型架构中实现增量编译的关键。"
