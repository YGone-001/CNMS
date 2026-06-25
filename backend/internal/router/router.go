package router

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/handler"
	"xcloud-cnms/internal/middleware"
	"xcloud-cnms/internal/ws"
)

// 应用启动时间（用于健康检查）
var startTime = time.Now()

// spaHandler 实现 SPA Fallback：
// 请求的文件存在则返回该文件，否则返回 index.html
type spaHandler struct {
	fs fs.FS
}

func (s *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 清理路径
	path := strings.TrimPrefix(r.URL.Path, "/")

	// 根路径直接返回 index.html
	if path == "" || path == "/" {
		path = "index.html"
	}

	// 尝试在 embed FS 中打开请求的文件
	f, err := s.fs.Open(path)
	if err == nil {
		defer f.Close()
		// 检查是否为目录，目录也回退到 index.html
		if stat, err := f.Stat(); err == nil && !stat.IsDir() {
			// 设置正确的 Content-Type
			ext := getExt(path)
			if contentType, ok := mimeTypes[ext]; ok {
				w.Header().Set("Content-Type", contentType)
			}
			http.FileServer(http.FS(s.fs)).ServeHTTP(w, r)
			return
		}
	}

	// 文件不存在或是目录，回退到 index.html（SPA 路由兜底）
	r.URL.Path = "/"
	http.FileServer(http.FS(s.fs)).ServeHTTP(w, r)
}

// MIME 类型映射
var mimeTypes = map[string]string{
	".html": "text/html; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".js":   "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg":  "image/svg+xml",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".gif":  "image/gif",
	".ico":  "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf":  "font/ttf",
}

func getExt(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '.' {
			return path[i:]
		}
		if path[i] == '/' {
			return ""
		}
	}
	return ""
}

// New 创建并返回路由注册完成的 http.ServeMux
// staticFS 为嵌入的前端 dist 文件系统（已通过 fs.Sub 剥离前缀），传 nil 时跳过静态托管
func New(h *handler.Handler, wh *ws.WSHandler, lsh *ws.LogStreamHandler, dh *handler.DiscoveryHandler, staticFS fs.FS) *http.ServeMux {
	mux := http.NewServeMux()

	// RBAC 中间件定义
	requireAdmin := auth.RequireRole("admin")
	requireOperator := auth.RequireRole("admin", "operator")

	// 健康检查端点（不需要认证，供运维和监控使用）
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
		})
	})

	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		// 检查 MongoDB 连接状态
		if err := h.CheckReadiness(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status": "not_ready",
				"error":  err.Error(),
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ready",
		})
	})

	// 登录接口（不需要认证）
	mux.HandleFunc("/api/v1/auth/login", h.Login)

	// API 文档（不需要认证）
	mux.HandleFunc("/api/docs", h.SwaggerSpec)

	// API 路由注册
	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/health":
			h.Health(w, r)
		case r.URL.Path == "/api/v1/mml/execute":
			requireOperator(h.MMLExecute)(w, r)
		case r.URL.Path == "/api/v1/monitor/ws":
			wh.MonitorWS(w, r)
		case r.URL.Path == "/api/v1/alarms":
			h.GetAlarmHistory(w, r)
		case r.URL.Path == "/api/v1/nf/logs":
			h.GetNFLogs(w, r)
		case r.URL.Path == "/api/v1/metrics/history":
			h.GetMetricsHistory(w, r)
		case r.URL.Path == "/api/v1/audit/logs":
			h.GetAuditLogs(w, r)
		// 定时任务
		case r.URL.Path == "/api/v1/tasks" && r.Method == http.MethodGet:
			h.GetScheduledTasks(w, r)
		case r.URL.Path == "/api/v1/tasks" && r.Method == http.MethodPost:
			requireOperator(h.CreateTask)(w, r)
		case r.URL.Path == "/api/v1/tasks" && r.Method == http.MethodPut:
			requireOperator(h.UpdateTask)(w, r)
		case r.URL.Path == "/api/v1/tasks" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteTask)(w, r)
		// 用户管理
		case r.URL.Path == "/api/v1/users" && r.Method == http.MethodGet:
			h.GetUsers(w, r)
		case r.URL.Path == "/api/v1/users" && r.Method == http.MethodPost:
			requireAdmin(h.CreateUser)(w, r)
		case r.URL.Path == "/api/v1/users" && r.Method == http.MethodPut:
			requireAdmin(h.UpdateUser)(w, r)
		case r.URL.Path == "/api/v1/users" && r.Method == http.MethodDelete:
			requireAdmin(h.DeleteUser)(w, r)
		// 通知通道
		case r.URL.Path == "/api/v1/notifications/channels" && r.Method == http.MethodGet:
			h.GetNotificationChannels(w, r)
		case r.URL.Path == "/api/v1/notifications/channels" && r.Method == http.MethodPost:
			requireOperator(h.CreateNotificationChannel)(w, r)
		case r.URL.Path == "/api/v1/notifications/channels" && r.Method == http.MethodPut:
			requireOperator(h.UpdateNotificationChannel)(w, r)
		case r.URL.Path == "/api/v1/notifications/channels" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteNotificationChannel)(w, r)
		// 升级规则
		case r.URL.Path == "/api/v1/notifications/escalation" && r.Method == http.MethodGet:
			h.GetEscalationRules(w, r)
		case r.URL.Path == "/api/v1/notifications/escalation" && r.Method == http.MethodPost:
			requireOperator(h.CreateEscalationRule)(w, r)
		case r.URL.Path == "/api/v1/notifications/escalation" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteEscalationRule)(w, r)
		case r.URL.Path == "/api/v1/notifications/logs":
			h.GetNotificationLogs(w, r)
		case r.URL.Path == "/api/v1/interface-health":
			h.GetInterfaceHealth(w, r)
		case r.URL.Path == "/api/v1/nf/logs/ws":
			lsh.StreamLogs(w, r)
		case r.URL.Path == "/api/v1/nf/logs/files":
			lsh.GetLogFiles(w, r)
		// 订户管理 REST API
		case r.URL.Path == "/api/v1/subscribers" && r.Method == http.MethodGet:
			h.GetSubscribers(w, r)
		case r.URL.Path == "/api/v1/subscribers" && r.Method == http.MethodPost:
			requireOperator(h.CreateSubscriber)(w, r)
		case r.URL.Path == "/api/v1/subscribers" && r.Method == http.MethodPut:
			requireOperator(h.UpdateSubscriber)(w, r)
		case r.URL.Path == "/api/v1/subscribers" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteSubscriber)(w, r)
		// 告警规则
		case r.URL.Path == "/api/v1/alarm-rules" && r.Method == http.MethodGet:
			h.GetAlarmRules(w, r)
		case r.URL.Path == "/api/v1/alarm-rules" && r.Method == http.MethodPost:
			requireOperator(h.CreateAlarmRule)(w, r)
		case r.URL.Path == "/api/v1/alarm-rules" && r.Method == http.MethodPut:
			requireOperator(h.UpdateAlarmRule)(w, r)
		case r.URL.Path == "/api/v1/alarm-rules" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteAlarmRule)(w, r)
		// 电信 KPI
		case r.URL.Path == "/api/v1/telecom-kpi":
			h.GetTelecomKPI(w, r)
		// P3: 站点管理
		case r.URL.Path == "/api/v1/sites" && r.Method == http.MethodGet:
			h.GetSites(w, r)
		case r.URL.Path == "/api/v1/sites" && r.Method == http.MethodPost:
			requireOperator(h.CreateSite)(w, r)
		case r.URL.Path == "/api/v1/sites" && r.Method == http.MethodPut:
			requireOperator(h.UpdateSite)(w, r)
		case r.URL.Path == "/api/v1/sites" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteSite)(w, r)
		// P3: 配置备份
		case r.URL.Path == "/api/v1/backups" && r.Method == http.MethodGet:
			h.GetBackups(w, r)
		case r.URL.Path == "/api/v1/backups" && r.Method == http.MethodPost:
			requireOperator(h.CreateBackup)(w, r)
		case r.URL.Path == "/api/v1/backups" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteBackup)(w, r)
		case r.URL.Path == "/api/v1/backups/diff":
			h.GetBackupDiff(w, r)
		case r.URL.Path == "/api/v1/backups/versions":
			h.GetBackupVersions(w, r)
		// P3: 报表导出
		case r.URL.Path == "/api/v1/reports/metrics/csv":
			h.GetMetricsCSV(w, r)
		case r.URL.Path == "/api/v1/reports/alarms/csv":
			h.GetAlarmsCSV(w, r)
		case r.URL.Path == "/api/v1/reports/summary":
			h.GetReportSummary(w, r)
		// P3: NF 自动发现
		case r.URL.Path == "/api/v1/nf/discovery":
			dh.TriggerDiscovery(w, r)
		case r.URL.Path == "/api/v1/nf/discovered":
			dh.GetDiscovered(w, r)
		// P4: AIOps
		case r.URL.Path == "/api/v1/aiops/anomalies":
			h.GetAnomalies(w, r)
		case r.URL.Path == "/api/v1/aiops/root-causes":
			h.GetRootCauses(w, r)
		case r.URL.Path == "/api/v1/aiops/predictions":
			h.GetPredictions(w, r)
		case r.URL.Path == "/api/v1/aiops/trends":
			h.GetTrends(w, r)
		case r.URL.Path == "/api/v1/aiops/summary":
			h.GetAIOpsSummary(w, r)
		// P5: 知识库管理
		case r.URL.Path == "/api/v1/solutions" && r.Method == http.MethodGet:
			h.GetSolutions(w, r)
		case strings.HasPrefix(r.URL.Path, "/api/v1/solutions/search"):
			h.SearchSolutions(w, r)
		case r.URL.Path == "/api/v1/solutions/stats":
			h.GetSolutionStats(w, r)
		case r.URL.Path == "/api/v1/solutions" && r.Method == http.MethodPost:
			requireOperator(h.CreateSolution)(w, r)
		case r.URL.Path == "/api/v1/solutions" && r.Method == http.MethodPut:
			requireOperator(h.UpdateSolution)(w, r)
		case r.URL.Path == "/api/v1/solutions" && r.Method == http.MethodDelete:
			requireOperator(h.DeleteSolution)(w, r)
		case r.URL.Path == "/api/v1/solutions/upload" && r.Method == http.MethodPost:
			requireOperator(h.UploadFile)(w, r)
		case strings.HasPrefix(r.URL.Path, "/api/v1/solutions/files/"):
			h.DownloadFile(w, r)
		case strings.HasPrefix(r.URL.Path, "/api/v1/solutions/"):
			h.GetSolution(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// 应用限流 + 认证中间件
	finalHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 限流: 每秒 20 请求，突发容量 40
		middleware.RateLimiter(20, 40, apiHandler.ServeHTTP)(w, r)
	})

	if h.Auth.Enabled {
		mux.HandleFunc("/api/", auth.AuthMiddleware(finalHandler.ServeHTTP))
	} else {
		mux.Handle("/api/", finalHandler)
	}

	// 前端静态资源托管（embed 模式 + SPA Fallback）
	if staticFS != nil {
		mux.Handle("/", &spaHandler{fs: staticFS})
	}

	// 根路径也由 spaHandler 处理（确保 / 返回 index.html）

	return mux
}
