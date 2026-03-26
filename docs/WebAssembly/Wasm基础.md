---
title: WebAssembly (Wasm) 基础知识
date: 2026-03-27
abstract: Wasm基础知识描述
tags:
- WebAssembly
---


# WebAssembly (Wasm) 基础知识

WebAssembly 是一种在现代 Web 浏览器中运行的新型代码格式，它为 Web 带来了近乎原生的执行性能。本篇将根据官方定义，结合生活比喻，带你深入浅出地掌握 WASM 的核心基础。

##  目录大纲
1. [一、 WebAssembly 的定义与特点](#一-webassembly-的定义与特点)
2. [二、 二进制格式 (.wasm) 与文本格式 (.wat)](#二-二进制格式-wasm-与文本格式-wat)
3. [三、 WASM 模块的结构详解](#三-wasm-模块的结构详解)
4. [四、 WASM 与 JavaScript 的关系](#四-wasm-与-javascript-的关系)
5. [五、 实战示例：如何在网页中运行 WASM](#五-实战示例如何在网页中运行-wasm)

---

## 一、 WebAssembly 的定义与特点

### 1. 官方定义 (Official Definition)
WebAssembly (简称 Wasm) 是一种高效的、低级的二进制指令格式。它旨在作为 **C/C++/Rust/Go** 等语言的编译目标，使其能以近乎原生的速度在浏览器中运行。

### 2. 生活比喻：【全能管家 vs 职业运动员】
*   **JavaScript** 就像是一位**全能管家**：他非常聪明、灵活，什么活都能干（UI 交互、处理逻辑、调 API），但由于他需要处理的事情太杂，在进行超高强度的“搬砖”（如视频解码、物理演算）时，效率会遇到瓶颈。
*   **Wasm** 就像是一位**职业运动员**：他只专注做一件事（高性能计算）。他虽然不擅长打扫卫生（不直接操作 DOM），但在“百米短跑”（计算密集型任务）上，他能比全能管家快得多。

### 3. 三大核心特点：
- **高效**：二进制格式极小，下载快，且能以接近硬件的原生速度执行。
- **安全**：运行在沙箱环境（Sandbox）中，与宿主系统隔离。
- **跨平台**：一套代码，可以在各种浏览器和环境中运行。

---

## 二、 二进制格式 (.wasm) 与文本格式 (.wat)

### 1. 官方定义 (Official Definition)
- **.wasm (Binary Format)**：这是实际分发给浏览器执行的格式。它是紧凑的字节码，人类几乎无法直接阅读。
- **.wat (Text Format)**：这是 Wasm 的文本表现形式（类似于汇编语言）。它使用 S-表达式（S-expressions）结构，方便开发者进行调试和阅读。

### 2. 生活比喻：【压缩包 vs 装修草图】
*   **.wasm** 就像是**宜家家具的压缩包装盒**：它体积极小、排列紧凑，虽然你从外面看不出里面到底长什么样，但它最适合运输（网络传输）和快速组装（机器解析）。
*   **.wat** 就像是**家具的组装草图**：它是人能看懂的说明书。虽然你不会直接拿说明书当家具用，但当你发现家具装错位置时，你得靠它来排查问题。

---

## 三、 WASM 模块的结构详解

### 1. 官方定义 (Official Definition)
一个标准的 WASM 模块由多个“节”（Sections）组成，主要包含：
- **Types**: 定义函数签名（参数和返回值）。
- **Functions**: 模块内部的逻辑函数。
- **Imports/Exports**: 从外部导入的东西，以及暴露给外部使用的接口。
- **Memory**: 线性内存，用于存储数据的大数组。

### 2. 生活比喻：【标准化的集装箱】
一个 WASM 模块就像是一个**标准集装箱**：
- **清单 (Types/Imports)**：列出了集装箱需要什么燃料，以及里面装了什么规格的货。
- **货物 (Functions)**：集装箱里的精密机器。
- **储物架 (Memory)**：集装箱里一个连续的货架，用来放原始数据。
- **出口窗口 (Exports)**：集装箱侧面开的小窗，外面的人可以通过这个窗口启动里面的机器。

---

## 四、 WASM 与 JavaScript 的关系

### 1. 官方定义 (Official Definition)
Wasm 不是为了取代 JavaScript，而是为了**互补**。它们通过 `WebAssembly JavaScript API` 进行通信，JS 负责控制和调用，Wasm 负责繁重的计算。

### 2. 生活比喻：【导演与特技演员】
*   **JavaScript 是导演**：他负责把控整场戏的进度，安排什么时候开始，什么时候结束，并处理琐碎的现场事务（用户交互、页面展示）。
*   **Wasm 是特技演员**：他平时不出面。只有当导演遇到“高难度动作”（密集计算、图形渲染）时，才会喊特技演员上场。演完后，特技演员把结果交给导演，由导演决定怎么展示。

---

## 五、 实战示例：如何在网页中运行 WASM

通常我们会用 C/Rust 编写代码并编译成 `.wasm`。以下是使用 JavaScript 加载并调用一个简单 WASM 模块的流程：

### 1. 生成的 WAT 示例 (add.wat)
```lisp
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add)
  (export "add" (func $add))
)
```

### 2. JavaScript 加载代码
```javascript
async function runWasm() {
  // 1. 获取二进制流
  const response = await fetch('add.wasm');
  const bytes = await response.arrayBuffer();

  // 2. 实例化模块
  // WebAssembly.instantiate 是最常用的 API
  const { instance } = await WebAssembly.instantiate(bytes);

  // 3. 调用导出的函数
  const result = instance.exports.add(10, 20);
  console.log('WASM 计算结果:', result); // 输出 30
}

runWasm();
```

---

##  总结
“WebAssembly 并不是要终结 JavaScript，它是 Web 的**性能推进器**。它通过**二进制字节码**提供近乎原生的速度，通过**线性内存**实现高效数据交换。在处理视频编解码、3D 渲染或大型游戏等场景时，Wasm 是 JS 不可或缺的‘最强辅助’。”
