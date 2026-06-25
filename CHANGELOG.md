# 变更日志

所有重要更改都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.4.1] - 2026-06-01

### 修复

- **RCA 根因分析未在告警生成时触发**
  - 在 `WSHandler` 中添加 `rca *aiops.RCAEngine` 字段
  - 在 `insertAlarm()` 函数中异步调用 RCA 分析
  - 影响文件: `backend/internal/ws/handler.go`

- **NF 自动发现 NRF URL 硬编码**
  - 新增 `NewNFDiscoveryWithDB()` 构造函数
  - 从 MongoDB `sites` 集合动态读取 NRF URL
  - 影响文件: `backend/internal/monitor/discovery.go`, `backend/main.go`

- **NetworkElements 位置树硬编码**
  - 扩展 Site 模型，新增 `Type`、`ParentID`、`NFIds` 字段
  - 前端从 `/api/v1/sites` API 动态加载位置树
  - 影响文件: `backend/internal/model/site.go`, `frontend/src/pages/NetworkElements.tsx`

### 数据模型变更

Site 集合新增字段:
```json
{
  "type": "dc",           // 站点类型: region | dc | node
  "parent_id": "...",     // 父站点 ID
  "nf_ids": ["amfd", "smfd", "upfd"]  // 关联的 NF 进程名列表
}
```

### 部署说明

1. 重新编译后端: `go build -o xcloud-cnms .`
2. 重启后端服务
3. 前端自动使用新代码（Vite 热更新）
4. 如需使用动态位置树，在 Sites 页面创建带层级关系的站点数据

---

## [1.4.0] - 2026-05-15

### 新增

- **智能运维 (AIOps)**
  - 异常检测模块
  - 趋势分析模块
  - 根因分析 (RCA) 模块
  - 预测分析模块

- **知识库系统**
  - 文章管理（创建/编辑/删除）
  - 分类和标签系统
  - 解决方案关联

- **报表系统**
  - 性能报表生成
  - 自定义报表模板
  - 数据导出功能

- **配置备份**
  - 配置文件备份管理
  - 版本历史记录
  - 配置恢复操作

- **站点管理**
  - 多站点支持
  - 站点层级结构
  - NRF URL 配置

### 优化

- 前端 UI 全面升级（Cyber-tech 主题）
- 侧边栏菜单重构（扁平化 15 项）
- WebSocket 实时监控优化
- 告警系统增强

---

## [1.3.0] - 2026-04-20

### 新增

- **用户权限系统**
  - 多用户支持
  - 角色权限控制（Admin/Operator/Viewer）
  - JWT 认证

- **审计日志**
  - 操作记录追踪
  - 日志查询和导出

- **定时任务**
  - Cron 任务管理
  - 任务执行历史

### 优化

- 数据库连接池优化
- API 响应速度提升
- 前端加载性能优化

---

## [1.2.0] - 2026-03-10

### 新增

- **告警系统**
  - 实时告警推送
  - 告警确认/清除
  - Webhook 通知
  - 告警历史查询

- **指标监控**
  - 历史指标查询
  - 趋势图表展示
  - 自定义时间范围

### 优化

- WebSocket 连接稳定性
- 告警去重逻辑
- 前端响应式布局

---

## [1.1.0] - 2026-02-01

### 新增

- **网络拓扑**
  - 5GC SBA 架构可视化
  - 网元连接关系展示

- **订户管理**
  - 订户 CRUD 操作
  - 批量导入/导出

- **MML 终端**
  - Man-Machine Language 命令执行
  - 命令历史记录

### 优化

- 数据模型优化
- API 接口规范化
- 前端组件重构

---

## [1.0.0] - 2026-01-01

### 新增

- **核心功能**
  - 实时进程监控
  - CPU/内存/磁盘监控
  - WebSocket 实时数据推送

- **Web UI**
  - 响应式仪表盘
  - 进程状态表格
  - 资源使用图表

- **后端服务**
  - Go HTTP 服务器
  - MongoDB 数据存储
  - RESTful API

- **部署支持**
  - Docker 多阶段构建
  - Docker Compose 配置
  - 一键构建脚本

---

## 版本说明

- **主版本号**: 不兼容的 API 更改
- **次版本号**: 向下兼容的功能性新增
- **修订号**: 向下兼容的问题修正
