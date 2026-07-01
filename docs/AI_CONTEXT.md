# AI 项目上下文

本文档保存项目长期上下文，供 Claude Code 每次进入项目时快速理解全局。
详细设计请参阅各子项目的 canonical 文档。

---

## 项目定位

xCloud-CNMS 是一个专业的 4G/5G/IMS 核心网监控管理平台，面向电信运营商的运维团队。
当前部署在 Ubuntu 24.04 开发环境上，与 IMS/VoLTE 核心网（Kamailio + FreeSWITCH + open5gs）联调。

版本：v1.4.1

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    工作区根目录                            │
│  /usr/local/src/claudeWorkSpace/                        │
│                                                         │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ xCloud-CNMS  │  │ heplify  │  │ netCoreConf       │  │
│  │ (主项目)      │  │ (采集器)  │  │ (IMS 配置链接)    │  │
│  │ Go+React     │  │ Go       │  │ pcscf/scscf/icscf │  │
│  │ MongoDB      │  │          │  │ freeswitch        │  │
│  └──────┬───────┘  └──────────┘  └───────────────────┘  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              4G/5G/IMS 核心网                     │   │
│  │  open5gs (EPC+5GC) + kamailio (IMS) + FreeSWITCH │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## xCloud-CNMS 核心模块

详细架构 → `architecture.md`

### 后端模块 (Go)

| 模块 | 路径 | 职责 |
|------|------|------|
| auth | internal/auth/ | JWT 认证、角色权限 |
| config | internal/config/ | 配置加载、热重载（fsnotify） |
| handler | internal/handler/ | HTTP 请求处理（17 个 handler 文件） |
| monitor | internal/monitor/ | 进程探测、NF 接口健康检查、NF 自动发现 |
| aiops | internal/aiops/ | 异常检测、根因分析、趋势预测、容量规划、数据聚合 |
| mml | internal/mml/ | MML 命令解析执行（10 种命令） |
| model | internal/model/ | 数据模型（10 个模型文件，20+ 集合） |
| mongo | internal/mongo/ | MongoDB 客户端封装 |
| ws | internal/ws/ | WebSocket 实时推送（监控/日志流/部署状态 3 个端点） |
| notify | internal/notify/ | 多通道告警通知 + 升级规则 |
| scheduler | internal/scheduler/ | 定时任务调度（6 种任务类型 + AIOps 任务） |
| router | internal/router/ | 路由注册（flat switch）、SPA 静态资源 |
| middleware | internal/middleware/ | 限流中间件（20 req/s, burst 40） |

### 前端页面 (React, 25 个)

#### 主导航（侧边栏 16 项）

| 页面 | 文件 | 功能 |
|------|------|------|
| Overview | Overview.tsx | 运维总览（EPC/5GC/IMS 分组折叠、告警横幅、运行时长、操作按钮） |
| Topology | Topology.tsx | 网络拓扑可视化（EPC/5GC/IMS 架构） |
| NetworkElements | NetworkElements.tsx | 网元列表管理 |
| AgentManagement | AgentManagement.tsx | Agent 节点管理（真实数据、告警关联、NF 展开、重连） |
| UEInfo | UEInfo.tsx | UE 信息（MSISDN/SIP URI/会话状态图标） |
| MetricsHistory | MetricsHistory.tsx | 实时指标监控 |
| AlarmCenter | AlarmCenter.tsx | 告警中心（闭环管理） |
| FaultDiagnosis | FaultDiagnosis.tsx | 故障诊断（5 种故障类型、发生次数、AI 推荐） |
| FaultResolution | FaultResolution.tsx | 故障处置（一键修复、验证、状态流转） |
| LogCenter | LogCenter.tsx | 日志中心（多目录、实时流、日期滚动、告警关联） |
| ConfigBackups | ConfigBackups.tsx | 配置备份（版本历史、diff 对比） |
| ScheduledTasks | ScheduledTasks.tsx | 自动化任务（Cron 表达式） |
| KnowledgeBase | KnowledgeBase.tsx | 知识库（种子数据、Markdown 工具栏、故障标签打通） |
| Reports | Reports.tsx | 报表中心 |
| Sites | Sites.tsx | 站点/系统管理 |
| ApiDocs | ApiDocs.tsx | API 文档（交互式 Try it 调试） |

#### 知识库子页面

| 页面 | 文件 | 功能 |
|------|------|------|
| KnowledgeBaseDetail | KnowledgeBaseDetail.tsx | 知识库文章详情 |
| KnowledgeBaseEdit | KnowledgeBaseEdit.tsx | 知识库文章编辑 |

#### 旧版路由（向后兼容）

| 页面 | 文件 | 功能 |
|------|------|------|
| Subscribers | Subscribers.tsx | 订户管理（CRUD + 批量操作） |
| MmlTerminal | MmlTerminal.tsx | MML 命令终端 |
| AuditLogs | AuditLogs.tsx | 审计日志 |
| UserManagement | UserManagement.tsx | 用户管理（RBAC） |

---

## 关键数据流

### 实时监控流

```
5GC NF 进程 → monitor/probe.go (进程探测, 2s)
           → ws/handler.go (WebSocket 推送)
           → 前端 useMonitorSocket.ts (接收渲染)
           → 告警生成 (阈值检测 + 去重)
           → MongoDB (告警持久化)
           → notify/service.go (多通道通知)
           → aiops/rca.go (自动根因分析)
```

### 日志流

```
NF 日志文件 → ws/logstream.go (500ms 轮询)
           → 动态过滤 (level/keyword, 客户端可运行时修改)
           → 前端 LogCenter 实时展示
```

### 部署状态流

```
部署模板 → ws/deployment.go (5s 轮询)
        → EPC/IMS 用户数统计 (10s)
        → 前端 Overview 部署状态展示
```

### MML 命令流

```
前端 MmlTerminal → POST /api/v1/mml/execute
               → handler/mml.go
               → mml/parser.go (命令解析)
               → 执行操作 (订户 CRUD / NF 控制 / 告警管理)
               → 返回结果
```

### AIOps 分析流

```
MongoDB (历史指标) → aiops/aggregator.go (每小时聚合)
                 → aiops/detector.go (异常检测)
                 → aiops/predictor.go (容量预测)
                 → aiops/trend.go (趋势分析)
                 → aiops/rca.go (告警触发根因分析)
                 → handler/aiops.go → 前端展示
```

### 外部数据集成

```
open5gs MME/AMF (HTTP API) → handler/ue_info.go → UE 信息页面
open5gs SMF (Prometheus)   → handler/business_metrics.go → 业务指标
MySQL hss_db               → handler/business_metrics.go → IMS 订户数
MySQL scscf                → handler/business_metrics.go → S-CSCF 注册数
```

---

## 数据存储

- **MongoDB (xCloud)**: 20+ 集合（告警、指标、订户、站点、任务、备份、知识库、审计日志、AIOps 子集合、通知、KPI 等）
- **MongoDB (open5gs)**: open5gs 核心网订户数据
- **MySQL (hss_db)**: IMS 订户数据（IMPI/IMPU 表）
- **MySQL (scscf)**: S-CSCF 注册/联系数据
- **配置文件**: JSON 格式，支持 fsnotify 热重载
- **日志文件**: /var/log/xCloud/ (NF 日志), /var/log/cscf/ (IMS 日志)

详细数据模型 → `architecture.md#数据模型`

---

## API 接口

详细 API 文档 → `api.md`

核心接口分组（全部通过 auth 中间件 + rate limiting）：
- **系统**: 健康检查 (/healthz, /readyz, /api/health)、OpenAPI 规范
- **认证**: JWT 登录
- **监控**: WebSocket 实时流（3 个端点）、进程列表
- **告警**: 告警历史查询、告警规则 CRUD
- **通知**: 通知渠道 CRUD、升级规则、通知日志
- **订户**: CRUD + 批量导入导出
- **MML**: 10 种 MML 命令执行
- **站点**: 树形管理
- **任务**: 定时任务 CRUD
- **用户**: 用户管理、角色权限
- **日志**: NF 日志、审计日志、日志文件列表
- **备份**: 配置备份、恢复、diff、版本历史
- **知识库**: 文章 CRUD、搜索、统计、文件上传下载
- **AIOps**: 根因分析、趋势、异常检测、预测、汇总
- **指标**: 接口健康、电信 KPI、业务指标、UE 信息
- **报表**: 指标 CSV、告警 CSV、汇总报表
- **部署**: 部署模板、状态、组件状态
- **发现**: NF 自动发现

---

## 后台服务

| 服务 | 间隔 | 职责 |
|------|------|------|
| Scheduler | 按任务 Cron | 执行健康检查、重启、清理、备份、自定义命令、AIOps 任务 |
| HealthProber | 30s (接口) / 60s (KPI) | NF 接口探测 + 电信 KPI 采集 |
| NFDiscovery | 周期性 | 从 NRF 自动发现 NF（支持 Sites 动态 NRF URL） |
| ConfigWatcher | 文件监听 | fsnotify 配置热重载 |

AIOps 后台任务（通过 Scheduler）：
- `aiops_anomaly_scan` — 指标异常扫描
- `aiops_trend_scan` — 趋势检测
- `aiops_predict` — 容量预测
- `aiops_aggregate` — 每小时指标聚合
- `aiops_rca` — 根因分析清理（RCA 本身由告警触发）

---

## 部署方式

详细部署指南 → `deployment.md`

两种部署方式：
1. **Docker Compose** (推荐): `docker-compose up -d`
2. **手动构建**: `./build.sh` → `cd backend && ./xcloud-cnms -config config/config.json`

---

## IMS 核心网配置

### Kamailio 配置

| CSCF | 配置入口 | 路由脚本目录 |
|------|----------|-------------|
| P-CSCF | /etc/kamailio_pcscf/kamailio_pcscf.cfg | /etc/kamailio_pcscf/route/ |
| S-CSCF | /etc/kamailio_scscf/kamailio_scscf.cfg | - |
| I-CSCF | /etc/kamailio_icscf/kamailio_icscf.cfg | - |

### FreeSWITCH

- 配置目录: /usr/local/freeswitch/conf/
- SIP Profile: /usr/local/freeswitch/conf/sip_profiles/
- 拨号计划: /usr/local/freeswitch/conf/dialplan/

### 抓包分析

- 抓包脚本: pcap/pcap.sh（tcpdump 抓 SIP/RTP/HEP 流量）
- 抓包文件: pcap/按日期目录/
- HEP 采集: heplify 项目

---

## 重要设计决策

1. **单二进制部署**: 前端 dist 通过 go:embed 嵌入 Go 二进制，单一文件即可运行
2. **MongoDB 而非 SQL**: 灵活的文档模型适合监控数据的多样性；IMS 侧保留 MySQL
3. **WebSocket 实时推送**: 3 个独立 WS 端点，避免前端轮询，降低延迟
4. **flat switch 路由**: 不依赖第三方路由库，路由逻辑集中在 router.go
5. **MML 命令行风格**: 模拟电信设备的人机命令交互方式（10 种命令）
6. **AIOps 内置**: 异常检测和根因分析作为核心功能，非外部依赖
7. **告警去重**: 同 source+severity 未关闭告警递增 count 而非新建
8. **RCA 自动触发**: 新告警插入时自动执行根因分析
9. **配置备份 SHA-256**: 校验和去重，跳过未变更配置
10. **日志流动态过滤**: 客户端可在连接中发送 JSON 修改过滤条件

---

## 当前系统能力边界

### 已实现

- EPC/5GC/IMS NF 进程监控（20 个进程）
- NF 接口健康检查（30s 周期探测）
- NF 自动发现（NRF 查询）
- 实时指标采集和展示
- 告警生成、确认、清除、去重、升级规则、多通道通知
- MML 命令执行（10 种：订户管理、NF 控制、告警管理、批量导入导出）
- 故障诊断（5 种故障类型，发生次数统计，AI 推荐）
- 故障处置（一键修复、验证、状态流转）
- 日志中心（多目录、实时流、日期滚动、告警关联）
- 配置备份（版本历史、SHA-256 去重、diff 对比）
- 知识库（种子数据、Markdown 工具栏、故障标签打通、文件上传）
- 报表中心（CSV 导出、汇总报表）
- Agent 分布式采集节点管理（真实数据、告警关联、NF 展开）
- UE 信息查询（MSISDN/SIP URI/会话状态，集成 open5gs MME/AMF/SMF）
- 业务指标（集成 MySQL HSS/S-CSCF + SMF Prometheus）
- 部署模板管理 + WebSocket 部署状态推送
- JWT 认证和 RBAC 权限控制（admin/operator/viewer）
- API 文档（OpenAPI 3.0 + 交互式 Try it）
- 前端深色/浅色主题、i18n 国际化
- 审计日志、用户管理

### 规划中

- 自定义监控插件
- 自定义告警规则（当前阈值硬编码）
- 自定义报表模板
- HTTPS / Nginx 反向代理集成
- Prometheus + Grafana 集成
- 前端单元测试覆盖
- heplify 与 xCloud-CNMS 联动

---

## 相关文档链接

- [系统架构详细设计](./architecture.md)
- [API 接口详细文档](./api.md)
- [部署运维详细指南](./deployment.md)
- [开发进展记录](./DEV_LOG.md)
- [待办任务](./TODO.md)
