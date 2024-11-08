# Windows弱网配置教程
network emulator主要用于测试丢包率

1、连上360wiffi （win10需要手动下载360wiffi 驱动安装：http://wifi.360.cn/）

![img](/test_group/2024/network_emulator/wps1.jpg) 

2、控制面板\所有控制面板项\网络和共享中心，设置WLAN（360免费WiFi-91）

![img](/test_group/2024/network_emulator/wps2.jpg) 

3、wiffi对应的物理地址

![img](/test_group/2024/network_emulator/wps3.jpg) 

 

![img](/test_group/2024/network_emulator/wps4.jpg) 

4、属性-勾选NEWT NDIS6，否则network emulator上可能没有360wifi的网卡

![img](/test_group/2024/network_emulator/wps5.jpg) 

 

5、打开network emulator，

a、新建VirtualChannel，File->new或者 Configuration->New Channel;

![img](/test_group/2024/network_emulator/wps6.jpg) 

b、再建一个过滤器Filter,Configuration->New Filter

![img](/test_group/2024/network_emulator/wps7.jpg) 

设置说明：1. All Network 是指所有网络；

​         2. IPV4、IPV6(本地IP(Local IP)，或者远程IP(Remote IP)及子网掩码(IP Mask))；

​         3.可以指定本地端口(Local Port)或远程端口(Remote Port)大小范围；

​          4.协议(Protocol)，针对TCP\UDP协议；

​          5.可以选择网卡适配器(Adapaters），对适配器增删改；

备注：选择要连接的wifii物理地址，点击新增Add，再点击Modify修改设置成功。

![img](/test_group/2024/NetworkNmulator/wps8.jpg) 

c、新建连接Link,Configration->New Link

目前demo上的模拟丢包按钮没有生效，采用network emulator+360随身wifi进行测试，选择无限网卡连接，弱网设置后启动。

![img](/test_group/2024/network_emulator/wps9.png) 



![img](/test_group/2024/network_emulator/wps10.png) 



![img](/test_group/2024/network_emulator/wps11.png) 



![img](/test_group/2024/network_emulator/wps12.png) 

---也可以直接设置rtt抖动值

![img](./test_group/2024/network_emulator/wps13.jpg) 

备注：Latency：网络延迟，即rtt抖动500~700ms 

 先使用手机搜索并连接到360wiffi：

![img](/test_group/2024/network_emulator/wps14.jpg) 

设置好之后，先点击脚印，再点开始，之后在RT Traffic Monitor可以看是动态的变化

![img](/test_group/2024/network_emulator/wps15.png) 



前提要有手机连上这个网络，连上之后选择loss rate我们就可以看到动态的丢包率了

![img](/test_group/2024/network_emulator/wps16.png) 





备注：

![img](/test_group/2024/network_emulator/wps17.png) 

要是network emulator上没有360wifi的网卡 你就在上面那边打个勾 ，重启network emulator就会出现的了-----重要

学习链接：https://blog.csdn.net/no1mwb/article/details/53638681

 
