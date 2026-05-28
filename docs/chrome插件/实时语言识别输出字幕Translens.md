---
title: 实时语言识别输出字幕Translens
date: 2026-05-28
abstract: chrome实时语言识别输出字幕插件。
tags:
- Ai实战项目
- chrome插件
---

# TransLens - Chrome 插件开发与实时语音翻译实战教程

你好！欢迎来到 Chrome 插件开发的奇妙世界。这篇文档是专门为你准备的 **TransLens 项目深度拆解指南**。即使你的基础薄弱，也不用担心。我们将把这个项目拆解成生活中的例子，带你一步步理解它的核心原理 and 开发流程。

看完这篇文档，你不仅能掌握 **Chrome 插件 (Manifest V3) 的核心架构**，还能学会**如何截获网页音频、如何使用 WebSockets，以及如何优雅地在别人网页里注入不冲突的 UI**。

## 目录
- [1. 整体结构与设计理念：我们为什么这么做？](#1-整体结构与设计理念我们为什么这么做)
- [2. 业务流程与开发详解（手把手教学）](#2-业务流程与开发详解手把手教学)
    - [第一棒：用户点击“开始”](#第一棒用户点击开始-popup---background)
    - [第二棒：获取录音权限并唤醒暗房](#第二棒获取录音权限并唤醒暗房-background---offscreen)
    - [第三棒：暗房疯狂截取音频发给 AI](#第三棒暗房疯狂截取音频发给-ai-offscreen---websocket---python-proxy)
    - [第四棒：AI 吐出字幕，前线施工队渲染](#第四棒ai-吐出字幕前线施工队渲染-offscreen---background---content)
- [3. 关键知识点大白话解析](#3-关键知识点大白话解析)
    - [Service Worker](#1-service-worker-对应-backgroundindexts)
    - [Offscreen Document](#2-offscreen-document-对应-offscreenhtml)
    - [Shadow DOM](#3-shadow-dom-对应-content-注入逻辑)
    - [WebSocket](#4-websocket-对应-proxy_serverpy-和-ws--new-websocket)
- [4. 攻克的难关](#4-攻克的难关)
- [5. 迭代优化记录](#5-迭代优化记录)
    - [5.1 字幕卡死问题修复](#51-字幕卡死问题修复)
    - [5.2 字幕重叠问题修复](#52-字幕重叠问题修复)
    - [5.3 消息竞态条件修复](#53-消息竞态条件修复)
    - [5.4 字幕 UI 体验升级](#54-字幕-ui-体验升级)

---

## 1. 整体结构与设计理念：我们为什么这么做？

**TransLens** 的目标是：**实时截获当前网页正在播放的声音（比如看无字幕外语视频），将其发送给 AI 识别，并把翻译后的字幕悬浮显示在网页上。**

为了实现这个目标，我们的项目采用了 **Chrome Extension Manifest V3 (MV3) + React + Vite + Python 代理服务** 的架构。整个项目由以下几个“部门”协同工作：

### 项目结构分布：
*   **`src/popup` (控制面板)**：你点击浏览器右上角插件图标弹出的界面。用来填写 API 密钥、选择引擎、点击“开始捕获”。
*   **`src/background` (调度中心 / Service Worker)**：插件的大脑。运行在浏览器后台，负责协调各个部门，但它**没有视觉界面（不能访问 DOM），也不能录音**。
*   **`src/offscreen` (幕后暗房)**：**这是 MV3 时代最重要的设计！** 因为后台大脑（Background）被剥夺了录音权限，且随时可能休眠。我们不得不创建一个用户看不见的隐形网页（Offscreen Document），专门在这个网页里开启录音（Web Audio API）并维持与服务器的长连接（WebSocket）。
*   **`src/content` (前线施工队 / Content Script)**：这段代码会被“强行注入”到用户当前正在看的网页中。它的任务就是在网页里画一个漂亮的字幕框。
*   **`proxy_server.py` (本地中转站)**：因为部分云端 AI 服务（如火山引擎）要求复杂的鉴权或特殊的 HTTP 请求头，而浏览器的 WebSocket 无法随意修改这些头，所以我们用 Python 跑了一个本地中转站。

### 为什么这么设计？（设计理念）
1.  **为什么不直接在 Background 里录音？**
    Chrome 官方为了省电和安全，在最新的 MV3 标准中使用了 Service Worker 替代了以前的后台页。Service Worker 没有网页环境（DOM），调不了音频接口。**所以我们用 Offscreen 充当“干脏活的替身”。**
2.  **为什么字幕要用 Shadow DOM？**
    如果直接在网页里加个 `<div>` 写字幕，网页原本的 CSS 样式（比如字体变大、颜色变红）可能会污染我们的字幕。Shadow DOM 就像一个隔离的“玻璃罩”，外面的样式进不来，里面的样式出不去，保证字幕永远美观。

---

## 2. 业务流程与开发详解（手把手教学）

整个流程可以分为四个接力棒。我们将详细讲解每一个接力棒是如何交接的。

### 第一棒：用户点击“开始” (Popup -> Background)

**业务流程**：用户在弹窗（Popup）输入完密钥，点击“开始捕获”。Popup 获取当前正在看的标签页 ID，并告诉“调度中心”（Background）：“喂，开始干活了！”

**核心代码 (`src/popup/index.tsx`)**：
```typescript
// 1. 获取当前活跃的标签页
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// 2. 发送消息给后台调度中心 (Background)
// 这里用到了 Chrome 的消息通信 API
chrome.runtime.sendMessage({ 
  type: 'START_CAPTURE', 
  tabId: tab.id 
}, (response) => {
  if (response.success) {
    console.log('启动成功！');
  }
});
```

### 第二棒：获取录音权限并唤醒暗房 (Background -> Offscreen)

**业务流程**：Background 收到指令后，首先去向 Chrome 申请捕获该标签页声音的“许可证”（Stream ID）。拿到许可证后，它唤醒隐藏的“暗房”（Offscreen），把许可证交给它，让它去录音。

**核心代码 (`src/background/index.ts`)**：
```typescript
async function handleStartCapture(tabId: number) {
  // 1. 唤醒暗房 (创建 Offscreen Document)
  // 这是 MV3 的关键 API，告诉浏览器我们需要一个不可见的网页来录音 (USER_MEDIA)
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA], // 理由：使用媒体设备
      justification: 'Recording tab audio for translation'
    });
  }

  // 2. 申请标签页录音许可证 (MediaStreamId)
  const streamId = await new Promise<string>((resolve) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => resolve(id));
  });

  // 3. 把许可证交给暗房 (发送消息)
  chrome.runtime.sendMessage({
    type: 'START_AUDIO_CAPTURE',
    streamId: streamId,
    // ... 附带 API keys 等配置
  });
}
```

### 第三棒：暗房疯狂截取音频发给 AI (Offscreen -> WebSocket -> Python Proxy)

**业务流程**：暗房收到许可证，立刻开启录音。它把连续的声音切成一小块一小块的“数据包”（PCM数据），通过 WebSocket 一刻不停地发给 Python 代理服务器，代理服务器再转给 AI（豆包或阿里云）。

**核心代码 (`src/offscreen/index.ts`)**：
```typescript
async function startCapture(streamId: string) {
  // 1. 凭许可证 (streamId) 真正拿到音频流
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab', // 指定录制标签页，而不是麦克风
        chromeMediaSourceId: streamId
      }
    } as any
  });

  // 2. 建立音频加工厂 (AudioContext)
  const audioContext = new AudioContext({ sampleRate: 16000 }); // AI 需要 16kHz
  // 引入我们自己写的处理器，用来切碎音频
  await audioContext.audioWorklet.addModule('audio-processor.js'); 
  
  const source = audioContext.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(audioContext, 'pcm-processor');

  // 3. 连接 WebSocket
  const ws = new WebSocket(`ws://127.0.0.1:8765/ws`);
  
  // 4. 每次音频被切碎（加工厂产出），就发给服务器
  processor.port.onmessage = (event) => {
    const audioBuffer = event.data;
    // ... 进行 WAV 封装或 Base64 编码 ...
    ws.send(packet.buffer); 
  };
  
  // 将音频流输入到加工厂
  source.connect(processor);
}
```

### 第四棒：AI 吐出字幕，前线施工队渲染 (Offscreen -> Background -> Content)

**业务流程**：WebSocket 收到 AI 返回的 JSON 字幕。Offscreen 把字幕发给 Background，Background 就像个邮局，精准地把字幕派发给当初那个被录音的标签页（Content Script）。Content Script 收到后，在屏幕上画出来。

**核心代码 (`src/content/index.tsx`)**：
```tsx
// 1. 创建字幕容器并注入到别人网页的 body 中
let container = document.createElement('div');
document.body.appendChild(container);

// 2. 核心：附加 Shadow DOM（防止样式冲突）
const shadowRoot = container.attachShadow({ mode: 'open' });
const shadowContainer = document.createElement('div');
shadowRoot.appendChild(shadowContainer);

// 3. 使用 React 监听消息并渲染 UI
const SubtitleOverlay = () => {
  const [sentences, setSentences] = useState([]);
  
  useEffect(() => {
    // 监听来自 Background 的字幕更新消息
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'SUBTITLE_UPDATE') {
        // 更新 React 状态，重新渲染字幕
        setSentences(prev => updateSentences(prev, request.text, request.isFinal));
      }
    });
  }, []);

  return (
    <div className="subtitle-box">
      {sentences.map(s => <div key={s.id}>{s.text}</div>)}
    </div>
  );
};

// 4. 把 React 组件渲染进 Shadow DOM 里
createRoot(shadowContainer).render(<SubtitleOverlay />);
```

---

## 3. 关键知识点大白话解析

为了让你知其然更知其所以然，我们来消化一下这几个硬核概念：

### 1. Service Worker (对应 background/index.ts)
*   **官方描述**：一种独立于网页运行的事件驱动脚本，生命周期短暂，无法访问 DOM。
*   **生活类比**：**公司的“外包前台”**。她不属于任何一个具体的部门（页面），有人打电话（事件）她就接，把任务分发下去。但她没有权力动公司里的设备（没有 DOM，不能录音），而且如果几分钟没电话，她就会打瞌睡（休眠）。这解释了为什么我们要把重度工作移交给 Offscreen。

### 2. Offscreen Document (对应 offscreen.html)
*   **官方描述**：允许扩展在后台使用 DOM API 创建不可见文档的机制。
*   **生活类比**：**公司的“地下暗房”**。前台（Service Worker）搞不定的录音、长时间打电话（WebSocket），她就写个纸条（Message）塞给地下暗房。暗房有完整的设备，只要任务没结束，暗房就一直工作。

### 3. Shadow DOM (对应 content 注入逻辑)
*   **官方描述**：Web components 技术的一部分，允许将隐藏的 DOM 树附加到常规的 DOM 树中，实现封装。
*   **生活类比**：**“生化隔离箱”**。我们要在别人的网页（比如 YouTube）上写字幕，万一 YouTube 设置了 `div { background: red; }`，我们的字幕也会变红。把字幕放进 Shadow DOM，就像放进了一个无菌透明箱，外面网页的 CSS 毒气渗透不进来，保证字幕原汁原味。

### 4. WebSocket (对应 proxy_server.py 和 ws = new WebSocket())
*   **官方描述**：在单个 TCP 连接上进行全双工通信的协议。
*   **生活类比**：**“打电话 vs 发短信”**。普通的 HTTP 请求像发短信（发一次，回一次，挂断）。我们要实时语音翻译，一秒钟要传好几次声音，如果用 HTTP 就相当于每秒钟拨号挂断几十次。WebSocket 则是拨通了电话就不挂断（长连接），两边可以随便说话，延迟极低。

---

## 4. 攻克的难关


1.  **MV3 的后台限制陷阱**：当你发现 Service Worker 没法调用音频 API 时，你没有硬碰硬，而是优雅地利用了最新的 `chrome.offscreen` 架构，实现了隐式录音。
2.  **音频流的高级处理**：你跨越了普通的增删改查，深入了 Web Audio API，学会了用 `AudioWorkletNode` 像处理字节流一样处理声波（PCM 格式），这是多媒体前端的高阶技能。
3.  **UI 隔离与污染防御**：你熟练运用了 `Shadow DOM` 保护自己的组件。这说明你不仅能把功能做出来，还能保证它在极其复杂的外部环境（任意网页）中健壮运行。
4.  **跨端网络通信**：遇到浏览器 WebSocket 头限制时，你引入了 Python 代理服务，打通了 前端 -> 代理 -> 云端大模型 的全链路。

---

## 5. 迭代优化记录

以下记录了项目上线后在真实使用中发现的 Bug 和对应的修复思路，这些是比"做出功能"更有价值的工程经验。

### 5.1 字幕卡死问题修复

**现象**：AI 模型有时会在没有发送标准"结束"事件的情况下停止输出，导致最后一条字幕永远停在"草稿"状态，不再更新，看起来像卡住了。

**根本原因**：阿里云语音 API 的 WebSocket 协议中有多种"完成"事件类型（`response.text.done`、`response.audio_transcript.done`、`response.done`），而旧代码只监听了其中一种，其余情况下草稿句子永远不会被"确认"（finalize）。

**修复方案（双保险机制）**：

**修复 1 — `src/offscreen/index.ts`**：监听所有 done 类型事件，只要携带文本就立刻发送 `isFinal: true`。

```typescript
// 修复前：只处理 response.text.done
} else if (res.type === 'response.text.done' && res.text) {
  sendSubtitle(res.text, true);
}

// 修复后：监听所有 done 事件
} else if (
  res.type === 'response.audio_transcript.done' ||
  res.type === 'response.text.done' ||
  res.type === 'response.done'
) {
  // 只有携带文本时才发送，无文本时什么都不发（交给 timer 兜底）
  if (finalText) sendSubtitle(finalText, true);
}
```

**修复 2 — `src/content/index.tsx`**：加入 **5 秒自动确认定时器**作为最后的兜底。每次收到新的字幕更新时重置定时器；如果连续 5 秒没有任何新消息且当前仍有草稿句，自动将其标记为 final。

```typescript
const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

const resetDraftTimer = () => {
  if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
  draftTimerRef.current = setTimeout(() => {
    setSentences(prev => {
      const last = prev[prev.length - 1];
      if (last && !last.isFinal) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, isFinal: true };
        return updated;
      }
      return prev;
    });
  }, 5000); // 5 秒无响应后自动确认草稿
};
```

**工程启示**：对接外部 API 时，永远不能假设对方会按照文档"完美"地发送每一个事件。要为所有异常路径（事件缺失、顺序错乱、连接中断）设计兜底逻辑。

---

### 5.2 字幕重叠问题修复

**现象**：多条字幕出现时，新旧字幕在视觉上发生重叠，而不是整齐地堆叠显示。

**根本原因**：两个问题叠加导致：

1.  **CSS `max-height` 动画破坏 flex 布局**：旧的入场动画用 `max-height: 0 → 100px` 实现展开效果，但在 flexbox 布局中，`max-height` 过渡期间元素占据的空间不确定，导致多个元素互相挤压重叠。
2.  **透明元素仍然占据 flex 空间**：旧方案把全部历史句子渲染出来，只对超出 3 条的部分设置 `opacity: 0`（透明）。但透明不等于消失，这些元素依然在 flex 布局里占位，把有内容的句子挤到错误的位置。

**修复方案**：

```typescript
// 修复 1：状态层面限制最多只保留 3 条，渲染几条显示几条
const MAX_SENTENCES = 3;

const next = [...prev, newSentence];
return next.length > MAX_SENTENCES ? next.slice(-MAX_SENTENCES) : next;

// 修复 2：用不影响布局的动画替换 max-height 动画
// 旧（有问题）：@keyframes slideBlurIn { from { max-height: 0; } to { max-height: 100px; } }
// 新（正确）：只改变 opacity 和 transform，不触碰盒模型尺寸
// @keyframes fadeSlideIn {
//   from { opacity: 0; transform: translateY(8px); }
//   to   { opacity: 1; transform: translateY(0);   }
// }
```

**工程启示**：CSS 动画中，凡是会影响盒模型尺寸的属性（`max-height`、`width`、`padding`）在 flex/grid 布局里都可能引发布局抖动。正确做法是只动画 `opacity` 和 `transform`——这两个属性完全不影响布局流，且由 GPU 加速，性能更好。

---

### 5.3 消息竞态条件修复

**现象**：点击"开始捕获"后，字幕弹框有时不出现，偶发性很强。

**根本原因**：这是一个经典的**竞态条件（Race Condition）**。Background 在 `handleStartCapture()` 完成后立刻发送 `SHOW_SUBTITLE` 消息，但此时 content script 的 React 组件可能还没完成挂载（`useEffect` 是异步的），导致消息发出时"没人接听"，弹框永远不显示。

还有一个额外陷阱：**`chrome.tabs` API 在 content script 里不可用**。如果在 content script 里调用 `chrome.tabs.getCurrent()`，会报 `TypeError: Cannot read properties of undefined`，导致整个 React 组件直接崩溃，弹框彻底消失。

**修复方案（双保险）**：

```typescript
// 不再单纯依赖 SHOW_SUBTITLE 的时机
// 第一条字幕数据到达时，也顺手触发显示，无论 SHOW_SUBTITLE 有没有被接到
} else if (request.type === 'SUBTITLE_UPDATE') {
  setIsVisible(true);  // 双保险：字幕到达 = 一定在捕获中 = 弹框应该显示
  resetDraftTimer();
  // ... 更新 sentences 逻辑
}
```

**工程启示**：Chrome 插件是多进程架构，各组件启动时机不同。对于"必须触发"的状态变更，要设计多条独立触发路径。同时牢记 API 权限边界：`chrome.tabs` 仅在 Background 和 Popup 中可用，Content Script 里访问会直接报错。

---

### 5.4 字幕 UI 体验升级

在修复 Bug 的过程中，同步对字幕弹框做了以下用户体验升级：

**可拖拽定位**：弹框默认出现在屏幕底部中央，用户可拖动到任意位置，避免遮挡视频重要区域。

```typescript
onMouseDown={(e) => {
  setIsDragging(true);
  // 记录鼠标按下时相对弹框左上角的偏移量
  setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
}}
// 拖动时：新坐标 = 鼠标当前位置 - 初始偏移量
const onMove = (e) => setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
```

**手动关闭按钮**：弹框右上角有 `✕` 按钮，无需打开 Popup 即可立即隐藏字幕。

**旧句渐隐效果**：最多显示 3 条，越旧的句子越淡、越模糊，给用户清晰的视觉焦点引导。

```typescript
const fromEnd = sentences.length - 1 - idx; // 0 = 最新的句子（底部）
const opacity = 1 - fromEnd * 0.3;          // 最新: 1.0 → 次新: 0.7 → 最旧: 0.4
const blurPx  = fromEnd * 1.5;              // 最新: 0px → 次新: 1.5px → 最旧: 3px
```

**草稿 vs 最终字幕视觉区分**：正在实时更新的草稿句以蓝色（`#00f2fe`）高亮显示；一旦 AI 确认为 `isFinal`，切换为白色，给用户即时的流式反馈感。
