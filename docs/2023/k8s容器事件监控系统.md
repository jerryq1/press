# k8s容器事件监控系统
## 一、事件监控
Kubernetes作为云原生的平台实现，以状态机为整体的设计原则，通过设定期望状态、执行状态转换、检查并补偿状态的方式将资源的生命周期进行接管。状态之间的转换会产生相应的转换事件，在Kubernetes中，事件分为两种：
- 一种是Warning事件，表示产生这个事件的状态转换是在非预期的状态之间产生的
- 另外一种是Normal事件，表示期望到达的状态，和目前达到的状态是一致的

针对事件监控场景，阿里开源了事件离线工具kube-eventer，可以通过它来收集容器事件来丰富Kuernetes在监控方面的维度和准确性，弥补其他监控方案的缺欠。

但在AIOPS和智能化运维场景下，原有通知模式，对每个事件都发出的通知，而且通知内容比较专业化，我们无法快速知道其产生原理和原因，因些，在原有事件基础上做了一次通知改造，通过整合问题知识库，以类似AI方式展示事件告警。

## 二、部署阿里kube-eventer
参考阿里官方教程：[链接](https://gitcode.com/gh_mirrors/ku/kube-eventer/overview?utm_source=csdn_blog_hover)
## 三、告警通知改造
### 3.1、原生kube-eventer通知信息
![alt text](/yw/eventer/image-2.png)
***缺点：一条事件一条通知，无法识别事件原因，解决问题全靠经验，无法快速定位问题原因。***
### 3.2、改造后通知信息
![alt text](/yw/eventer/image-1.png)
***优点：对事件按APP名进行分组，并整合WIKI知识库，提供智能分析、定位、诊断等***
### 3.3、新事件监控系统架构
![alt text](/yw/eventer/image-3.png)
***优化： 通过整合内外部故障知识库，实现智能告警。***
### 3.3、代码实现
略
## 四、大屏监控展示
![alt text](/yw/eventer/image-4.png)
## 五、大屏监控展示链接
[链接Grafana](https://prometheus.mddcloud.com.cn/d/kubernetes-event-exporter/kubernetes-events?orgId=1&refresh=1m)