---
title: Data-Agent Docker 环境快速指南
date: 2026-04-24
abstract: Data-Agent Docker 环境快速指南以及踩坑（基于 ES 8.19 + ARM64）
tags:
- Docker
- Ai实战项目
---

# Data-Agent Docker 环境快速指南

> 基于 macOS Apple Silicon (M2/M3) 搭建完整 AI 开发环境的一键命令清单

---

## ⚡ 快速命令速查（收藏这 12 条就够了）

### 🔥 最常用命令（日常开发 90% 场景）

```bash
# 暂停所有服务（下班/关电脑/临时停用）
docker compose stop

# 恢复所有服务（第二天上班）
docker compose start

# 查看服务状态
docker compose ps

# 查看所有服务日志（实时）
docker compose logs -f
```

### 📦 其他常用命令

```bash
# 首次启动或重建后启动（后台运行）
docker compose up -d

# 彻底停止并删除容器（保留数据）
docker compose down

# 彻底停止并删除容器 + 数据卷（⚠️ 数据会丢）
docker compose down -v

# 重启单个服务
docker compose restart 服务名

# 查看单个服务日志
docker compose logs 服务名 -f

# 进入容器内部调试
docker exec -it 容器名 bash

# 检查 YAML 配置是否正确
docker compose config
```

### 💡 使用频率说明

| 频率 | 命令 | 使用场景 |
|------|------|----------|
| ⭐⭐⭐⭐⭐ | `stop` / `start` | 日常开发，每天都要用 |
| ⭐⭐⭐⭐ | `ps` / `logs -f` | 查看状态和排查问题 |
| ⭐⭐⭐ | `up -d` | 首次启动或重建后 |
| ⭐⭐ | `down` | 修改配置文件后 |
| ⭐ | `down -v` | 极少使用，数据会丢 |

### ✅ 日常开发工作流

```bash
# 早上上班
docker compose start

# 查看状态确认都起来了
docker compose ps

# 有问题时查看日志
docker compose logs -f

# 晚上下班
docker compose stop
```

---

## 🎯 本项目的服务端口一览

| 服务 | 端口 | 访问地址 |
|------|------|----------|
| MySQL | 3306 | `localhost:3306` |
| Elasticsearch | 9200 | `http://localhost:9200` |
| Kibana | 5601 | `http://localhost:5601` |
| Qdrant | 6333 | `http://localhost:6333` |
| Embedding API | 8082 | `http://localhost:8082` |

**默认账号密码**：
- MySQL: 用户名 `atguigu` / 密码 `Atguigu.123`
- Elasticsearch/Kibana: 无密码（本地开发）

---

## 🧪 测试各服务是否正常

```bash
# 1. 测试 MySQL
docker exec mysql mysql -uroot -pAtguigu.123 -e "SELECT 1"

# 2. 测试 Elasticsearch
curl http://localhost:9200

# 3. 测试 Qdrant
curl http://localhost:6333

# 4. 测试 Embedding（注意：/health 返回空是正常的）
curl -X POST http://localhost:8082/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "测试文本"}'
```

> ⚠️ **特别注意**：Embedding 服务的 `/health` 端点返回空响应（HTTP 200 but body empty）是**正常行为**，请使用 `/embed` 端点测试服务是否正常。

---

## 📊 查看服务启动进度

```bash
# 查看 Embedding 模型下载进度（最慢，需要 5-10 分钟）
docker compose logs embedding -f

# 查看 Elasticsearch 启动日志
docker compose logs elasticsearch --tail=50
```

---

## 📁 完整的 docker-compose.yml（复制即用）

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: mysql
    restart: unless-stopped
    platform: linux/arm64
    environment:
      MYSQL_ROOT_PASSWORD: Atguigu.123
      MYSQL_USER: atguigu
      MYSQL_PASSWORD: Atguigu.123
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./mysql:/docker-entrypoint-initdb.d
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_general_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 10s
      retries: 5

  elasticsearch:
    image: elasticsearch:8.19.3
    container_name: elasticsearch
    restart: unless-stopped
    platform: linux/arm64
    privileged: true
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      xpack.security.enrollment.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
      - "9300:9300"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200"]
      timeout: 10s
      retries: 5

  kibana:
    image: kibana:8.19.3
    container_name: kibana
    restart: unless-stopped
    platform: linux/arm64
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy

  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    restart: unless-stopped
    platform: linux/arm64
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  embedding:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-arm64-latest
    container_name: embedding
    restart: unless-stopped
    platform: linux/arm64
    ports:
      - "8082:80"
    environment:
      MODEL_ID: BAAI/bge-large-zh-v1.5
      REVISION: main
      MAX_CONCURRENT_REQUESTS: "16"
      MAX_BATCH_TOKENS: "16384"
      HUGGINGFACE_HUB_CACHE: /data
    volumes:
      - embedding_cache:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/embed", "-X", "POST", "-H", "Content-Type: application/json", "-d", "{\"inputs\":\"health\"}"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s

volumes:
  mysql_data:
  es_data:
  qdrant_data:
  embedding_cache:
```

---

## 🔧 首次使用前的配置（一次性设置）

### 1. 安装 Docker Desktop
- **macOS 12.x 用户**：下载 4.32.0 版本
  - Apple Silicon (M2): [点击下载](https://desktop.docker.com/mac/main/arm64/161314/Docker.dmg)
- **macOS 14+ 用户**：官网下载最新版

### 2. 配置 Docker 代理（国内用户必备）

打开 Docker Desktop → Settings → Resources → Proxies：
- HTTP: `http://127.0.0.1:7897`（替换成你的代理端口）
- HTTPS: `http://127.0.0.1:7897`

### 3. 配置镜像加速器

点击 Settings → Docker Engine，粘贴以下配置：
```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "dns": ["8.8.8.8", "114.114.114.114"]
}
```
点击 Apply & Restart。

---

## 🎯 快速启动流程

```bash
# 1. 进入项目目录
cd /path/to/data-agent/docker

# 2. 启动所有服务
docker compose up -d

# 3. 查看状态（等待所有服务变为 healthy）
docker compose ps

# 4. 查看 embedding 下载进度（需要 5-10 分钟）
docker compose logs embedding -f
```

**预期输出**：所有服务状态显示 `Up` 或 `healthy`

---

## 🐛 常见问题速查表

| 问题 | 快速解决 |
|------|----------|
| 镜像拉取超时 | 检查代理配置是否正确 |
| Elasticsearch 启动失败 | 确认是否添加了 `privileged: true` |
| Kibana 打不开 | 确认 Kibana 版本与 ES 一致（都是 8.19.3） |
| Embedding 一直重启 | 确认用了 `cpu-arm64-latest` 标签 |
| Embedding `/health` 无响应 | **正常现象**，用 `/embed` 测试 |
| Embedding 健康检查失败 | 已修复，使用正确的 JSON 格式 |
| MySQL 密码错误 | 执行 `docker compose down -v` 重置 |
| 端口被占用 | `lsof -i :端口号` 查看并关闭占用进程 |

---

## 📞 获取帮助

```bash
# 查看具体错误日志
docker compose logs 问题服务名 --tail=50

# 检查 YAML 配置是否正确
docker compose config
```

---

# 📖 附录：踩坑完整记录

> 以下是搭建过程中遇到的所有问题及解决方案，供后续参考

---

## 坑 1：Docker 安装失败 - 版本不兼容

**错误**：`应用程序"Docker"的这个版本不能与此版本的macOS配合使用`

**原因**：macOS 12.4 太老，新版 Docker 需要 macOS 14+

**解决**：下载 Docker Desktop 4.32.0 版本（支持 macOS 12 的最后一个版本）

---

## 坑 2：镜像拉取超时 / EOF

**错误**：
```
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection
```

**原因**：国内访问 Docker Hub 不稳定

**解决**：
1. 配置代理（Docker Desktop → Settings → Resources → Proxies）
2. 配置镜像加速器（daemon.json 添加 registry-mirrors）

---

## 坑 3：Elasticsearch 8.x seccomp 问题

**错误**：
```
java.lang.UnsupportedOperationException: seccomp unavailable: CONFIG_SECCOMP not compiled into kernel
```

**原因**：ES 8.x 需要 seccomp 安全沙箱，但 Docker Desktop on Mac 的 Linux 虚拟机内核不支持

**解决方案**：在 docker-compose.yml 中添加 `privileged: true`，一行即可解决

**完整配置示例**：
```yaml
elasticsearch:
  image: elasticsearch:8.19.3
  privileged: true  # 关键配置，一行即可
  # 不需要 security_opt、ES_JAVA_OPTS_EXTRA 等其他配置
  # ... 其他配置
```

---

## 坑 4：Kibana 版本不匹配

**错误**：
```
This version of Kibana (v8.19.10) is incompatible with Elasticsearch nodes: v7.17.23
```

**原因**：Kibana 和 ES 主版本号不一致

**解决**：确保 Kibana 和 Elasticsearch 使用相同的主版本号（如都是 8.19.3）

---

## 坑 5：ARM64 架构镜像问题

**现象**：在 M2/M3 Mac 上运行 x86 镜像时性能差或启动慢

**解决**：使用 `linux/arm64` 平台的专用镜像

| 服务 | 原镜像 | ARM64 镜像 |
|------|--------|------------|
| MySQL | `mysql:8.0` | `linux/arm64` 自动适配 |
| Elasticsearch | `elasticsearch:8.19.3` | `linux/arm64` 自动适配 |
| Embedding | `cpu-latest` | `cpu-arm64-latest` |

---

## 坑 6：Embedding 服务健康检查失败

**现象**：
```bash
docker compose ps
# 显示 embedding (health: starting) 一直不变
```

**查看详情**：
```bash
docker inspect embedding --format='{{json .State.Health}}' | jq
# 显示 ExitCode: 22, Output: "curl: (22) The requested URL returned error: 400"
```

**原因**：健康检查命令中的 JSON 格式不正确，引号嵌套导致服务端返回 400 错误

**错误配置示例**：
```yaml
# 错误：外层单引号 + 转义双引号导致 JSON 解析失败
test: ["CMD", "curl", "-f", "http://localhost:80/embed", "-d", "'{\"inputs\": \"test\"}'"]
```

**正确配置**：
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/embed", "-X", "POST", "-H", "Content-Type: application/json", "-d", "{\"inputs\":\"health\"}"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 120s
```

**验证命令**：
```bash
# 手动测试健康检查命令是否正常
docker exec embedding curl -f -X POST http://localhost:80/embed -H "Content-Type: application/json" -d "{\"inputs\":\"health\"}"
```

---

## 坑 7：Embedding 模型下载失败

**错误**：
```
Error: Could not download model artifacts. relative URL without a base
```

**原因**：某些版本存在下载 bug 或网络问题

**解决**：
1. 使用 `cpu-arm64-latest` 标签
2. 检查代理配置
3. 耐心等待（模型约 1.3GB，首次下载需要 5-10 分钟）

---

## 坑 8：端口冲突

**现象**：服务启动失败，日志显示 `address already in use`

**原因**：端口被其他应用占用（如 Chrome 占用 8081 端口）

**解决**：
```bash
# 查看端口占用
lsof -i :端口号

# 方案一：关闭占用进程
kill -9 PID

# 方案二：修改 docker-compose.yml 中的端口映射
# 例如将 "8081:80" 改为 "8082:80"
```

---

## 坑 9：YAML 格式错误

**错误**：
```
services.platform must be a mapping
additional properties 'embedding' not allowed
```

**原因**：缩进不正确

**解决**：确保 `elasticsearch`、`kibana`、`embedding` 等服务与 `mysql` 左对齐（没有多余缩进）

---

## ✅ 最终稳定版本组合（ARM64 Mac 专用）

| 服务 | 版本 | 平台 | 端口 | 说明 |
|------|------|------|------|------|
| Docker Desktop | 4.32.0+ | ARM64 | - | macOS 12+ 兼容 |
| MySQL | 8.0 | linux/arm64 | 3306 | 自动适配 |
| Elasticsearch | 8.19.3 | linux/arm64 | 9200 | 需 `privileged: true` |
| Kibana | 8.19.3 | linux/arm64 | 5601 | 与 ES 版本匹配 |
| Qdrant | latest | linux/arm64 | 6333 | 自动适配 |
| Embedding | cpu-arm64-latest | linux/arm64 | 8082 | ARM64 专用 CPU 版本 |

---

## 💡 命令对照表（Docker Desktop 界面 vs 命令行）

| 界面操作 | 命令行 | 说明 |
|----------|--------|------|
| 点击暂停按钮（■） | `docker compose stop` | 暂停容器 |
| 点击启动按钮（▶） | `docker compose start` | 启动已暂停的容器 |
| 删除容器 | `docker compose down` | 删除容器（保留数据） |
| 重新创建并启动 | `docker compose up -d` | 首次启动或重建后 |

---

## 🔗 相关资源

- [Elasticsearch 8.x Java Client 文档](https://www.elastic.co/guide/en/elasticsearch/client/java-api-client/8.19/index.html)
- [Text Embeddings Inference 文档](https://huggingface.co/docs/text-embeddings-inference/index)
- [BAAI/bge-large-zh-v1.5 模型](https://huggingface.co/BAAI/bge-large-zh-v1.5)
```

## ✅ 本次更新内容

| 更新项 | 旧内容 | 新内容 |
|--------|--------|--------|
| Embedding healthcheck | 引号嵌套错误的版本 | 修复后的正确 JSON 格式 |
| 坑6 标题 | "健康检查失败" | "Embedding 服务健康检查失败" |
| 坑6 内容 | 只有现象 | 增加错误码、错误配置示例、正确配置示例、验证命令 |
| 常见问题表 | 无此项 | 增加 "Embedding 健康检查失败" 条目 |

