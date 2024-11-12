# 云原生-Thanos分布式监控
## 一、Thanos架构详解
### 1.1、Thanos是什么？
thanos是prometheus的高可用解决方案之一，thanos与prometheus无缝集成，并提高了一些高级特性，满足了长期存储 + 无限拓展 + 全局视图 + 无侵入性的需求。

### 1.2、thanos receive模式架构
![alt text](/thanos/image.png)
图中包含了 Thanos 的几个核心组件，但并不包括所有组件，简单介绍上图中几个组件：
- 查询网关（Thanos Querier/Query）：实现了 Prometheus API，与汇集底层组件（如边车组件 Sidecar，或是存储网关 Store Gateway）的数据（可以去查询sidecar里面的数据，或者是程查询存储网关里面的一个数据，有一部分的数据可能还在本地，因为sidecar还没有将数据上传到对象存储，这个时候去查询的时候会根据查询时间会去路由到本地的sidecar，如果数据在远程存储上面，那么就会从存储网关Thanos Store Gateway上面去读取）
- 存储网关（Thanos Store Gateway）：将对象存储中的数据内容暴露给Query去查询，用于历史数据查找
- 压缩器（Thanos Compactor）：将对象存储中的数据进行压缩和降低采样率，加速大时间区间监控数据查询的速度
- 接收器（Thanos Receiver）：从 Prometheus 的 remote-write WAL（Prometheus 远程预写式日志）获取数据，暴露出去或者上传到云存储（和sidecar是两种不同的方式）
- 规则组件（Thanos Ruler）：对监控数据进行评估和告警，还可以计算出新的监控数据，将这些新数据提供给 Thanos Query 查询并且/或者上传到对象存储，以供长期存储
- Bucket：主要用于展示对象存储中历史数据的存储情况，查看每个指标源中数据块的压缩级别，解析度，存储时段和时间长度等信息。
## 二、kube-prometheus部署
### 2.1、版本选择
![alt text](/thanos/image-1.png)
### 2.2、部署
提供优化后的kube-prometheus-1.24.tar.gz或prometheus-1.26.tar.gz,解压后，运行以下命令：
```
#修改集群标识
vim prometheus-prometheus.yaml
# 增加cluster标识
externalLabels:
    cluster: mdd-xxx
#执行crd创建，因crd内容比较多，使用apply会提示long错误，此处使用create进行创建
kubectl create -f manifests/setup/
#创建kube-prometheus组件所有服务
kubectl apply -f manifests/
```
**注意：要更改prometheus-prometheus.yaml 里面的externalLabels集群标识**
**注意：要更改prometheus-prometheus.yaml 里面的externalLabels集群标识**
**注意：要更改prometheus-prometheus.yaml 里面的externalLabels集群标识**
## 三、kube-thanos 部署
### 3.1 receive模式架构
![alt text](/thanos/image-2.png)
### 3.2 receive模式配置
prometheus-prometheus.yaml分别配置remote-write远程写入和prometheus 设置为agent模式
```
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  labels:
    app.kubernetes.io/component: prometheus
    app.kubernetes.io/instance: k8s
    app.kubernetes.io/name: prometheus
    app.kubernetes.io/part-of: kube-prometheus
    app.kubernetes.io/version: 2.41.0
  name: k8s
  namespace: monitoring
spec:
  image: mdd-images.tencentcloudcr.com/monitoring/prometheus:v2.41.0
  containers:
  - name: prometheus
    args:
    - '--config.file=/etc/prometheus/config_out/prometheus.env.yaml'
    - '--storage.agent.path=/prometheus'
    - '--enable-feature=agent' # 启用agent模式采集容器监控数据，本地不存储数据
    - '--web.enable-lifecycle'

  remoteWrite:
    - url: http://thanos-receive-router.thanos:19291/api/v1/receive # thanos接收端
      name: mdd-devops # 集群标识
      remoteTimeout: 30s # 超时时间
      headers: # 添加自定义header，多租户
        THANOS-TENANT: mdd-devops 

```
### 3.3 安装kube-thanos
从github下载源码包：https://github.com/thanos-io/kube-thanos 或优化后的部署文件, 执行安装部署
```
kubectl apply -f manifests/
```
### 3.4 配置文件说明
|文件	|作用|
| ------ | ------ |
|alert-rules-app.yaml|	监控规则-应用相关
|alert-rules-host.yaml|	监控规则-主机相关
|alert-rules-http.yaml|	监控规则-域名监控
|alert-rules-k8s.yaml|	监控规则-K8S集群相关
|alert-rules-mdd.yaml|	监控规则-MDD接口
|alert-rules-ott.yaml|	监控规则-OTT接口
|alert-rules-thanos.yaml|	监控规则-Thanos组件监控
|blackbox-http-test.yaml|	黑盒-域名监控-不重要域名
|blackbox-http.yaml|	黑盒-域名监控-重要域名
|blackbox-ping.yaml|	黑盒-PING监控-重要IP/域名
|prometheus-additional-scrape-config.yaml|	Prometheus自定义监控，可以在这里手动添加监控目标，比如要监控超级节点的POD内存、磁盘等，可参考https://cloud.tencent.com/document/product/457/82640

### 3.5 部署完成效果
![alt text](/thanos/image-3.png)

## 四、阿里ARMS告警管理接入
### 4.1 创建集成
 阿里云控制台->ARMS->告警管理->集成->创建集成
![alt text](/thanos/image-4.png)
### 4.2 thanos rule 配置集成
```
apiVersion: v1
kind: Secret
metadata:
  labels:
    app.kubernetes.io/name: thanosruler-alertmanagersconfig
  name: thanosruler-alertmanagersconfig
  namespace: thanos
stringData:
  config.yaml: |-
    alertmanagers:
    - http_config:
        bearer_token: "xxxxxx"
      static_configs: ["alerts.aliyuncs.com"]
      scheme: https
      timeout: 30s
      api_version: v1
type: Opaque

```
### 4.3 配置ARMS集成事件映射
![alt text](/thanos/image-5.png)

### 4.4 配置ARMS事件处理流
用途：通过设置事件处理流将告警源产生的事件进行过滤和分类，比如把severity原来的P3改成P1
事件流架构：

![alt text](/thanos/image-7.png)
### 4.5 配置ARMS告警规则
用途：发送相关业务联系人
### 4.6 配置升级策略
用途：告警在N时间内没恢复，则升级，比如打电话、发邮件、发短信、发微信、发钉钉等
### 4.7 配置告警联系人
### 4.8 配置告警模板
### 4.9 配置静默策略
### 4.10 部署完成效果
![alt text](/thanos/image-8.png)