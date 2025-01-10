---
title: Vue3性能提升
date: 2025-01-10
abstract: Vue3性能提升说明
tags:
- Vue3
- 原理
---

# Vue3性能提升

## 响应式系统升级

### Vue.js 2.x 中响应式系统的核心 `defineProperty`
在 Vue.js 2.x 中，响应式系统通过 `defineProperty` 来实现数据的观察和代理。

### Vue.js 3.0 中使用 `Proxy` 对象重写响应式系统
- 可以监听动态新增/删除的属性
- 可以监听数组的索引和 `length` 属性

## 编译优化

### Vue.js 2.x 中的优化：标记静态根节点
Vue.js 2.x 通过标记静态根节点来优化 `diff` 的过程：
- Vue2.x 的优化只是跳过根节点不做 `diff`，其余节点全部 `diff`，是全量 `diff`。

### Vue.js 3.0 中的优化
- 标记和提升所有的静态节点，`diff` 的时候只需要对比动态节点的内容。
- **Fragments（片段特性）**：模板中不需要创建一个唯一的根节点，可以直接放文本内容或多个同级的标签。
- **静态提升**：静态节点只会创建一次，之后复用。
- **Patch Flag（静态标记）**：用来优化 `diff` 过程。
- **缓存事件处理函数**：事件处理函数只会缓存，避免重复绑定。
- **子节点对比优化**：Vue 3 中使用 `patchKeyedChildren`，而 Vue 2.x 使用的是 `updateChildren`。

### 总结
- Vue 2.x 是全量 `diff`。
- Vue 3 是静态标记 + 非全量 `diff`（仅对比动态节点）。

## 静态提升

静态节点只创建一次，然后复用。下面是 Vue 2 和 Vue 3 中的代码示例：

### Vue 2 的代码
```javascript
with(this){
  return _c(
    'div',
    {attrs:{"id":"app"}},
    [ 
      _c('div',[_v("二狗")]),
      _c('p',[_v(_s(age))])
    ]
  )
}
```

### Vue 3 的代码
```javascript
const _hoisted_1 = { id: "app" }
const _hoisted_2 = /*#__PURE__*/_createElementVNode("div", null, "二狗", -1 /* HOISTED */)

export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    _hoisted_2,
    _createElementVNode("p", null, _toDisplayString(_ctx.age), 1 /* TEXT */)
  ]))
}
```

## 静态标记（标记节点的类型）

在 Vue 3 中使用静态标记来优化性能，只对比动态节点。下面是 `PatchFlags` 的定义：

```javascript
export const enum PatchFlags {
  TEXT = 1,  // 动态文本节点
  CLASS = 1 << 1,  // 2   动态class
  STYLE = 1 << 2,  // 4   动态style
  PROPS = 1 << 3,  // 8   除去class/style以外的动态属性
  FULL_PROPS = 1 << 4,  // 16  有动态key属性的节点，当key改变时，需进行完整的diff比较
  HYDRATE_EVENTS = 1 << 5,  // 32  有监听事件的节点
  STABLE_FRAGMENT = 1 << 6,  // 64  一个不会改变子节点顺序的fragment
  KEYED_FRAGMENT = 1 << 7,  // 128 带有key属性的fragment或部分子节点有key
  UNKEYED_FRAGMENT = 1 << 8, // 256 子节点没有key的fragment
  NEED_PATCH = 1 << 9,  // 512  一个节点只会进行非props比较
  DYNAMIC_SLOTS = 1 << 10, // 1024 动态slot
  HOISTED = -1,  // 静态节点
  BAIL = -2  // 表示 Diff 过程中不需要优化
}
```

### Vue 2 编译结果
```javascript
with(this){
  return _c(
    'div',
    {attrs:{"id":"app"}},
    [ 
      _c('div',[_v("二狗")]),
      _c('p',[_v(_s(age))])
    ]
  )
}
```

### Vue 3 编译结果
```javascript
const _hoisted_1 = { id: "app" }
const _hoisted_2 = /*#__PURE__*/_createElementVNode("div", null, "二狗", -1 /* HOISTED */)

export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("div", _hoisted_1, [
    _hoisted_2,
    _createElementVNode("p", null, _toDisplayString(_ctx.age), 1 /* TEXT */)
  ]))
}
```

在 Vue 3 中，`-1` 和 `1` 就是静态标记，表示静态节点和动态节点。在 `patch` 过程中，Vue 会根据这些标记优化 `diff` 流程，跳过一些静态节点对比。

## 事件缓存

在 Vue 3 中，事件会被缓存。例如，有一个带点击事件的按钮：

```html
<button @click="handleClick">按钮</button>
```

### Vue 3 编译结果：
```javascript
export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("button", {
    onClick: _cache[0] || (_cache[0] = (...args) => (_ctx.handleClick && _ctx.handleClick(...args)))
  }, "按钮"))
}
```

在这个示例中，`onClick` 会先读取缓存，如果缓存中没有，则会将事件存储到缓存中。与 Vue 2 相比，Vue 2 没有事件缓存，每次都会动态绑定事件。

## `patchKeyedChildren` 优化

在 Vue 2 中，`updateChildren` 进行以下几种比较：
- 头和头比
- 尾和尾比
- 头和尾比
- 尾和头比
- 都没有命中的对比

在 Vue 3 中，`patchKeyedChildren` 优化为：
- 头和头比
- 尾和尾比
- 基于最长递增子序列进行移动/添加/删除

### 示例：

**老的 children：**
```javascript
[a, b, c, d, e, f, g]
```

**新的 children：**
```javascript
[a, b, f, c, d, e, h, g]
```

1. 先进行头和头比，得到 `[a, b]`。
2. 再进行尾和尾比，得到 `[g]`。
3. 然后保存未比较的节点 `[f, c, d, e, h]`，并通过 `newIndexToOldIndexMap` 获取对应的下标，得到 `[5, 2, 3, 4, -1]`，其中 `-1` 表示新增节点。
4. 通过获取最长递增子序列 `[2, 3, 4]` 对应的节点 `[c, d, e]`。
5. 最后，根据 `[c, d, e]` 的位置进行剩余节点的移动、新增和删除。

使用最长递增子序列可以最大程度减少 DOM 操作，避免不必要的节点移动。

## 源码体积的优化

### Vue 3 中的优化
- 移除一些不常用的 API，例如 `inline-template`、`filter` 等，使得最终的代码体积变小。
- 对 `Tree-shaking` 支持更好。`Tree-shaking` 依赖于 ES 模块（`import` 和 `export`），通过静态分析找出未使用的模块，在打包时直接过滤掉，从而减小打包后的体积。

### 更好的优化
- 对于一些组件，`keep-alive`、`transition` 都能走 `tree-shaking`。
- 对于一些指令，如 `v-model` 等，也能够优化。
- 对于一些 API，也能进行优化。

