# 腾讯VPN审计-高性能HTTP审计实现

## 一、历史背景
原有腾讯云OPENVPN基于TCP架构，用户拨号后，VPN服务器会分配一个内网IP地址，用户通过VPN服务器访问腾讯云内网，VPN服务器会转发用户所有请求，现有架构存在如下问题：
- 无法实时监控用户访问内部系统日志记录
- 无法根据HTTP 域名七层拦截实现数据库访问权限控制
- 无法识别事故追根溯源以及风险预警等。
![alt text](/yw/http/image.png)

## 二、请求数据库数据流程
![alt text](/yw/http/image-1.png)
- PREROUTING: 在路由选择之前处理数据包
- POSTROUTING: 在路由选择之后处理数据包
iptables 里有一个 REDIRECT 目标，主要用于把路过服务器的某些流量重定向到服务器上某个端口进行处理，所以，可以把MYSQL、REDIS的请求重定向到代理服务器上，然后代理服务器进行拦截，主要使用PREROUTING链实现流量劫持。
```
# 把所有WEB访问请求重定向到代理服务器31281端口上
-A PREROUTING -p tcp -m tcp --dport 8080 -j REDIRECT --to-ports 31281
-A PREROUTING -p tcp -m tcp --dport 443 -j REDIRECT --to-ports 31282
-A PREROUTING -p tcp -m tcp --dport 5601 -j REDIRECT --to-ports 31281

```
## 三、HTTP PROXY实现原理
OPENVPN拨号成功后，用户通过Navicat工具配置DB终端IP，数据包通过本机路由规则把内网172.16.0.0/16转发到VPN服务器，VPN服务器再通过iptables把请求重定向到代理服务器31281端口，然后在代理服务器进行授权、日志收集和拦截等判断处理。
>知识库：主要获取用户七层HTTP应用头请求HOST地址进行PROXY_PASS 实现。
## 四、代理服务器关键实现代码
4.1、加载鉴权规则
```
    #nginx-lua-waf配置
    lua_package_path "/opt/application/openresty/nginx/conf/nginx-lua-waf/?.lua;;";
    lua_shared_dict limit 200m;
    #开启lua代码缓存功能
    lua_code_cache on; 
    lua_regex_cache_max_entries 4096;
    init_by_lua_file   /opt/application/openresty/nginx/conf/nginx-lua-waf/init.lua;
    #access_by_lua_file /opt/application/openresty/nginx/conf/nginx-lua-waf/access.lua;
```
4.2、建立代理连接，将客户端请求proxy_pass转发到目的host（七层主机头）
```
    server {
	listen       31281 reuseport;
	server_name  _;
	resolver     183.60.83.19 183.60.82.98;

	# forward proxy for CONNECT requests
	proxy_connect;
	proxy_connect_allow            443 563;
	proxy_connect_connect_timeout  60s;
	proxy_connect_data_timeout     60s;
        proxy_connect_send_timeout     60s;
	client_max_body_size 	       512m;
        client_body_buffer_size        500k;
	add_header Mdd-Waf $server_addr;

	# Example: reverse proxy for non-CONNECT requests
	location / {
    		access_by_lua_file /opt/application/openresty/nginx/conf/nginx-lua-waf/access.lua;

		proxy_pass http://$http_host; #用户访问的HOST
                proxy_redirect off;
                #proxy_pass http://$host$request_uri;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection $connection_upgrade;
		proxy_set_header Host $http_host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_max_temp_file_size 0;
		proxy_buffers 512 4k;

		access_log /opt/application/openresty/nginx/logs/access.log  json_combined;
	}
    }


```
## 五、代理服务器日志记录
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
