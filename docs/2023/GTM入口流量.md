### 概述

```markdown
本文主要基于腾讯云的iGTM产品，讨论原理和具体实施，全局流量管理，简称GTM，主要作用于DNS层面，提供就近接入、负载均衡、入口网络健康检查，并能够根据健康检查结果进行故障隔离或流量切换，主要用于多活等高可用场景。
```

### 原理

```markdown
例如网站服务是 www.example.com
1. 开通 GTM 实例后 , 系统自动分配了一个CNAME接入域名 gtm12345678.gtm-000.com
2. 为GTM 实例添加资源池 1.1.XX.XX、2.2.XX.XX、3.3.XX.XX，并开启健康检查。
3. 将网站服务 www.example.com CNAME指向 gtm12345678.gtm-000.com。
```

**原理流程图解**

![原理图解](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/8051950461/p362535.png)

**产品架构图解**

![产品架构](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/8051950461/p362536.png)

**切换规则**具体参考[腾讯云文档](https://cloud.tencent.com/document/product/1551/84524)

### 实施

```markdown
从上述的架构原理图，我们可以清晰看到GTM的本质是通过HealthCheck配合访问策略和资源组，实现动态实时的更改Dnspod解析规则，从而达到从DNS实时剔除异常节点，当然用户端（App、PC）生效还需要加上扩散时间，当然实时双活不是本文重点，细节我们后续再讨论，目前我们主要讨论如何接入GTM。
```

- 现状

  我们以`xxx.com`举例，现状该域名已在`Dnspod`进行`A地址`解析托管（其实就是解析到`CLB`的`VIP`地址)

- 接入

  如果要接入`GTM`，需要在`Dnspod`进行`CNAME`解析到`igtm.xxxx.com`(腾讯自动生成)，考虑到初次接入和平稳过渡的需求，我们会考虑逐步可迭代的方式进行接入，需要引入**新的域名**提供给用户端（`App、PC`），并做好实时回退、放量、切换的流程方案。

- 高可用

  通过`GTM`似乎实现相比目前更高一级的高可用，可以应对比如腾讯云`Region`、`DB`等故障，如果`GTM`、`Dnspod`、`HttpDNS`本身故障我们仍然无能为力，当然如果我们在阿里云进行备域名备案和托管并做好用户端（`App`、`PC`）切换策略，是可以更进一步提高可用性（是否需要，有待商榷）。

- 风险点分析

  1. 引入`GTM`造成的不稳定，`GTM`本身不稳定
  2. `HealthCheck`和资源策略的不合理导致剔除不符合预期，都会对入口流量造成风险
  3. 用户端（`App`、`PC`）策略，包括回退、放量、切换等流程方案造成的异常风险

### 参考链接

[腾讯云文档](https://cloud.tencent.com/document/product/1551)











