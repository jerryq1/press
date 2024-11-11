# 腾讯VPN审计系统-数据库审计

## 一、历史背景
原有腾讯云OPENVPN基于TCP架构，用户拨号后，VPN服务器会分配一个内网IP地址，用户通过VPN服务器访问腾讯云内网，VPN服务器会转发用户所有请求，现有架构存在如下问题：
- 无法实时监控用户操作和日志记录
- 无法检测违规操作并对危险命令进行拦截
- 无法识别事故追根溯源以及风险预警等。
![alt text](/yw/tcp/image.png)

## 二、请求数据库数据流程
![alt text](/yw/tcp/image-1.png)
- PREROUTING: 在路由选择之前处理数据包
- POSTROUTING: 在路由选择之后处理数据包
iptables 里有一个 REDIRECT 目标，主要用于把路过服务器的某些流量重定向到服务器上某个端口进行处理，所以，可以把MYSQL、REDIS的请求重定向到代理服务器上，然后代理服务器进行拦截，主要使用PREROUTING链实现流量劫持。
```
# 把访问 172.16.96.133 的MYSQL请求重定向到代理服务器8004端口上
-A PREROUTING -d 172.16.96.133/32 -p tcp -m tcp --dport 3306 -j REDIRECT --to-ports 8004
```
## 三、TCP PROXY实现原理
![alt text](/yw/tcp/image-4.png)
OPENVPN拨号成功后，用户通过Navicat工具配置DB终端IP，数据包通过本机路由规则把内网172.16.0.0/16转发到VPN服务器，VPN服务器再通过iptables把请求重定向到代理服务器8004端口，然后代理服务器进行授权、日志收集和拦截等判断处理。
>知识库：iptables的redirect target是改写IP包头中的Destination IP和Destination port从而实现流量转发，同时将原始目的IP/端口写在Sock option里的SO_ORIGINAL_DST
## 四、代理服务器关键实现代码
![alt text](image6.png)
4.1、监听端口8004，接收客户端连接，获取客户端IP和真实访问DB目的地址
```
#!/bin/python
# -*- coding: utf-8 -*-
from gevent import monkey;monkey.patch_all()
……
server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

# 绑定套接字到指定IP和端口
server_socket.bind((server_ip, port))
# 开始监听，允许最大10240个连接排队
server_socket.listen(10240)

while True:
    # 接受客户端连接请求
    client_socket, client_address = server_socket.accept()
    # 获取客户端IP
    client_ip = client_address[0]

    # 获取VPN用户，如果无效则标记为无效用户
    vpn_user = vpn_user_dict.get(client_ip, "InvalidUser")

    try:
        # 获取访问目的地址IP和端口
        dst_info = client_socket.getsockopt(socket.SOL_IP, 80, 16)
        if len(dst_info) != 16:
            raise ValueError("Invalid destination info length")
        # 解析目的地址
        db_port, db_packed_ip = struct.unpack("!2xH4s8x", dst_info) # 核心核心核心核心核心核心，参考知识库描述
```
4.2、建立代理连接，将客户端请求转发到目的地址
```
 # 创建转发套接字并建立远程连接
forward_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
forward_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
forward_socket.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 1024 * 4)
# PROXY是CLIENT,发起DB连接
forward_socket.connect((db_ip, db_port))
# 异步转发数据
gevent.spawn(forward, client_socket, forward_socket, "client", client_ip, db_ip, db_port,vpn_user)
gevent.spawn(forward, forward_socket, client_socket, "server", db_ip, client_ip, db_port,vpn_user)

```
## 五、代理服务器日志记录
```
{"timestamp": "2024-11-11T06:21:40+00:00", "user": "xx", "remote_addr": "10.8.17.41", "operation_type": "mysql-audit", "asset": "172.16.226.8", "events": "SHOW COLUMNS FROM `mdd_adx`.`t_adx_log_config`"}
{"timestamp": "2024-11-11T06:21:40+00:00", "user": "xx", "remote_addr": "10.8.17.41", "operation_type": "mysql-audit", "asset": "172.16.226.8", "events": "SHOW TABLE STATUS LIKE 't_adx_log_config'"}
{"timestamp": "2024-11-11T06:21:40+00:00", "user": "xx", "remote_addr": "10.8.17.41", "operation_type": "mysql-audit", "asset": "172.16.226.8", "events": "SHOW CREATE TABLE `mdd_adx`.`t_adx_log_config`"}
# 拦截记录
{"timestamp": "2024-10-10T07:53:29+00:00", "user": "hezhu", "remote_addr": "10.8.16.9", "operation_type": "mysql-audit", "asset": "172.16.96.133", "events": "black: drop DATABASE hezhutest"}
{"timestamp": "2024-10-10T08:57:08+00:00", "user": "hezhu", "remote_addr": "10.8.16.9", "operation_type": "mysql-audit", "asset": "172.16.96.133", "events": "black: drop DATABASE hezhutest"}
```
## 六、展示大屏
![alt text](/yw/tcp/image-5.png)
