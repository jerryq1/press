---
title: Data-Agent Docker 环境快速指南
date: 2026-04-24
abstract: Data-Agent Docker 环境快速指南以及踩坑
tags:
- Docker
- Ai实战项目
---


#  Data-Agent Docker 环境快速指南

> 基于 macOS Apple Silicon (M2) 搭建完整 AI 开发环境的一键命令清单

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
docker compose up -d 服务名

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
| Embedding API | 8081 | `http://localhost:8081` |

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

# 4. 测试 Embedding（模型加载需要几分钟）
curl http://localhost:8081/health
```

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
    platform: linux/amd64
    environment:
      MYSQL_ROOT_PASSWORD: Atguigu.123
      MYSQL_USER: atguigu
      MYSQL_PASSWORD: Atguigu.123
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 10s
      retries: 5

  elasticsearch:
    image: elasticsearch:7.17.23
    container_name: elasticsearch
    restart: unless-stopped
    platform: linux/amd64
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200"]
      timeout: 10s
      retries: 5

  kibana:
    image: kibana:7.17.23
    container_name: kibana
    restart: unless-stopped
    platform: linux/amd64
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
    platform: linux/amd64
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  embedding:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-latest
    container_name: embedding
    restart: unless-stopped
    platform: linux/amd64
    ports:
      - "8081:80"
    environment:
      MODEL_ID: BAAI/bge-large-zh-v1.5
    volumes:
      - embedding_cache:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/health"]
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
| Elasticsearch 启动失败 | 确认用的是 `7.17.23` 版本 |
| Kibana 打不开 | 确认 Kibana 版本与 ES 一致（都是 7.17.23） |
| Embedding 一直重启 | 确认用的是 `cpu-latest` 标签 |
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

## 坑 3：Elasticsearch 启动失败 - seccomp

**错误**：
```
java.lang.UnsupportedOperationException: seccomp unavailable
```

**原因**：ES 8.x 需要 seccomp，但 Docker Desktop on Mac 不支持

**解决**：降级到 Elasticsearch 7.17.23

---

## 坑 4：Kibana 无法连接 - 版本不兼容

**错误**：
```
This version of Kibana (v8.19.10) is incompatible with Elasticsearch nodes: v7.17.23
```

**原因**：Kibana 和 ES 主版本号不一致

**解决**：Kibana 也降到 7.17.23

---

## 坑 5：Embedding 启动失败 - 找不到 nvidia-smi

**错误**：
```
Error: 'nvidia-smi' command not found
```

**原因**：`latest` 镜像默认需要 NVIDIA GPU

**解决**：使用 `cpu-latest` 标签

---

## 坑 6：Embedding 模型下载失败

**错误**：
```
Error: Could not download model artifacts. relative URL without a base
```

**原因**：`cpu-1.5` 版本存在下载 bug

**解决**：升级到 `cpu-latest` 标签

---

## 坑 7：MySQL 启动失败 - 未指定密码

**错误**：
```
Database is uninitialized and password option is not specified
```

**原因**：环境变量未正确传递或容器缓存问题

**解决**：`docker compose down -v` 后重新启动

---

## 坑 8：YAML 格式错误

**错误**：
```
services.platform must be a mapping
additional properties 'embedding' not allowed
```

**原因**：缩进不正确

**解决**：确保 `embedding` 与其他服务平级（没有多余缩进）

---

## 坑 9：Docker Desktop 安装后卡在 drag and drop

**现象**：下载的 .dmg 打开后只有一个 Docker 图标和 Applications 文件夹

**解决**：把 Docker 图标拖到 Applications 文件夹里才算安装完成

---

## 坑 10：端口冲突

**现象**：服务启动失败，日志显示 `address already in use`

**解决**：
```bash
# 查看端口占用
lsof -i :端口号
# 杀死占用进程或修改 docker-compose.yml 中的端口映射
```

---

## ✅ 最终稳定版本组合

| 服务 | 版本 | 说明 |
|------|------|------|
| Docker Desktop | 4.32.0 | macOS 12 兼容版 |
| MySQL | 8.0 | 稳定版 |
| Elasticsearch | 7.17.23 | 避开 seccomp 问题 |
| Kibana | 7.17.23 | 与 ES 版本匹配 |
| Qdrant | latest | 正常使用 |
| Embedding | cpu-latest | CPU 版本，避开 GPU 依赖 |

---

## 💡 命令对照表（Docker Desktop 界面 vs 命令行）

| 界面操作 | 命令行 | 说明 |
|----------|--------|------|
| 点击暂停按钮（■） | `docker compose stop` | 暂停容器 |
| 点击启动按钮（▶） | `docker compose start` | 启动已暂停的容器 |
| 删除容器 | `docker compose down` | 删除容器（保留数据） |
| 重新创建并启动 | `docker compose up -d` | 首次启动或重建后 |

