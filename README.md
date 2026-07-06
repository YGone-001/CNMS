# xCloud-CNMS

**4G/5G/IMS 核心网监控管理平台**

[![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat&logo=go)](https://go.dev/)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js)](https://nodejs.org/)
[![MongoDB Version](https://img.shields.io/badge/MongoDB-7+-47A248?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Internal-orange)](#)

xCloud-CNMS 是一个专业的 4G/5G/IMS 核心网监控管理平台，面向电信运营商运维团队，提供实时监控、故障诊断、告警管理、AIOps 智能分析、自动化运维等功能。

当前部署在 Ubuntu 24.04 上，与 IMS/VoLTE 核心网（Kamailio + FreeSWITCH + open5gs）联调。

---

## ✨ 核心功能

### 📊 运维总览
- 系统状态仪表盘，网元按 EPC/5GC/IMS 分组折叠显示
- 告警横幅接入真实 Alarm Center 数据
- 系统运行时长卡片
- 操作按钮（查看日志、重启 NF）

### 🌐 网络拓扑
- EPC / 5GC / IMS 架构可视化
- 网元连接关系展示

### 🖥️ 网元管理
- 网络元素列表管理
- 进程状态实时监控
- NF 自动发现（NRF 查询）

### 📡 Agent 管理
- 分布式采集节点管理（接入真实数据）
- 告警关联、NF 展开、重连按钮
- 资源使用率监控（CPU/内存/磁盘）

### 📱 UE 信息
- 在线 UE 信息查询（集成 open5gs MME/AMF/SMF）
- MSISDN / SIP URI / 会话状态展示

### 📈 实时指标
- 进程性能指标实时监控（2s 间隔推送）
- 历史趋势图表
- NF 接口健康检查（30s 周期）
- 电信 KPI 采集（60s 周期）

### 🔔 告警中心
- 实时告警推送（WebSocket）
- 告警确认/清除/去重（同源同级自动合并计数）
- 告警规则配置
- 多通道通知（Webhook/邮件）+ 升级规则

### 🤖 AIOps 智能分析
- 异常检测（基于统计）
- 根因分析（告警自动触发）
- 容量预测
- 趋势分析和早期预警

### 🔍 故障诊断
- 5 种故障类型：UE 注册失败、VoLTE 呼叫失败、无声音、专用承载失败、NF 发现失败
- 发生次数统计、AI 推荐、自定义诊断

### 🔧 故障处置
- 一键修复、验证、状态流转
- 根因候选分析（置信度排序）

### 📦 一键抓包
- 12 种电信协议预设（VoLTE、SIP、Diameter、GTP、NGAP、PFCP 等）
- BPF 过滤表达式 + 注入防护
- WebSocket 实时进度推送（文件大小、包计数、进度百分比）
- PCAP 文件下载、会话管理
- 并发限制（最多 5 个）、资源上限（时长/文件大小）

### 🔍 信令追踪
- 三级数据源：HEPListener（Kamailio HEP 推送）→ Homer API → tshark pcap 环形缓冲区
- 信令持续抓包（tshark 环形缓冲区 20×100MB，BPF 信令协议过滤，崩溃自动重启）
- HEP 监听器（UDP 9060 接收 Kamailio siptrace，HEPv3 解析，50000 条环形缓冲区）
- 跨协议关联引擎（Union-Find 10 维标识：IMSI/SUPI/MSISDN/TEID/UE IP 等）
- Ladder Diagram 梯形时序图（纯 SVG，虚拟滚动，协议着色，错误标记）
- 消息详情面板（按协议类型展示不同字段，SDP 解析，原始数据预览）
- 媒体质量展示（MOS 仪表盘、丢包/抖动/RTD 指标、rtpengine 中继映射）
- 成功/失败摘要（注册/鉴权/会话/IMS注册/通话/短信 6 项判定 + 失败环节定位）
- 已验证：4875 条消息，9 个网元（UE/eNB/MME/HSS/SGW/SMF/UPF/P-CSCF/S-CSCF）

### 📝 日志中心
- 多目录日志文件、日期滚动
- 实时日志流 WebSocket（支持运行时动态 level/keyword 过滤）
- 告警关联

### 💾 配置备份
- 版本历史、SHA-256 去重
- diff 对比、配置恢复

### ⏰ 自动化任务
- Cron 定时任务管理
- 支持健康检查、重启、清理、备份、自定义命令、AIOps 任务

### 📚 知识库
- 文章 CRUD、全文搜索、分类统计
- Markdown 工具栏、故障标签打通
- 文件上传/下载

### 📊 报表中心
- 指标/告警 CSV 导出
- 报表汇总

### 🔌 部署模板
- 部署模板管理 + WebSocket 部署状态推送
- EPC/IMS 用户数实时统计

### ⚙️ 系统管理
- 站点/区域管理（region/dc/node 树形结构）
- 用户管理 + RBAC 权限控制（admin/operator/viewer）
- 审计日志

### 📖 API 文档
- OpenAPI 3.0 规范
- 交互式 Try it 调试功能

### 🌍 国际化
- 中英文切换（i18n）
- 深色/浅色主题

---

## 🚀 快速开始

### Docker 部署（推荐）

```bash
docker-compose up -d
# 访问 http://localhost:8080
```

### 手动构建

```bash
./build.sh
cd backend && ./xcloud-cnms -config config/config.json
```

### 环境要求

| 组件 | 版本 |
|------|------|
| Go | 1.24+ |
| Node.js | 18+ |
| MongoDB | 7.0+ |
| MySQL | 8.0+（IMS 侧，可选） |

---

## ⚙️ 配置说明

编辑 `config.json`：

```json
{
  "server": { "host": "0.0.0.0", "port": 8080 },
  "mongodb": { "uri": "mongodb://localhost:27017", "database": "xCloud" },
  "log_dir": "/var/log/xCloud",
  "notify": { "webhook_url": "", "min_level": "major" },
  "auth": { "enabled": false, "username": "admin", "password": "admin123", "jwt_key": "change-me" }
}
```

配置支持 fsnotify 热重载，修改后无需重启。详见 [部署指南](docs/deployment.md)。

---

## 📡 MML 命令

MML（Man-Machine Language）模拟电信设备人机命令交互：

| 命令 | 说明 | 权限 |
|------|------|------|
| `ADD-SUB: IMSI=..., APN=internet;` | 添加订户 | operator+ |
| `DEL-SUB: IMSI=...;` | 删除订户 | operator+ |
| `LST-SUB: IMSI=...;` | 查询订户 | any |
| `MOD-SUB: IMSI=..., APN=5gnet;` | 修改订户 | operator+ |
| `ADD-SUB-BATCH: FILE=subscribers.csv;` | 批量导入 | operator+ |
| `EXP-SUB: FILE=subscribers.json;` | 导出订户 | any |
| `IMP-SUB: FILE=subscribers.json;` | 导入订户 | operator+ |
| `CTRL-NF: NAME=amfd, ACTION=restart;` | NF 服务控制 | operator+ |
| `ACK-ALARM: ID=<alarm_id>;` | 确认告警 | operator+ |
| `CLR-ALARM: ID=<alarm_id>;` | 清除告警 | operator+ |

---

## 🔌 API 接口

80+ 个 API 端点，主要分组：

| 分组 | 端点 | 说明 |
|------|------|------|
| 系统 | `/healthz` `/readyz` `/api/health` `/api/docs` | 健康检查、OpenAPI |
| 认证 | `/api/v1/auth/login` | JWT 登录 |
| 监控 | `/api/v1/monitor/ws` | 实时监控 WebSocket（2s） |
| 告警 | `/api/v1/alarms` `/api/v1/alarm-rules` | 告警 CRUD + 规则 |
| 通知 | `/api/v1/notifications/*` | 渠道/升级/日志 |
| 订户 | `/api/v1/subscribers` | 订户 CRUD |
| MML | `/api/v1/mml/execute` | 10 种 MML 命令 |
| 站点 | `/api/v1/sites` | 站点管理 |
| 任务 | `/api/v1/tasks` | 定时任务 |
| 用户 | `/api/v1/users` | 用户管理 |
| 日志 | `/api/v1/nf/logs` `/api/v1/nf/logs/ws` `/api/v1/audit/logs` | 日志查询 + 实时流 |
| 指标 | `/api/v1/metrics/history` `/api/v1/interface-health` `/api/v1/telecom-kpi` `/api/v1/business-metrics` `/api/v1/ue-info` | 指标 + KPI + UE |
| 备份 | `/api/v1/backups` | 备份 CRUD + diff |
| 知识库 | `/api/v1/solutions` | 文章 CRUD + 搜索 + 文件 |
| AIOps | `/api/v1/aiops/*` | 异常/根因/预测/趋势 |
| 报表 | `/api/v1/reports/*` | CSV 导出 + 汇总 |
| 部署 | `/api/v1/deployment/*` `/api/v1/deployment/ws` | 模板 + 状态 WebSocket |
| 发现 | `/api/v1/nf/discovery` `/api/v1/nf/discovered` | NF 自动发现 |
| 抓包 | `/api/v1/capture/start` `/api/v1/capture/stop` `/api/v1/capture/sessions` `/api/v1/capture/download` `/api/v1/capture/presets` | 一键抓包生命周期 |
| 信令追踪 | `/api/v1/signaling/trace` `/api/v1/signaling/traces` `/api/v1/signaling/homer/status` | 跨协议信令关联追踪（13 个端点） |

完整 API 文档请访问 Web UI 中的 `/docs` 页面，或参阅 [API 文档](docs/api.md)。

---

## 🔌 WebSocket 端点

| 端点 | 用途 | 推送间隔 |
|------|------|----------|
| `/api/v1/monitor/ws` | NF 进程状态、告警生成、指标持久化、抓包进度 | 2s / 30s |
| `/api/v1/nf/logs/ws` | 实时日志流（动态过滤） | 500ms |
| `/api/v1/deployment/ws` | 部署状态 + EPC/IMS 用户数 | 5s / 10s |
| `/api/v1/signaling/trace/{id}/ws` | 信令追踪实时进度（阶段/进度/消息数/预览） | 500ms |

---

## 👥 用户角色

| 角色 | 权限 |
|------|------|
| **admin** | 全部权限，包括用户管理 |
| **operator** | MML 执行、订户/任务/通知/备份/站点/知识库/抓包管理 |
| **viewer** | 所有数据只读访问 |

---

## 🔗 外部集成

| 集成 | 方式 | 用途 |
|------|------|------|
| open5gs MME/AMF/SMF | HTTP API | UE 信息、会话数据 |
| MySQL hss_db | 直连 | IMS 订户数 |
| MySQL scscf | 直连 | S-CSCF 注册数 |
| Kamailio P/S/I-CSCF | 配置文件 + systemctl | IMS SIP 代理 |
| FreeSWITCH | 配置文件 | VoIP 媒体服务器 |
| heplify | HEP 协议 | 抓包采集 |

---

## 📊 监控目标

系统监控 20 个 xCloud 核心 NF 进程：

`amfd` `ausfd` `bsfd` `drad` `hssd` `mmed` `nrfd` `nssfd` `ocsd` `pcfd` `pcrfd` `pgwcd` `pgwud` `scpd` `sgwcd` `sgwud` `smfd` `udmd` `udrd` `upfd`

---

## ⚠️ 告警阈值

| 条件 | 级别 |
|------|------|
| 进程未运行 | Critical |
| CPU > 80% | Major |
| 内存 > 80% | Minor |
| 磁盘 > 90% | Warning |

> 告警规则可通过 API `/api/v1/alarm-rules` 配置。

---

## 📁 项目结构

```
xCloud-CNMS/
├── backend/                        # Go 1.24 后端
│   ├── main.go                     # 入口文件
│   ├── config/config.json          # 默认配置
│   └── internal/
│       ├── auth/jwt.go             # JWT 认证
│       ├── config/                 # 配置加载 + 热重载
│       ├── handler/                # HTTP 处理器（18 个文件）
│       ├── middleware/ratelimit.go # 限流中间件
│       ├── mml/parser.go          # MML 命令解析器
│       ├── model/                  # 数据模型（11 个文件）
│       ├── mongo/client.go        # MongoDB 封装
│       ├── monitor/                # 进程探测 + 健康检查 + NF 发现
│       ├── aiops/                  # AIOps 引擎（5 个文件）
│       ├── notify/service.go      # 多通道通知
│       ├── scheduler/             # 定时任务调度
│       ├── router/router.go       # 路由注册
│       └── ws/                    # WebSocket（3 个文件）
├── frontend/                       # React 18 + TypeScript
│   └── src/
│       ├── pages/                  # 页面组件（26 个）
│       ├── components/             # 共享组件
│       ├── context/                # React Context（含 i18n）
│       ├── hooks/                  # 自定义 Hooks
│       ├── locales/                # 语言文件
│       ├── types/                  # TypeScript 类型
│       └── utils/                  # 工具函数
├── docs/                           # 项目文档
│   ├── architecture.md             # 系统架构详细设计
│   ├── api.md                      # API 接口详细文档
│   ├── deployment.md               # 部署运维详细指南
│   ├── AI_CONTEXT.md               # 项目长期上下文
│   ├── DEV_LOG.md                  # 开发进展记录
│   └── TODO.md                     # 待办任务清单
├── Dockerfile                      # Docker 多阶段构建
├── docker-compose.yml              # Docker Compose 配置
├── build.sh                        # 一键构建脚本
├── CLAUDE.md                       # Claude Code 开发规则
└── README.md                       # 本文件
```

---

## 📄 许可证

内部使用，未经授权不得外传。

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'feat: add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 创建 Pull Request

## 📞 联系方式

- 问题反馈：[GitHub Issues](https://github.com/YGone-001/CNMS/issues)
- 邮箱：947067341@qq.com
