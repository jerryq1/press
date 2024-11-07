
## 可观测监控Prometheus

*Mdd可观测现状主要由Metric、Log、Trace体系构成，当前Metric和Log通过K8s的metadata打通，Log和Trace通过探针Agent的TraceId打通，实现Metric、Log、Trace数据可关联；对于系统级别的监控，接入目前体系基本可以覆盖所有应用；对于业务部分，目前主要通过系统级别的Metric、Log部分监控实现业务**兜底级别**的可观测覆盖，对具体业务的巡检、实时可观测等覆盖欠缺，本文主要讨论可观测Prometheus的业务部分，以期解决目前可观测体系未覆盖部分。*

#### 应用接入：

```xml
<!-- spring-boot-actuator依赖 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<!-- prometheus依赖 -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

#### 收集流程图：

![img](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5304637071/271da216f5ek2.svg)

#### 数据采集

- 暴露端点

  暴露`actuator/prometheus`端点，`podMonitor`定时拉取

- 采集方式

  `Prometheus SDK`暴露`Counter`、`Gauge`、`Summary`、`Histogram`等指标

#### 使用示例(error日志告警)

```markdown
#### 场景需求：
1、收集logback的error event事件
2、2分钟内超过3条发微信
3、2分钟内超过20条发短信
```

- 收集上报

  ```markdown
  #### 原始数据
  prometheus 收集logback event的counter，logback_events_total(level='info") -> value
  
  #### PodMonitor采集
  apiVersion: monitoring.coreos.com/v1
  kind: PodMonitor
  metadata:
    annotations:
    labels:
      prom_id: prom-obnq3j4s
    name: mdd-jmx-metrics
    namespace: ops
  spec:
    namespaceSelector:
      any: true
    podMetricsEndpoints:
    - basicAuth:
        password:
          key: password
          name: jmx-auth
        username:
          key: username
          name: jmx-auth
      interval: 15s
      path: /actuator/prometheus
      port: http-mdd
      relabelings:
      - action: replace
        regex: (.*)
        replacement: mdd-xxx
        sourceLabels:
        - cluster
        targetLabel: cluster
      scheme: http
    podTargetLabels:
    - app
    - version
    - grade
    selector:
      matchExpressions:
      - key: business
        operator: In
        values:
        - mdd
  ```

- 统计告警

  ```markdown
  #### AlertManager
  sum(logback_events_total{app="mdd-xxx",namespace=~"prod|gray", level="error"} - logback_events_total{app="mdd-xxx",namespace=~"prod|gray", level="error"} offset 2m)
  ```

#### 参考链接

[Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator/blob/main/Documentation/api.md)