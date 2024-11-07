### 记一次SpringBoot健康探针导致问题

本文主要介绍SpringBoot的actuator health探针用作k8s startup probe的配置时，管理后台无法启动无法拉起的一次故障定位。

#### 配置

```yaml
#### 典型配置如下
management:
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
    mail:
      enabled: false
    sentinel:
      enabled: false          
```

#### 初始化

- SpringBoot(Servlet应用)

  ```markdown
  #### autoconfigure 用于组装注入
  1. HealthEndpointConfiguration
  2. AutoConfiguredHealthContributorRegistry
  3. HealthContributor(各种HealthIndicator bean声明)
  #### health endpoing 用于提供endpoint和扩展
  1. HealthEndpoint
  2. HealthEndpointWebExtension(SpringBoot 2.x引入，用于HealthEndpoint扩展)
  ```

- K8s

  ```yaml
  startupProbe:                     # 健康检查方式：[readinessProbe,livenessProbe,StartupProbe]
    failureThreshold: 3             # 检测失败3次表示未就绪
    httpGet:                        # 请求方式
      path: /health                 # 请求路径
      port: 8080                    # 请求端口
      scheme: HTTP                  # 请求协议
    initialDelaySeconds: 0         # 容器启动后要等待多少秒后存活和就绪探测器才被初始化，默认是 0 秒，最小值是 0。
    periodSeconds: 10               # 执行探测的时间间隔（单位是秒）。默认是 10 秒。最小值是 1。 
    successThreshold: 1             # 探测器在失败后，被视为成功的最小连续成功数。默认值是 1 存活和启动探测的这个值必须是1 最小值是 1
    failureThreshold: 3             # 当探测失败时，Kubernetes 的重试次数。 存活探测情况下的放弃就意味着重新启动容器。 就绪探测情况下的放弃 Pod 会被打上未就绪的标签。默认值是 3。最小值是 1。
    timeoutSeconds: 1               # 探测的超时间。默认值是 1 秒。最小值是 1。
  ```

#### 生效

```markdown
#### 加载流程
1. 加载HealthIndicator的bean声明(management.health.xxx.enabled=true)
2. AutoConfiguredHealthContributorRegistry装配
3. AbstractHealthIndicator doHealthCheck()进行具体的health check
4. Health check最终结果由所有HealthIndicator组合而成，如果有超时或失败导致检查不通过;在k8s场景，超时容易超出startup probe默认的timeoutSeconds

#### 生效和失效
1. 由于HealthIndicator bean来源外部中间件health，默认开启，只能通过黑名单方式进行配置
2. 黑名单通过management.health.xxx.enabled=false进行关闭,xxx名称来自于OnEnabledHealthIndicatorCondition配置
```
