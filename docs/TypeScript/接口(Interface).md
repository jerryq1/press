---
title: TypeScript 接口 (Interface)详解
date: 2026-03-28
abstract: TS的接口
tags:
- TypeScript
---

# TypeScript 接口 (Interface) 详解

接口（Interface）是 TypeScript 的核心原则之一，用于对值所具有的结构进行类型检查。它被称作“鸭子类型”或“结构性子类型化”。

## 1. 接口的定义和使用

接口主要用于定义对象的形状（Shape）。

```typescript
interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Antigravity",
  age: 18
};
```

**【面试口白】**：
> "在 TS 中，接口是一种定义代码契约的方式。它只关注对象的形状，而不关注对象是如何实现的。只要对象满足接口定义的属性和类型，就被认为是该接口的实现。"

---

## 2. 可选属性与只读属性

### 可选属性 (`?`)
有时接口里的属性是不必须的。

```typescript
interface Device {
  brand: string;
  color?: string; // 可选
}
```

### 只读属性 (`readonly`)
一些对象属性只能在对象刚刚创建的时候修改其值。

```typescript
interface Point {
  readonly x: number;
  readonly y: number;
}
```

**【面试口白】**：
> "可选属性通过在属性名后加问号实现，用于处理不确定项；只读属性使用 `readonly` 关键字，确保对象初始化后不可被二次赋值，这对于保证数据的不可变性非常有用。"

---

## 3. 函数类型接口

接口也能够描述函数类型。它就像是一个只有参数列表和返回值类型的函数定义。

```typescript
interface SearchFunc {
  (source: string, subString: string): boolean;
}

let mySearch: SearchFunc = (src, sub) => {
  return src.indexOf(sub) > -1;
}
```

---

## 4. 可索引类型接口

描述那些能够“通过索引得到”的类型，比如 `a[10]` 或 `obj["key"]`。

```typescript
interface StringArray {
  [index: number]: string;
}

let myArray: StringArray = ["Bob", "Fred"];
let myStr: string = myArray[0];
```

---

## 5. 接口继承

和类一样，接口也可以相互继承。这可以让你从一个接口复制成员到另一个接口，从而更灵活地拆分接口以便复用。

```typescript
interface Shape {
  color: string;
}

interface Square extends Shape {
  sideLength: number;
}

let square = {} as Square;
square.color = "blue";
square.sideLength = 10;
```

**【面试口白】**：
> "接口继承允许我们将复杂的接口拆分成细粒度的模块，通过 `extends` 关键字实现复用。一个接口甚至可以同时继承多个接口，从而组合成更强大的契约。"
