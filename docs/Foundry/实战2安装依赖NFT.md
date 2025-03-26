---
title: 实战2:安装依赖NFT
date: 2025-03-26
abstract: Web3Foundry框架的相关知识
tags:
- Web3
- Foundry
---

# 实战2:安装依赖-NFT


在成功创建了 Foundry 项目后，接下来我们就要学习如何安装项目所需的依赖库。这些库包括 Solidity 编写的智能合约库，如 Solmate 用于 ERC721 实现和 OpenZeppelin 提供的一系列实用程序库。安装这些依赖是确保合约功能完整并且符合行业标准的关键步骤。

## 安装步骤

1. 首先，确保您位于项目的根目录
2. 通过以下命令安装所需的依赖库：

```bash
forge install transmissions11/solmate Openzeppelin/openzeppelin-contracts
```

这个命令将 `transmissions11/solmate` 和 `OpenZeppelin/openzeppelin-contracts` 这两个库作为 git 子模块添加到您的项目中。这样做可以确保您的项目可以随时获取这些依赖库的最新更新，并方便管理这些外部代码。

## 查看依赖结构

安装完成后，可以通过查看项目目录结构来确认依赖是否正确安装。运行以下命令来查看项目结构：

```bash
tree . -d -L 2
```

您应该能看到如下结构，其中包括新增的 `lib` 目录下的子目录，对应您刚刚安装的依赖：

```
.
├── lib
│   ├── solmate
│   └── openzeppelin-contracts
├── script
├── src
└── test
```

### 依赖库说明

- **lib/solmate**: 存放了 Solmate 库的文件，这是一个专为节省 gas 而优化的 ERC721 标准实现
- **lib/openzeppelin-contracts**: 包含了 OpenZeppelin 提供的智能合约库，这些库广泛用于提供安全性和遵循最佳实践的智能合约开发

确保这些依赖正确安装是继续开发过程中的重要一步。有了这些工具，您就可以构建安全、高效的智能合约，为后续的开发和测试打下坚实的基础。
