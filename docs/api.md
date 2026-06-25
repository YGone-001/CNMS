# API 文档

xCloud-CNMS RESTful API 接口文档。

---

## 📋 目录

- [概述](#概述)
- [认证](#认证)
- [错误处理](#错误处理)
- [API 端点](#api-端点)
  - [系统](#系统)
  - [认证](#认证-1)
  - [监控](#监控)
  - [告警](#告警)
  - [订户](#订户)
  - [站点](#站点)
  - [任务](#任务)
  - [用户](#用户)
  - [日志](#日志)
  - [备份](#备份)
  - [知识库](#知识库)
  - [AIOps](#aiops)
  - [MML](#mml)

---

## 概述

### 基础信息

- **Base URL**: `http://localhost:8080/api`
- **协议**: HTTP/1.1, HTTP/2
- **格式**: JSON
- **字符集**: UTF-8

### 请求头

| 头字段 | 必需 | 说明 |
|--------|------|------|
| `Content-Type` | 是 | `application/json` |
| `Authorization` | 否 | `Bearer <token>` (认证接口除外) |

### 响应格式

#### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

#### 错误响应

```json
{
  "code": 400,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

### 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `page_size` | int | 20 | 每页数量 |

### 分页响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  }
}
```

---

## 认证

### JWT Token

大部分 API 需要 JWT Token 认证。通过登录接口获取 Token，然后在请求头中携带。

```
Authorization: Bearer <token>
```

### Token 过期

- **默认过期时间**: 24 小时
- **刷新机制**: 重新登录获取新 Token

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| 10001 | 参数验证失败 |
| 10002 | 认证失败 |
| 10003 | 权限不足 |
| 10004 | 资源不存在 |
| 10005 | 资源已存在 |
| 20001 | 数据库错误 |
| 20002 | 外部服务错误 |
| 30001 | MML 命令执行失败 |

---

## API 端点

### 系统

#### 健康检查

```http
GET /api/health
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "ok",
    "version": "1.4.1",
    "uptime": "24h30m"
  }
}
```

#### API 规范

```http
GET /api/docs
```

返回 OpenAPI 3.0 规范 JSON。

---

### 认证

#### 用户登录

```http
POST /api/v1/auth/login
```

**请求体:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400,
    "user": {
      "id": "60d5ecf5...",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

---

### 监控

#### WebSocket 连接

```http
GET /api/v1/monitor/ws
Upgrade: websocket
```

**消息类型:**

| 类型 | 说明 |
|------|------|
| `metrics` | 实时指标数据 |
| `alarm` | 告警通知 |
| `process` | 进程状态变更 |

**指标消息示例:**

```json
{
  "type": "metrics",
  "data": {
    "source": "amfd",
    "cpu": 45.2,
    "memory": 62.8,
    "disk": 38.5,
    "status": "running",
    "uptime": "24h30m"
  },
  "timestamp": "2026-06-24T10:30:00Z"
}
```

#### 获取进程列表

```http
GET /api/v1/monitor/processes
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "name": "amfd",
      "pid": 12345,
      "status": "running",
      "cpu": 45.2,
      "memory": 62.8,
      "disk": 38.5,
      "uptime": "24h30m",
      "start_time": "2026-06-23T10:00:00Z"
    }
  ]
}
```

---

### 告警

#### 获取告警列表

```http
GET /api/v1/alarms?page=1&page_size=20&status=active&severity=major
```

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 告警状态: `active`, `acked`, `cleared` |
| `severity` | string | 告警级别: `critical`, `major`, `minor`, `warning` |
| `source` | string | 告警来源 |
| `start_time` | string | 开始时间 |
| `end_time` | string | 结束时间 |

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "60d5ecf5...",
        "source": "amfd",
        "severity": "major",
        "message": "CPU usage high",
        "status": "active",
        "root_cause_id": null,
        "created_at": "2026-06-24T10:30:00Z",
        "updated_at": "2026-06-24T10:30:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20
  }
}
```

#### 确认告警

```http
POST /api/v1/alarms/:id/acknowledge
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "60d5ecf5...",
    "status": "acked",
    "acked_by": "admin",
    "acked_at": "2026-06-24T10:35:00Z"
  }
}
```

#### 清除告警

```http
POST /api/v1/alarms/:id/clear
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "60d5ecf5...",
    "status": "cleared",
    "cleared_by": "admin",
    "cleared_at": "2026-06-24T10:40:00Z"
  }
}
```

---

### 订户

#### 获取订户列表

```http
GET /api/v1/subscribers?page=1&page_size=20&imsi=460110000000001
```

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `imsi` | string | IMSI 号码 |
| `msisdn` | string | MSISDN 号码 |
| `apn` | string | APN 名称 |

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "60d5ecf5...",
        "imsi": "460110000000001",
        "msisdn": "13800138000",
        "apn": "internet",
        "qos": 5,
        "status": "active",
        "created_at": "2026-06-24T10:30:00Z"
      }
    ],
    "total": 1000,
    "page": 1,
    "page_size": 20
  }
}
```

#### 创建订户

```http
POST /api/v1/subscribers
```

**请求体:**

```json
{
  "imsi": "460110000000001",
  "msisdn": "13800138000",
  "apn": "internet",
  "qos": 5
}
```

#### 更新订户

```http
PUT /api/v1/subscribers/:id
```

**请求体:**

```json
{
  "apn": "5gnet",
  "qos": 9
}
```

#### 删除订户

```http
DELETE /api/v1/subscribers/:id
```

---

### 站点

#### 获取站点列表

```http
GET /api/v1/sites
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "60d5ecf5...",
      "name": "上海数据中心",
      "type": "dc",
      "parent_id": null,
      "nrf_url": "http://nrf.5gc.mnc011.mcc460.3gppnetwork.org:8080",
      "nf_ids": ["amfd", "smfd", "upfd"],
      "enabled": true,
      "created_at": "2026-06-24T10:30:00Z"
    }
  ]
}
```

#### 创建站点

```http
POST /api/v1/sites
```

**请求体:**

```json
{
  "name": "上海数据中心",
  "type": "dc",
  "parent_id": "60d5ecf5...",
  "nrf_url": "http://nrf.5gc.mnc011.mcc460.3gppnetwork.org:8080",
  "nf_ids": ["amfd", "smfd", "upfd"],
  "enabled": true
}
```

---

### 任务

#### 获取任务列表

```http
GET /api/v1/tasks
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "60d5ecf5...",
      "name": "数据清理任务",
      "cron": "0 2 * * *",
      "command": "clean_old_data",
      "enabled": true,
      "last_run": "2026-06-24T02:00:00Z",
      "next_run": "2026-06-25T02:00:00Z",
      "created_at": "2026-06-24T10:30:00Z"
    }
  ]
}
```

#### 创建任务

```http
POST /api/v1/tasks
```

**请求体:**

```json
{
  "name": "数据清理任务",
  "cron": "0 2 * * *",
  "command": "clean_old_data",
  "enabled": true
}
```

---

### 用户

#### 获取用户列表

```http
GET /api/v1/users
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "60d5ecf5...",
      "username": "admin",
      "role": "admin",
      "created_at": "2026-06-24T10:30:00Z"
    }
  ]
}
```

#### 创建用户

```http
POST /api/v1/users
```

**请求体:**

```json
{
  "username": "operator1",
  "password": "password123",
  "role": "operator"
}
```

---

### 日志

#### 获取审计日志

```http
GET /api/v1/audit/logs?page=1&page_size=20&user=admin&action=login
```

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `user` | string | 操作用户 |
| `action` | string | 操作类型 |
| `start_time` | string | 开始时间 |
| `end_time` | string | 结束时间 |

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "60d5ecf5...",
        "user": "admin",
        "action": "login",
        "detail": "用户登录成功",
        "ip": "192.168.1.100",
        "created_at": "2026-06-24T10:30:00Z"
      }
    ],
    "total": 500,
    "page": 1,
    "page_size": 20
  }
}
```

#### 获取 NF 日志

```http
GET /api/v1/nf/logs?source=amfd&level=error&limit=100
```

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `source` | string | NF 名称 |
| `level` | string | 日志级别: `info`, `warn`, `error`, `debug` |
| `limit` | int | 返回数量 |

---

### 备份

#### 获取备份列表

```http
GET /api/v1/backups
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "60d5ecf5...",
      "name": "config_backup_20260624",
      "version": 1,
      "created_at": "2026-06-24T10:30:00Z"
    }
  ]
}
```

#### 创建备份

```http
POST /api/v1/backups
```

**请求体:**

```json
{
  "name": "config_backup_20260624",
  "content": "{ ... }"
}
```

#### 恢复备份

```http
POST /api/v1/backups/:id/restore
```

---

### 知识库

#### 获取知识库文章列表

```http
GET /api/v1/kb?page=1&page_size=20&category=故障处理&tag=AMF
```

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `category` | string | 文章分类 |
| `tag` | string | 标签 |
| `keyword` | string | 关键词 |

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "60d5ecf5...",
        "title": "AMF 进程故障排查指南",
        "category": "故障处理",
        "tags": ["AMF", "进程", "重启"],
        "views": 156,
        "created_at": "2026-06-24T10:30:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20
  }
}
```

#### 获取知识库文章详情

```http
GET /api/v1/kb/:id
```

---

### AIOps

#### 获取根因分析结果

```http
GET /api/v1/aiops/rca/:alarm_id
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "60d5ecf5...",
    "alarm_id": "60d5ecf5...",
    "candidates": [
      {
        "description": "RTPENGINE offer/answer 参数异常",
        "confidence": 0.86,
        "evidence": [
          "RTPENGINE 日志显示 offer 处理时 SDP c= 行 IP 地址错误",
          "抓包显示 RTP 包发送到 10.0.0.1 而非实际 UE IP"
        ]
      }
    ],
    "recommendations": [
      "检查 rtpengine_sock 配置",
      "检查 route[NATMANAGE] 路由逻辑"
    ],
    "created_at": "2026-06-24T10:30:00Z"
  }
}
```

#### 获取趋势分析

```http
GET /api/v1/aiops/trends?source=amfd&metric=cpu&period=24h
```

#### 获取异常检测结果

```http
GET /api/v1/aiops/anomalies?source=amfd&start_time=2026-06-24T00:00:00Z&end_time=2026-06-24T23:59:59Z
```

---

### MML

#### 执行 MML 命令

```http
POST /api/v1/mml/execute
```

**请求体:**

```json
{
  "command": "LST-SUB: IMSI=460110000000001;"
}
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "result": "OK",
    "output": "IMSI: 460110000000001\nMSISDN: 13800138000\nAPN: internet\nQOS: 5\nSTATUS: active"
  }
}
```

---

## WebSocket API

### 连接

```javascript
const ws = new WebSocket('ws://localhost:8080/api/v1/monitor/ws');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

### 消息类型

#### 指标数据

```json
{
  "type": "metrics",
  "data": {
    "source": "amfd",
    "cpu": 45.2,
    "memory": 62.8,
    "disk": 38.5,
    "status": "running",
    "uptime": "24h30m"
  },
  "timestamp": "2026-06-24T10:30:00Z"
}
```

#### 告警通知

```json
{
  "type": "alarm",
  "data": {
    "id": "60d5ecf5...",
    "source": "amfd",
    "severity": "major",
    "message": "CPU usage high",
    "status": "active"
  },
  "timestamp": "2026-06-24T10:30:00Z"
}
```

#### 进程状态变更

```json
{
  "type": "process",
  "data": {
    "name": "amfd",
    "status": "stopped",
    "pid": null
  },
  "timestamp": "2026-06-24T10:30:00Z"
}
```

---

## SDK 示例

### JavaScript

```javascript
// 登录
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { data: { token } } = await response.json();

// 获取告警列表
const alarms = await fetch('/api/v1/alarms', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: { items } } = await alarms.json();
```

### Python

```python
import requests

# 登录
response = requests.post('http://localhost:8080/api/v1/auth/login', json={
    'username': 'admin',
    'password': 'admin123'
})
token = response.json()['data']['token']

# 获取告警列表
headers = {'Authorization': f'Bearer {token}'}
alarms = requests.get('http://localhost:8080/api/v1/alarms', headers=headers)
print(alarms.json()['data']['items'])
```

### cURL

```bash
# 登录
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

# 获取告警列表
curl -s http://localhost:8080/api/v1/alarms \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items'
```

---

## 更新历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.4.1 | 2026-06-01 | 初始版本 |
