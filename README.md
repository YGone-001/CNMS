# xCloud-CNMS

**5G Core Network Monitoring and Management Platform**

[![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat&logo=go)](https://go.dev/)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js)](https://nodejs.org/)
[![MongoDB Version](https://img.shields.io/badge/MongoDB-7+-47A248?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Internal-orange)](#)

xCloud-CNMS 是一个专业的 5G 核心网监控管理平台，提供实时监控、故障诊断、告警管理、自动化运维等功能。

## ✨ 核心功能

### 📊 运维总览
- 系统状态概览仪表盘
- 关键指标实时展示
- 快速访问常用功能

### 🌐 网络拓扑
- 5GC SBA 架构可视化
- 网元连接关系展示
- 拓扑图交互操作

### 🖥️ 网元管理
- 网络元素列表管理
- 状态监控和控制
- 位置树动态加载

### 📡 Agent 管理
- 分布式采集节点管理
- 节点状态监控（在线/告警/离线）
- 资源使用率监控（CPU/内存/磁盘）
- 远程操作（终端/配置/上传）

### 📈 实时指标
- 性能指标实时监控
- 历史趋势图表
- 自定义指标查询

### 🔔 告警中心
- 实时告警推送
- 告警确认/清除
- 告警历史查询
- Webhook 通知

### 🔍 故障诊断
- 支持 5 种故障类型：
  - UE 注册失败
  - VoLTE 呼叫失败
  - 无声音
  - 专用承载失败
  - NF 发现失败
- 信令流程图分析
- 自动根因定位
- 证据日志收集
- 推荐修复动作

### 🔧 故障处置
- 故障工单管理
- 根因候选分析（置信度排序）
- 建议操作执行
- 处置时间线记录

### 📝 日志中心
- 多级别日志（信息/警告/错误/调试）
- 多类别（系统/安全/操作/审计）
- 日志搜索和过滤
- 详情展开查看

### 💾 配置备份
- 配置文件备份管理
- 版本历史记录
- 配置恢复操作

### ⏰ 自动化任务
- 定时任务管理
- 任务执行历史
- Cron 表达式配置

### 📚 知识库
- 故障处理知识库
- 文章分类管理
- 标签搜索

### 📊 报表中心
- 性能报表生成
- 数据导出功能
- 自定义报表模板

### ⚙️ 系统管理
- 站点管理
- 用户管理
- 角色权限控制

### 📖 API 文档
- OpenAPI 3.0 规范
- 交互式 API 文档
- 接口测试功能

## 🚀 快速开始

### Docker 部署（推荐）

```bash
# 启动服务
docker-compose up -d

# 访问 Web UI
open http://localhost:8080
```

### 手动构建

```bash
# 一键构建
./build.sh

# 运行
cd backend && ./xcloud-cnms -config config/config.json
```

### 环境要求

- Go 1.24+
- Node.js 18+
- MongoDB 7+

## ⚙️ 配置说明

编辑 `config.json` 或 `backend/config/config.json`：

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
    "webhook_url": "https://hooks.example.com/alarm",
    "min_level": "major"
  },
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "admin123",
    "jwt_key": "your-secret-key-here"
  }
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `server.host` | 监听地址 | `0.0.0.0` |
| `server.port` | 监听端口 | `8080` |
| `mongodb.uri` | MongoDB 连接 URI | `mongodb://localhost:27017` |
| `mongodb.database` | 数据库名称 | `xCloud` |
| `log_dir` | NF 日志目录 | `/var/log/xCloud` |
| `notify.webhook_url` | 告警 Webhook URL（空则禁用） | - |
| `notify.min_level` | 通知最低级别 | `major` |
| `auth.enabled` | 启用 JWT 认证 | `false` |
| `auth.username` | 登录用户名 | `admin` |
| `auth.password` | 登录密码 | `admin123` |
| `auth.jwt_key` | JWT 签名密钥 | - |

## 📡 MML 命令

### 订户操作

| 命令 | 说明 |
|------|------|
| `ADD-SUB: IMSI=460110000000001, APN=internet;` | 添加订户 |
| `DEL-SUB: IMSI=460110000000001;` | 删除订户 |
| `LST-SUB:;` | 列出所有订户（分页） |
| `LST-SUB: IMSI=460110000000001;` | 查询特定订户 |
| `LST-SUB: PAGE=1, PAGE_SIZE=10;` | 分页列出 |
| `MOD-SUB: IMSI=460110000000001, APN=5gnet, QOS=5;` | 修改订户 |
| `ADD-SUB-BATCH: FILE=subscribers.csv;` | 批量导入 CSV |
| `EXP-SUB: FILE=subscribers.json;` | 导出所有订户 |
| `IMP-SUB: FILE=subscribers.json;` | 从 JSON 导入 |

### 网络功能控制

| 命令 | 说明 |
|------|------|
| `CTRL-NF: NAME=amfd, ACTION=restart;` | 重启 NF 服务 |
| `CTRL-NF: NAME=amfd, ACTION=stop;` | 停止 NF 服务 |
| `CTRL-NF: NAME=amfd, ACTION=start;` | 启动 NF 服务 |

### 告警管理

| 命令 | 说明 |
|------|------|
| `ACK-ALARM: ID=<alarm_id>;` | 确认告警 |
| `CLR-ALARM: ID=<alarm_id>;` | 清除告警 |

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/v1/auth/login` | 用户登录 |
| POST | `/api/v1/mml/execute` | 执行 MML 命令 |
| WS | `/api/v1/monitor/ws` | 实时监控流 |
| GET | `/api/v1/alarms` | 查询告警历史 |
| GET | `/api/v1/nf/logs` | 获取 NF 日志 |
| GET | `/api/v1/metrics/history` | 查询指标历史 |
| GET | `/api/v1/audit/logs` | 查询审计日志 |
| GET | `/api/v1/tasks` | 列出定时任务 |
| GET | `/api/v1/users` | 列出用户 |
| GET | `/api/docs` | OpenAPI 3.0 规范 |

完整 API 文档请访问 Web UI 中的 `/docs` 页面。

## 👥 用户角色

| 角色 | 权限 |
|------|------|
| **Admin** | 完全访问权限，用户管理 |
| **Operator** | MML 命令，告警管理 |
| **Viewer** | 只读访问 |

## 📊 监控目标

系统监控以下 xCloud 核心进程：

`amfd`, `ausfd`, `bsfd`, `drad`, `hssd`, `mmed`, `nrfd`, `nssfd`, `ocsd`, `pcfd`, `pcrfd`, `pgwcd`, `pgwud`, `scpd`, `sgwcd`, `sgwud`, `smfd`, `udmd`, `udrd`, `upfd`

## ⚠️ 告警阈值

| 条件 | 级别 |
|------|------|
| 进程未运行 | Critical |
| CPU > 80% | Major |
| 内存 > 80% | Minor |

## 📁 项目结构

```
xcloud-cnms/
├── backend/                    # 后端服务
│   ├── main.go                 # 入口文件
│   ├── config/config.json      # 默认配置
│   └── internal/
│       ├── auth/jwt.go         # JWT 认证
│       ├── config/             # 配置加载 + 热重载
│       ├── handler/            # HTTP 处理器
│       ├── mml/parser.go       # MML 命令解析器
│       ├── model/              # 数据模型
│       ├── mongo/client.go     # MongoDB 封装
│       ├── monitor/probe.go    # 进程监控
│       ├── router/router.go    # 路由注册
│       └── ws/handler.go       # WebSocket + 告警生成
├── frontend/                   # 前端应用
│   └── src/
│       ├── pages/              # 页面组件
│       ├── components/         # 共享组件
│       ├── context/            # React Context
│       ├── hooks/              # 自定义 Hooks
│       ├── types/              # TypeScript 类型
│       └── utils/              # 工具函数
├── docs/                       # 项目文档
│   ├── architecture.md         # 系统架构
│   ├── api.md                  # API 文档
│   └── deployment.md           # 部署指南
├── Dockerfile                  # Docker 多阶段构建
├── docker-compose.yml          # Docker Compose 配置
├── build.sh                    # 构建脚本
├── CHANGELOG.md                # 变更日志
├── ROADMAP.md                  # 路线图
└── README.md                   # 本文件
```

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
