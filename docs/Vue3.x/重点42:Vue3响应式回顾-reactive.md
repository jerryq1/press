---
title: 重点4-2:Vue3响应式回顾-reactive
date: 2025-01-22
abstract: Vue3的响应式-reactive的说明
tags:
- Vue3
- 原理
---


# 重点4-2:Vue3响应式回顾-reactive


- 接收一个**参数**,判断这个**参数是否是对象**
- 创建**拦截器对象handler**,设置**get/set/deleteProperty**
- 返回Proxy对象

## 判断是否是对象
```javascript
// 判断是否是对象
const isObject = val => val !== null && typeof val === 'object'
```

## 转换函数
```javascript
// 判断 target 是否是对象，如果是对象则进行 reactive 处理
const convert = target => isObject(target) ? reactive(target) : target
```

## 判断对象是否拥有某个属性
```javascript
// 获取对象原型上的 hasOwnProperty
const hasOwnProperty = (target, key) => Object.prototype.hasOwnProperty.call(target, key)
```

## reactive 方法
```javascript
export function reactive(target) {
  // 如果不是一个对象，直接返回 target，不作响应式处理
  if (!isObject(target)) return target

  // 定义一个 handler 对象
  const handler = {
    get(target, key, receiver) {
      // 收集依赖
      track(target, key)
      console.log('收集依赖')
      const result = Reflect.get(target, key, receiver)
      return convert(result)
    },
    set(target, key, value, receiver) {
      // 返回值，确保 set 操作成功返回 true，否则会报错
      let result = true
      const oldValue = Reflect.get(target, key, receiver)
      if (oldValue !== value) {
        result = Reflect.set(target, key, value, receiver)
        // 触发更新
        console.log('set 触发更新', key, value)
        trigger(target, key)
      }
      return result
    },
    deleteProperty(target, key) {
      // 判断对象是否存在该 key
      const getKeyValue = hasOwnProperty(target, key)

      // 删除属性是否成功
      const result = Reflect.deleteProperty(target, key)

      if (getKeyValue && result) {
        // 触发更新
        console.log('del 删除触发更新', key)
        trigger(target, key)
      }
      return result
    }
  }

  return new Proxy(target, handler)
}
```

## effect 函数
```javascript
// effect 监听回调 (用于触发收集依赖，相当于 Vue 2 中的 Dep.target)
let activeEffect = null

export function effect(callback) {
  activeEffect = callback
  callback() // 触发访问响应式对象属性，收集依赖
  activeEffect = null
}
```

## 依赖收集
```javascript
// target -> depsMap -> dep (new Set(...callbacks))
let targetMap = new WeakMap()

// 收集依赖函数
export function track(target, key) {
  // 没有回调则直接返回
  if (!activeEffect) return

  // 获取 depsMap，如果没有则创建
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, depsMap = new Map())
  }

  // 获取 dep，如果没有则创建
  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, dep = new Set())
  }

  // 将回调添加到 dep 中
  dep.add(activeEffect)
}
```

## 触发依赖
```javascript
// 触发依赖函数
export function trigger(target, key) {
  // 获取 depsMap
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  // 获取 dep
  const dep = depsMap.get(key)
  if (!dep) return

  // 执行 dep 中的所有回调
  dep.forEach(cb => {
    cb()
  })
}
