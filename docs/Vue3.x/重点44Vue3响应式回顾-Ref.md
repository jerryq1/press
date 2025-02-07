---
title: 重点4-4:Vue3响应式回顾-Ref
date: 2025-01-26
abstract: Vue3的响应式-Ref
tags:
- Vue3
- 原理
---


# 重点4-4:Vue3响应式回顾-Ref
- ref可以把基本数据类型数据,转成响应式对象
- ref返回的对象,重新赋值成对象也是响应式的
- reactive返回的对象,重新复制丢失响应式
- reactive返回的对象不可以解构(需要使用toRefs)

## ref返回的对象,重新赋值成对象也是响应式的

```js
//判断target是否是对象如果是对象则进行reactive处理
const convert = target => isObject(target) ? reactive(target) : target

//ref函数
export function ref(raw) {
  //判断 1.raw是否是ref创建的对象,如果是的话就直接返回
  // raw创建的对象是一个对象,具体看实例r,
  // 并且它具备__v_isRef属性
  if (isObject(raw) && raw.__v_isRef) return raw
  let value = convert(raw)
  const r = {
    __v_isRef: true,
    get value() {
      track(r, 'value')
      return value
    },
    set value(newValue) {
      if (value !== newValue) {
        value = convert(newValue)
        trigger(r, 'value')
      }
    }
  }
  return r
}

let test = ref(1)
//重新赋值test还是响应式的
test.value = 'b'
```

1. 假设新值为基础类型,经过convert函数后最新值还是赋值到原来的r对象中
2. 假设新值为引用数据类型,经过convert会变转化为proxy对象,也是一个响应式属性

## reactive返回的对象,重新复制丢失响应式

使用 `reactive` 包装数组响应式失效。  
或： `reactive` 使用时响应式失效。我们通过 `reactive` 定义一个响应式数组，网络请求返回的数据，赋值给数组之后，页面上的数据并没有更新。

具体的代码：

```js
const arr = reactive([]);
const load = () => {
  const res = [2, 3, 4, 5]; //假设请求接口返回的数据
  // 方法1 失败，直接赋值丢失了响应性
  // arr = res;
  // 方法2 这样也是失败
  // arr.concat(res);
};
```

原因：
1. `arr` 是 `new Proxy` 对象，而直接赋值的话是将普通对象赋值给 `arr` 变量
2. `arr` 是一个 `new Proxy` 对象，对用直接使用 `concat` 来连接普通数组的方式也是不行的

核心原因: 具体看下面源码，`reactive` 返回的是一个 `new Proxy` 对象

```js
//reactive方法
export function reactive(target) {
  // 如果不是一个对象即返回该target,不作响应式处理
  if (!isObject(target)) return target

  // 定义一个handler对象
  const handler = {
    get(target, key, receiver) {
      // 收集依赖
      track(target, key)
      console.log('收集依赖')
      const result = Reflect.get(target, key, receiver)
      return convert(result)
    },
    set(target, key, value, receiver) {
      // 这里的result是为了set返回一个true值,否则会报错
      let result = true
      const oldValue = Reflect.get(target, key, receiver)
      if (oldValue !== value) {
        result = Reflect.set(target, key, value, receiver)
        // 触发更新
        console.log('set触发更新', key, value);
        trigger(target, key)
      }
      return result
    },
    deleteProperty(target, key) {
      //判断该对象是否存在该key
      const getKeyValue = hasOwnProperty(target, key)

      //删除属性是否成功
      const result = Reflect.deleteProperty(target, key)

      if (getKeyValue && result) {
        //触发更新
        console.log('del删除触发更新', key);
        trigger(target, key)
      }
      return result
    }
  }

  return new Proxy(target, handler)
}
```
