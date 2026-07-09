# API 文档

xCloud-CNMS RESTful API 接口文档（v1.5.0）。

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
  - [告警规则](#告警规则)
  - [通知](#通知)
  - [订户](#订户)
  - [站点](#站点)
  - [任务](#任务)
  - [用户](#用户)
  - [日志](#日志)
  - [指标](#指标)
  - [备份](#备份)
  - [知识库](#知识库)
  - [AIOps](#aiops)
  - [报表](#报表)
  - [部署](#部署)
  - [NF 发现](#nf-发现)
  - [MML](#mml)
  - [抓包](#抓包)
  - [信令追踪](#信令追踪)
- [WebSocket API](#websocket-api)
- [RBAC 权限](#rbac-权限)

---

## 概述

### 基础信息

- **Base URL**: `http://localhost:8080/api`
- **协议**: HTTP/1.1, HTTP/2
- **格式**: JSON
- **字符集**: UTF-8
- **限流**: 20 req/s, burst 40

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

WebSocket 认证支持两种方式：
- Query param: `?token=<token>`
- Header: `Authorization: Bearer <token>`

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
GET /healthz
```

轻量级健康检查，无依赖。

```http
GET /readyz
```

就绪检查，验证 MongoDB 连接。

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
| `metrics` | 实时指标数据（2s 间隔） |
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
  "timestamp": "2026-07-01T10:30:00Z"
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
        "count": 3,
        "root_cause_id": null,
        "created_at": "2026-07-01T10:30:00Z",
        "updated_at": "2026-07-01T10:30:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20
  }
}
```

> **去重机制**: 同 source + severity 的未关闭告警不会新建，而是递增 `count` 字段。

---

### 告警规则

#### 获取告警规则列表

```http
GET /api/v1/alarm-rules
```

#### 创建告警规则

```http
POST /api/v1/alarm-rules
```

**请求体:**

```json
{
  "name": "CPU 高阈值",
  "metric": "cpu",
  "threshold": 80,
  "severity": "major",
  "enabled": true
}
```

#### 更新告警规则

```http
PUT /api/v1/alarm-rules
```

#### 删除告警规则

```http
DELETE /api/v1/alarm-rules
```

---

### 通知

#### 获取通知渠道列表

```http
GET /api/v1/notifications/channels
```

#### 创建通知渠道

```http
POST /api/v1/notifications/channels
```

**请求体:**

```json
{
  "name": "运维 Webhook",
  "type": "webhook",
  "config": {
    "url": "https://hooks.example.com/notify",
    "method": "POST"
  },
  "enabled": true
}
```

#### 更新通知渠道

```http
PUT /api/v1/notifications/channels
```

#### 删除通知渠道

```http
DELETE /api/v1/notifications/channels
```

#### 获取告警升级规则

```http
GET /api/v1/notifications/escalation
```

#### 创建告警升级规则

```http
POST /api/v1/notifications/escalation
```

#### 删除告警升级规则

```http
DELETE /api/v1/notifications/escalation
```

#### 获取通知日志

```http
GET /api/v1/notifications/logs
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
        "created_at": "2026-07-01T10:30:00Z"
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
      "created_at": "2026-07-01T10:30:00Z"
    }
  ]
}
```

#### 创建站点

```http
POST /api/v1/sites
```

#### 更新站点

```http
PUT /api/v1/sites
```

#### 删除站点

```http
DELETE /api/v1/sites
```

---

### 任务

#### 获取任务列表

```http
GET /api/v1/tasks
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

#### 更新任务

```http
PUT /api/v1/tasks
```

#### 删除任务

```http
DELETE /api/v1/tasks
```

---

### 用户

#### 获取用户列表

```http
GET /api/v1/users
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

#### 更新用户

```http
PUT /api/v1/users
```

#### 删除用户

```http
DELETE /api/v1/users
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

#### 获取日志文件列表

```http
GET /api/v1/nf/logs/files
```

返回可用的日志文件列表。

#### 日志流 WebSocket

```http
GET /api/v1/nf/logs/ws
Upgrade: websocket
```

实时日志流，支持运行时动态过滤（客户端发送 JSON）：

```json
{
  "level": "ERROR",
  "keyword": "timeout"
}
```

---

### 指标

#### 获取指标历史

```http
GET /api/v1/metrics/history?source=amfd&name=cpu&start_time=2026-07-01T00:00:00Z
```

#### 获取接口健康状态

```http
GET /api/v1/interface-health
```

返回各 NF 接口探测结果（30s 周期探测）。

#### 获取电信 KPI

```http
GET /api/v1/telecom-kpi
```

返回电信域 KPI 指标（60s 周期采集）。

#### 获取业务指标

```http
GET /api/v1/business-metrics
```

返回业务指标数据，集成来源：
- MySQL `hss_db`: IMS 订户数
- MySQL `scscf`: S-CSCF 注册数
- open5gs SMF Prometheus: 5G 会话数

#### 获取 UE 信息

```http
GET /api/v1/ue-info
```

返回当前在线 UE 信息，集成来源：
- open5gs MME (127.0.0.2:9090): EPC UE
- open5gs AMF (127.0.0.5:9090): 5G UE
- open5gs SMF (127.0.0.4:9090): 5G 会话

---

### 备份

#### 获取备份列表

```http
GET /api/v1/backups
```

#### 创建备份

```http
POST /api/v1/backups
```

**请求体:**

```json
{
  "name": "config_backup_20260701",
  "content": "{ ... }"
}
```

> **去重机制**: 使用 SHA-256 校验和，相同内容的备份会被跳过。

#### 删除备份

```http
DELETE /api/v1/backups
```

#### 获取备份 diff

```http
GET /api/v1/backups/diff
```

比较两个版本之间的差异。

#### 获取备份版本历史

```http
GET /api/v1/backups/versions
```

---

### 知识库

#### 获取知识库文章列表

```http
GET /api/v1/solutions?page=1&page_size=20&category=故障处理&tag=AMF
```

#### 搜索知识库

```http
GET /api/v1/solutions/search?keyword=AMF+进程
```

全文搜索知识库内容。

#### 获取知识库统计

```http
GET /api/v1/solutions/stats
```

返回文章数量、分类分布、热门标签等统计。

#### 获取知识库文章详情

```http
GET /api/v1/solutions/:id
```

#### 创建知识库文章

```http
POST /api/v1/solutions
```

#### 更新知识库文章

```http
PUT /api/v1/solutions
```

#### 删除知识库文章

```http
DELETE /api/v1/solutions
```

#### 上传文件

```http
POST /api/v1/solutions/upload
Content-Type: multipart/form-data
```

#### 下载文件

```http
GET /api/v1/solutions/files/:name
```

---

### AIOps

#### 获取异常检测结果

```http
GET /api/v1/aiops/anomalies?source=amfd&start_time=2026-07-01T00:00:00Z&end_time=2026-07-01T23:59:59Z
```

#### 获取根因分析结果

```http
GET /api/v1/aiops/root-causes
```

**响应:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "60d5ecf5...",
      "alarm_id": "60d5ecf5...",
      "candidates": [
        {
          "description": "RTPENGINE offer/answer 参数异常",
          "confidence": 0.86,
          "evidence": [
            "RTPENGINE 日志显示 offer 处理时 SDP c= 行 IP 地址错误"
          ]
        }
      ],
      "recommendations": ["检查 rtpengine_sock 配置"],
      "created_at": "2026-07-01T10:30:00Z"
    }
  ]
}
```

> **自动触发**: RCA 在新告警插入时自动执行，无需手动请求。

#### 获取容量预测

```http
GET /api/v1/aiops/predictions
```

#### 获取趋势分析

```http
GET /api/v1/aiops/trends?source=amfd&metric=cpu&period=24h
```

#### 获取 AIOps 汇总

```http
GET /api/v1/aiops/summary
```

返回 AIOps 整体摘要（异常数、趋势、预测概览）。

---

### 报表

#### 导出指标 CSV

```http
GET /api/v1/reports/metrics/csv?source=amfd&start_time=2026-07-01T00:00:00Z
```

#### 导出告警 CSV

```http
GET /api/v1/reports/alarms/csv?severity=major&start_time=2026-07-01T00:00:00Z
```

#### 获取报表汇总

```http
GET /api/v1/reports/summary
```

---

### 部署

#### 获取部署模板列表

```http
GET /api/v1/deployment/templates
```

#### 设置部署模板

```http
POST /api/v1/deployment/template
```

#### 获取部署状态

```http
GET /api/v1/deployment/status
```

#### 获取组件状态

```http
GET /api/v1/deployment/component
```

#### 部署状态 WebSocket

```http
GET /api/v1/deployment/ws
Upgrade: websocket
```

推送部署状态（5s 间隔）和 EPC/IMS 业务指标（10s 间隔）。

---

### NF 发现

#### 触发 NF 发现

```http
GET /api/v1/nf/discovery
```

手动触发 NF 自动发现（NRF 查询）。

#### 获取已发现 NF

```http
GET /api/v1/nf/discovered
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

**支持的 MML 命令:**

| 命令 | 说明 | 权限 |
|------|------|------|
| `ADD-SUB` | 添加订户 | operator+ |
| `DEL-SUB` | 删除订户 | operator+ |
| `LST-SUB` | 查询订户 | any |
| `MOD-SUB` | 修改订户 | operator+ |
| `CTRL-NF` | NF 服务控制 | operator+ |
| `ACK-ALARM` | 确认告警 | operator+ |
| `CLR-ALARM` | 清除告警 | operator+ |
| `ADD-SUB-BATCH` | 批量添加订户 | operator+ |
| `EXP-SUB` | 导出订户 | any |
| `IMP-SUB` | 导入订户 | operator+ |

---

### 抓包

#### 开始抓包

```http
POST /api/v1/capture/start
```

**请求体:**

```json
{
  "name": "VoLTE 注册抓包",
  "interface": "eth0",
  "filter": "sip",
  "protocol": "volte_full",
  "max_duration": 300,
  "max_size": 100
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 会话名称 |
| `interface` | string | 是 | 抓包网卡（如 eth0、lo、any） |
| `filter` | string | 否 | BPF 过滤表达式，支持安全校验 |
| `protocol` | string | 否 | 协议预设 ID（如 volte_full、sip） |
| `max_duration` | int | 否 | 最大抓包时长（秒），默认 300，上限 3600 |
| `max_size` | int | 否 | 最大文件大小（MB），默认 100，上限 1024 |

**响应:**

```json
{
  "status": "success",
  "message": "capture started",
  "session_id": "688d92c6...",
  "file_path": "/tmp/captures/cap_20260702_180500.pcap"
}
```

**安全约束:**
- BPF 注入防护：过滤表达式不允许 `;|&$\`` 等 shell 特殊字符
- 并发限制：最多同时 5 个抓包会话
- 权限：operator+ 角色

#### 停止抓包

```http
POST /api/v1/capture/stop
```

**请求体:**

```json
{
  "session_id": "688d92c6..."
}
```

**响应:**

```json
{
  "status": "success",
  "message": "capture stopped",
  "session_id": "688d92c6...",
  "file_path": "/tmp/captures/cap_20260702_180500.pcap"
}
```

#### 获取抓包会话列表

```http
GET /api/v1/capture/sessions
```

**响应:**

```json
{
  "status": "success",
  "sessions": [
    {
      "id": "688d92c6...",
      "name": "VoLTE 注册抓包",
      "status": "completed",
      "interface": "eth0",
      "filter": "sip",
      "protocol": "volte_full",
      "file_path": "/tmp/captures/cap_20260702_180500.pcap",
      "file_size": 5242880,
      "packet_count": 12345,
      "started_by": "admin",
      "started_at": "2026-07-02T18:05:00+08:00",
      "stopped_at": "2026-07-02T18:10:00+08:00"
    }
  ]
}
```

#### 下载 PCAP 文件

```http
GET /api/v1/capture/download?id=<session_id>
```

返回 `application/octet-stream` 格式的 PCAP 文件。

#### 删除抓包会话

```http
DELETE /api/v1/capture/sessions?id=<session_id>
```

同时删除会话记录和 PCAP 文件。权限：operator+

#### 获取协议预设

```http
GET /api/v1/capture/presets
```

**响应:**

```json
{
  "status": "success",
  "presets": [
    {
      "id": "volte_full",
      "name": "VoLTE 完整流程",
      "description": "SIP + RTP + Diameter + GTP 完整 VoLTE 流程",
      "filter": "portrange 5060-5080 or portrange 10000-20000 or port 3868 or port 2123 or port 2152"
    },
    {
      "id": "sip",
      "name": "SIP 信令",
      "description": "SIP 注册/呼叫/消息信令",
      "filter": "portrange 5060-5080"
    }
  ]
}
```

共 12 种预设：`volte_full`、`sip`、`diameter`、`gtp`、`s1ap_ngap`、`rtp_media`、`dns`、`pfcp`、`gtpv2`、`ipsec_esp`、`icmp`、`all_telecom`。

**抓包进度 WebSocket:**

通过 `/api/v1/monitor/ws` 订阅 `capture_progress` 消息类型：

```json
{
  "type": "capture_progress",
  "data": {
    "session_id": "688d92c6...",
    "status": "running",
    "file_size": 5242880,
    "packet_count": 12345,
    "elapsed_seconds": 60,
    "progress": 20
  }
}
```

---

### 信令追踪

信令追踪模块提供跨协议信令关联分析能力。创建追踪后，后台异步从多个日志源采集数据，解析提取消息，通过 Union-Find 引擎关联（含 Identity Context Tree 跨层合并），最终生成梯形时序图和成功/失败摘要。

#### 数据来源（优先级）

| 优先级 | 来源 | 说明 | IMSI 提取方式 |
|--------|------|------|--------------|
| 1 | HEPListener | Kamailio siptrace 通过 HEPv3 推送到 :9060/udp（L1 ring + L2 MongoDB） | SIP URI 中的 IMSI（正则提取） |
| 2 | Homer API | 从 Homer 查询已存储的 SIP 消息 | SIP 消息中的 IMSI |
| 3 | TsharkQuery | 从 tshark 环形缓冲区 pcap 查询（复合 IMSI 过滤器） | `e212.imsi` + `diameter.User-Name` + `nas_5gs.mm.suci.msin` + SIP URI |

#### 创建追踪任务

```http
POST /api/v1/signaling/trace
```

**请求体:**

```json
{
  "query_type": "imsi",
  "query_value": "460001234567890",
  "scenario": "all",
  "time_range": {
    "start": "2026-07-01T00:00:00Z",
    "end": "2026-07-01T23:59:59Z"
  },
  "sources": ["logs", "pcap"]
}
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `query_type` | string | 是 | 查询类型：imsi/supi/msisdn/sip_uri/impu/impi/ip/teid/call_id/guti/fiveg_guti |
| `query_value` | string | 是 | 查询值 |
| `scenario` | string | 否 | 场景：5g_registration/4g_attach/ims_registration/volte_call/vonr_call/sms_sgs/sms_nas/sms_ims/all（默认 all） |
| `time_range` | object | 否 | 时间范围（默认最近 24 小时） |
| `sources` | array | 否 | 数据来源：logs/pcap（默认全部） |

**响应:**

```json
{
  "status": "ok",
  "message": "trace started",
  "data": { "trace_id": "a2238643-6cdd-425c-aa57-7619885cfd77" }
}
```

**说明:** 创建后立即返回 trace_id，后台异步执行解析/关联/存储。前端轮询查询状态。超时时间 5 分钟。

#### 查询追踪状态

```http
GET /api/v1/signaling/trace/{traceId}
```

**响应:**

```json
{
  "status": "ok",
  "data": {
    "trace_id": "a2238643...",
    "query_type": "imsi",
    "query_value": "460001234567890",
    "scenario": "all",
    "status": "completed",
    "message_count": 42,
    "entities": ["UE", "gNB", "AMF", "SMF", "UPF"],
    "time_range": { "start": "...", "end": "..." },
    "summary": {
      "reg_ok": true,
      "auth_ok": true,
      "session_ok": true,
      "ims_reg_ok": false,
      "call_ok": false,
      "sms_ok": false,
      "error_step": "",
      "error_detail": ""
    },
    "created_at": "...",
    "created_by": "admin"
  }
}
```

| 状态 | 说明 |
|------|------|
| `running` | 解析中，继续轮询 |
| `completed` | 完成，可加载消息 |
| `error` | 失败 |

**摘要字段说明:**

| 字段 | 说明 |
|------|------|
| `reg_ok` | 注册/附着是否成功（NAS Registration Accept / Attach Accept） |
| `auth_ok` | 鉴权是否成功（Authentication Response / Security Mode Complete） |
| `session_ok` | 会话建立是否成功（Create Session Response / PDU Session Accept） |
| `ims_reg_ok` | IMS 注册是否成功（SIP REGISTER → 200 OK） |
| `call_ok` | VoLTE 呼叫是否成功（SIP INVITE → 200 OK，无 CANCEL/4xx/5xx） |
| `sms_ok` | 短信是否成功（SIP MESSAGE → 200 OK） |
| `error_step` | 失败环节（reg_ok/auth_ok/session_ok/ims_reg_ok/call_ok/sms_ok 为 false 时填充） |
| `error_detail` | 失败详情 |

#### 查询关联消息

```http
GET /api/v1/signaling/trace/{traceId}/messages?protocol=SIP&page=1&page_size=50
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `protocol` | string | 按协议过滤：NAS/NGAP/S1AP/SIP/Diameter/GTPv2C/PFCP/RTP 等 |
| `entity` | string | 按网元过滤 |
| `page` | int | 页码（默认 1） |
| `page_size` | int | 每页条数（默认 50，上限 500） |

**响应:**

```json
{
  "status": "ok",
  "messages": [
    {
      "id": "...",
      "trace_id": "...",
      "timestamp": "2026-07-01T10:30:45.123Z",
      "protocol": "NAS",
      "interface": "N1",
      "direction": "request",
      "method": "Registration Request",
      "src_entity": "UE",
      "dst_entity": "AMF",
      "src_ip": "10.45.0.2",
      "dst_ip": "10.45.0.1",
      "identifiers": { "imsi": "460001234567890", "supi": "imsi-460001234567890" },
      "call_id": "",
      "session_id": "5",
      "data_source": "tshark",
      "cross_layer": false
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 50
}
```

#### 查询媒体质量

```http
GET /api/v1/signaling/trace/{traceId}/media?page=1&page_size=50
```

**响应:**

```json
{
  "status": "ok",
  "media": [
    {
      "trace_id": "...",
      "call_id": "abc123@host",
      "direction": "caller_to_callee",
      "codec": "AMR-WB",
      "src_ip": "10.45.0.2",
      "src_port": 4000,
      "dst_ip": "10.45.0.5",
      "dst_port": 4001,
      "ssrc": "0x12345678",
      "pkts_sent": 1500,
      "pkts_lost": 3,
      "loss_rate": 0.002,
      "jitter": 12.5,
      "mos": 4.2,
      "rtd": 45.0
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 50
}
```

#### 列出历史追踪

```http
GET /api/v1/signaling/traces?status=completed&page=1&page_size=20
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 按状态过滤：running/completed/error |
| `query_type` | string | 按查询类型过滤 |
| `page` | int | 页码 |
| `page_size` | int | 每页条数 |

#### 删除追踪

```http
DELETE /api/v1/signaling/trace/{traceId}
```

删除追踪记录及关联的所有消息和媒体质量数据。需要 operator+ 角色。

#### Homer 状态

```http
GET /api/v1/signaling/homer/status
```

**响应:**

```json
{
  "status": "ok",
  "enabled": true,
  "healthy": true,
  "version": "7.x",
  "api_url": "http://127.0.0.1:9080"
}
```

#### 信令追踪处理流程

```
用户输入 IMSI → POST /signaling/trace → 创建 trace (status=running)
    ↓ 异步 goroutine (5 分钟超时)
    ├─ [优先] HEPListener.QueryByIMSI() — 从 L1 ring + L2 MongoDB 查询 SIP 消息
    ├─ [辅助] h.Homer.Search() — 从 Homer API 查询（HEP 无数据时）
    └─ [兜底] TsharkQuery.Query() — 从环形缓冲区 pcap 查询（复合 IMSI 过滤器）
        ├─ editcap 时间裁剪 → mergecap 合并
        ├─ tshark -Y 复合显示过滤: e212.imsi || diameter.User-Name || nas_5gs.mm.suci.msin || frame contains
        └─ 无结果时回退 per-protocol 查询
    ↓ Union-Find 跨协议关联 (10 维标识 + 7 条规则)
    ↓ Identity Context Tree 跨层合并 (SIP ↔ NAS/S1AP via Call-ID → IMSI)
    ↓ 摘要生成 (6 项成功/失败判定)
    ↓ 批量写入 signaling_messages + 更新 trace (status=completed)
```

#### HEP 监听器状态

```http
GET /api/v1/signaling/hep/status
```

**响应:**

```json
{
  "status": "ok",
  "enabled": true,
  "running": true,
  "listen_addr": ":9060",
  "received": 3087,
  "parsed": 3087,
  "errors": 0,
  "buffer_count": 3087,
  "last_receive": "2026-07-08T16:03:35+08:00"
}
```

**字段说明:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | bool | HEP 监听器是否已配置 |
| `running` | bool | 是否正在运行 |
| `listen_addr` | string | UDP 监听地址 |
| `received` | int | 收到的 HEP 包总数 |
| `parsed` | int | 成功解析的 SIP 消息数 |
| `errors` | int | 解析错误数 |
| `buffer_count` | int | L1 环形缓冲区中当前消息数 |
| `last_receive` | string | 最后收到消息的时间 |

**两级缓存说明:**
- L1: 无锁环形缓冲区（50000 条，atomic 操作，零拷贝读取）
- L2: MongoDB overflow 集合 `hep_ring_overflow`（TTL 7 天，异步批量写入）
- 查询时自动合并 L1 + L2 数据，按 timestamp 去重

---

## WebSocket API

### 三个 WebSocket 端点

| 端点 | 用途 | 推送间隔 |
|------|------|----------|
| `/api/v1/monitor/ws` | NF 进程状态、告警生成、指标持久化、抓包进度 | 2s (状态), 30s (指标) |
| `/api/v1/nf/logs/ws` | 实时日志流（支持动态 level/keyword 过滤） | 500ms 轮询 |
| `/api/v1/deployment/ws` | 部署状态 + EPC/IMS 用户数 | 5s (部署), 10s (业务) |

### 连接示例

```javascript
// 监控 WebSocket
const monitorWs = new WebSocket('ws://localhost:8080/api/v1/monitor/ws?token=<jwt>');

monitorWs.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: "metrics" | "alarm" | "process"
};

// 日志流 WebSocket
const logWs = new WebSocket('ws://localhost:8080/api/v1/nf/logs/ws?token=<jwt>');

// 运行时动态修改过滤条件
logWs.send(JSON.stringify({ level: 'ERROR', keyword: 'timeout' }));

// 部署状态 WebSocket
const deployWs = new WebSocket('ws://localhost:8080/api/v1/deployment/ws?token=<jwt>');
```

### 消息格式

#### 监控指标

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
  "timestamp": "2026-07-01T10:30:00Z"
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
  "timestamp": "2026-07-01T10:30:00Z"
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
  "timestamp": "2026-07-01T10:30:00Z"
}
```

#### 抓包进度

```json
{
  "type": "capture_progress",
  "data": {
    "session_id": "688d92c6...",
    "status": "running",
    "file_size": 5242880,
    "packet_count": 12345,
    "elapsed_seconds": 60,
    "progress": 20
  },
  "timestamp": "2026-07-02T18:06:00+08:00"
}
```

---

## RBAC 权限

三种角色：`admin`、`operator`、`viewer`

| 角色 | 权限范围 |
|------|----------|
| **admin** | 全部权限，包括用户管理 |
| **operator** | MML 执行、订户管理、任务管理、通知配置、备份、站点、知识库 |
| **viewer** | 所有数据的只读访问 |

API 文档中各端点的 RBAC 标注：
- `any`: 所有角色可访问
- `operator+`: operator 和 admin 可访问
- `admin`: 仅 admin 可访问

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
| v1.5.0 | 2026-07-02 | 新增抓包 API（start/stop/sessions/download/delete/presets）、抓包进度 WebSocket |
| v1.4.1 | 2026-07-01 | 全面更新：补充告警规则、通知、指标、UE 信息、报表、部署、NF 发现等 API |
| v1.4.1 | 2026-06-01 | 初始版本 |
