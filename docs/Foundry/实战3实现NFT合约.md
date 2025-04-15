---
title: 实战3:实现NFT合约
date: 2025-04-15
abstract: Web3Foundry框架的相关知识
tags:
- Web3
- Foundry
---

# 实战3:实现NFT合约
## 3.1 创建合约文件

### 设置合约文件

首先，我们需要准备合约的基础文件。在您的项目中，找到 `src/Counter.sol` 文件，这是一个智能合约的样板文件。为了明确我们的目标和功能，我们将这个文件重命名为 `src/NFT.sol`。

这个操作可以手动修改，也可以在命令行中使用如下命令完成：

```bash
mv src/Counter.sol src/NFT.sol
```

## 3.2. 声明编译器版本

### 声明编译器版本

在开始编写项目的第一步，首先需要确定合约所使用的编译器版本。

编译器声明可以确保你的合约在特定版本的编译器中进行编译，并且与该版本的语法和功能兼容。

```solidity
pragma solidity 0.8.17;
```

## 3.3 引入 ERC721 的标准库

### 引入ERC721的标准库

我们需要引入 ERC721 合约，目前被广泛认可的 solmate 的 ERC721 标准实现了 Gas 优化，所以让我们将它引入合约。

```solidity
pragma solidity 0.8.20;

import "solmate/tokens/ERC721.sol";
```

## 3.4. 定义 NFT 合约

### 定义 NFT 合约

这节课，我们来学习如何定义我们的 NFT 合约。

NFT其实是一个遵循 ERC721 标准的合约，所以我们在定义合约时，需要继承 ERC721 的标准合约。

```solidity
contract NFT is ERC721 {}
```

## 3.5 定义合约构造函数

### 定义构造函数

在定义合约之后，不要忘记 ERC721 有一个构造函数，它需要代 NFT 的名称和符号作为参数来初始化ERC721。

现在我们将定义我们自己的 constructor 来 初始化ERC721。

```solidity
constructor() ERC721() {}
```

## 3.6 初始化 NFT 的名称和符号

### 定义构造函数

上节课，我们简单定义了 NFT 合约的 constructor 来 初始化ERC721，但我们不要忘记 ERC721 还需要传入 名称和符号来初始化，这节课我们完善构造函数的参数，并初始化 ERC721。

```solidity
constructor(
    string memory _nft_name,
    string memory _nft_symbol
) ERC721(_nft_name, _nft_symbol) {}
```

## 3.7. 定义 NFT 编号

### 定义 _tokenIdCounter 变量

我们需要引入一个名为 `currentTokenId` 的变量。这个变量的主要作用是记录当前的NFT 编号，每当成功铸造一个 NFT，`currentTokenId` 的值都会自动加 1。

由于 TokenId 是非负的，我们选择使用 `uint256`来存储它。

```solidity
uint256 public currentTokenId = 1;
```

## 3.8 定义 tokenURI 函数

### 定义tokenURI函数

`tokenURI` 函数是 ERC-721 标准的一部分，用于提供有关 NFT 的详细信息的元数据的链接。

```solidity
pragma solidity 0.8.20;

import "solmate/tokens/ERC721.sol";
import "openzeppelin-contracts/contracts/utils/Strings.sol";

contract NFT is ERC721 {
    uint256 public currentTokenId;

    constructor(
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {}

    function tokenURI(uint256 id) public view virtual override returns (string memory) {}
}
```

## 3.9 引入 String 的工具库

### 引入 String 的工具库

引入 OpenZeppelin 的 Strings 工具库，该库提供了一系列处理字符串的辅助函数。

```solidity
import "openzeppelin-contracts/contracts/utils/Strings.sol"
```

## 3.10 返回 Token URI

### 返回 Token URI

在 `tokenURI` 函数内将 token ID 转换为字符串形式以构造完整的 URI 并返回。

```solidity
return Strings.toString(token_id);
```

## 3.11 定义 mintTo 函数

### 定义 mintTo 函数

`mintTo` 函数的主要目的是提供一个公共方法，用于根据给定的铸造地址来铸造一个 NFT。

```solidity
function mintTo(address recipient) public payable returns(uint256) {}
```

## 3.12 更新 TokenId

### 更新 TokenId

在 `mintTo` 函数中，我们需要获取下一个 NFT ID，才能实现铸造逻辑。

```solidity
uint256 newId = ++currentTokenId;
```

## 3.13 完成铸造

### 更新 TokenId

完成实际的 NFT 铸造操作，使用 Solmate 中的 `_safeMint` 方法：

```solidity
_safeMint(recipient, newItemId);
```

## 3.14 返回 Token Id

### 返回 Token ID

将新生成的 NFT ID 返回，以供外部调用方确认铸造的唯一标识。

```solidity
return newItemId;
```

## 3.15 完成 NFT 合约编写

### 完成 NFT 合约编写

完整的 NFT 合约代码：

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "solmate/tokens/ERC721.sol";
import "openzeppelin-contracts/contracts/utils/Strings.sol";

contract NFT is ERC721 {
    uint256 public currentTokenId;

    constructor(
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {}

    function mintTo(address recipient) public payable returns (uint256) {
        uint256 newItemId = ++currentTokenId;
        _safeMint(recipient, newItemId);
        return newItemId;
    }

    function tokenURI(uint256 id) public view virtual override returns (string memory) {
        return Strings.toString(id);
    }
}
