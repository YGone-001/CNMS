# 系统架构

xCloud-CNMS 系统架构设计文档（v1.5.0）。

---

## 📋 目录

- [整体架构](#整体架构)
- [后端架构](#后端架构)
- [前端架构](#前端架构)
- [数据模型](#数据模型)
- [外部集成](#外部集成)
- [通信协议](#通信协议)
- [RBAC 权限模型](#rbac-权限模型)
- [部署架构](#部署架构)

---

## 整体架构

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
│                    React SPA (前端)                          │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP / WebSocket
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
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  4G/5G/IMS NF    │ │   open5gs    │ │   MySQL (IMS)    │
│  进程 (systemctl) │ │  HTTP API    │ │  hss_db / scscf  │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

### 核心组件

| 组件 | 说明 |
|------|------|
| **前端 (React)** | 用户界面，26 个页面组件，支持深色/浅色主题、i18n 国际化 |
| **后端 (Go)** | 业务逻辑，18 个 handler 模块，3 个 WebSocket 端点 |
| **MongoDB** | 数据存储，20+ 集合，持久化 |
| **WebSocket** | 实时通信，监控数据推送、日志流、部署状态 |
| **Monitor** | 进程探测、NF 接口健康检查、NF 自动发现 |
| **AIOps** | 异常检测、根因分析、趋势预测、容量规划 |
| **Scheduler** | Cron 定时任务调度（健康检查、备份、清理、AIOps） |

---

## 后端架构

### 目录结构

```
backend/
├── main.go                         # 入口文件，启动 HTTP 服务 + 后台任务
├── config/
│   └── config.json                 # 默认配置
└── internal/
    ├── auth/
    │   ├── jwt.go                  # JWT Token 生成/验证
    │   └── jwt_test.go
    ├── config/
    │   ├── config.go               # 配置加载
    │   ├── config_test.go
    │   └── watcher.go              # 配置热重载（fsnotify）
    ├── handler/
    │   ├── handler.go              # 处理器基础、CTRL-NF 执行
    │   ├── health.go               # 健康检查
    │   ├── auth.go                 # 登录认证
    │   ├── alarms.go               # 告警历史查询
    │   ├── alarm_rules.go          # 告警规则 CRUD
    │   ├── metrics.go              # 指标历史查询
    │   ├── subscribers.go          # 订户 CRUD
    │   ├── sites.go                # 站点管理
    │   ├── tasks.go                # 定时任务 CRUD
    │   ├── users.go                # 用户管理
    │   ├── logs.go                 # NF 日志查询
    │   ├── backups.go              # 配置备份 CRUD + diff
    │   ├── reports.go              # 报表导出 (CSV/Summary)
    │   ├── solutions.go            # 知识库 CRUD + 文件上传
    │   ├── notifications.go        # 通知渠道 + 升级规则 + 日志
    │   ├── discovery.go            # NF 发现
    │   ├── aiops.go                # AIOps 查询（异常/根因/预测/趋势）
    │   ├── ue_info.go              # UE 信息查询（open5gs MME/AMF/SMF）
    │   ├── business_metrics.go     # 业务指标（MySQL HSS/S-CSCF + SMF Prometheus）
    │   ├── interface_health.go     # NF 接口健康状态
    │   ├── deployment.go           # 部署模板管理
    │   ├── knowledge_base.go       # 知识库增强（统计/搜索/文件）
    │   ├── mml.go                  # MML 命令执行
    │   ├── capture.go              # 抓包会话管理（start/stop/sessions/download/delete/presets）
    │   ├── signaling.go            # 信令追踪 API（create/get/messages/media/list/delete/homer-status）
    │   └── swagger.go              # OpenAPI 3.0 规范
    ├── middleware/
    │   └── ratelimit.go            # 限流中间件（20 req/s, burst 40）
    ├── mml/
    │   ├── parser.go               # MML 命令解析器
    │   └── parser_test.go
    ├── model/
    │   ├── alarm.go                # 告警 + 告警规则模型
    │   ├── metrics.go              # 指标模型
    │   ├── subscriber.go           # 订户模型（EPC/5GC）
    │   ├── site.go                 # 站点模型（region/dc/node）
    │   ├── notification.go         # 通知渠道 + 升级规则 + 日志模型
    │   ├── solution.go             # 知识库模型
    │   ├── config_backup.go        # 配置备份模型
    │   ├── telecom_kpi.go          # 电信 KPI 模型
    │   ├── aiops.go                # AIOps 模型（异常/根因/预测/趋势）
    │   ├── discovery.go            # NF 发现模型
    │   ├── capture.go              # 抓包会话模型
    │   └── signaling.go            # 信令追踪模型（SignalingMessage/SignalingTrace/MediaQuality）
    ├── mongo/
    │   └── client.go               # MongoDB 客户端封装
    ├── monitor/
    │   ├── probe.go                # 进程状态探测
    │   ├── health.go               # NF 接口健康检查（30s/60s 周期）
    │   ├── discovery.go            # NF 自动发现（NRF 查询）
    │   └── types.go                # 监控类型定义
    ├── notify/
    │   └── service.go              # 多通道告警通知服务
    ├── router/
    │   └── router.go               # 路由注册（flat switch）、SPA 静态资源
    ├── scheduler/
    │   └── scheduler.go            # Cron 任务调度器
    ├── aiops/
    │   ├── aggregator.go           # 数据聚合（每小时）
    │   ├── detector.go             # 异常检测
    │   ├── predictor.go            # 容量预测
    │   ├── rca.go                  # 根因分析（告警触发）
    │   └── trend.go                # 趋势分析
    ├── signaling/
    │   ├── parser.go               # 信令工具函数（matchFilters/normalizeSIPURI）
    │   ├── correlator.go           # 跨协议关联引擎（Union-Find）
    │   ├── hep.go                  # Homer API 客户端
    │   ├── capture_daemon.go       # tshark 持续抓包守护进程（环形缓冲区）
    │   ├── tshark_query.go         # pcap 查询引擎（tshark 显示过滤 + 流式解析）
    │   └── hep_listener.go         # HEP 监听器（UDP 9060，HEPv3 解析，SIP 提取）
    └── ws/
        ├── handler.go              # 监控 WebSocket（进程状态 + 告警生成）
        ├── logstream.go            # 日志流 WebSocket（动态过滤）
        └── deployment.go           # 部署状态 WebSocket
```

### 核心模块

#### 1. 认证模块 (auth)

- JWT Token 生成和验证
- 支持 WebSocket 认证（query param `?token=` 或 `Authorization: Bearer` header）
- 三种角色：admin / operator / viewer

#### 2. 配置模块 (config)

- JSON 配置文件加载
- fsnotify 文件监听热重载
- 默认值处理

#### 3. 处理器模块 (handler)

- 19 个 handler 文件覆盖全部业务逻辑
- flat switch 路由注册（非第三方路由库）
- 前端 dist 通过 `//go:embed` 嵌入 Go 二进制

#### 4. 监控模块 (monitor)

- 进程状态探测（ps 命令）
- NF 接口健康检查（30s 接口探测、60s KPI 采集）
- NF 自动发现（NRF 查询，支持 Sites 动态 NRF URL）

#### 5. AIOps 模块

- **aggregator**: 每小时指标数据聚合
- **detector**: 基于统计的异常检测
- **predictor**: 容量趋势预测
- **rca**: 根因分析（告警插入时自动触发）
- **trend**: 趋势分析和早期预警

#### 6. 信令追踪模块 (signaling)

**数据源（三级优先）：**
- **hep_listener**: UDP 9060 监听 Kamailio siptrace HEPv3 数据（优先，性能最好）
- **hep**: Homer API 客户端，查询已存储的 SIP 消息（辅助）
- **tshark_query**: 从 tshark 环形缓冲区 pcap 按条件查询全协议（兜底）
- **capture_daemon**: tshark 持续抓包守护进程，环形缓冲区 20×100MB

**关联引擎：**
- **correlator**: Union-Find 跨协议关联引擎
  - 10 维标识关联（IMSI/SUPI/MSISDN/SIP URI/TEID/UE IP/Call-ID 等）
  - 网元排序（按 3GPP 架构顺序：UE→gNB→AMF→HSS→SGW→PGW→P-CSCF→S-CSCF）
  - 摘要生成（注册/鉴权/会话/IMS 注册/通话/短信各环节成功/失败判断）

**信令数据来源:**

| 优先级 | 来源 | 说明 | 协议覆盖 |
|--------|------|------|----------|
| 1 | HEPListener | Kamailio siptrace → :9060/udp → HEPv3 解析 | SIP |
| 2 | Homer API | 查询 Homer 已存储数据 | SIP |
| 3 | TsharkQuery | 环形缓冲区 pcap → editcap + mergecap + tshark | S1AP/NGAP/SIP/Diameter/GTPv2C/PFCP/NAS/SGsAP |

**处理流程:** 创建 Trace → HEPListener 查询 SIP → Homer API 查询 → TsharkQuery pcap 查询 → Union-Find 跨协议关联 → 摘要生成 → 批量写入 MongoDB

#### 7. WebSocket 模块

三个 WebSocket 端点：

| 端点 | 用途 | 推送间隔 |
|------|------|----------|
| `/api/v1/monitor/ws` | NF 进程状态、告警生成、指标持久化、抓包进度 | 2s (状态), 30s (指标) |
| `/api/v1/nf/logs/ws` | 实时日志流（支持动态 level/keyword 过滤） | 500ms 轮询 |
| `/api/v1/deployment/ws` | 部署状态 + EPC/IMS 用户数 | 5s (部署), 10s (业务) |

#### 7. 调度器模块 (scheduler)

Cron 定时任务类型：
- `health_check`: 健康检查
- `restart`: 服务重启
- `cleanup`: 数据清理
- `backup_config`: 配置备份
- `custom`: 自定义命令
- AIOps 任务：anomaly_scan / trend_scan / predict / aggregate / rca

#### 8. 通知模块 (notify)

- 多通道通知（Webhook、邮件等）
- 告警升级规则
- 通知日志记录

---

## 前端架构

### 目录结构

```
frontend/
├── index.html                      # 入口 HTML
├── package.json                    # 依赖配置
├── tsconfig.json                   # TypeScript 配置
├── vite.config.ts                  # Vite 配置（含 WS 代理）
├── tailwind.config.ts              # Tailwind CSS 配置
└── src/
    ├── main.tsx                    # 入口文件
    ├── App.tsx                     # 根组件 + 路由定义
    ├── index.css                   # 全局样式
    ├── components/                 # 共享组件
    │   ├── StatusBar.tsx           # 状态栏（动态页面标题、i18n）
    │   ├── Sidebar.tsx             # 侧边栏导航（16 个主菜单项）
    │   ├── ProcessTable.tsx        # 进程表格
    │   ├── ResourceChart.tsx       # 资源图表
    │   ├── SummaryCard.tsx         # 汇总卡片
    │   ├── MarkdownViewer.tsx      # Markdown 查看器（深色模式适配）
    │   └── LadderDiagram.tsx       # 信令梯形时序图（SVG，协议着色，错误标记）
    ├── context/                    # React Context
    │   ├── MonitorContext.tsx      # 监控上下文
    │   ├── ThemeContext.tsx        # 主题上下文（深色/浅色）
    │   └── i18nContext.tsx         # 国际化上下文
    ├── hooks/                      # 自定义 Hooks
    │   └── useMonitorSocket.ts    # WebSocket Hook
    ├── locales/                    # 语言文件
    │   ├── en.ts                   # 英文
    │   └── zh.ts                   # 中文
    ├── pages/                      # 页面组件（25 个）
    │   ├── Overview.tsx            # 运维总览（分组折叠、告警横幅、运行时长）
    │   ├── Topology.tsx            # 网络拓扑（EPC/5GC/IMS 架构可视化）
    │   ├── NetworkElements.tsx     # 网元管理
    │   ├── AgentManagement.tsx     # Agent 节点管理（真实数据、告警关联）
    │   ├── UEInfo.tsx              # UE 信息（MSISDN/SIP URI/会话状态）
    │   ├── MetricsHistory.tsx      # 实时指标监控
    │   ├── AlarmCenter.tsx         # 告警中心（闭环管理）
    │   ├── FaultDiagnosis.tsx      # 故障诊断（5 种故障类型、AI 推荐）
    │   ├── FaultResolution.tsx     # 故障处置（一键修复、状态流转）
    │   ├── LogCenter.tsx           # 日志中心（多目录、实时流、日期滚动）
    │   ├── ConfigBackups.tsx       # 配置备份（版本历史、diff 对比）
    │   ├── ScheduledTasks.tsx      # 自动化任务（Cron 表达式）
    │   ├── KnowledgeBase.tsx       # 知识库列表
    │   ├── KnowledgeBaseDetail.tsx # 知识库详情
    │   ├── KnowledgeBaseEdit.tsx   # 知识库编辑（Markdown 工具栏）
    │   ├── Reports.tsx             # 报表中心
    │   ├── Sites.tsx               # 站点/系统管理
    │   ├── ApiDocs.tsx             # API 文档（交互式 Try it）
    │   ├── Subscribers.tsx         # 订户管理（CRUD + 批量操作）
    │   ├── MmlTerminal.tsx         # MML 命令终端
    │   ├── AuditLogs.tsx           # 审计日志
    │   ├── UserManagement.tsx      # 用户管理（RBAC）
    │   ├── Alarms.tsx              # 告警（旧版，AlarmCenter 已替代）
    │   ├── AIOps.tsx               # AIOps 汇总（未挂路由）
    │   ├── PacketCapture.tsx       # 一键抓包（协议预设、实时进度、PCAP 下载）
    │   └── SignalingTrace.tsx      # 信令追踪（跨协议关联、Ladder Diagram、Homer 集成）
    ├── types/                      # TypeScript 类型
    │   └── monitor.ts              # 监控类型定义
    └── utils/                      # 工具函数
        └── format.ts               # 格式化工具
```

### 前端路由

#### 主导航（侧边栏 18 项）

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | Overview | 运维总览仪表盘 |
| `/topology` | Topology | 网络拓扑可视化 |
| `/elements` | NetworkElements | 网元管理 |
| `/agents` | AgentManagement | Agent 节点管理 |
| `/ue-info` | UEInfo | UE 信息查询 |
| `/metrics` | MetricsHistory | 实时指标监控 |
| `/alarms` | AlarmCenter | 告警中心 |
| `/fault-diagnosis` | FaultDiagnosis | 故障诊断 |
| `/capture` | PacketCapture | 一键抓包（12 种协议预设、实时进度、PCAP 下载） |
| `/signaling` | SignalingTrace | 信令追踪（跨协议关联、Ladder Diagram、Homer 集成） |
| `/fault-resolution` | FaultResolution | 故障处置 |
| `/logs` | LogCenter | 日志中心 |
| `/backups` | ConfigBackups | 配置备份 |
| `/tasks` | ScheduledTasks | 自动化任务 |
| `/kb` | KnowledgeBase | 知识库 |
| `/reports` | Reports | 报表中心 |
| `/settings` | Sites | 系统管理 |
| `/docs` | ApiDocs | API 文档 |

#### 知识库子路由

| 路由 | 页面 |
|------|------|
| `/kb/:id` | KnowledgeBaseDetail |
| `/kb/edit` | KnowledgeBaseEdit |
| `/kb/edit/:id` | KnowledgeBaseEdit |

#### 旧版路由（向后兼容）

| 路由 | 页面 |
|------|------|
| `/subscribers` | Subscribers |
| `/mml` | MmlTerminal |
| `/audit` | AuditLogs |
| `/users` | UserManagement |
| `/sites` | Sites |

### 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.3 | 类型系统 |
| Vite | 4.5 | 构建工具（含 WS 代理） |
| Tailwind CSS | 3.4 | 样式框架 |
| Lucide React | 0.344 | 图标库 |
| React Router | 6.22 | 路由管理 |
| ECharts | 5.5 | 图表库 |

### 组件设计原则

1. **单一职责**: 每个组件只负责一个功能
2. **可复用性**: 共享组件提取到 components 目录
3. **类型安全**: 使用 TypeScript 严格类型检查
4. **响应式设计**: 适配不同屏幕尺寸
5. **主题支持**: 深色/浅色主题切换，Markdown 代码块深色模式适配
6. **国际化**: i18n 上下文支持中英文切换

---

## 数据模型

### MongoDB 集合一览

| 集合 | 模型文件 | 用途 |
|------|----------|------|
| `subscribers` | model/subscriber.go | EPC/5GC 订户（IMSI、安全上下文、会话、AMBR） |
| `alarms` | model/alarm.go | 告警事件（severity、ack/clear 状态、去重计数） |
| `alarm_rules` | model/alarm.go | 可配置告警规则 |
| `metrics` | model/metrics.go | 时序进程指标（CPU、内存、PID） |
| `audit_logs` | (handler 内联) | 用户操作审计日志 |
| `scheduled_tasks` | (handler 内联) | 定时任务定义 |
| `users` | (handler 内联) | 用户账号（bcrypt 密码、角色） |
| `notification_channels` | model/notification.go | 通知投递渠道 |
| `notification_logs` | model/notification.go | 通知发送记录 |
| `escalation_rules` | model/notification.go | 告警升级规则 |
| `solutions` | model/solution.go | 知识库条目（全文搜索） |
| `config_backups` | model/config_backup.go | NF 配置版本备份（SHA-256 去重） |
| `sites` | model/site.go | 站点/区域管理（region/dc/node） |
| `anomaly_events` | model/aiops.go | AIOps 检测到的异常事件 |
| `root_cause_analysis` | model/aiops.go | 根因分析结果（关联告警） |
| `capacity_predictions` | model/aiops.go | 容量预测 |
| `trend_alerts` | model/aiops.go | 趋势预警 |
| `interface_health` | (handler 内联) | NF 接口健康探测结果 |
| `telecom_kpi` | model/telecom_kpi.go | 电信域 KPI 指标 |
| `capture_sessions` | model/capture.go | 抓包会话（状态、文件路径、进度、PID） |
| `signaling_messages` | model/signaling.go | 信令消息（15 种协议、跨协议关联标识） |
| `signaling_traces` | model/signaling.go | 信令追踪会话（查询条件、网元列表、摘要） |
| `media_quality` | model/signaling.go | RTP/RTCP 媒体质量（MOS、丢包、抖动） |
| `settings` | (handler 内联) | 键值对设置（如部署模板） |

### 核心集合结构

#### 1. subscribers (订户)

```json
{
  "_id": ObjectId,
  "imsi": String,
  "msisdn": String,
  "apn": String,
  "security": { "k": String, "opc": String, "amf": String },
  "session": { "type": String, "ambr": Object },
  "qos": Number,
  "status": String,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 2. alarms (告警)

```json
{
  "_id": ObjectId,
  "source": String,
  "severity": String,       // critical | major | minor | warning
  "message": String,
  "status": String,         // active | acked | cleared
  "count": Number,          // 去重计数
  "root_cause_id": ObjectId,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 3. alarm_rules (告警规则)

```json
{
  "_id": ObjectId,
  "name": String,
  "metric": String,         // cpu | memory | disk
  "threshold": Number,
  "severity": String,
  "enabled": Boolean,
  "created_at": DateTime
}
```

#### 4. metrics (指标)

```json
{
  "_id": ObjectId,
  "source": String,
  "name": String,           // cpu | memory | disk | pid
  "value": Number,
  "timestamp": DateTime
}
```

#### 5. sites (站点)

```json
{
  "_id": ObjectId,
  "name": String,
  "type": String,           // region | dc | node
  "parent_id": ObjectId,
  "nrf_url": String,
  "nf_ids": [String],
  "enabled": Boolean,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 6. solutions (知识库)

```json
{
  "_id": ObjectId,
  "title": String,
  "content": String,
  "category": String,
  "tags": [String],
  "files": [{ "name": String, "size": Number }],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

#### 7. root_cause_analysis (根因分析)

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

#### 8. signaling_messages (信令消息)

```json
{
  "_id": ObjectId,
  "trace_id": String,
  "timestamp": DateTime,
  "protocol": String,
  "interface": String,
  "direction": String,
  "method": String,
  "status_code": Number,
  "src_entity": String,
  "dst_entity": String,
  "src_ip": String,
  "dst_ip": String,
  "src_port": Number,
  "dst_port": Number,
  "identifiers": {
    "imsi": String,
    "supi": String,
    "msisdn": String,
    "impu": String,
    "impi": String,
    "sip_uri": String,
    "guti": String,
    "fiveg_guti": String,
    "teid": String,
    "ue_ipv4": String,
    "ue_ipv6": String,
    "call_id": String
  },
  "details": Object,
  "raw_preview": String,
  "session_id": String,
  "call_id": String
}
```

#### 9. signaling_traces (信令追踪)

```json
{
  "_id": ObjectId,
  "trace_id": String,
  "query_type": String,
  "query_value": String,
  "scenario": String,
  "status": String,
  "message_count": Number,
  "entities": [String],
  "time_range": { "start": DateTime, "end": DateTime },
  "summary": {
    "reg_ok": Boolean,
    "auth_ok": Boolean,
    "session_ok": Boolean,
    "ims_reg_ok": Boolean,
    "call_ok": Boolean,
    "sms_ok": Boolean,
    "error_step": String,
    "error_detail": String
  },
  "created_at": DateTime,
  "created_by": String
}
```

#### 10. media_quality (媒体质量)

```json
{
  "_id": ObjectId,
  "trace_id": String,
  "call_id": String,
  "direction": String,
  "codec": String,
  "src_ip": String,
  "src_port": Number,
  "dst_ip": String,
  "dst_port": Number,
  "ssrc": String,
  "pkts_sent": Number,
  "pkts_lost": Number,
  "loss_rate": Number,
  "jitter": Number,
  "mos": Number,
  "rtd": Number,
  "relay_ip": String,
  "relay_port": Number,
  "timestamp": DateTime
}
```

---

## 外部集成

### open5gs 集成

| 组件 | 地址 | 用途 |
|------|------|------|
| MME | 127.0.0.2:9090 | EPC UE 信息查询 |
| AMF | 127.0.0.5:9090 | 5G UE 信息查询 |
| SMF | 127.0.0.4:9090 | 5G 会话信息 + Prometheus 指标 |

### MySQL 集成（IMS 侧）

| 数据库 | 用途 |
|--------|------|
| `hss_db` | IMS 订户数据（IMPI/IMPU 表） |
| `scscf` | S-CSCF 注册/联系数据 |

### 系统集成

| 集成 | 方式 | 用途 |
|------|------|------|
| systemctl | Shell exec | NF 服务启停控制（CTRL-NF MML 命令） |
| Webhook | HTTP POST | 告警通知外发 |

---

## 通信协议

### HTTP API

- **协议**: HTTP/1.1, HTTP/2
- **格式**: JSON
- **认证**: JWT Bearer Token（可选启用）
- **限流**: 20 req/s, burst 40
- **端口**: 8080 (默认)
- **静态资源**: 前端 dist 通过 go:embed 嵌入，SPA fallback

### WebSocket

三个独立 WebSocket 端点：

| 端点 | 认证 | 用途 |
|------|------|------|
| `/api/v1/monitor/ws` | Token | NF 进程状态实时推送、告警生成、指标持久化 |
| `/api/v1/nf/logs/ws` | Token | 日志实时流（支持运行时动态过滤） |
| `/api/v1/deployment/ws` | Token | 部署状态 + EPC/IMS 用户数统计 |

### 数据格式

#### HTTP 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

#### WebSocket 监控消息

```json
{
  "type": "metrics",
  "data": {
    "source": "amfd",
    "cpu": 45.2,
    "memory": 62.8,
    "disk": 38.5
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

#### WebSocket 日志流过滤（客户端 → 服务端）

```json
{
  "level": "ERROR",
  "keyword": "timeout"
}
```

---

## RBAC 权限模型

三种角色：

| 角色 | 权限范围 |
|------|----------|
| **admin** | 全部权限，包括用户管理 |
| **operator** | MML 执行、订户管理、任务管理、通知配置、备份、站点、知识库 |
| **viewer** | 所有数据的只读访问 |

MML 命令权限：
- `operator+` 角色可执行：`ADD-SUB`, `DEL-SUB`, `MOD-SUB`, `CTRL-NF`, `ACK-ALARM`, `CLR-ALARM`, `ADD-SUB-BATCH`, `IMP-SUB`
- `viewer` 可执行：`LST-SUB`, `EXP-SUB`

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
│  │      核心网 NF 进程          │   │
│  │  (open5gs + kamailio + FS)  │   │
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
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Agent 节点 1 │   │   Agent 节点 2 │   │   Agent 节点 3 │
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

---

## 安全设计

### 认证授权

- JWT Token 认证（可选启用）
- 角色权限控制 (RBAC: admin/operator/viewer)
- 密码加密存储 (bcrypt)

### 数据安全

- HTTPS 传输加密（需 Nginx 反向代理）
- 敏感数据加密存储
- 日志脱敏处理

### 访问控制

- 请求限流（20 req/s, burst 40）
- CORS 配置
- WebSocket Token 认证

---

## 监控指标

### 系统指标

| 指标 | 说明 | 阈值 |
|------|------|------|
| CPU 使用率 | 进程 CPU 占用 | > 80% 告警 |
| 内存使用率 | 进程内存占用 | > 80% 告警 |
| 磁盘使用率 | 磁盘空间占用 | > 90% 告警 |
| 进程状态 | 进程运行状态 | 停止告警 |

### 电信 KPI

| 指标 | 说明 |
|------|------|
| 注册成功率 | SIP REGISTER 成功率 |
| 附着成功率 | EPC/5GC 附着成功率 |
| 接口健康度 | NF 接口探测结果 |
| UE 在线数 | 当前在线 UE/IMS 用户数 |

### 业务指标

| 指标 | 说明 |
|------|------|
| 活跃告警数 | 当前未处理告警 |
| API 响应时间 | 接口延迟 |
| WebSocket 连接数 | 实时连接数 |
| MongoDB 连接池 | 数据库连接状态 |
