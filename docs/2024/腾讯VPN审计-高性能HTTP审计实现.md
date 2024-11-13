# 腾讯VPN审计-高性能HTTP审计实现

## 一、历史背景
原有腾讯云OPENVPN基于TCP架构，用户拨号后，VPN服务器会分配一个内网IP地址，用户通过VPN服务器访问腾讯云内网，VPN服务器通过SNAT方式转发用户所有请求，现有架构存在如下问题：
- 无法实时监控和记录用户访问内部系统情况
- 同一IP下可能有多个域名指向，单纯开放IP白名单，无法实现域名精准访问权限控制
- 无法识别事故追根溯源以及风险预警等。

## 二、新数据流向架构
![alt text](/yw/http/image.png)
- PREROUTING: 在路由选择之前处理数据包
- POSTROUTING: 在路由选择之后处理数据包
iptables 里有一个 REDIRECT 目标，主要用于把路过服务器的某些流量重定向到服务器上某个端口进行处理，所以，所以可以把WEB访问请求重定向到代理服务器上，然后在代理服务器进行过滤、授权、拦截、日志记录等功能。
```
# 使用PREROUTING链把所有要访问WEB端口80、443等访问请求通过iptables重定向到代理服务器31281端口
-A PREROUTING -p tcp -m tcp --dport 80 -j REDIRECT --to-ports 31281
-A PREROUTING -p tcp -m tcp --dport 443 -j REDIRECT --to-ports 31282
-A PREROUTING -p tcp -m tcp --dport 5601 -j REDIRECT --to-ports 31281

```
## 三、HTTP 透明实现原理
![alt text](/yw/http/image-1.png)
OPENVPN拨号成功后，用户通过Chrome等浏览器访问埋堆堆内部管理系统，流量经过VPN服务器，iptables把用户请求流量重定向到代理服务器openresty WAF 31281代理端口，通过在代理服务器进行用户授权、访问日志持久化和鉴权拦截等判断处理。
>知识库：授权通过后获取用户HTTP HOST地址在NGINX内部进行PROXY_PASS到目标后端服务器，实现HTTP透明代理。
## 四、代理服务器关键配置代码
4.1、加载WAF 配置规则
```
#nginx-lua-waf配置
lua_package_path "/opt/application/openresty/nginx/conf/nginx-lua-waf/?.lua;;";
lua_shared_dict limit 200m;
#开启lua代码缓存功能
lua_code_cache on; 
lua_regex_cache_max_entries 4096;
init_by_lua_file   /opt/application/openresty/nginx/conf/nginx-lua-waf/init.lua;
```
4.2、建立代理连接，将客户端请求proxy_pass转发到目的host（七层主机头）
```
server {
listen       31281 reuseport;
server_name  _;
resolver     183.60.83.19 183.60.82.98;

……
add_header Mdd-Waf $server_addr;

location / {
	access_by_lua_file /opt/application/openresty/nginx/conf/nginx-lua-waf/access.lua; #拦截规则
	proxy_pass http://$http_host; # 用户访问的HTTP HOST域名主机头
}
}
```
4.3、代码库参考
[代码链接](https://git.mddcloud.com.cn/mdd-devops/scripts/-/tree/master/openvpn-waf)


## 五、效果展示
5.1、访问日志审计
```
{"uri":"/zhangbing/mddtv.git/info/refs","timestamp":"2024-11-11T14:59:15+08:00","remote_user":"ott.public","http_host":"git.mddcloud.com.cn","request_method":"GET","http_user_agent":"git/2.38.1","request_uri":"/zhangbing/mddtv.git/info/refs?service=git-upload-pack","remote_addr":"10.8.17.169","waf_addr":"10.8.24.1","server_protocol":"HTTP/1.1","scheme":"http","waf_action":"Accept"}
{"uri":"/zhangbing/mddtv.git/info/refs","timestamp":"2024-11-11T14:59:15+08:00","remote_user":"ott.public","http_host":"git.mddcloud.com.cn","request_method":"GET","http_user_agent":"git/2.38.1","request_uri":"/zhangbing/mddtv.git/info/refs?service=git-upload-pack","remote_addr":"10.8.17.169","waf_addr":"10.8.24.1","server_protocol":"HTTP/1.1","scheme":"http","waf_action":"Accept"}
{"uri":"/zhangbing/mddtv.git/info/refs","timestamp":"2024-11-11T14:59:15+08:00","remote_user":"ott.public","http_host":"git.mddcloud.com.cn","request_method":"GET","http_user_agent":"git/2.38.1","request_uri":"/zhangbing/mddtv.git/info/refs?service=git-upload-pack","remote_addr":"10.8.17.169","waf_addr":"10.8.24.1","server_protocol":"HTTP/1.1","scheme":"http","waf_action":"Accept"}
{"uri":"/zhangbing/mddtv.git/git-upload-pack","timestamp":"2024-11-11T14:59:15+08:00","remote_user":"ott.public","http_host":"git.mddcloud.com.cn","request_method":"POST","http_user_agent":"git/2.38.1","request_uri":"/zhangbing/mddtv.git/git-upload-pack","remote_addr":"10.8.17.169","waf_addr":"10.8.24.1","server_protocol":"HTTP/1.1","scheme":"http","waf_action":"Accept"}
```
5.2、拦截页面
![alt text](/yw/http/image-2.png)
## 六、数据大屏
![alt text](/yw/http/image-3.png)
