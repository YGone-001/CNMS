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

## 阶段八：SignalingTrace 白屏修复 + 日志解析修复 (2026-07-03 ~ 07-06)

**状态**: ✅ 已完成

### 问题一：点击 Start Trace 后白屏

**直接原因**：追踪历史列表渲染时，`trace.entities` 为 `null`（MongoDB 返回空数组时可能序列化为 null），`trace.entities.length` 触发 `TypeError: Cannot read properties of null (reading 'length')`

**修复内容**：
- 新增 `SignalingErrorBoundary` 类组件包裹页面
- `trace.entities.length` 增加 `trace.entities &&` 空值检查
- `trace.query_type.toUpperCase()` 增加空值保护
- 所有 API 调用增加 HTTP 状态码检查和错误日志
- `fetchTraceStatus`/`handleSelectTrace` 增加字段默认值填充
- `LadderDiagram` 增加 `entities`/`messages` 空值检查

### 问题二：信令追踪无法捕获数据

**根因**：
1. Open5GS 日志路径错误（硬编码 `/var/log/open5gs/`，实际在 `/usr/local/src/open5gs/install/var/log/open5gs/`）
2. Kamailio 日志文件名不匹配（硬编码 `kamailio-pcscf.log`，实际为 `pcscf-2026-07-06.log`）
3. Kamailio 日志正则太严格（要求 `<script>:` 前缀，实际日志有多种模块格式）
4. SIP 方法正则太严格（要求 `"METHOD sip:... SIP/2.0"` 格式，Kamailio 日志只有 `METHOD sip:...`）
5. SIP URI/IMSI 提取逻辑缺失（Kamailio 日志没有标准 SIP From/To 头）

**修复内容**：
- `handler/signaling.go`：修正 Open5GS 日志路径，新增 `findKamailioLogs()` 动态查找函数
- `signaling/parser.go`：修正 Kamailio 日志正则（hostname 可选、进程名匹配 pcscf/scscf/icscf）
- `signaling/parser.go`：新增 `reSIPMethodSimple` 匹配 Kamailio 格式
- `signaling/parser.go`：`tryParseSIP` 增加从 body 直接提取 SIP URI 和 IMSI 的逻辑
- `signaling/parser.go`：`extractIMSIdentifiers` 增加从 SIP URI 提取 IMSI 的正则

### 修改文件

- `frontend/src/pages/SignalingTrace.tsx` — ErrorBoundary + 空值安全 + 错误处理
- `frontend/src/components/LadderDiagram.tsx` — 空值检查

---

## 阶段九：信令架构重构 — tshark 持续抓包 + HEP 监听 (2026-07-06)

### 目标
移除日志扫描方式，改为底层真实信令捕获：tshark 持续抓包 + Kamailio HEP 直接监听。

### 已完成内容

**新建文件：**
- `backend/internal/signaling/capture_daemon.go` (367 行) — tshark 持续抓包守护进程，环形缓冲区
- `backend/internal/signaling/tshark_query.go` (1130 行) — 从 pcap 环形缓冲区按条件查询信令
- `backend/internal/signaling/hep_listener.go` (500 行) — UDP 9060 监听 Kamailio HEPv3 SIP 消息

**重构文件：**
- `backend/internal/signaling/parser.go` — 从 1478 行精简到 82 行（删除日志解析和旧 tshark 解析）
- `backend/internal/handler/signaling.go` — runSignalingTrace 改为三级优先：HEP → Homer → tshark
- `backend/internal/handler/handler.go` — 新增 TsharkQ/CapDaemon/HEPListener 字段
- `backend/internal/config/config.go` — 新增 SignalingCaptureConfig/HEPListenerConfig
- `backend/main.go` — 启动 CaptureDaemon + TsharkQuery + HEPListener
- `backend/internal/router/router.go` — 新增 /signaling/capture/status + /signaling/hep/status 路由
- `backend/config/config.json` — 新增 signaling_capture + hep_listener 配置段

### Bug 修复
- editcap 时间过滤使用 UTC 导致 pcap 包全部被过滤 → 改为本地时间
- tshark 显示过滤无结果时返回错误 → 改为返回 nil（无消息非错误）
- tshark 显示过滤对 S1AP/SIP/Diameter 无效（不携带 IMSI）→ 无结果时回退全量查询
- IMSI 正则不匹配 Open5GS MME 日志格式 `IMSI:[xxx]` → 改为大小写+多格式

### 验证结果
```
Trace: completed, 4875 messages, 9 entities
Entities: [UE, eNB, MME, HSS, SGW, SMF, UPF, P-CSCF, S-CSCF]
Protocols: PFCP(268), S1AP(80), Diameter(76), GTPv2C(56), SIP(20)
```

---

## 阶段十：信令协议接口-网元映射修正 (2026-07-07)

**状态**: ✅ 已完成

### 问题

1. Diameter 接口字段为空 — tshark JSON 字段名 `diameter.applicationId` 与代码中 `diameter.app.id` 不一致
2. Diameter 网元硬编码 MME→HSS — 未根据 App-ID 和命令码区分 I-CSCF/S-CSCF/HSS
3. SIP 接口映射错误 — Mw 被误标为 UE↔S-CSCF，ISC 被误标为 UE↔AS
4. tshark 查询 fallback 逻辑粗暴 — 无过滤全量查询返回随机500条 Diameter+PFCP
5. SMF/UPF 错误判定 — PFCP 消息硬编码为 SMF→UPF，即使 SMF/UPF 未运行

### 修复内容

**tshark_query.go — Diameter 映射修正：**
- `diameterInterface()`: 修正 App-ID 映射，App-ID=0 改为 "Base"（非 S6a），S6a 标准 ID=16777251
- 新增 App-ID: Gxx(16777239), SWx(16777250), S6b(16777252), N7(16777267), S13(16777272)
- `parseDiameterFromLayers()`: 字段名从 `diameter.app.id` 改为 `diameter.applicationId`
- `parseDiameterFromLayers()`: 方向检测从 `diameter.flags.proxiable` 改为 `diameter.flags_tree.diameter.flags.request`
- `guessDiameterEntities()`: Cx 接口根据命令码区分（300=I-CSCF, 301=S-CSCF, 302=I-CSCF, 303=S-CSCF, 304/305=HSS→S-CSCF, 280=双向对等）
- `extractDiameterOriginHost()`: 新增，从 AVP tree 提取 Origin-Host

**tshark_query.go — SIP 映射修正：**
- `guessSIPInterface()`: 任一端口命中即可判断（5060/5061=Gm, 6060=Mw, 7060=ISC）
- `guessSIPEntities()`: 新增，根据接口+方向推断网元
  - Gm: UE↔P-CSCF, Mw: P-CSCF↔I-CSCF, ISC: S-CSCF↔AS

**tshark_query.go — 查询逻辑优化：**
- fallback 逻辑：无过滤全量查询 → `frame contains "IMSI值"` 精确搜索 → 按协议逐个查询
- 新增 `gtpv2Direction()`: GTPv2C 消息类型判断方向（偶数=请求, 奇数=响应）
- 新增 `pfcpDirection()`: PFCP 消息类型 1-50=请求, 51-100=响应

**tshark_query.go — 其他协议方向检测：**
- S1AP: 通过 `s1ap.successfulOutcome`/`s1ap.unsuccessfulOutcome` 判断响应
- NGAP: 同 S1AP
- GTPv2C: 新增 S5/S8, S10 接口映射
- PFCP: N4 接口 SMF↔UPF，响应方向交换

**hep_listener.go — SIP 映射修正：**
- 删除 `guessSIPSourceEntity()`，改用 `guessSIPEntities()`

### 验证结果

```
Trace: completed, 455 messages
Protocols: SIP(415), Diameter(40)
SIP: P-CSCF → UE [Gm] (415 条响应)
Diameter: HSS → S-CSCF [Cx] (27), HSS → I-CSCF [Cx] (13)
```

### 已知限制

- pcap 使用 Linux cooked-mode capture (sll)，tshark JSON 对 TCP 协议(SIP/Diameter)解析不完整
- SIP 的 method/status_code/direction 字段为空（tshark JSON 未包含 SIP 层详情）
- Diameter 的 IMSI/Origin-Host 等 AVP 未从 JSON 提取
- 跨协议关联(SIP↔Diameter)依赖 IMSI 标识提取，当前受限于 tshark JSON 输出

---

## 阶段十一：tshark JSON 输出修复 + 跨协议关联增强 (2026-07-07)

**状态**: ✅ 已完成

### 问题根因

1. **`-j` 参数导致 SIP/Diameter 字段丢失** — tshark `-T json -j "sip diameter ..."` 会输出过滤后的子树（如 `{"filtered": "sip.Request-Line"}`），丢失 `sip.Method`、`sip.Status-Code`、`sip.from.user` 等关键字段
2. **Diameter AVP 在 JSON 中不可访问** — `Origin-Host`、`User-Name`（IMSI）、`Session-Id` 等 AVP 在 `-T json` 输出中只有原始 hex，不作为独立 key
3. **缺少 TCP 流重组选项** — 未使用 `-2`（两遍模式）和 `tcp.check_checksum:FALSE`
4. **跨协议关联标识符未填充** — IMPU/IMPI/UE IPv4/SessionID 从未被任何解析器提取

### 修复内容

**tshark_query.go — 核心修复：**
- 移除 `-j` 参数，恢复完整的协议树输出
- 添加 `-2 -o tcp.desegment_tcp_streams:TRUE -o tcp.check_checksum:FALSE` 选项
- 新增 `findInMap()` 递归查找函数，修复 SIP 字段访问路径
- 新增 `runTsharkFields()` — 用 `-T fields` 补充 JSON 无法提取的 Diameter AVP
- 新增 `supplementMessages()` — 按时间戳匹配合并 fields 数据到 JSON 解析结果
- 新增 `extractIMSI()` — 从 SIP URI 提取 15 位 IMSI
- `parseSIPFromLayers` 重写：使用 `findInMap` 递归查找 SIP 嵌套字段
- `parseGTPv2FromLayers` 增强：提取 Cause 和 UE IPv4 (PAA)
- 修复 `pfcp.message_type` → `pfcp.msg_type` 字段名错误
- 清理死代码：删除 `tsharkJSONEntry`/`tsharkJSONSource`/`guessGTPv2Interface`

**correlator.go — 关联增强：**
- `checkIMSRegOK` 兼容 `cseq_method` 和 `cseq` 两种 detail key
- `checkCallOK` 修复：200 OK 只匹配 INVITE 的 CSeq，避免误判
- `checkSessionOK` 修复：GTPv2 成功改为 Cause=16（非 HTTP 200-299）
- SUPI/IMSI 匹配增强：支持更多 MCC 前缀（460/417/310/262/208 等）

**capture_daemon.go：**
- 添加 `-o tcp.check_checksum:FALSE` 选项

**handler/signaling.go：**
- HEP 有 SIP 数据时，tshark 跳过 SIP 消息（避免重复）
- 追踪状态增加 `no_data`（所有数据源返回 0 条消息时）

### 验证结果

```
SIP: 286/288 消息有 Method（2 条响应只有 Status-Code，预期行为）
Diameter: 7/7 消息有 Origin-Host（fields 补充）
Fields supplement: 696 records merged into 295 messages
```

### 已知限制

- `-T json` 对 Diameter AVP 的提取仍依赖 `-T fields` 补充（双查询开销）
- NAS 方向检测仍使用默认 "request"（需从 SCTP 端口判断）
- pcap 使用 sll 封装，部分 TCP 协议解析仍有局限

---

## 当前状态总结

| 项目 | 状态 | 说明 |
|------|------|------|
| xCloud-CNMS 后端 | ✅ 稳定 | 19 个 handler，4 个 WS 端点，AIOps 已接入 |
| xCloud-CNMS 前端 | ✅ 稳定 | 27 个页面（含 SignalingTrace），深色模式，i18n，ErrorBoundary |
| 文档体系 | ✅ 已建立 | 6 个文档全面更新 |
| IMS 配置 | 🔄 调优中 | P/S/I-CSCF 已配置，持续优化 |
| 一键抓包 | ✅ 已完成 | tcpdump 管理、12 种协议预设、WebSocket 实时进度 |
| 信令持续抓包 | ✅ 已完成 | CaptureDaemon tshark 环形缓冲区 + TsharkQuery 查询引擎 |
| HEP 监听 | ✅ 已完成 | UDP 9060 接收 Kamailio siptrace，50000 条缓冲区 |
| 信令追踪 | ✅ 已完成 | 三级数据源 + Union-Find 关联 + Ladder Diagram |
| 协议接口映射 | ✅ 已修正 | Diameter/SIP/GTPv2/PFCP/S1AP/NGAP/NAS/SGsAP 全面修正 |

### 信令数据源架构（2026-07-07 更新）

```
优先级 1: Kamailio → HEPv3 → :9060/udp → HEPListener → SIP 消息缓冲区
优先级 2: Homer API → 已存储的 SIP 消息（HEP 无数据时）
优先级 3: tshark 持续抓包 → /var/spool/xcloud/signaling/ring_*.pcap → TsharkQuery
           → frame contains "IMSI值" 精确匹配（非无过滤全量查询）
```

### 配置项（config.json）

```json
"signaling_capture": { "enabled": true, "interface": "any", "ring_dir": "/var/spool/xcloud/signaling", "ring_file_size_mb": 100, "ring_file_count": 20 }
"hep_listener": { "enabled": true, "listen_addr": ":9060", "buffer_size": 50000 }
```
