---
title: TypeScript 类class
date: 2026-03-30
abstract: TS的类class知识
tags:
- TypeScript
---


# TypeScript 类 (Class) 详解

TypeScript 的类在 ES6 类的基础上增加了类型检查和一些强类型语言特有的特性，如访问修饰符和抽象类。

## 1. 类的定义、继承与构造函数

```typescript
class Animal {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
    move(distance: number = 0) {
        console.log(`${this.name} moved ${distance}m.`);
    }
}

class Snake extends Animal {
    constructor(name: string) {
        super(name); // 子类构造函数必须调用 super()
    }
    move(distance: number = 5) {
        console.log("Slithering...");
        super.move(distance);
    }
}
```

**【面试口白】**：
> "在 TypeScript 中，类的继承完全遵循 ES6 规范，但增加了严格的属性类型声明。特别注意，子类如果有 `constructor`，必须在其中首先调用 `super()`，否则无法访问 `this`。"

---

## 2. 访问修饰符与 readonly

| 修饰符 | 可访问范围 | 描述 |
| :--- | :--- | :--- |
| `public` | 任何地方 | 默认值，外部和子类均可访问 |
| `private` | 仅类内部 | 外部和子类均不可访问 |
| `protected` | 类及其子类内部 | 外部不可访问，但子类可以访问 |
| `readonly` | - | 属性只能在构造函数中初始化，后续不可修改 |

```typescript
class Person {
    public name: string;
    private age: number;
    protected salary: number;
    readonly birthDate: Date;

    constructor(name: string, age: number, salary: number, birthDate: Date) {
        this.name = name;
        this.age = age;
        this.salary = salary;
        this.birthDate = birthDate;
    }
}
```

**【面试口白】**：
> "访问修饰符是实现『封装』的核心。`private` 确保了内部状态的安全，而 `protected` 则是为继承设计的。`readonly` 则提供了比 `const` 更细粒度的成员只读控制。"

---

## 3. 抽象类 (Abstract Classes)

抽象类作为其他派生类的基类使用，它们本身不能被实例化。

```typescript
abstract class Department {
    constructor(public name: string) {}

    printName(): void {
        console.log("Department name: " + this.name);
    }

    abstract printMeeting(): void; // 必须在派生类中实现
}

class ITDepartment extends Department {
    printMeeting(): void {
        console.log("IT Meeting at 10am.");
    }
}
```

**【面试口白】**：
> "抽象类和接口的区别是面试常客。抽象类不仅可以定义契约（抽象方法），还可以包含实现细节（普通方法）。它通常用于描述『是什么（is-a）』的关系，而接口更多描述『能做什么（has-a）』。"

---

## 4. 类和接口 (implements)

类可以通过 `implements` 关键字来实现接口，强制类符合某种结构。

```typescript
interface Alarm {
    alert(): void;
}

class SecurityDoor implements Alarm {
    alert() {
        console.log("Security Door Alert!");
    }
}
```

**【面试口白】**：
> "一个类可以实现多个接口，这弥补了 TypeScript 单继承的局限。它允许我们通过接口横向扩展类的能力，在大型系统设计中非常有用。"
