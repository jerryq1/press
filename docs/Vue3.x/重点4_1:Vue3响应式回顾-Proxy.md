---
title: 重点4-1:Vue3响应式回顾-Proxy
date: 2025-01-22
abstract: Vue3的响应式-proxy的说明
tags:
- Vue3
- 原理
---


# 重点4-1:Vue3响应式回顾-Proxy

## 问题 1：set 和 deleteProperty 需要返回布尔类型的值

- 在严格模式下，如果返回 `false` 会出现 `TypeError` 异常。
- `set` 和 `deleteProperty` 与 `get` 不一样，`get` 直接返回目标值。

```javascript
'use strict';

// 问题1:set和deleteProperty中需要返回布尔类型的值
// 在严格模式下,如果返回false的话会出现Type Error的异常
const target = {
  foo: 'xxx',
  bar: 'yyy'
};

const proxy = new Proxy(target, {
  get(target, key, receiver) { // 访问属性
    // return tarfet[key]
    // Reflect.get(target,key,receiver)就是目标值
    return Reflect.get(target, key, receiver); // receiver 指向该代理对象 proxy
  },
  set(target, key, value, receiver) { // 赋值予以属性
    // target[key] = value
    // Reflect.set(target,key,value,receiver) 这里如果仅这样就会set函数就会默认为return undefined 就会报错
    // Reflect.set(target,key,value,receiver)设置成功会返回true
    // 所以要使用 return Reflect.set(target,key,value,receiver)
    // Reflect.set返回的是布尔值,Reflect.get返回的是目标值有点区别
    return Reflect.set(target, key, value, receiver);
  },
  deleteProperty(target, key) { // 删除属性
    // delete target[key]
    // 跟set一致
    return Reflect.deleteProperty(target, key);
  }
});

proxy.foo = 'zzz';
//delete proxy.foo
```
### 说明
- Reflect.set 返回布尔值，表示设置属性是否成功。
- Reflect.deleteProperty 返回布尔值，表示删除操作是否成功。
---

## 问题 2：Proxy 和 Reflect 中使用的 receiver

### Proxy 中 receiver 解释
- `Proxy` 或者继承 `Proxy` 的对象。

### Reflect 中 receiver 解释
- 如果 `target` 对象中指定了 `getter`，`receiver` 则为 `getter` 调用时的 `this` 值。

```javascript
// Proxy 中 receiver: Proxy 或者继承 Proxy 的对象
// Reflect 中 receiver:如果 target 对象中设置了 getter,getter中的 this 指向 receiver

const obj = {
  get foo() {
    console.log(this);
    return this.bar;
  }
};

const proxy = new Proxy(obj, {
  get(target, key, receiver) { // 此处的 receiver 指向的是 proxy
    if (key === 'bar') {
      return 'value - bar';
    }
    return Reflect.get(target, key, receiver);
    // 这里的 receiver 指向的是 target 的 getter 中的 this，也就是 obj 的 this
    // 然后上面的 receiver 作为参数传递到这里，所以这里相当于获取 proxy 的 bar
    // 所以最终得到的是 'value - bar'
  }
});

console.log(proxy.foo);

// return Reflect.get(target, key) 输出 obj 以及 undefined
// return Reflect.get(target, key, receiver) 输出 proxy 以及 'value - bar'
```

### 解释
- Reflect.get(target, key, receiver) 使用 receiver 作为 getter 的 this 值。
- receiver 是 proxy，所以 getter 内部的 this.bar 会触发 proxy 的 get 方法，返回 'value - bar'。
- 如果 Reflect.get(target, key) 不传递 receiver，this 绑定为 obj，此时 bar 为 undefined。
