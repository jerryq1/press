---
title: 重点4-5:Vue3响应式回顾-toRefs
date: 2025-01-26
abstract: Vue3的响应式-toRefs
tags:
- Vue3
- 原理
---

# 重点4-5:Vue3响应式回顾-toRefs

## Proxy 示例

```js
const obj = {
    count: 1
};

const proxy = new Proxy(obj, {
    get(target, key) {
        console.log("get");
        return target[key]
    },
    set(target, key, value) {
        console.log("set");
        target[key] = value
        return true;
    }
});

console.log(proxy.count);
```

---

## toRefs 函数

```js
//toRefs函数
export function toRefs(proxy) {
  const ret = proxy instanceof Array ? new Array(proxy.length) : {}

  for (const key in proxy) {
    ret[key] = toProxyRef(proxy, key)
  }

  return ret
}

function toProxyRef(proxy, key) {
  const r = {
    __v_isRef: true,
    get value() {
      return proxy[key]
    },
    set value(newValue) {
      proxy[key] = newValue
    }
  }
  return r
}
```

- 原理很简单，把结构出来的基础类型数据再转换为 `r` 对象模型
- `r` 对象模型就是一个带有 `get value`、`set value` 的代理对象模型
