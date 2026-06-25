# 部署指南

xCloud-CNMS 部署和配置指南。

---

## 📋 目录

- [环境要求](#环境要求)
- [快速部署](#快速部署)
- [Docker 部署](#docker-部署)
- [手动部署](#手动部署)
- [配置说明](#配置说明)
- [生产环境部署](#生产环境部署)
- [常见问题](#常见问题)

---

## 环境要求

### 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|----------|----------|
| **操作系统** | Ubuntu 20.04 / CentOS 7 | Ubuntu 24.04 |
| **CPU** | 2 核 | 4 核 |
| **内存** | 4 GB | 8 GB |
| **磁盘** | 20 GB | 50 GB |
| **网络** | 100 Mbps | 1 Gbps |

### 软件依赖

| 软件 | 版本 | 说明 |
|------|------|------|
| **Go** | 1.24+ | 后端编译 |
| **Node.js** | 18+ | 前端编译 |
| **MongoDB** | 7.0+ | 数据存储 |
| **Git** | 2.30+ | 代码管理 |
| **Docker** | 24.0+ | 容器部署（可选） |
| **Docker Compose** | 2.20+ | 容器编排（可选） |

### 端口要求

| 端口 | 协议 | 说明 |
|------|------|------|
| 8080 | HTTP | Web UI 和 API |
| 27017 | TCP | MongoDB |
| 8088 | HTTP | Agent 上报（可选） |

---

## 快速部署

### 一键部署脚本

```bash
# 克隆代码
git clone https://github.com/YGone-001/CNMS.git
cd CNMS

# 执行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 手动快速部署

```bash
# 1. 安装依赖
sudo apt update
sudo apt install -y golang nodejs npm mongodb

# 2. 构建项目
./build.sh

# 3. 启动服务
cd backend && ./xcloud-cnms -config config/config.json
```

---

## Docker 部署

### 使用 Docker Compose（推荐）

#### 1. 准备配置文件

```bash
# 创建配置目录
mkdir -p config

# 复制配置文件
cp config.json config/config.json

# 修改配置（可选）
vi config/config.json
```

#### 2. 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f xcloud-cnms
```

#### 3. 访问服务

```
http://localhost:8080
```

#### 4. 停止服务

```bash
docker-compose down
```

### Docker Compose 配置

```yaml
version: '3.8'

services:
  # MongoDB 数据库
  mongodb:
    image: mongo:7
    container_name: xcloud-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: xCloud
    networks:
      - xcloud-net
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  # xCloud-CNMS 应用
  xcloud-cnms:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: xcloud-cnms
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./config/config.json:/app/config/config.json:ro
      - /var/log/xCloud:/var/log/xCloud:ro
    environment:
      - TZ=Asia/Shanghai
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - xcloud-net

networks:
  xcloud-net:
    driver: bridge

volumes:
  mongo_data:
```

### Dockerfile

```dockerfile
# 阶段 1: 构建前端
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# 阶段 2: 构建后端
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
COPY --from=frontend-builder /app/frontend/dist ./public/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o xcloud-cnms .

# 阶段 3: 运行
FROM alpine:3.18
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=backend-builder /app/backend/xcloud-cnms .
COPY --from=backend-builder /app/backend/public ./public
COPY config.json ./config/config.json
EXPOSE 8080
CMD ["./xcloud-cnms", "-config", "config/config.json"]
```

---

## 手动部署

### 1. 安装依赖

#### Ubuntu/Debian

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Go
wget https://go.dev/dl/go1.24.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.4.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### CentOS/RHEL

```bash
# 安装 Go
wget https://go.dev/dl/go1.24.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.4.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# 安装 Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 安装 MongoDB
sudo vi /etc/yum.repos.d/mongodb-org-7.0.repo
```

添加以下内容：

```ini
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
```

```bash
sudo yum install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 2. 克隆代码

```bash
git clone https://github.com/YGone-001/CNMS.git
cd CNMS
```

### 3. 构建项目

```bash
# 一键构建
./build.sh

# 或手动构建
# 构建前端
cd frontend
npm ci
npm run build
cd ..

# 构建后端
cd backend
go mod download
go build -o xcloud-cnms .
cd ..
```

### 4. 配置服务

```bash
# 复制配置文件
cp config.json backend/config/config.json

# 修改配置
vi backend/config/config.json
```

### 5. 启动服务

```bash
# 前台运行
cd backend && ./xcloud-cnms -config config/config.json

# 后台运行
nohup ./backend/xcloud-cnms -config backend/config/config.json > /var/log/xcloud-cnms.log 2>&1 &

# 使用 systemd
sudo vi /etc/systemd/system/xcloud-cnms.service
```

### 6. systemd 服务配置

```ini
[Unit]
Description=xCloud-CNMS Service
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/CNMS/backend
ExecStart=/opt/CNMS/backend/xcloud-cnms -config config/config.json
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=xcloud-cnms

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable xcloud-cnms
sudo systemctl start xcloud-cnms
sudo systemctl status xcloud-cnms
```

---

## 配说明

### 配置文件结构

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080
  },
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "xCloud"
  },
  "log_dir": "/var/log/xCloud",
  "notify": {
    "webhook_url": "",
    "min_level": "major"
  },
  "auth": {
    "enabled": false,
    "username": "admin",
    "password": "admin123",
    "jwt_key": "xcloud-cnms-secret-key-change-me"
  }
}
```

### 配置项说明

#### 服务器配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `server.host` | string | `0.0.0.0` | 监听地址 |
| `server.port` | int | `8080` | 监听端口 |

#### MongoDB 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `mongodb.uri` | string | `mongodb://localhost:27017` | 连接 URI |
| `mongodb.database` | string | `xCloud` | 数据库名称 |

#### 日志配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `log_dir` | string | `/var/log/xCloud` | NF 日志目录 |

#### 通知配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `notify.webhook_url` | string | `""` | Webhook URL（空则禁用） |
| `notify.min_level` | string | `major` | 最低通知级别 |

#### 认证配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `auth.enabled` | bool | `false` | 启用认证 |
| `auth.username` | string | `admin` | 管理员用户名 |
| `auth.password` | string | `admin123` | 管理员密码 |
| `auth.jwt_key` | string | - | JWT 签名密钥 |

### 环境变量

支持通过环境变量覆盖配置：

```bash
export XCloud_MONGODB_URI="mongodb://localhost:27017"
export XCloud_AUTH_ENABLED="true"
export XCloud_AUTH_JWT_KEY="your-secret-key"
```

---

## 生产环境部署

### 安全加固

#### 1. 修改默认密码

```json
{
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "StrongPassword123!@#",
    "jwt_key": "your-very-long-random-secret-key-here"
  }
}
```

#### 2. 启用 HTTPS

使用 Nginx 反向代理：

```nginx
server {
    listen 443 ssl;
    server_name cnms.example.com;

    ssl_certificate /etc/ssl/certs/cnms.crt;
    ssl_certificate_key /etc/ssl/private/cnms.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/monitor/ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 3. 防火墙配置

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 数据备份

#### MongoDB 备份

```bash
# 创建备份目录
mkdir -p /backup/mongodb

# 备份数据库
mongodump --db xCloud --out /backup/mongodb/$(date +%Y%m%d)

# 恢复数据库
mongorestore --db xCloud /backup/mongodb/20260624/xCloud
```

#### 自动备份脚本

```bash
#!/bin/bash
# /opt/scripts/backup_mongodb.sh

BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d)
RETENTION_DAYS=30

# 创建备份
mongodump --db xCloud --out $BACKUP_DIR/$DATE

# 压缩备份
tar -czf $BACKUP_DIR/xcloud_$DATE.tar.gz -C $BACKUP_DIR $DATE
rm -rf $BACKUP_DIR/$DATE

# 删除旧备份
find $BACKUP_DIR -name "xcloud_*.tar.gz" -mtime +$RETENTION_DAYS -delete
```

```bash
# 添加定时任务
crontab -e
0 2 * * * /opt/scripts/backup_mongodb.sh
```

### 监控告警

#### 系统监控

```bash
# 安装监控工具
sudo apt install -y prometheus node-exporter

# 配置 Prometheus
vi /etc/prometheus/prometheus.yml
```

#### 应用监控

访问 `/api/health` 检查应用状态：

```bash
curl http://localhost:8080/api/health
```

### 性能优化

#### 1. MongoDB 优化

```javascript
// 创建索引
db.alarms.createIndex({ "created_at": -1 })
db.alarms.createIndex({ "status": 1, "severity": 1 })
db.metrics.createIndex({ "source": 1, "timestamp": -1 })
db.audit_logs.createIndex({ "created_at": -1 })
```

#### 2. 系统优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# 优化内核参数
echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
sysctl -p
```

---

## 常见问题

### 1. MongoDB 连接失败

**问题**: `Failed to connect to MongoDB`

**解决**:

```bash
# 检查 MongoDB 状态
sudo systemctl status mongod

# 启动 MongoDB
sudo systemctl start mongod

# 检查端口
netstat -tlnp | grep 27017
```

### 2. 端口被占用

**问题**: `Port 8080 already in use`

**解决**:

```bash
# 查找占用端口的进程
lsof -i :8080

# 杀死进程
kill -9 <PID>

# 或修改配置使用其他端口
vi config.json
```

### 3. 前端构建失败

**问题**: `npm run build failed`

**解决**:

```bash
# 清除缓存
rm -rf node_modules package-lock.json
npm cache clean --force

# 重新安装依赖
npm install

# 重新构建
npm run build
```

### 4. Go 编译失败

**问题**: `go build failed`

**解决**:

```bash
# 设置 Go 代理
export GOPROXY=https://goproxy.cn,direct

# 清除模块缓存
go clean -modcache

# 重新下载依赖
go mod download

# 重新编译
go build -o xcloud-cnms .
```

### 5. WebSocket 连接失败

**问题**: WebSocket 连接被拒绝

**解决**:

```bash
# 检查 Nginx 配置
# 确保包含 WebSocket 升级配置
location /api/v1/monitor/ws {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 6. 权限问题

**问题**: `Permission denied`

**解决**:

```bash
# 修改文件权限
chmod +x build.sh
chmod +x backend/xcloud-cnms

# 修改目录权限
chmod -R 755 /var/log/xCloud
```

---

## 升级指南

### 1. 备份数据

```bash
# 备份 MongoDB
mongodump --db xCloud --out /backup/$(date +%Y%m%d)

# 备份配置文件
cp config.json config.json.bak
```

### 2. 拉取新代码

```bash
git pull origin main
```

### 3. 重新构建

```bash
./build.sh
```

### 4. 重启服务

```bash
# systemd
sudo systemctl restart xcloud-cnms

# Docker
docker-compose down
docker-compose up -d
```

### 5. 验证升级

```bash
# 检查版本
curl http://localhost:8080/api/health

# 检查日志
tail -f /var/log/xcloud-cnms.log
```

---

## 回滚指南

### 1. 停止服务

```bash
sudo systemctl stop xcloud-cnms
```

### 2. 恢复代码

```bash
git checkout v1.4.1
```

### 3. 恢复配置

```bash
cp config.json.bak config.json
```

### 4. 重新构建

```bash
./build.sh
```

### 5. 恢复数据（如需要）

```bash
mongorestore --db xCloud /backup/20260624/xCloud
```

### 6. 启动服务

```bash
sudo systemctl start xcloud-cnms
```

---

## 技术支持

- 问题反馈: [GitHub Issues](https://github.com/YGone-001/CNMS/issues)
- 邮箱: 947067341@qq.com
- 文档: [docs/](docs/)
