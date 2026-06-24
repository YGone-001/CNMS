# xCloud-CNMS v1.4.1 变更日志

**日期:** 2026-06-01
**版本:** v1.4.1 (Bug Fix Release)

---

## 修复的缺陷

### 1. RCA 根因分析未在告警生成时触发

**问题描述:**
`RCAEngine.AnalyzeAlarm()` 方法已完整实现，但在告警插入时从未被调用。调度任务 `aiops_rca` 仅执行 `CleanOldRCA()` 清理旧数据，不触发实际分析。

**修复方案:**
- 在 `WSHandler` 结构体中添加 `rca *aiops.RCAEngine` 字段
- 在 `NewWSHandler` 初始化时创建 `RCAEngine` 实例
- 在 `insertAlarm()` 函数中，新告警插入后异步调用 `go wh.rca.AnalyzeAlarm(alarm.ID, alarm.Source, alarm.Severity)`

**影响文件:**
- `backend/internal/ws/handler.go`

**技术细节:**
- RCA 分析在新告警首次插入时触发（去重更新不触发）
- 使用 goroutine 异步执行，不阻塞告警插入流程
- 分析结果写入 `root_cause_analysis` 集合，并更新告警文档的 `root_cause_id` 字段

---

### 2. NF 自动发现 NRF URL 硬编码

**问题描述:**
NF 发现引擎在 `main.go` 中硬编码 NRF URL 为 `"http://localhost:8080"`，忽略了 Sites 集合中配置的 `nrf_url` 字段。`SetNRFURL()` 方法存在但从未被调用。

**修复方案:**
- 新增 `NewNFDiscoveryWithDB(nrfURL string, mc *mongo.Client)` 构造函数
- 新增 `loadNRFURLFromSites()` 方法，从 MongoDB `sites` 集合读取第一个启用站点的 `nrf_url`
- 在 `Discover()` 方法中优先使用 Sites 动态获取的 NRF URL
- `main.go` 改用 `NewNFDiscoveryWithDB` 构造函数

**影响文件:**
- `backend/internal/monitor/discovery.go`
- `backend/main.go`

**技术细节:**
- 每次发现周期动态读取 Sites 集合，支持运行时修改 NRF URL
- 优先级：Sites 动态 URL > 手动 SetNRFURL > 启动配置默认值
- 如果 Sites 集合为空或无启用站点，回退到默认 NRF URL

---

### 3. NetworkElements 位置树硬编码

**问题描述:**
网元管理页面的位置树 (`LOCATION_TREE`) 完全硬编码为"华南区域-江门核心 DC-茂名边缘节点"，未与 Sites API 联动。多站点管理的数据无法反映到位置树中。

**修复方案:**

**后端扩展 Site 模型:**
- 新增 `Type` 字段 (`region` / `dc` / `node`) - 站点层级类型
- 新增 `ParentID` 字段 - 父站点 ID，构建树形结构
- 新增 `NFIds` 字段 - 关联的 NF 进程名列表

**后端 API 更新:**
- `CreateSiteRequest` 支持新字段
- `CreateSite` / `UpdateSite` 处理新字段

**前端更新:**
- `Site` 接口扩展 `type`、`parent_id`、`nf_ids` 字段
- `Sites.tsx` 表单新增类型下拉框、父站点选择器、NF 进程名输入
- `Sites.tsx` 表格新增 Type 和 NF Count 列
- `NetworkElements.tsx` 从 `/api/v1/sites` API 动态加载位置树
- 保留硬编码树作为 API 返回空数据时的回退方案

**影响文件:**
- `backend/internal/model/site.go`
- `backend/internal/handler/sites.go`
- `frontend/src/types/monitor.ts`
- `frontend/src/pages/Sites.tsx`
- `frontend/src/pages/NetworkElements.tsx`

**技术细节:**
- `buildTreeFromSites()` 函数将扁平 Site 列表转换为 `TreeNode[]` 树形结构
- 通过 `parent_id` 字段建立父子关系
- 根节点为没有 `parent_id` 的站点
- 使用 `useEffect` 在组件挂载时异步获取 Sites 数据
- 如果 Sites API 返回空数据，自动回退到硬编码的默认树

---

## 数据模型变更

### Site 集合新增字段

```json
{
  "type": "dc",           // 站点类型: region | dc | node
  "parent_id": "...",     // 父站点 ObjectID (字符串)
  "nf_ids": ["amfd", "smfd", "upfd"]  // 关联的 NF 进程名列表
}
```

**兼容性:** 新字段均为可选，不影响现有数据。已有站点默认 `type` 为 `dc`，无 `parent_id`，无 `nf_ids`。

---

## 部署说明

1. 重新编译后端：`go build -o xcloud-cnms .`
2. 重启后端服务
3. 前端自动使用新代码（Vite 热更新）
4. 如需使用动态位置树，在 Sites 页面创建带层级关系的站点数据
