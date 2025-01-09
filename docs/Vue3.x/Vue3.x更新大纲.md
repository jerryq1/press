---
title: Vue3.x更新大纲
date: 2025-01-09
abstract: Vue3.x对比Vue2.x更新、优化的地方简介
tags:
- Vue3
---

# Vue3.x更新大纲

## 1. 响应式系统升级

### Vue.js 2.x 中的响应式系统

在 Vue 2.x 中，响应式系统的核心是使用 `defineProperty` 来实现对对象属性的访问和修改进行拦截。

### Vue.js 3.0 中的响应式系统

Vue 3.x 将响应式系统的实现从 `defineProperty` 升级为 `Proxy` 对象。这带来了以下优化：

- **动态新增/删除属性的监听**：可以更方便地监听对象的动态属性增删。
- **监听数组的索引和 `length` 属性**：可以直接监听数组的变化，提升性能。

## 2. 编译优化

### Vue.js 2.x 中的编译优化

在 Vue 2.x 中，优化 `diff` 过程的方式是标记静态根节点，跳过不参与更新的静态节点进行 `diff`，但其他节点会进行全量对比。

```js
with(this) {
  return _c(
    'div',
    { attrs: { "id": "app" } },
    [ 
      _c('div', [_v("二狗")]),
      _c('p', [_v(_s(age))])
    ]
  )
}
```

### Vue.js 3.0 中的编译优化

在 Vue 3.x 中，编译器对所有静态节点进行了标记和提升，`diff` 过程中只对比动态节点。主要优化包括：

- **Fragments**：模板中不需要唯一的根节点，多个同级标签或文本内容可以直接使用 Fragment 包裹。
- **静态提升**：静态节点只创建一次并复用，避免重复创建。
- **Patch flag（静态标记）**：通过静态标记来跳过不需要对比的节点，进一步减少 `diff` 的计算量。
- **缓存事件处理函数**：事件处理函数会被缓存，避免每次更新时重新绑定。
- **子节点对比优化**：使用 `patchKeyedChildren` 来优化节点更新，对比时只考虑动态变化的部分。

### 总结

- **Vue 2.x**：全量 `diff`，每次更新都进行完全的节点对比。
- **Vue 3.x**：通过静态标记和静态提升，仅对比动态节点，优化了 `diff` 的性能。

## 3. 静态提升

静态节点只会创建一次，并在后续渲染中复用，避免重复创建。

### Vue 2.x 中的行为

每次更新时，不管元素是否参与更新，都会重新创建所有节点：

```js
with(this) {
  return _c(
    'div',
    { attrs: { "id": "app" } },
    [ 
      _c('div', [_v("二狗")]),
      _c('p', [_v(_s(age))])
    ]
  )
}
```

### Vue 3.x 中的行为

静态节点只会创建一次并保存在内存中，之后的渲染会复用这些静态节点：

```js
const _hoisted_1 = { id: "app" }
const _hoisted_2 = /*#__PURE__*/_createElementVNode("div", null, "二狗", -1 /* HOISTED */)

export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    _hoisted_2,
    _createElementVNode("p", null, _toDisplayString(_ctx.age), 1 /* TEXT */)
  ]))
}
```

## 4. 静态标记（Patch Flags）

静态标记用于在 `diff` 过程中优化性能，Vue 3 使用静态标记来判断哪些节点是静态的，哪些节点是动态的，从而跳过不必要的对比。

### 静态标记枚举

```js
export const enum PatchFlags {
  TEXT = 1,              // 动态文本节点
  CLASS = 1 << 1,        // 动态class
  STYLE = 1 << 2,        // 动态style
  PROPS = 1 << 3,        // 除去class/style以外的动态属性
  FULL_PROPS = 1 << 4,   // 有动态key属性的节点
  HYDRATE_EVENTS = 1 << 5,  // 有监听事件的节点
  STABLE_FRAGMENT = 1 << 6, // 稳定的Fragment
  KEYED_FRAGMENT = 1 << 7,  // 带key的Fragment
  UNKEYED_FRAGMENT = 1 << 8, // 无key的Fragment
  NEED_PATCH = 1 << 9,       // 只进行非props比较
  DYNAMIC_SLOTS = 1 << 10,   // 动态slot
  HOISTED = -1,              // 静态节点
  BAIL = -2                  // 不需要优化
}
```

### Vue 2.x 和 Vue 3.x 编译结果比较

**Vue 2.x** 编译结果：

```js
with(this) {
  return _c(
    'div',
    { attrs: { "id": "app" } },
    [ 
      _c('div', [_v("二狗")]),
      _c('p', [_v(_s(age))])
    ]
  )
}
```

**Vue 3.x** 编译结果：

```js
const _hoisted_1 = { id: "app" }
const _hoisted_2 = /*#__PURE__*/_createElementVNode("div", null, "二狗", -1 /* HOISTED */)

export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    _hoisted_2,
    _createElementVNode("p", null, _toDisplayString(_ctx.age), 1 /* TEXT */)
  ]))
}
```

### 事件缓存

在 Vue 3 中，事件处理函数会被缓存，从而避免每次更新时都重新绑定事件：

```js
export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("button", {
    onClick: _cache[0] || (_cache[0] = (...args) => (_ctx.handleClick && _ctx.handleClick(...args)))
  }, "按钮"))
}
```

### Vue 2.x 中没有缓存事件。

## 5. `patchKeyedChildren` 优化

在 Vue 2.x 中，`updateChildren` 会对比所有子节点，包括头尾、头尾交替等情况，导致大量的 DOM 操作。

### Vue 2.x 中的 `updateChildren`

- 头和头比
- 尾和尾比
- 头和尾比
- 尾和头比
- 没有命中的对比

### Vue 3.x 中的 `patchKeyedChildren`

Vue 3.x 引入了最长递增子序列优化，减少 DOM 的移动，提升性能：

- 头和头比
- 尾和尾比
- 基于最长递增子序列进行移动/添加/删除

### 示例

假设老的子节点为：

```js
[a, b, c, d, e, f, g]
```

新的子节点为：

```js
[a, b, f, c, d, e, h, g]
```

1. 首先比较头和头，发现相同，得到 `[a, b]`。
2. 然后比较尾和尾，发现相同，得到 `[g]`。
3. 保存没有比较过的节点 `[f, c, d, e, h]`，并通过 `newIndexToOldIndexMap` 映射得到下标 `[5, 2, 3, 4, -1]`，其中 `-1` 表示新节点。
4. 通过最长递增子序列得到 `[2, 3, 4]`，对应节点 `[c, d, e]`。
5. 最后只需要移动/添加/删除剩余节点，避免多余的 DOM 操作。

## 6. 源码体积优化

### Vue 3 中的优化

- **移除不常用的 API**：如 `inline-template`、`filter` 等，减少最终打包文件的体积。
- **更好的 Tree-shaking 支持**：Vue 3 使用 ES Module 的 `import` 和 `export`，通过静态分析依赖，移除未使用的模块，从而减小打包后的体积。

### 更好的 Tree-shaking

- 对于一些组件（如 `keep-alive`、`transition`）和指令（如 `v-model`）等，Vue 3 都可以进行 Tree-shaking，去除未用到的代码。

---

通过这些性能优化，Vue 3 相较于 Vue 2 在响应式系统、编译过程、静态提升、事件缓存、子节点对比、以及源码体积等方面都做出了显著改进，使得应用性能大幅提升。
