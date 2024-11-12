# 使用 coroot 实现 Kubernetes 服务可观测性

## 可观测性与传统监控的区别和联系
### 什么是可观测性？
可观测性（Observability）是一种软件开发和系统构建的哲学，是对系统内部状态及行为的度量和推断能力，通常包括日志、指标、链路追踪等多个度量维度。也就是说，在软件开发和运维领域中，可观测性是指对于一个复杂的系统，能够通过监控、日志、指标、追踪等手段，快速地发现、诊断、解决问题的能力。
### 传统监控的局限性
- 侧重于依赖“经验主义”，应对“已知问题”，对“未知问题”的应对能力有限
- 告警驱动的传统监控，缺乏对故障的全局感知
- 系统的开发者和系统的维护者，职责是相对分割的，导致监控以外挂形式为主
- 传统监控面向的通常是基础设施，Metrics是传统监控的基础

传统监控，要预先知晓采集哪些指标，添加什么样的告警策略，定制什么样的仪表盘，以便发现某种类型的故障后，采用什么样的动作来应对。比如技术团队会根据过往经验，知道一台服务器上打开的文件句柄数量不能太多，超过某个上限就会影响到网络通信以及文件读写，因此我们会采集一个 node_filefd_allocated 的指标，然后配置一个告警策略：当 node_filefd_allocated > 1000k 则触发告警，同时我们会提前制作一个 Linux 主机 Dashboard，其中包含有 node_filefd_allocated 的趋势图。准备好这些工作之后，接下来就是守株待兔，等待告警的触发，当发现故障时值班的技术团队就可以按照技术文档来排查故障，检查是否有进程泄露文件句柄，或者是否有大量的网络链接建立等等。
## Coroot 是什么？
Coroot是一款基于 eBPF 的开源可观测性工具，可将遥测数据转化为可操作视图，帮助快速识别和解决应用程序问题。coroot 的架构设计基于 prometheus，同时也依赖了 eBPF。但对内核有局限性，必须4.16+上才才能使用。

### 架构图如下所示：
![alt text](/coroot/image.png)
### 安装部署
```
helm repo add coroot https://coroot.github.io/helm-charts
helm repo update coroot
helm install --namespace coroot --create-namespace --set corootCE.service.type=NodePort coroot coroot/coroot
```
### 安装后效果
![alt text](/coroot/image-1.png)
![alt text](/coroot/image-2.png)
![alt text](/coroot/image-4.png)