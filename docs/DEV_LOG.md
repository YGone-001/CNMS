# 开发进展记录

按阶段记录已完成的开发工作。详细 commit 记录请查阅各子项目 Git 历史。

---

## 阶段一：项目初始化 (2026-05)

**状态**: ✅ 已完成

### 已完成内容

- xCloud-CNMS 项目初始化 v1.4.1（Go + React + MongoDB）
- 后端框架：main.go、router、config 加载、热重载
- 前端框架：React 18 + TypeScript + Vite + Tailwind CSS
- MongoDB 数据模型设计（20+ 集合）
- JWT 认证模块（admin/operator/viewer 三级角色）
- WebSocket 实时通信框架（3 个端点）
- 进程监控探测模块
- Docker 多阶段构建 + docker-compose 编排
- build.sh 一键构建脚本
- 侧边栏扁平化 16 项菜单结构

### 关键 commit

- `4245f17` feat: 初始化 xCloud-CNMS 项目 v1.4.1
- `6314fad` refactor: 重构侧边栏菜单为扁平化9项结构
- `b467657` feat: 补充菜单项 - 配置备份、自动化任务、知识库、报表中心、系统管理、API文档

---

## 阶段二：核心功能开发 (2026-06)

**状态**: ✅ 已完成

### 已完成内容

- **故障诊断/处置**: 专业故障分析页面（5 种故障类型、信令流程图、根因定位）
- **告警中心**: 闭环管理（确认/清除/升级规则/多通道通知）
- **部署模板**: 与运维总览联动
- **业务指标**: 接入实际数据（MySQL HSS/S-CSCF + SMF Prometheus）
- **SPA 路由修复**: 健康检查端点修复
- **WebSocket 业务指标**: 统一 Socket + 部署状态 WS

### 关键 commit

- `92d9880` feat: 新增故障诊断和故障处置专业页面
- `e6f5c5e` feat: 告警中心闭环管理
- `5ca37c1` feat: 部署模板与运维总览联动
- `e40af30` feat: 业务指标接入实际数据
- `025c61a` feat: 部署状态WebSocket + 统一Socket + 页面优化
- `f5be369` fix: 修复 SPA 路由和健康检查端点

---

## 阶段三：Overview 增强与页面优化 (2026-06 下旬)

**状态**: ✅ 已完成

### 已完成内容

- **Overview 重构**: 网元表格按 EPC/5GC/IMS 分组折叠显示，div 布局解决折叠白屏
- **告警横幅**: Overview 接入 Alarm Center 真实数据
- **运行时长卡片**: 系统运行时长展示
- **操作按钮**: 查看日志跳转 / 重启调用 API
- **UE Info 增强**: MSISDN/SIP URI/会话状态图标
- **LogCenter 增强**: 多目录支持、实时流、告警关联
- **LogCenter 修复**: 日期格式名称冲突自动用目录名
- **移除废弃指标**: active_calls 和 sip_reg_success_rate
- **网元分类调整**: NF 分类逻辑重构

### 关键 commit

- `7dca07f` feat: Overview网元表格按EPC/5GC/IMS分组折叠显示
- `e82879c` fix: Overview分组表格改为div布局彻底解决折叠白屏
- `dfe936e` feat: Overview告警横幅接入Alarm Center真实数据
- `29c4b2f` feat: Overview增加系统运行时长卡片
- `a47157a` feat: Overview操作按钮落地 — 查看日志跳转/重启调用API
- `fb8da1b` feat: UE Info增强 — MSISDN/SIP URI/会话状态图标
- `86964f2` feat: LogCenter多目录+实时流+告警关联
- `89920b1` fix: LogCenter日期格式日志文件名称冲突自动用目录名
- `2a41e80` refactor: 移除active_calls和sip_reg_success_rate
- `c6d94aa` refactor: 网元分类调整

---

## 阶段四：Agent 管理与 AIOps (2026-06 末 ~ 2026-07 初)

**状态**: ✅ 已完成

### 已完成内容

- **Agent 管理**: 接入真实数据（主节点 morun），告警关联，NF 展开，重连按钮
- **API 文档**: OpenAPI 3.0 规范，交互式 Try it 调试功能，移除示例密码
- **KnowledgeBase 增强**: 种子数据、Markdown 工具栏、故障标签打通
- **StatusBar 优化**: 页面标题随页面动态变化，改用 i18n 翻译函数
- **深色模式适配**: Markdown 代码块深色模式适配
- **LogCenter 修复**: 日期滚动日志优先返回今天的文件

### 关键 commit

- `08aee26` refactor: Agent Management接入真实数据 — 主节点
- `1bb6447` feat: Agent Management增强 — 告警关联/NF展开/重连按钮
- `e61d4b2` feat: API Docs增加Try it交互调试 + 移除示例密码
- `ef7706b` fix: LogCenter日期滚动日志优先返回今天的文件
- `cb61c3a` fix: Markdown代码块深色模式适配
- `8d0384a` fix: StatusBar页面标题改用i18n翻译函数
- `05f09af` fix: StatusBar标题随页面动态变化
- `812c4ac` feat: KnowledgeBase种子数据+Markdown工具栏+故障标签打通

---

## 阶段五：文档体系与代码整理 (2026-07)

**状态**: ✅ 已完成

### 已完成内容

- 文档体系建立（architecture.md, AI_CONTEXT.md, DEV_LOG.md, TODO.md）
- 架构文档根据实际代码库全面更新（补充外部集成、WebSocket 端点、RBAC、后台服务等）
- AI_CONTEXT.md 同步更新（25 个页面、20+ 集合、完整数据流）
- DEV_LOG.md 重构为 5 个阶段

### 关键 commit

- `a5419a1` docs: 完善项目文档体系

---

## 阶段六：一键抓包功能 (2026-07-02)

**状态**: ✅ 已完成

### 已完成内容

**后端（Go）**：
- `model/capture.go` — CaptureSession 数据模型 + ProtocolPreset 类型
- `handler/capture.go` — 6 个 API handler（start/stop/sessions/download/delete/presets）
  - tcpdump 进程管理（exec.Command + Setpgid 进程组 + SIGTERM/SIGKILL）
  - BPF 注入防护（正则校验 + shell 特殊字符黑名单）
  - 后台监控 goroutine（2s 轮询 file_size/packet_count，超时/超大小自动停止）
  - 并发限制（MongoDB 查询 running 状态，同时只允许 1 个会话）
  - 资源上限（max_duration ≤ 3600s，max_size ≤ 500MB）
- `router/router.go` — 新增 6 条路由（requireOperator 保护 start/stop/delete）
- `handler/swagger.go` — OpenAPI 文档新增 Capture 分组（6 个端点 + CaptureSession schema）
- `auth/jwt.go` — 修复 RequireRole 在 auth.enabled=false 时的行为（无 claims 放行）

**前端（React/TypeScript）**：
- `pages/PacketCapture.tsx` — 完整抓包页面（904 行）
  - 标题栏 + 统计卡片 + 实时状态条（WebSocket capture_progress）+ 历史表格 + 配置弹窗
  - 12 种协议预设模板（VoLTE/SIP/Diameter/GTP/S1AP/RTP/DNS/PFCP 等）
  - useCaptureSocket hook 监听 /api/v1/monitor/ws 的 capture_progress 消息
  - i18n 全覆盖（capture.* 62 条中英文词条）
- `locales/zh.ts` / `locales/en.ts` — 新增 nav.packetCapture + capture.* 词条
- `App.tsx` — 路由 /capture + 侧边栏菜单项（fault-diagnosis 和 fault-resolution 之间）
- `components/StatusBar.tsx` — 页面标题映射 /capture → nav.packetCapture

**Bug 修复**：
- auth.enabled=false 时 requireOperator 返回 "no claims in context" 的问题
  - 根因：JWT 中间件未运行 → context 无 claims → RequireRole 拒绝
  - 修复：RequireRole 无 claims 时放行 + handler 内部 claims 为 nil 时跳过角色检查

### 新增文件

- `backend/internal/model/capture.go` (34 行)
- `backend/internal/handler/capture.go` (713 行)
- `frontend/src/pages/PacketCapture.tsx` (904 行)

### 修改文件

- `backend/internal/router/router.go` — 追加 6 条路由
- `backend/internal/handler/swagger.go` — 追加 OpenAPI 定义
- `backend/internal/auth/jwt.go` — RequireRole 修复
- `frontend/src/App.tsx` — 路由 + 侧边栏
- `frontend/src/components/StatusBar.tsx` — 页面标题映射
- `frontend/src/locales/zh.ts` — 中文 i18n
- `frontend/src/locales/en.ts` — 英文 i18n

---

## IMS 核心网配置

**状态**: 🔄 持续调优

### 已完成内容

- Kamailio P-CSCF 配置（/etc/kamailio_pcscf/）
- Kamailio S-CSCF 配置（/etc/kamailio_scscf/）
- Kamailio I-CSCF 配置（/etc/kamailio_icscf/）
- FreeSWITCH 配置（/usr/local/freeswitch/conf/）
- netCoreConf 符号链接集合建立
- 抓包脚本和按日期归档

### 配置备份

P-CSCF 已有多个备份版本：
- kamailio_pcscf.cfg.backup.20260616105451
- kamailio_pcscf.cfg.backup.20260622174324
- pcscf.cfg.backup.20260622173733
- pcscf.cfg.backup.20260622174324

---

## heplify 采集器

**状态**: 已集成

- heplify 项目已 clone 到工作区
- 独立 Git 仓库，仅 1 个 commit（CI 配置调整）
- 用于 HEP 协议抓包采集，配合 Homer 分析
- 尚未与 xCloud-CNMS 联动

---

## 阶段七：跨协议信令追踪 (2026-07-03)

**状态**: ✅ 已完成

### 已完成内容

**后端（Go）**：
- `model/signaling.go` — 6 个数据结构（SignalingMessage、MessageIdentifiers、SignalingTrace、TraceSummary、MediaQuality、TimeRange），3 个 MongoDB 集合
- `signaling/parser.go` — 4 个日志解析器（Open5GS、Kamailio、FreeSWITCH、tshark pcap），15 种协议支持
- `signaling/correlator.go` — Union-Find 跨协议关联引擎（10 维标识关联）、网元排序、摘要生成
- `signaling/hep.go` — Homer API 客户端（认证、搜索、Call Flow、格式转换）
- `handler/signaling.go` — 7 个 API handler（create/get/messages/media/list/delete/homer-status）
- `config/config.go` — 新增 HomerConfig 配置结构
- `router/router.go` — 新增 7 条信令追踪路由
- `main.go` — Homer 客户端初始化

**前端（React/TypeScript）**：
- `types/signaling.ts` — 完整类型定义（协议颜色、网元图标、查询类型、场景选项、摘要步骤）
- `pages/SignalingTrace.tsx` — 主页面（1028 行），查询面板、场景快捷按钮、追踪历史、摘要卡片、视图模式切换（Table/Ladder/Homer）
- `components/LadderDiagram.tsx` — 纯 SVG 梯形时序图（618 行），虚拟滚动、协议着色、错误标记、时间断裂、tooltip 交互
- `components/MessageDetail.tsx` — 消息详情面板（567 行），4 个 Tab（Summary/SDP/Raw/Relations），按协议类型展示不同字段
- `components/MediaQuality.tsx` — 媒体质量展示（475 行），MOS 仪表盘（ECharts）、丢包/抖动/RTD 指标卡片、rtpengine 中继映射
- `components/HomerIntegration.tsx` — Homer 集成（409 行），iframe 嵌入 + API 模式双模式
- `App.tsx` — 路由 /signaling + 侧边栏菜单项（GitBranch 图标）
- `StatusBar.tsx` — 页面标题映射
- `locales/zh.ts` / `locales/en.ts` — signalingTrace 词条

### Bug 修复

- 修复路由未注册问题（router.go 缺少信令追踪路由）
- 修复 Homer 客户端未初始化问题（main.go 缺少 SetHomer 调用）
- 修复空数据页面崩溃问题（activeTrace.entities/summary 空值访问）
- 修复已有 TS 错误（AgentManagement/LogCenter/FaultDiagnosis 未使用导入）

### 新增文件

- `backend/internal/model/signaling.go` (137 行)
- `backend/internal/signaling/parser.go` (1439 行)
- `backend/internal/signaling/correlator.go` (641 行)
- `backend/internal/signaling/hep.go` (535 行)
- `backend/internal/handler/signaling.go` (731 行)
- `frontend/src/types/signaling.ts` (321 行)
- `frontend/src/pages/SignalingTrace.tsx` (1028 行)
- `frontend/src/components/LadderDiagram.tsx` (618 行)
- `frontend/src/components/MessageDetail.tsx` (567 行)
- `frontend/src/components/MediaQuality.tsx` (475 行)
- `frontend/src/components/HomerIntegration.tsx` (409 行)

### 修改文件

- `backend/internal/config/config.go` — 新增 HomerConfig
- `backend/config/config.json` — 新增 homer 配置段
- `backend/internal/handler/handler.go` — 新增 Homer 字段和 SetHomer 方法
- `backend/internal/router/router.go` — 新增 7 条路由
- `backend/main.go` — Homer 客户端初始化
- `frontend/src/App.tsx` — 路由 + 侧边栏 + 导入
- `frontend/src/components/StatusBar.tsx` — 页面标题映射
- `frontend/src/locales/zh.ts` / `en.ts` — signalingTrace 词条

---

## 当前状态总结

| 项目 | 状态 | 说明 |
|------|------|------|
| xCloud-CNMS 后端 | ✅ 稳定 | 19 个 handler（含 signaling），3 个 WS 端点，AIOps 已接入 |
| xCloud-CNMS 前端 | ✅ 稳定 | 27 个页面（含 SignalingTrace），深色模式，i18n |
| 文档体系 | ✅ 已建立 | 5 个文档全面更新，含信令追踪 |
| IMS 配置 | 🔄 调优中 | P/S/I-CSCF 已配置，持续优化 |
| heplify | ✅ 已集成 | HEP 采集可用，未与主系统联动 |
| 一键抓包 | ✅ 已完成 | tcpdump 管理、12 种协议预设、WebSocket 实时进度、PCAP 下载 |
| 信令追踪 | ✅ 已完成 | 跨协议解析/关联/Ladder Diagram/Homer 集成 |
