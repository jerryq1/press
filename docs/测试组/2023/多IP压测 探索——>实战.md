
### `一、概念`

###### `**IP欺骗**：`

```
攻击者伪装成信任的主机或服务器，并将伪造的源IP地址放入网络数据包中。这使得攻击者的数据包看起来像是来自于合法的源，从而欺骗目标系统。
```

###### `**压测IP欺骗**：`

```
ip欺骗就是模拟ip。什么意思呢，一个电脑就只有一个ip地址，当然如果有多块网卡的话，会有多个ip地址，一般服务器上有个网卡，我们自己的电脑一般都只有一个ip地址，但是你做压测的时候有的系统为了防止恶意刷请求，服务端会判断每个请求过来的ip是不是同一个，如果同一个ip地址在一段时间内频繁请求的话，就把这个ip给封了。这样的情况下你做压测的时候就会受到影响了，因为你的电脑就只有一个ip地址，所有的请求发过去都只是一个ip地址这种情况下就需要用到ip欺骗了，这样请求发过去的ip地址就不是同一个了，就能解决这样的问题了。ip欺骗就是在这种情况下使用的。
```

###### `**IP欺骗真的有用吗**：`

```
  第一种情况，内网压测:
    内网压测的话，ip欺骗是有用的，ip欺骗是在局域网里面找一些没有被使用过的ip地址，然后以这些ip地址发请求过去，这样的话，服务端接收到的ip地址，都是你局域网里面的ip，它的确是模拟了其他ip的。
  第二种情况，外网压测:
   外网压测，外网压测的话，就是把我们的系统部署到外网上了，所有的人都可以访问，那这样的话，ip欺骗模拟的ip还是局域网里面的那些ip，公司里面整个网络的出口都是一样的，比如说公司是电信的网络，拉了一条网线，那么整个公司的人，发出去的请求都是一个出口，就是这一个网线的出口出去的，就只有一个外网的ip地址了，那么你再怎么ip欺骗都是局域网里面可以随便搞，出口始终是一个、就模拟不了了、这种就是自己欺骗自己。
```

###### `**为什么要伪装和欺骗**：`

```
  (1)由于现在绝大多数的服务器出于安全考虑会对同一IP地址做过滤，例如: 百度同一IP短时间内发出大量的请求，这个IP就会被封禁-段时间。所以如果想要达到正常的压测效果，我们需要在发请求时伪造出不同的IP地址。
  （2)我们在做压力测试时，有这样的场景和需求，希望模拟的批量用户来自不同的IP地址，更加贴近真实。
```

### `二、工具   `

​    loadrunner（仅windows）：

​      LoadRunner ---->Tools ---->IP Wizard

```
  jmeter：
```

​     没有对应插件，可以借用nmap扫描

​     JMeter进行IP欺骗的原理很简单，就是将本地网卡绑定多个IP，JMeter使用该网卡配置的合理IP发送请求，因此这种IP欺骗，对外网是无效的，只能用于内网的测试。 在一些公司环境中，某些网线端口已经固定IP，使用自己配置的固定IP无法正常访问网络，或者此端口与局域网内其他IP冲突，此时可能报错误：[Java.net](http://java.net/).BindException: Cannot assign requested address: JVM_Bind。此时可以咨询公司IT（解决端口固定IP问题），或者PING一下端口查看是否占用（解决冲突问题），或者自己用交换机自己组建一个简单干净的局域网进行测试。

### 三、探索

####  使用loadrunner：

##### 1.**第一步：**

![TVBC > 多IP压测 探索——>实战 >image2023-11-29_13-57-49.png](../public/test_group/2023/image2023-11-29_13-57-49.png)

**create new setting** 创建新的设置

　　当第一次使用IP欺骗或已经释放了添加的IP时，就需要选择这一项创建新有设置。

**Load previous settings fro** 读取IP列表文件

　　从以前设置的IP地址列表中读取IP地址

**Restore original setting** 释放已经设置的IP 

　　释放已经添加的IP 地址。

选择默认选中项：create new setting （创建新的设置） ，点击“下一步”

##### 2.**第二步：**

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-5-17.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-5-17.png?version=1&modificationDate=1701237917622&api=v2)

让输入服务器的IP地址，Loadrunner通过该地址更新路由表。

　　客户端计算机上添加新的IP地址后，服务器需要将该地址添加到路由表，以便能够识别返回到客户端的路由。如果服务器和客户端具有相同的子网掩码、IP 类和网络，则不需要修改服务器的路由表。

　　如果客户端和服务器计算机之间有一个路由器，则服务器需要识别经过该路由器的路径。确保将以下路由添加到服务器路由表：从 Web 服务器到路由器的路由，以及从路由器到负载生成器计算机上的所有 IP 地址的路由。

这里可以不做任何添加，点击“下一步”。

##### 3.**第三步：**

**![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-6-22.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-6-22.png?version=1&modificationDate=1701237982994&api=v2)**

**默认显示本机的IP 地址，当然，我们还需要添加更多的IP 。点击“Add”进入IP添加页面。
**

##### 4.**第四步：**

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-7-3.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-7-3.png?version=1&modificationDate=1701238023217&api=v2)



**Class C、Class B、****Class A** 表示，我们要使用是的A类、B类还是C类IP地址。**don't use any of these** 不要使用任何，它会把默认的IP与子网掩码清空。

（C类最多只能模拟255 个IP，如果你的需要更多，那么就需要使用A 类或B类）

**from ip** 输入框中输入起始ip

**Number to**  输入框中输入ip地址的个数，也就是说我们需要成多少个用于欺骗的IP

（上面的配置是从110开始，按顺序生成5个）

**Submask**根据IP类型输入正确的子网掩码

选中“verify that new ip addresses are not already used”，点击“OK”。

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-8-41.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-8-41.png?version=1&modificationDate=1701238121450&api=v2)

此时IP Wizard会自动按照设置生成IP地址，并且将已经占用的IP列出。点击“完成”

##### 5.**第五步：**

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-9-48.png](https://wiki.mddcloud.com.cn/download/thumbnails/18220206/image2023-11-29_14-9-48.png?version=1&modificationDate=1701238188649&api=v2)

点击“save as”按钮，可以将我们设置的IP 保存成一个文件，以后再设置的时候，是在第一步里，我们可以选择第二个选项（Load previous settings fro），从文件导入IP 。

点击“ok”，IP Wizard开始帮我们成成IP 。

在命令提示符号输入ipconfig命令验证：

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-10-18.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-10-18.png?version=1&modificationDate=1701238218925&api=v2)

##### 6.**第六步：**

打开loadrunner ---> Controller ，选择Scenario--->Enable IP Spoofer ，此项打勾后表示允许使用IP欺骗。

####  jmeter ：

##### 1.nmap扫描

   安装：nmap官网：https://nmap.org/download.html

   python-nmap：

​    我这边使用的是python-nmap (端口扫描器：Python的第三方模块python-nmap可以实现高效的端口扫描。比如服务器的22,21,3389，3306等高危端口是否暴露在了互联网上。python-nmap是Linux命令nmap的封装)
​    由于python-nmap是nmap命令的封装，因此必须先安装nmap



   利用python脚本反向生成未被占用的ip文件

筛选时候注意网段的选择

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-47-17.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-47-17.png?version=1&modificationDate=1701240437403&api=v2)

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-47-37.png](https://wiki.mddcloud.com.cn/download/thumbnails/18220206/image2023-11-29_14-47-37.png?version=1&modificationDate=1701240457600&api=v2)

##### 2.负载机绑定ip

######  windows：

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_14-51-37.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_14-51-37.png?version=1&modificationDate=1701240698541&api=v2)

######  mac：

系统偏好设置--网络 新增wifi接口-高级--TCP/IP

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_15-5-19.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_15-5-19.png?version=1&modificationDate=1701241520292&api=v2)

###### linux：

cd /etc/sysconfig/network-scripts/
vim ifcfg-[网口名称]
新增 IPADDR1=192.168.1.11
PREFIX1=24

##### 3.jmeter配置：

 a. http请求 高级 客户端实现 HttpClient4 源地址 IP/主机名：${ip}

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_15-15-5.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_15-15-5.png?version=1&modificationDate=1701242106085&api=v2)

 b.请求头新增X-LocalAddress：${ip}

![TVBC > 多IP压测 探索——>实战 > image2023-11-29_15-14-40.png](https://wiki.mddcloud.com.cn/download/attachments/18220206/image2023-11-29_15-14-40.png?version=1&modificationDate=1701242080415&api=v2)

### 四、落地

Linux：前置已经和运维调通，运维提供一个配置好的ip文件列表，测试这边只需要配置下jmeter引入就OK了，即上文中的jmeter配置。
