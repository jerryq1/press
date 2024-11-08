# 埋堆堆CMDB资产自动化体系建设

## 一、什么是CMDB？
CMDB，Configuration Management Database的简称，与可以叫”配置管理数据库“，但实际上更多的被称呼为”资产管理系统“，CMDB的主要功能是收集、存储和分析所有IT基础设施和服务的信息,以确保企业在进行配置管理、问题解决和变更管理等方面具有全面而准确的数据支持。
## 二、埋堆堆为啥要做CMDB？
现埋堆堆运维基础组件jenkins、prometheus、jumpserver等系统相对独立，没有统一数据源，比如业务要增加一台CVM服务器上线，需要到各个系统添加服务器归属业务路径，用户权限等信息，容易导致各个系统服务器信息不一致、难管理等问题
现服务器上架流程图：
![alt text](/cmdb/image.png)
## 三、CMDB解决那些问题？
CMDB是所有运维工具的数据基础，提供服务器的基础信息，例如服务磁盘、内存、CPU、用户权限等，用来搜索服务器的基础信息、权限关系等，并将这些信息，提供给各个运维组件，比如Jenkins代码发布系统需要业务节点IP、Prometheus监控系统需要业务IP和节点信息、Jumpserver跳板机需要用户授权信息等；CMDB也是运维自动化工具的基石，比如开发脚本对接CMDB，通过CMDB获取服务器信息，实现自动化。
## 四、整改后架构图所示：
![alt text](/cmdb/image-1.png)
## 五、安装部署
### 5.1、安装腾讯蓝鲸平台
参考腾讯文档：[[GitHub](https://bk.tencent.com/docs/markdown/ZH/DeploymentGuides/7.2/index.md)] (https://bk.tencent.com/docs/markdown/ZH/DeploymentGuides/7.2/index.md)
### 5.2、配置腾讯云账号，用于CVM等资产同步
![alt text](/cmdb/image-2.png)
![alt text](/cmdb/image-3.png)
### 5.3、资产目录树配置
![alt text](/cmdb/image-4.png)
### 5.4、资产权限配置
![alt text](/cmdb/image-5.png)
**备注：主要维护人对应系统tvbcserver用户，备份维护人对应系统devops用户**
## 六、与Prometheus整合
### 6.1、Prometheus 基于 Consul 实现服务自动发现注册架构
![alt text](/cmdb/image-7.png)
### 6.2、资产同步脚本开发
![alt text](/cmdb/image-8.png)
### 6.3、Consul同步结果展示
![alt text](/cmdb/image-9.png)
![alt text](/cmdb/image-10.png)
### 6.4、与Grafana监控系统整合
![alt text](/cmdb/image-11.png)
### 6.5、与Prometheus告警系统整合
![alt text](/cmdb/image14.png)
## 七、与Jumpserver跳板机整合
### 7.1、资产权限同步方式主要是通过Jumpserver API实现
![alt text](/cmdb/image-12.png)
### 7.2、效果展示
![alt text](/cmdb/image-13.png)
### 7.3、代码实现
## 八、与Jenkins代码发布系统整合
### 8.1、主要使用Groovy脚本与CMDB交互
### 8.2、代码实现
