---
title: Solana铸造代币
date: 2026-01-17
abstract: 简述一下Solana铸造代币初体验
tags:
- Web3
- Solana
---
# Solana铸造代币

## 项目目标
在本次挑战中，我们将实现四个简单的指令：

1.创建一个铸币：使用原始指令或 SDK 提供的抽象指令创建一个 Mint Account

2.初始化铸币：使用原始指令或 SDK 提供的抽象指令初始化创建的 Mint Account。铸币应具有 6 位小数，铸币权限设置为运行代码的钱包，并且没有冻结权限

3.创建一个关联代币账户：使用原始指令或 SDK 提供的抽象指令创建并初始化一个 Associated Token Account

4.铸造 2100 万代币：将 2100 万（21,000,000）新创建的代币铸造到新创建的 Associated Token Account 中

## 代码方式

### 原子创建(手动组装)
```ts
/** Challenge: Mint an SPL Token
 *
 * In this challenge, you will create an SPL token!
 *
 * Goal:
 *   Mint an SPL token in a single transaction using Web3.js and the SPL Token library.
 *
 * Objectives:
 *   1. Create an SPL mint account.
 *   2. Initialize the mint with 6 decimals and your public key (feePayer) as the mint and freeze authorities.
 *   3. Create an associated token account for your public key (feePayer) to hold the minted tokens.
 *   4. Mint 21,000,000 tokens to your associated token account.
 *   5. Sign and send the transaction.
 */

import {
  Keypair,
  Connection,
  
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createMintToCheckedInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import bs58 from "bs58";

// Import our keypair from the wallet file
const feePayer = Keypair.fromSecretKey(
  // ⚠️ INSECURE KEY. DO NOT USE OUTSIDE OF THIS CHALLENGE
  bs58.decode(process.env.SECRET)
);

// Create a connection to the RPC endpoint
const connection = new Connection(
  process.env.RPC_ENDPOINT,
  "confirmed"
);
// const connection = new Connection(
//   "https://api.devnet.solana.com",  // devnet 测试网
//   // "https://api.testnet.solana.com",  // testnet 测试网（可选）
//   "confirmed"
// );

// Entry point of your TypeScript code (we will call this)
async function main() {
  try {
    // Generate a new keypair for the mint account
    const mint = Keypair.generate();

    const mintRent = await getMinimumBalanceForRentExemptMint(connection);
    
    // START HERE

    // 1. Create the mint account
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: feePayer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID
    });

    // 2. Initialize the mint account
    const initializeMintIx = createInitializeMint2Instruction(
      mint.publicKey, // mint pubkey
      6, // decimals
      feePayer.publicKey, // mint authority
      feePayer.publicKey, // freeze authority
      TOKEN_PROGRAM_ID
    );

    // 3. Create the associated token account
    // 🔧 修正1：使用同步版本 getAssociatedTokenAddressSync 而不是异步的 getAssociatedTokenAddress
    const associatedTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey, // mint pubkey
      feePayer.publicKey, // owner pubkey
      false, // allow owner off-curve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // 🔧 修正2：使用 createAssociatedTokenAccountInstruction 而不是 createAssociatedTokenAccountIdempotentInstruction
    const createAssociatedTokenAccountIx = createAssociatedTokenAccountInstruction(
      feePayer.publicKey, // payer
      associatedTokenAccount, // associated token account address
      feePayer.publicKey, // owner
      mint.publicKey, // mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // 4. Mint 21,000,000 tokens to the associated token account
    const mintAmount = 21000000 * (10 ** 6);

    // 🔧 修正3：使用 createMintToCheckedInstruction 而不是 createMintToInstruction
    const mintToCheckedIx = createMintToCheckedInstruction(
      mint.publicKey, // mint
      associatedTokenAccount, // destination
      feePayer.publicKey, // mint authority
      mintAmount, // amount of tokens
      6 // 🔧 修正4：添加 decimals 参数（必须与初始化时的6一致）
    );

    const recentBlockhash = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      feePayer: feePayer.publicKey,
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    }).add(
      createAccountIx,
      initializeMintIx,
      createAssociatedTokenAccountIx,
      mintToCheckedIx
    );

    const signers = [feePayer, mint];

    const transactionSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      signers
    );

    console.log("✅ Mint Address:", mint.publicKey.toBase58());
    console.log("✅ ATA Address:", associatedTokenAccount.toBase58());
    console.log("✅ Transaction Signature:", transactionSignature);
  } catch (error) {
    console.error(`Oops, something went wrong: ${error}`);
    // 🔧 修正5：添加错误日志输出以便调试
    if (error.logs) {
      console.error("Error logs:", error.logs);
    }
  }
}

// 🔧 修正6：确保调用 main 函数
main().catch(console.error);
```


#### 🔧 修正点详解

##### 修正1：使用同步版本获取ATA地址
**问题原因**
- `getAssociatedTokenAddress` 是异步函数，返回 `Promise<PublicKey>`
- 地址未完全解析可能导致指令数据不正确
- 异步时序问题在复杂事务中尤为明显

**解决方案**
- 使用 `getAssociatedTokenAddressSync` 同步版本
- ATA地址是确定性计算的PDA，不需要异步操作
- 确保指令构建时地址已完全确定

##### 修正2：使用标准ATA创建指令
**问题原因**
- `createAssociatedTokenAccountIdempotentInstruction` 会在账户存在时静默跳过
- 可能导致后续指令失败，且错误信息不明确
- 开发调试时需要更明确的行为

**解决方案**
- 使用 `createAssociatedTokenAccountInstruction` 标准版本
- 行为明确：要么创建成功，要么明确失败
- 包含完整的参数，特别是 `ASSOCIATED_TOKEN_PROGRAM_ID`

##### 修正3&4：使用 `createMintToCheckedInstruction` 并传递 `decimals`
**问题原因**
- `createMintToInstruction` 问题：
    - 不验证金额的小数位数
    - 金额格式错误时，链上返回模糊的"Invalid instruction data"
- 缺少 `decimals` 参数问题：
    - 链上程序无法验证金额格式
    - 无法判断 21000000 是否正确或忘记乘以 10^6

**解决方案**
- 使用 `createMintToCheckedInstruction` 进行客户端验证
- 传递 `decimals` 参数进行验证
- 客户端验证失败会给出明确错误信息

##### 修正5：添加错误日志输出
**问题原因**
- Solana交易失败时，RPC返回详细的执行日志
- 日志包含具体哪条指令失败及失败原因
- 默认的错误信息通常不够详细

**解决方案**
- 检查 `error.logs` 是否存在
- 打印完整的交易执行日志
- 便于定位具体失败原因

##### 修正6：确保调用主函数
**问题原因**
- 定义了 async 函数但忘记调用
- 代码不会执行，但语法正确，难以发现疏忽

**解决方案**
- 明确调用主函数
- 添加 `.catch()` 处理未捕获的Promise错误
- 确保代码实际执行

##### 常见坑点总结

| 坑点 | 现象 | 解决方案 |
|------|------|----------|
| 忘记乘以小数位 | Invalid instruction data | 金额 × 10^decimals |
| 余额不足 | may not be used to pay transaction fees | 请求空投或转入SOL |
| ATA程序ID缺失 | 创建ATA失败 | 添加 `ASSOCIATED_TOKEN_PROGRAM_ID` |
| 指令顺序错误 | 账户未初始化 | 按正确顺序：创建→初始化→ATA→铸造 |
| 签名者缺失 | 签名验证失败 | 包含所有新创建账户的密钥对 |

### 抽象指令创建(自动组装)

```ts
/**
 * SPL代币铸造 - 封装API方式
 * 使用高级抽象API简化操作
 */

import { Keypair, Connection } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import bs58 from "bs58";

const feePayer = Keypair.fromSecretKey(bs58.decode(process.env.SECRET));
const connection = new Connection(process.env.RPC_ENDPOINT, "confirmed");

async function abstractMintToken() {
  try {
    console.log("开始铸造SPL代币...");
    
    // 🔧 关键：抽象API中，createMint 函数自动处理账户创建和初始化
    
    // 1. 创建并初始化铸币账户（一步完成）
    console.log("创建铸币...");
    const mint = await createMint(
      connection,           // 网络连接
      feePayer,            // 费用支付者（Keypair）
      feePayer.publicKey,  // 铸币权限地址
      null,                // 冻结权限（null表示没有冻结权限）
      6,                   // 小数位数
      undefined,           // 可选：指定mint的Keypair，undefined表示自动生成
      { commitment: "confirmed" } // 确认选项
    );
    
    console.log("✅ 铸币创建成功:", mint.toBase58());
    
    // 2. 创建关联代币账户（ATA）
    console.log("创建ATA...");
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      feePayer,           // 支付者
      mint,               // 铸币地址
      feePayer.publicKey, // 所有者
      false,              // allowOwnerOffCurve
      { commitment: "confirmed" }
    );
    
    console.log("✅ ATA创建成功:", ata.address.toBase58());
    
    // 3. 铸造2100万代币
    console.log("铸造2100万代币...");
    const amount = 21000000 * (10 ** 6); // 考虑6位小数
    
    const signature = await mintTo(
      connection,
      feePayer,      // 支付者
      mint,          // 铸币地址
      ata.address,   // 目标账户
      feePayer,      // 铸币权限持有者（Keypair）
      amount,        // 金额
      [],            // 多签者列表
      { commitment: "confirmed" }
    );
    
    console.log("✅ 铸造成功！");
    console.log("铸币地址:", mint.toBase58());
    console.log("交易签名:", signature);
    
    // 4. 验证结果
    console.log("验证铸造结果...");
    const ataInfo = await getAccount(connection, ata.address);
    const finalAmount = ataInfo.amount / (10 ** 6);
    
    console.log("最终余额:", finalAmount, "代币");
    console.log("目标金额: 21,000,000 代币");
    
    return { mint, signature, amount: finalAmount };
    
  } catch (error) {
    console.error("❌ 错误:", error.message);
    if (error.logs) {
      console.error("交易日志:", error.logs);
    }
    throw error;
  }
}

abstractMintToken().catch(console.error);
```
