---
title: 实战6:扩展NFT合约
date: 2025-04-19
abstract: Web3Foundry框架的相关知识
tags:
- Web3
- Foundry
---

# 实战6:扩展NFT合约

## 6.3 定义 MintPriceNotPaid 错误

在智能合约开发中，正确处理错误是至关重要的。这有助于确保合约的执行按预期进行，并能够有效地向用户通报问题。

在本节课中，我们将定义一个错误类型，用于处理在铸造 NFT 时未支付正确金额的情况。

我们通过使用 Solidity 的 `error` 关键字来定义这个错误。这种方式比传统的 `require` 语句更节省 gas，因为它不需要存储错误信息的字符串。

```solidity
error MintPriceNotPaid();
```

## 6.4 定义 MaxSupply 错误

在开发 NFT 智能合约时，为了确保稀缺性和防止无限铸造，有必要设置一个最大供应量，并在达到该供应量时停止进一步的铸造。

在本节课中，我们将定义一个错误类型，用于当铸造尝试超过设定的最大供应量时触发。

我们将使用 `error` 关键字来声明错误。这一方式更为简洁、节省 gas，并且为错误处理提供了更高的灵活性。

```solidity
error MaxSupply();
```

## 6.5 验证铸币价格

确保用户支付正确的铸币价格是开发 NFT 合约的重要部分。

在本节课中，我们将介绍如何通过检查用户的支付金额来实现价格验证。如果金额不足或超出预期，我们会触发之前我们定义好的 `MintPriceNotPaid` 错误，从而中止交易。

我们使用 `msg.value` 来获取用户在这次交易中发送的金额，并将其与 `MINT_PRICE` 进行比较。如果不相等，则触发相应的错误。

### Syntax Review

```solidity
if(msg.value != MINT_PRICE) {
    revert MintPriceNotPaid();
}
```
