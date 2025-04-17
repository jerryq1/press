---
title: 实战5:铸造NFT
date: 2025-04-17
abstract: Web3Foundry框架的相关知识
tags:
- Web3
- Foundry
---


# 实战5:铸造NFT

## 5.1 铸造 NFT

### 铸造 NFT

上节课我们已经完成 NFT 合约的部署。  
这节课开始，我们要学习铸造我们的第一个 NFT！之前我们已经学过 Cast 命令行工具，它用于与智能合约交互、发送交易和获取链上数据，因此，我们可以用它来调用 NFT 合约上的函数完成铸造。

🚀🚀 那就让我们一起来学习，如何使用它从我们的 NFT 合约中铸造 NFT吧。

```bash
cast send --rpc-url=$RPC_URL <contractAddress> "mintTo(address)" <mintAddress> --private-key=$PRIVATE_KEY
```

**参数说明：**
- `contractAddress`：从上一节课部署成功后的 `Deployed to` 信息可以得到。
- `mintAddress`：可以从 `anvil` 提供的 `Available Accounts` 选择一个即可。

如果铸造成功，您将看到终端打印出的链上信息：

```json
{
  "blockHash": "0x9e93b747b38f94dc55be8c4c1eb051a7ec6f6b5d968edb32229750cd5fd1ba67",
  "blockNumber": 2,
  "contractAddress": "",
  "cumulativeGasUsed": 21432,
  "effectiveGasPrice": 3883511409,
  "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "gasUsed": 21432,
  "logs": [],
  "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "root": "",
  "status": 1,
  "transactionHash": "0xda7e3ab82bff39b5bcaeedde0ced1e4649d56112886dfce0774830aae01038ec",
  "transactionIndex": 0,
  "type": 2,
  "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "depositNonce": null
}
```

恭喜你，NFT 已经铸造成功！下节课，我们将一起学习如何验证 NFT 是否真的归属于我们指定的地址。

---

## 5.2 检验 NFT 所有者

### 检验 NFT 所有者

上节课，我们从编写的 NFT 合约中铸造了自己的第一个 NFT！  
从这节课开始，我们要学习来检查铸造出来的 NFT 持有者是不是我们指定的地址，如果对应上，那就可以真正确认我们的 NFT 铸造成功。

```bash
cast call --rpc-url=$RPC_URL --private-key=$PRIVATE_KEY <contractAddress> "ownerOf(uint256)" 1
```

通过运行 `cast call` 命令来检查 `currentTokenId` 等于 1 的 NFT 的所有者。上面的命令我们只需要手动修改 `contractAddress` 即可，如果运行成功，应该会返回我们铸造时指定的所有者地址。

如果地址完全匹配，那恭喜你🎉，NFT 已经铸造成功！
