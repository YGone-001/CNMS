# 系统架构

xCloud-CNMS 系统架构设计文档。

---

## 📋 目录

- [整体架构](#整体架构)
- [后端架构](#后端架构)
- [前端架构](#前端架构)
- [数据模型](#数据模型)
- [通信协议](#通信协议)
- [部署架构](#部署架构)

---

## 整体架构

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
│                    React SPA (前端)                          │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    xCloud-CNMS 后端                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Router   │ │ Handler  │ │ Monitor  │ │  AIOps   │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │            │            │            │              │
│       └────────────┼────────────┼────────────┘              │
│                    │            │                           │
│                    ▼            ▼                           │
│              ┌─────────────────────┐                       │
│              │      MongoDB        │                       │
│              └─────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    5G 核心网 NF 进程                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ AMF  │ │ SMF  │ │ UPF  │ │ NRF  │ │ ...  │             │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘             │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 说明 |
|------|------|
| **前端 (React)** | 用户界面，负责展示和交互 |
| **后端 (Go)** | 业务逻辑，API 服务 |
| **MongoDB** | 数据存储，持久化 |
| **WebSocket** | 实时通信，监控数据推送 |
| **Agent** | 分布式采集节点（可选） |

---

## 后端架构

### 目录结构

```
backend/
├── main.go                     # 入口文件
├── config/
│   └── config.json             # 配置文件
└── internal/
    ├── auth/
    │   ├── jwt.go              # JWT 认证
    │   └── jwt_test.go         # 测试
    ├── config/
    │   ├── config.go           # 配置加载
    │   ├── config_test.go      # 测试
    │   └── watcher.go          # 配置热重载
    ├── handler/
    │   ├── handler.go          # 处理器基础
    │   ├── health.go           # 健康检查
    │   ├── auth.go             # 认证处理
    │   ├── alarms.go           # 告警处理
    │   ├── metrics.go          # 指标处理
    │   ├── subscribers.go      # 订户处理
    │   ├── sites.go            # 站点处理
    │   ├── tasks.go            # 任务处理
    │   ├── users.go            # 用户处理
    │   ├── logs.go             # 日志处理
    │   ├── backups.go          # 备份处理
    │   ├── reports.go          # 报表处理
    │   ├── solutions.go        # 解决方案处理
    │   ├── notifications.go    # 通知处理
    │   ├── discovery.go        # 发现处理
    │   ├── aiops.go            # AIOps 处理
    │   └── swagger.go          # API 文档
    ├── middleware/
    │   └── ratelimit.go        # 限流中间件
    ├── mml/
    │   ├── parser.go           # MML 解析器
    │   └── parser_test.go      # 测试
    ├── model/
    │   ├── alarm.go            # 告警模型
    │   ├── metrics.go          # 指标模型
    │   ├── subscriber.go       # 订户模型
    │   ├── site.go             # 站点模型
    │   ├── notification.go     # 通知模型
    │   ├── solution.go         # 解决方案模型
    │   ├── config_backup.go    # 配置备份模型
    │   ├── telecom_kpi.go      # 电信 KPI 模型
    │   └── aiops.go            # AIOps 模型
    ├── mongo/
    │   └── client.go           # MongoDB 客户端
    ├── monitor/
    │   ├── probe.go            # 进程探测
    │   ├── health.go           # 健康检查
    │   └── discovery.go        # NF 发现
    ├── notify/
    │   └── service.go          # 通知服务
    ├── router/
    │   └── router.go           # 路由注册
    ├── scheduler/
    │   └── scheduler.go        # 任务调度器
    ├── aiops/
    │   ├── aggregator.go       # 数据聚合
    │   ├── detector.go         # 异常检测
    │   ├── predictor.go        # 预测分析
    │   ├── rca.go              # 根因分析
    │   └── trend.go            # 趋势分析
    └── ws/
        ├── handler.go          # WebSocket 处理器
        └── logstream.go        # 日志流
```

### 核心模块

#### 1. 认证模块 (auth)

- JWT Token 生成和验证
- 用户认证和授权
- 角色权限控制

#### 2. 配置模块 (config)

- 配置文件加载
- 配置热重载（文件监听）
- 默认值处理

#### 3. 处理器模块 (handler)

- HTTP 请求处理
- 业务逻辑实现
- 响应格式化

#### 4. 监控模块 (monitor)

- 进程状态探测
- 资源使用率采集
- NF 服务发现

#### 5. AIOps 模块

- 数据聚合 (aggregator)
- 异常检测 (detector)
- 预测分析 (predictor)
- 根因分析 (rca)
- 趋势分析 (trend)

#### 6. WebSocket 模块

- 实时数据推送
- 告警实时通知
- 连接管理

---

## 前端架构

### 目录结构

```
frontend/
├── index.html                  # 入口 HTML
├── package.json                # 依赖配置
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 配置
├── tailwind.config.ts          # Tailwind CSS 配置
└── src/
    ├── main.tsx                # 入口文件
    ├── App.tsx                 # 根组件
    ├── index.css               # 全局样式
    ├── components/             # 共享组件
    │   ├── StatusBar.tsx       # 状态栏
    │   ├── ProcessTable.tsx    # 进程表格
    │   ├── ResourceChart.tsx   # 资源图表
    │   ├── SummaryCard.tsx     # 汇总卡片
    │   └── MarkdownViewer.tsx  # Markdown 查看器
    ├── context/                # React Context
    │   ├── MonitorContext.tsx  # 监控上下文
    │   └── ThemeContext.tsx    # 主题上下文
    ├── hooks/                  # 自定义 Hooks
    │   └── useMonitorSocket.ts # WebSocket Hook
    ├── i18nContext.tsx         # 国际化
    ├── locales/                # 语言文件
    │   ├── en.ts               # 英文
    │   └── zh.ts               # 中文
    ├── pages/                  # 页面组件
    │   ├── Overview.tsx        # 运维总览
    │   ├── Topology.tsx        # 网络拓扑
    │   ├── NetworkElements.tsx # 网元管理
    │   ├── AgentManagement.tsx # Agent 管理
    │   ├── MetricsHistory.tsx  # 实时指标
    │   ├── Alarms.tsx          # 告警中心
    │   ├── FaultDiagnosis.tsx  # 故障诊断
    │   ├── FaultResolution.tsx # 故障处置
    │   ├── LogCenter.tsx       # 日志中心
    │   ├── ConfigBackups.tsx   # 配置备份
    │   ├── ScheduledTasks.tsx  # 自动化任务
    │   ├── KnowledgeBase.tsx   # 知识库
    │   ├── Reports.tsx         # 报表中心
    │   ├── Sites.tsx           # 系统管理
    │   ├── ApiDocs.tsx         # API 文档
    │   └── Login.tsx           # 登录页面
    ├── types/                  # TypeScript 类型
    │   └── monitor.ts          # 监控类型定义
    └── utils/                  # 工具函数
        └── format.ts           # 格式化工具
```

### 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.3 | 类型系统 |
| Vite | 4.5 | 构建工具 |
| Tailwind CSS | 3.4 | 样式框架 |
| Lucide React | 0.344 | 图标库 |
| React Router | 6.22 | 路由管理 |
| ECharts | 5.5 | 图表库 |

### 组件设计原则

1. **单一职责**: 每个组件只负责一个功能
2. **可复用性**: 共享组件提取到 components 目录
3. **类型安全**: 使用 TypeScript 严格类型检查
4. **响应式设计**: 适配不同屏幕尺寸
5. **主题支持**: 支持深色/浅色主题切换

---

## 数据模型

### 核心集合

#### 1. users (用户)

```json
{
  "_id": ObjectId,
  "username": String,
  "password": String,  // bcrypt 加密
  "role": String,      // admin | operator | viewer
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 2. alarms (告警)

```json
{
  "_id": ObjectId,
  "source": String,      // 来源 NF
  "severity": String,    // critical | major | minor | warning
  "message": String,
  "status": String,      // active | acked | cleared
  "root_cause_id": ObjectId,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 3. metrics (指标)

```json
{
  "_id": ObjectId,
  "source": String,
  "name": String,        // cpu | memory | disk
  "value": Number,
  "timestamp": DateTime
}
```

#### 4. subscribers (订户)

```json
{
  "_id": ObjectId,
  "imsi": String,
  "msisdn": String,
  "apn": String,
  "qos": Number,
  "status": String,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 5. sites (站点)

```json
{
  "_id": ObjectId,
  "name": String,
  "type": String,        // region | dc | node
  "parent_id": ObjectId,
  "nrf_url": String,
  "nf_ids": [String],
  "enabled": Boolean,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 6. tasks (任务)

```json
{
  "_id": ObjectId,
  "name": String,
  "cron": String,
  "command": String,
  "enabled": Boolean,
  "last_run": DateTime,
  "next_run": DateTime,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 7. config_backups (配置备份)

```json
{
  "_id": ObjectId,
  "name": String,
  "content": String,
  "version": Number,
  "created_at": DateTime
}
```

#### 8. knowledge_base (知识库)

```json
{
  "_id": ObjectId,
  "title": String,
  "content": String,
  "category": String,
  "tags": [String],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 9. root_cause_analysis (根因分析)

```json
{
  "_id": ObjectId,
  "alarm_id": ObjectId,
  "candidates": [
    {
      "description": String,
      "confidence": Number,
      "evidence": [String]
    }
  ],
  "recommendations": [String],
  "created_at": DateTime
}
```

---

## 通信协议

### HTTP API

- **协议**: HTTP/1.1, HTTP/2
- **格式**: JSON
- **认证**: JWT Bearer Token
- **端口**: 8080 (默认)

### WebSocket

- **协议**: WebSocket
- **路径**: `/api/v1/monitor/ws`
- **用途**: 实时监控数据推送
- **心跳**: 30 秒

### 数据格式

#### 请求格式

```json
{
  "method": "POST",
  "path": "/api/v1/alarms",
  "headers": {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
  },
  "body": {
    "source": "amfd",
    "severity": "major",
    "message": "CPU usage high"
  }
}
```

#### 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "60d5ecf5...",
    "source": "amfd",
    "severity": "major",
    "message": "CPU usage high",
    "status": "active",
    "created_at": "2026-06-24T10:30:00Z"
  }
}
```

#### WebSocket 消息格式

```json
{
  "type": "metrics",
  "data": {
    "source": "amfd",
    "cpu": 45.2,
    "memory": 62.8,
    "disk": 38.5
  },
  "timestamp": "2026-06-24T10:30:00Z"
}
```

---

## 部署架构

### 单机部署

```
┌─────────────────────────────────────┐
│           单机部署                    │
│  ┌─────────────────────────────┐   │
│  │      xCloud-CNMS            │   │
│  │  (Go + React + MongoDB)     │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │      5G Core NFs            │   │
│  │  (AMF, SMF, UPF, ...)       │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 分布式部署

```
┌─────────────────────────────────────────────────────────────┐
│                      主控节点                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              xCloud-CNMS 主服务                      │   │
│  │  (API Server + Frontend + MongoDB)                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Agent 节点 1 │   │   Agent 节点 2 │   │   Agent 节点 3 │
│  (上海数据中心) │   │  (北京数据中心) │   │  (广州数据中心) │
│  ┌─────────┐  │   │  ┌─────────┐  │   │  ┌─────────┐  │
│  │ NF 进程  │  │   │  │ NF 进程  │  │   │  │ NF 进程  │  │
│  └─────────┘  │   │  └─────────┘  │   │  └─────────┘  │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Docker 部署

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: xcloud-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  xcloud-cnms:
    build: .
    container_name: xcloud-cnms
    ports:
      - "8080:8080"
    volumes:
      - ./config.json:/app/config/config.json
      - /var/log/xCloud:/var/log/xCloud
    depends_on:
      - mongodb

volumes:
  mongo_data:
```

---

## 扩展性设计

### 水平扩展

- **后端**: 无状态设计，支持多实例部署
- **数据库**: MongoDB 副本集/分片集群
- **前端**: 静态资源 CDN 加速

### 垂直扩展

- **CPU**: 根据并发量调整
- **内存**: 根据数据量调整
- **存储**: 根据日志和指标数据量调整

### 插件机制（规划中）

- 自定义监控插件
- 自定义告警规则
- 自定义报表模板

---

## 安全设计

### 认证授权

- JWT Token 认证
- 角色权限控制 (RBAC)
- 密码加密存储 (bcrypt)

### 数据安全

- HTTPS 传输加密
- 敏感数据加密存储
- 日志脱敏处理

### 访问控制

- IP 白名单（可选）
- 请求限流
- CORS 配置

---

## 监控指标

### 系统指标

| 指标 | 说明 | 阈值 |
|------|------|------|
| CPU 使用率 | 进程 CPU 占用 | > 80% 告警 |
| 内存使用率 | 进程内存占用 | > 80% 告警 |
| 磁盘使用率 | 磁盘空间占用 | > 90% 告警 |
| 进程状态 | 进程运行状态 | 停止告警 |

### 业务指标

| 指标 | 说明 |
|------|------|
| 告警数量 | 活跃告警数 |
| 响应时间 | API 响应时间 |
| 并发连接数 | WebSocket 连接数 |
| 数据库连接数 | MongoDB 连接池 |

---

## 性能优化

### 后端优化

- 连接池复用
- 异步处理
- 缓存策略
- 索引优化

### 前端优化

- 代码分割
- 懒加载
- 图片压缩
- CDN 加速

### 数据库优化

- 索引设计
- 查询优化
- 数据归档
- 分片策略
