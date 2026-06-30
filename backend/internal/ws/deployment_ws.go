package ws

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"
	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/monitor"
	"xcloud-cnms/internal/mongo"
)

// DeploymentWSHandler 部署状态 WebSocket 处理器
type DeploymentWSHandler struct {
	mongo       *mongo.Client
	mysqlDB     *sql.DB
	scscfDB     *sql.DB
	probe       *monitor.Probe
	authEnabled bool
	template    *monitor.DeploymentTemplate
}

// NewDeploymentWSHandler 创建部署状态 WebSocket 处理器
func NewDeploymentWSHandler(mc *mongo.Client, mysqlDB *sql.DB, scscfDB *sql.DB, authEnabled bool) *DeploymentWSHandler {
	return &DeploymentWSHandler{
		mongo:       mc,
		mysqlDB:     mysqlDB,
		scscfDB:     scscfDB,
		authEnabled: authEnabled,
		probe:       monitor.New(nil),
		template:    monitor.GetDefaultTemplate(),
	}
}

// SetTemplate 设置部署模板
func (h *DeploymentWSHandler) SetTemplate(template *monitor.DeploymentTemplate) {
	h.template = template
	h.probe = monitor.NewWithTemplate(template)
}

// DeploymentWSMessage WebSocket 消息类型
type DeploymentWSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// ProcessStatusMessage 进程状态消息（兼容旧的 MonitorSnapshot）
type ProcessStatusMessage struct {
	Timestamp int64                    `json:"timestamp"`
	Processes []monitor.ProcessStatus  `json:"processes"`
}

// DeploymentStatusMessage 部署状态消息
type DeploymentStatusMessage struct {
	Template  string                      `json:"template"`
	Summary   monitor.StatusSummary       `json:"summary"`
	Processes []monitor.ProcessStatusEnhanced `json:"processes"`
}

// BusinessMetricsMessage 业务指标消息
type BusinessMetricsMessage struct {
	EPCOnlineUsers    int64   `json:"epc_online_users"`
	IMSOnlineUsers    int64   `json:"ims_online_users"`
	TotalSubscribers  int64   `json:"total_subscribers"`
	TotalIMSUsers     int64   `json:"total_ims_users"`
	ActiveCalls       int64   `json:"active_calls"`
	SIPRegSuccessRate float64 `json:"sip_reg_success_rate"`
}

// MonitorDeploymentWS 部署状态 WebSocket 连接
func (h *DeploymentWSHandler) MonitorDeploymentWS(w http.ResponseWriter, r *http.Request) {
	if h.authEnabled {
		token := r.URL.Query().Get("token")
		if token == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if token == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "missing authentication token"})
			return
		}
		if _, err := auth.ValidateToken(token); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": err.Error()})
			return
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("deployment ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("deployment ws client connected: %s", r.RemoteAddr)

	// 每 5 秒推送一次部署状态
	statusTicker := time.NewTicker(5 * time.Second)
	defer statusTicker.Stop()

	// 每 10 秒推送一次业务指标
	metricsTicker := time.NewTicker(10 * time.Second)
	defer metricsTicker.Stop()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// 立即推送一次初始数据
	h.pushDeploymentStatus(conn)
	h.pushBusinessMetrics(conn)

	for {
		select {
		case <-done:
			log.Printf("deployment ws client disconnected: %s", r.RemoteAddr)
			return
		case <-statusTicker.C:
			h.pushDeploymentStatus(conn)
		case <-metricsTicker.C:
			h.pushBusinessMetrics(conn)
		}
	}
}

// pushDeploymentStatus 推送部署状态（同时推送兼容格式的进程状态）
func (h *DeploymentWSHandler) pushDeploymentStatus(conn *websocket.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 获取部署状态
	status, err := h.probe.GetCurrentStatusEnhanced()
	if err != nil {
		log.Printf("deployment ws probe error: %v", err)
		return
	}

	// 获取当前模板
	templateName := "auto"
	if h.mongo != nil {
		coll := h.mongo.Database.Collection("settings")
		var result struct {
			Value string `bson:"value"`
		}
		if err := coll.FindOne(ctx, bson.M{"key": "deployment_template"}).Decode(&result); err == nil {
			templateName = result.Value
		}
	}

	// 推送部署状态
	msg := DeploymentWSMessage{
		Type: "deployment_status",
		Data: DeploymentStatusMessage{
			Template:  templateName,
			Summary:   status.Summary,
			Processes: status.Processes,
		},
	}

	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("deployment ws write error: %v", err)
		return
	}

	// 同时推送兼容格式的进程状态（供旧的 MonitorContext 使用）
	processStatuses := make([]monitor.ProcessStatus, len(status.Processes))
	for i, p := range status.Processes {
		processStatuses[i] = monitor.ProcessStatus{
			Name:          p.Name,
			PID:           p.PID,
			CPUPercent:    p.CPUPercent,
			MemoryRSS:     p.MemoryRSS,
			MemoryVMS:     p.MemoryVMS,
			MemoryPercent: p.MemoryPercent,
			Running:       p.State == monitor.StateRunning,
		}
	}

	processMsg := DeploymentWSMessage{
		Type: "process_status",
		Data: ProcessStatusMessage{
			Timestamp: time.Now().Unix(),
			Processes: processStatuses,
		},
	}

	if err := conn.WriteJSON(processMsg); err != nil {
		log.Printf("deployment ws write error: %v", err)
	}
}

// pushBusinessMetrics 推送业务指标
func (h *DeploymentWSHandler) pushBusinessMetrics(conn *websocket.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	metrics := BusinessMetricsMetrics{}

	// 从 MongoDB 获取 EPC/5GC 订户数据
	if h.mongo != nil {
		open5gsDB := h.mongo.GetClient().Database("open5gs")
		subscribersColl := open5gsDB.Collection("subscribers")

		totalCount, err := subscribersColl.CountDocuments(ctx, bson.M{})
		if err == nil {
			metrics.TotalSubscribers = totalCount
		}
	}

	// 从 Prometheus metrics 获取 EPC 在线用户
	epcOnlineUsers, err := getEPCOnlineUsersFromMetrics()
	if err == nil {
		metrics.EPCOnlineUsers = epcOnlineUsers
	}

	// 从 MySQL (hss_db) 获取总 IMS 用户数
	if h.mysqlDB != nil {
		var totalIMSUsers int64
		if err := h.mysqlDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM hss_db.impi").Scan(&totalIMSUsers); err == nil {
			metrics.TotalIMSUsers = totalIMSUsers
		}
	}

	// 从 S-CSCF 获取 IMS 在线用户
	if h.scscfDB != nil {
		var onlineIMSUsers int64
		query := `
			SELECT COUNT(DISTINCT c.id)
			FROM contact c
			JOIN impu_contact ic ON ic.contact_id = c.id
			JOIN impu i ON i.id = ic.impu_id
			WHERE c.expires IS NOT NULL AND c.expires > NOW()
		`
		err := h.scscfDB.QueryRowContext(ctx, query).Scan(&onlineIMSUsers)
		if err == nil {
			metrics.IMSOnlineUsers = onlineIMSUsers
		} else {
			log.Printf("deployment ws scscf query error: %v", err)
		}
	}

	// 计算 SIP 注册成功率
	if metrics.TotalIMSUsers > 0 {
		metrics.SIPRegSuccessRate = float64(metrics.IMSOnlineUsers) / float64(metrics.TotalIMSUsers) * 100
	} else {
		metrics.SIPRegSuccessRate = 100.0
	}

	msg := DeploymentWSMessage{
		Type: "business_metrics",
		Data: metrics,
	}

	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("deployment ws write error: %v", err)
	}
}

// BusinessMetricsMetrics 业务指标
type BusinessMetricsMetrics struct {
	EPCOnlineUsers    int64   `json:"epc_online_users"`
	IMSOnlineUsers    int64   `json:"ims_online_users"`
	TotalSubscribers  int64   `json:"total_subscribers"`
	TotalIMSUsers     int64   `json:"total_ims_users"`
	ActiveCalls       int64   `json:"active_calls"`
	SIPRegSuccessRate float64 `json:"sip_reg_success_rate"`
}

// getEPCOnlineUsersFromMetrics 从 Prometheus metrics 获取 EPC 在线用户
func getEPCOnlineUsersFromMetrics() (int64, error) {
	metricsURL := "http://127.0.0.4:9090/metrics"
	client := &http.Client{Timeout: 5 * time.Second}

	resp, err := client.Get(metricsURL)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch metrics: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	// 解析 metrics，查找 ues_active 指标
	lines := strings.Split(string(body), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "ues_active") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				var value int64
				if _, err := fmt.Sscanf(parts[1], "%d", &value); err == nil {
					return value, nil
				}
			}
		}
	}

	return 0, nil
}
