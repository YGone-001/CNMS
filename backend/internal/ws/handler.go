package ws

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"
	"xcloud-cnms/internal/aiops"
	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/monitor"
	"xcloud-cnms/internal/mongo"
	"xcloud-cnms/internal/notify"
)

// WSHandler WebSocket 处理器
type WSHandler struct {
	probe       *monitor.Probe
	mongo       *mongo.Client
	prevStatus  map[string]bool
	webhookURL  string
	minLevel    string
	httpClient  *http.Client
	authEnabled bool
	notifier    *notify.Service
	rca         *aiops.RCAEngine
}

// NewWSHandler 创建 WebSocket 处理器实例
func NewWSHandler(mc *mongo.Client, webhookURL, minLevel string, authEnabled bool) *WSHandler {
	return &WSHandler{
		probe:       monitor.New(nil),
		mongo:       mc,
		prevStatus:  make(map[string]bool),
		webhookURL:  webhookURL,
		minLevel:    minLevel,
		httpClient:  &http.Client{Timeout: 10 * time.Second},
		authEnabled: authEnabled,
		notifier:    notify.New(mc),
		rca:         aiops.NewRCAEngine(mc),
	}
}

// validateWSToken 从 query param 或 header 中提取并验证 JWT
func (wh *WSHandler) validateWSToken(r *http.Request) error {
	if !wh.authEnabled {
		return nil
	}

	// 优先从 query param 获取
	token := r.URL.Query().Get("token")
	if token == "" {
		// 回退到 Authorization header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	if token == "" {
		return fmt.Errorf("missing authentication token")
	}

	_, err := auth.ValidateToken(token)
	return err
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// 允许同源请求和开发环境
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // 非浏览器客户端
		}
		host := r.Host
		return strings.Contains(origin, host) || strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1")
	},
}

// MonitorWS 建立 WebSocket 连接，每 2 秒推送一次进程状态
func (wh *WSHandler) MonitorWS(w http.ResponseWriter, r *http.Request) {
	if err := wh.validateWSToken(r); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": err.Error()})
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("ws client connected: %s", r.RemoteAddr)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// 指标持久化定时器（每 30 秒存储一次到 MongoDB）
	metricsTicker := time.NewTicker(30 * time.Second)
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

	for {
		select {
		case <-done:
			log.Printf("ws client disconnected: %s", r.RemoteAddr)
			return
		case <-ticker.C:
			status, err := wh.probe.GetCurrentStatus()
			if err != nil {
				log.Printf("ws probe error: %v", err)
				continue
			}

			wh.checkAlarms(status)

			if err := conn.WriteJSON(status); err != nil {
				log.Printf("ws write error: %v", err)
				return
			}
		case <-metricsTicker.C:
			// 持久化当前快照到 metrics 集合
			go wh.persistMetrics()
		}
	}
}

var severityOrder = map[string]int{"critical": 0, "major": 1, "minor": 2, "warning": 3}

func (wh *WSHandler) shouldNotify(severity string) bool {
	if wh.webhookURL == "" {
		return false
	}
	min, ok := severityOrder[wh.minLevel]
	if !ok {
		min = 1
	}
	s, ok := severityOrder[severity]
	if !ok {
		return false
	}
	return s <= min
}

// getAlarmRules 从 MongoDB 读取告警阈值规则，提供默认值
func (wh *WSHandler) getAlarmRules() map[string]model.AlarmRule {
	defaults := map[string]model.AlarmRule{
		"cpu_high":    {Name: "cpu_high", Threshold: 80, Severity: "major", Enabled: true},
		"memory_high": {Name: "memory_high", Threshold: 80, Severity: "minor", Enabled: true},
		"process_down": {Name: "process_down", Threshold: 0, Severity: "critical", Enabled: true},
	}

	if wh.mongo == nil {
		return defaults
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	coll := wh.mongo.Database.Collection("alarm_rules")
	cursor, err := coll.Find(ctx, bson.M{"enabled": true})
	if err != nil {
		return defaults
	}
	defer cursor.Close(ctx)

	var rules []model.AlarmRule
	if err := cursor.All(ctx, &rules); err != nil {
		return defaults
	}

	for _, rule := range rules {
		defaults[rule.Name] = rule
	}
	return defaults
}

func (wh *WSHandler) checkAlarms(status *monitor.SystemStatus) {
	if wh.mongo == nil {
		return
	}

	rules := wh.getAlarmRules()

	for _, p := range status.Processes {
		wasRunning := wh.prevStatus[p.Name]
		isRunning := p.Running

		if wasRunning && !isRunning {
			if rule, ok := rules["process_down"]; ok && rule.Enabled {
				wh.insertAlarm(rule.Severity, p.Name, "Process "+p.Name+" is not running")
			}
		}

		if isRunning {
			if rule, ok := rules["cpu_high"]; ok && rule.Enabled && p.CPUPercent > rule.Threshold {
				wh.insertAlarm(rule.Severity, p.Name, fmt.Sprintf("High CPU usage: %.1f%% (threshold: %.0f%%)", p.CPUPercent, rule.Threshold))
			}
			if rule, ok := rules["memory_high"]; ok && rule.Enabled && float64(p.MemoryPercent) > rule.Threshold {
				wh.insertAlarm(rule.Severity, p.Name, fmt.Sprintf("High memory usage: %.1f%% (threshold: %.0f%%)", p.MemoryPercent, rule.Threshold))
			}
		}

		wh.prevStatus[p.Name] = isRunning
	}
}

// persistMetrics 持久化当前进程指标到 MongoDB
func (wh *WSHandler) persistMetrics() {
	if wh.mongo == nil {
		return
	}

	status, err := wh.probe.GetCurrentStatus()
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := wh.mongo.Database.Collection("metrics")

	var docs []interface{}
	now := time.Now()
	for _, p := range status.Processes {
		docs = append(docs, model.MetricPoint{
			Name:          p.Name,
			PID:           p.PID,
			CPUPercent:    p.CPUPercent,
			MemoryRSS:     p.MemoryRSS,
			MemoryVMS:     p.MemoryVMS,
			MemoryPercent: p.MemoryPercent,
			Running:       p.Running,
			Timestamp:     now,
		})
	}

	if len(docs) > 0 {
		if _, err := coll.InsertMany(ctx, docs); err != nil {
			log.Printf("metrics persist error: %v", err)
		}
	}

	// 清理 7 天前的旧数据
	weekAgo := now.AddDate(0, 0, -7)
	coll.DeleteMany(ctx, bson.M{"timestamp": bson.M{"$lt": weekAgo}})
}

// insertAlarm 插入告警，支持去重：同 source+severity 的未清除告警只更新计数
func (wh *WSHandler) insertAlarm(severity, source, message string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	coll := wh.mongo.Database.Collection("alarms")
	now := time.Now()

	// 查找同 source + severity 的未清除告警
	filter := bson.M{
		"source":   source,
		"severity": severity,
		"cleared":  false,
	}

	var existing model.Alarm
	err := coll.FindOne(ctx, filter).Decode(&existing)

	if err == nil {
		// 已存在 -> 更新计数和最近时间
		coll.UpdateOne(ctx, bson.M{"_id": existing.ID}, bson.M{
			"$set": bson.M{"timestamp": now, "message": message},
			"$inc": bson.M{"count": 1},
		})
	} else {
		// 不存在 -> 插入新告警
		alarm := model.Alarm{
			Severity:        severity,
			Source:          source,
			Message:         message,
			Timestamp:       now,
			FirstOccurrence: now,
			Count:           1,
		}
		result, err := coll.InsertOne(ctx, alarm)
		if err != nil {
			log.Printf("alarm insert error: %v", err)
			return
		}
		alarm.ID = result.InsertedID.(bson.ObjectID)

		// 触发多通道通知
		go wh.notifier.NotifyAlarm(alarm)

		// 触发根因分析
		go wh.rca.AnalyzeAlarm(alarm.ID, alarm.Source, alarm.Severity)
	}
}

func (wh *WSHandler) sendWebhook(severity, source, message string) {
	payload := map[string]interface{}{
		"severity":  severity,
		"source":    source,
		"message":   message,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("webhook marshal error: %v", err)
		return
	}

	resp, err := wh.httpClient.Post(wh.webhookURL, "application/json", bytes.NewReader(data))
	if err != nil {
		log.Printf("webhook send error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("webhook returned status %d", resp.StatusCode)
	}
}
