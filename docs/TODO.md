# TODO

待开发任务清单。按优先级排列，不重复 DEV_LOG 中已完成内容。

---

## P0 - 当前优先处理

- [ ] xCloud-CNMS 生产环境安全加固

  - 背景：当前 auth.enabled 默认为 false，密码为明文默认值
  - 影响范围：config.json, auth 模块
  - 验证方式：启用 JWT 认证后登录测试，修改默认密码

- [ ] HTTPS / Nginx 反向代理配置

  - 背景：当前仅 HTTP，生产环境需要 HTTPS
  - 影响范围：部署架构，Nginx 配置
  - 验证方式：HTTPS 访问正常，WebSocket wss:// 连接正常

---

## P1 - 近期处理

- [x] 信令追踪模块完善

  - Phase 7-12 已完成，架构重构为 tshark 持续抓包 + HEP 监听 + 两级缓存 + 跨层关联
  - 已完成：
    - ✅ 白屏修复（ErrorBoundary + 空值安全）
    - ✅ 移除日志扫描，改为底层真实信令捕获
    - ✅ CaptureDaemon tshark 环形缓冲区持续抓包 + 磁盘上限 6GB 自动清理
    - ✅ TsharkQuery 从 pcap 按 IMSI/SIP/TEID 等条件查询
    - ✅ HEPListener UDP 9060 监听 Kamailio siptrace，mongo=true 启用 L2 overflow
    - ✅ 三级数据源优先级：HEP → Homer → tshark
    - ✅ 复合 IMSI 过滤器（e212.imsi + diameter.User-Name + nas_5gs.mm.suci.msin + frame contains）
    - ✅ SIP URI IMSI 正则提取（sip:15位数字@）
    - ✅ Identity Context Tree 跨层关联（SIP ↔ NAS/S1AP 通过 Call-ID → IMSI 映射）
    - ✅ 两级缓存架构（L1 无锁 ring buffer + L2 MongoDB overflow）
    - ✅ Diameter 接口映射修正（Cx/S6a/Sh/Rx/Gx/N7/SWx/S6b/Gxx/S13/Base）
    - ✅ Diameter 网元推断（根据 App-ID + 命令码区分 I-CSCF/S-CSCF/HSS）
    - ✅ SIP 接口映射修正（Gm=UE↔P-CSCF, Mw=P-CSCF↔I-CSCF, ISC=S-CSCF↔AS）
    - ✅ GTPv2C/PFCP/S1AP/NGAP/NAS/SGsAP 方向检测和接口映射
    - ✅ 前端 HEP 状态指示器 + 数据源标签 + 跨层关联标识
    - ✅ 后端 Model 补 data_source / cross_layer 字段，各数据源赋值
    - ✅ pcap 文件名时间预筛选（性能优化，271→2 文件）
    - ✅ Correlator 跨层合并后 CrossLayer 标记
    - ✅ 前端 HEP Status 10 秒自动刷新
    - ✅ 端到端验证通过（IMSI 417010000000002 → 542 消息，5 网元）
  - 已知限制：
    - pcap 使用 sll 封装，tshark JSON 对 TCP 协议解析不完整
    - SIP 的 method/status_code/direction 字段可能为空
    - 5G NAS SUCI 加密场景下 IMSI 无法从 NAS 层提取
  - 待完善：
    - OpenAPI 文档补丁（swagger.go 未更新）
    - 前端 i18n 词条提取
    - Ladder Diagram 性能优化（>500 条消息时）

- [x] tshark JSON 对 TCP 协议解析问题

  - 根因：tshark `-j` 参数导致输出过滤后的子树，丢失 SIP Method/Status-Code 等字段
  - 修复：移除 `-j` 参数 + 添加 `-2` 两遍模式 + TCP 重组选项 + `-T fields` 补充 Diameter AVP
  - 验证：SIP 286/288 消息有 Method，Diameter 7/7 有 Origin-Host

- [x] 跨协议关联逻辑完善（SIP↔Diameter 交互流）

  - 修复：CSeq method 提取 + checkIMSRegOK 兼容 cseq/cseq_method + checkCallOK 200 OK 匹配 INVITE
  - 修复：GTPv2 状态码改为 Cause=16 + SUPI/IMSI 匹配增强 + UE IPv4 提取
  - 待完善：SIP↔Diameter 交互流的端到端验证（需实际 VoLTE 呼叫测试）

- [ ] IMS VoLTE 呼叫流程端到端验证

  - 背景：Kamailio + FreeSWITCH 已配置，需要完整呼叫测试
  - 影响范围：P-CSCF、S-CSCF、FreeSWITCH 配置
  - 验证方式：UE 注册成功，VoLTE 呼叫建立，RTP 媒体流正常

- [ ] 信令追踪 OpenAPI 文档更新

  - 背景：swagger.go 未更新信令追踪 API 定义
  - 影响范围：API 文档页面
  - 验证方式：/docs 页面显示信令追踪 API 定义

- [ ] 自定义告警规则引擎

  - 背景：当前告警阈值硬编码（CPU>80%, 内存>80%），alarm_rules CRUD API 已实现但前端配置界面未完成
  - 影响范围：monitor 模块，告警配置，前端 AlarmCenter
  - 验证方式：通过前端界面自定义告警规则并生效

---

## P2 - 后续优化

- [ ] MongoDB 索引优化

  - 背景：当前未创建专用索引，大数据量时查询可能变慢
  - 影响范围：alarms、metrics、audit_logs 集合
  - 验证方式：`explain()` 查询计划确认索引命中

- [ ] 自动化备份脚本

  - 背景：MongoDB 数据备份需要定时执行
  - 影响范围：运维流程
  - 验证方式：定时任务执行，备份文件生成，恢复测试通过

- [ ] Prometheus + Grafana 监控集成

  - 背景：xCloud-CNMS 内置监控适合运维，Prometheus 适合基础设施监控
  - 影响范围：部署架构，监控体系
  - 验证方式：Prometheus 采集 xCloud-CNMS 指标，Grafana 展示

- [ ] 前端单元测试覆盖

  - 背景：vitest 已配置但测试覆盖不足
  - 影响范围：frontend/src/ 所有页面组件
  - 验证方式：`npm test` 通过，覆盖率报告

- [ ] 自定义报表模板

  - 背景：当前报表功能基础（CSV 导出 + 汇总），需要支持自定义模板
  - 影响范围：Reports 页面，后端报表模块
  - 验证方式：创建自定义报表模板并生成报表

- [ ] 通知渠道前端配置界面

  - 背景：notification_channels CRUD API 已实现，前端配置界面待开发
  - 影响范围：通知设置页面（新建或集成到 Sites/Settings）
  - 验证方式：通过界面配置 Webhook/邮件通知渠道并发送测试通知

- [ ] PCAP 文件自动清理

  - 背景：/tmp/xcloud-captures/ 下的 pcap 文件超过 24 小时未下载应自动清理
  - 影响范围：scheduler 模块，新增定时任务类型
  - 验证方式：24h 后文件被自动删除，MongoDB 记录同步清理

---

## 暂缓 / 风险项

- [ ] Xiaomi MiMo 集成

  - 暂缓原因：/opt/xiaomi-mimo 路径当前为空，MiMo 尚未部署
  - 风险：需要确认 MiMo 部署方式和 API 接口

- [ ] 插件机制

  - 暂缓原因：架构设计中规划但未开始实现
  - 风险：需要设计插件 API 和沙箱机制

- [ ] 多站点分布式部署

  - 暂缓原因：当前为单机开发环境，Agent 功能已实现但未实际部署多节点
  - 风险：网络拓扑、数据同步、故障隔离需要验证

- [ ] MySQL 与 MongoDB 共存

  - 暂缓原因：IMS 侧使用 MySQL（Kamailio），xCloud-CNMS 使用 MongoDB，两套数据库需要协调
  - 风险：运维复杂度增加，备份策略需要分别制定

---

## 已完成（归档）

- [x] xCloud-CNMS 项目初始化和 Git 仓库建立
- [x] 文档体系建立（architecture.md, AI_CONTEXT.md, DEV_LOG.md, TODO.md）
- [x] 架构文档根据代码库全面更新
- [x] Overview 网元分组折叠、告警横幅、运行时长卡片
- [x] Agent Management 接入真实数据 + 告警关联
- [x] API Docs 交互式 Try it 调试
- [x] LogCenter 日期滚动 + 实时流 + 告警关联
- [x] KnowledgeBase 种子数据 + Markdown 工具栏
- [x] StatusBar 动态页面标题 + i18n
- [x] 深色模式 Markdown 代码块适配
- [x] 一键抓包功能（后端 6 API + 前端页面 + 12 种协议预设 + WebSocket 实时进度）
- [x] auth.enabled=false 时 RequireRole 放行修复（解决 "no claims in context" 报错）
- [x] 信令追踪白屏修复（ErrorBoundary + 空值安全）
- [x] 信令追踪日志解析修复（Open5GS/Kamailio 路径、正则、IMSI 提取）
- [x] 信令架构重构：移除日志扫描，改为 tshark 持续抓包 + HEP 监听（Phase 9）
- [x] CaptureDaemon tshark 环形缓冲区持续抓包（20×100MB，BPF 信令过滤）
- [x] TsharkQuery pcap 查询引擎（editcap 时间裁剪 + mergecap 合并 + 显示过滤）
- [x] HEPListener UDP 9060 监听 Kamailio siptrace（HEPv3 解析，50000 条缓冲区）
- [x] IMSI 正则修复（支持 Open5GS MME 格式 `IMSI:[xxx]`）
- [x] editcap 时间过滤 UTC bug 修复（改为本地时间）
- [x] tshark JSON 输出修复：移除 `-j` 参数 + 添加 TCP 流重组选项 + `-T fields` 补充 Diameter AVP
- [x] 跨协议关联增强：CSeq 提取 + GTPv2 Cause=16 + SUPI/IMSI 匹配 + UE IPv4 + checkCallOK 修复
