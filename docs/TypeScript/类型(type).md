---
title: TypeScript 类型别名 (Type Alias)详解
date: 2026-03-28
abstract: TS的类型别名
tags:
- TypeScript
---


# TypeScript 类型别名 (Type Alias) 详解

类型别名（Type Alias）用于给一个类型起一个新名字。我们可以用 `type` 关键字定义它。

## 1. type 关键字定义类型别名

```typescript
type Name = string;
type NameResolver = () => string;
type NameOrResolver = Name | NameResolver;

function getName(n: NameOrResolver): Name {
    if (typeof n === "string") return n;
    else return n();
}
```

---

## 2. type 和 interface 的区别

虽然 `type` 和 `interface` 都可以描述一个对象，但它们有以下核心区别：

| 特性 | Interface | Type Alias |
| :--- | :--- | :--- |
| **可重复定义** | **支持**：同名接口会自动合并（Declaration Merging） | **不支持**：同名类型定义会直接报错 |
| **定义范围** | 只能描述 **对象** 或 **函数** | 可以描述任何类型（原始类型、对象、联合类型、交叉类型、元组等） |
| **扩展性** | 通过 `extends` 关键字扩展 | 通过 `&`（交叉类型）来组合/扩展 |
| **计算属性** | 不支持属性名称为计算类型 | 支持属性名称为计算类型 |

**【面试口白】**：
> "在开发中，如果我们定义的是一个公共库，通常建议优先使用接口，因为接口具有更好的可扩展性和声明合并特性。但如果我们需要处理联合类型或交叉类型，或者定义元组、原始类型别名，则必须使用 `type`。另外，接口在编译器内部处理性能上通常略优于交叉类型。"

---

## 3. 联合类型 (Union Types)

表示一个值可以是几种类型之一。我们用竖线 `|` 分隔每个类型。

```typescript
type ID = string | number | null;

let userId: ID = "12345";
userId = 67890;
userId = null;
```

**【面试口白】**：
> "联合类型非常适用于处理那些具有多种可能的返回值或参数输入的场景。它为代码提供了极大的灵活性，结合类型推断（Type Guard）能让代码既灵活又安全。"

---

## 4. 交叉类型 (Intersection Types)

交叉类型是将多个类型合并为一个类型。这让我们能够组合现有的类型来获得包含所有成员的类型。通常用于混入（Mixins）或其他不适合面向对象类的场景。

```typescript
interface ErrorHandling {
  success: boolean;
  error?: { message: string };
}

interface ArtData {
  artistName: string;
}

// 联合为一个类型
type ArtResponse = ArtData & ErrorHandling;

const handleArtistResponse = (response: ArtResponse) => {
  if (response.success) {
      console.log(response.artistName);
  }
}
```

**【面试口白】**：
> "交叉类型通常用于将多个接口合并为一个完整契约，这在处理大型项目或混入行为时非常有用。它和接口继承虽然表现相似，但交叉类型通过 `&` 运算符提供了一种更灵活的组合方案。"
