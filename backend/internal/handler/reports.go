package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"math"
	"net/http"
	"time"

	"xcloud-cnms/internal/monitor"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ReportSummary 统计摘要
type ReportSummary struct {
	Period          string  `json:"period"`
	TotalNFs        int     `json:"total_nfs"`
	OnlineNFs       int     `json:"online_nfs"`
	OfflineNFs      int     `json:"offline_nfs"`
	AvgCPU          float64 `json:"avg_cpu"`
	AvgMemory       float64 `json:"avg_memory"`
	MaxCPU          float64 `json:"max_cpu"`
	MaxCPUName      string  `json:"max_cpu_name"`
	MaxMemory       float64 `json:"max_memory"`
	MaxMemoryName   string  `json:"max_memory_name"`
	TotalAlarms     int     `json:"total_alarms"`
	CriticalAlarms  int     `json:"critical_alarms"`
	MajorAlarms     int     `json:"major_alarms"`
	MinorAlarms     int     `json:"minor_alarms"`
	WarningAlarms   int     `json:"warning_alarms"`
	Acknowledged    int     `json:"acknowledged_alarms"`
	Unacknowledged  int     `json:"unacknowledged_alarms"`
	Availability    float64 `json:"availability_pct"`
}

// GetMetricsCSV 导出指标数据为 CSV
// GET /api/v1/reports/metrics/csv
func (h *Handler) GetMetricsCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("metrics")

	// 解析时间范围
	filter := bson.M{}
	if from := r.URL.Query().Get("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			filter["timestamp"] = bson.M{"$gte": t}
		}
	}
	if to := r.URL.Query().Get("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			if _, ok := filter["timestamp"]; ok {
				filter["timestamp"].(bson.M)["$lte"] = t
			} else {
				filter["timestamp"] = bson.M{"$lte": t}
			}
		}
	}
	if name := r.URL.Query().Get("name"); name != "" {
		filter["name"] = name
	}

	opts := options.Find().SetSort(bson.M{"timestamp": 1}).SetLimit(50000)
	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	// 设置 CSV 响应头
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=metrics_%s.csv", time.Now().Format("20060102_150405")))
	w.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// 写入表头
	writer.Write([]string{"timestamp", "name", "pid", "cpu_percent", "memory_rss", "memory_vms", "memory_percent", "running"})

	for cursor.Next(ctx) {
		var doc struct {
			Timestamp     time.Time `bson:"timestamp"`
			Name          string    `bson:"name"`
			PID           int       `bson:"pid"`
			CPUPercent    float64   `bson:"cpu_percent"`
			MemoryRSS     int64     `bson:"memory_rss"`
			MemoryVMS     int64     `bson:"memory_vms"`
			MemoryPercent float64   `bson:"memory_percent"`
			Running       bool      `bson:"running"`
		}
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		writer.Write([]string{
			doc.Timestamp.Format(time.RFC3339),
			doc.Name,
			fmt.Sprintf("%d", doc.PID),
			fmt.Sprintf("%.2f", doc.CPUPercent),
			fmt.Sprintf("%d", doc.MemoryRSS),
			fmt.Sprintf("%d", doc.MemoryVMS),
			fmt.Sprintf("%.2f", doc.MemoryPercent),
			fmt.Sprintf("%t", doc.Running),
		})
	}
}

// GetAlarmsCSV 导出告警数据为 CSV
// GET /api/v1/reports/alarms/csv
func (h *Handler) GetAlarmsCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("alarms")

	filter := bson.M{}
	if severity := r.URL.Query().Get("severity"); severity != "" {
		filter["severity"] = severity
	}
	if source := r.URL.Query().Get("source"); source != "" {
		filter["source"] = source
	}

	opts := options.Find().SetSort(bson.M{"timestamp": 1}).SetLimit(50000)
	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=alarms_%s.csv", time.Now().Format("20060102_150405")))
	w.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(w)
	defer writer.Flush()

	writer.Write([]string{"timestamp", "severity", "source", "message", "count", "acknowledged", "cleared"})

	for cursor.Next(ctx) {
		var doc struct {
			Timestamp    time.Time `bson:"timestamp"`
			Severity     string    `bson:"severity"`
			Source       string    `bson:"source"`
			Message      string    `bson:"message"`
			Count        int       `bson:"count"`
			Acknowledged bool      `bson:"acknowledged"`
			Cleared      bool      `bson:"cleared"`
		}
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		writer.Write([]string{
			doc.Timestamp.Format(time.RFC3339),
			doc.Severity,
			doc.Source,
			doc.Message,
			fmt.Sprintf("%d", doc.Count),
			fmt.Sprintf("%t", doc.Acknowledged),
			fmt.Sprintf("%t", doc.Cleared),
		})
	}
}

// round2 四舍五入到 2 位小数
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// GetReportSummary 生成统计摘要（数据源与 Dashboard 一致）
// GET /api/v1/reports/summary
func (h *Handler) GetReportSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	period := "24h"
	if p := r.URL.Query().Get("period"); p != "" {
		switch p {
		case "1h", "7d", "30d":
			period = p
		}
	}

	summary := ReportSummary{Period: period}

	// ---- 实时进程数据（与 Dashboard 同源） ----
	templateName := h.getDeploymentTemplate()
	templates := monitor.GetDefaultTemplates()
	template, ok := templates[templateName]
	if !ok {
		template = monitor.GetDefaultTemplate()
	}
	probe := monitor.NewWithTemplate(template)
	status, err := probe.GetCurrentStatusEnhanced()
	if err == nil {
		var maxCPU, maxMem float64
		var maxCPUName, maxMemName string
		var totalCPU, totalMem float64
		var count int

		for _, p := range status.Processes {
			summary.TotalNFs++
			if p.State == monitor.StateRunning {
				summary.OnlineNFs++
			} else {
				summary.OfflineNFs++
			}
			totalCPU += p.CPUPercent
			totalMem += float64(p.MemoryPercent)
			count++
			if p.CPUPercent > maxCPU {
				maxCPU = p.CPUPercent
				maxCPUName = p.Name
			}
			if float64(p.MemoryPercent) > maxMem {
				maxMem = float64(p.MemoryPercent)
				maxMemName = p.Name
			}
		}
		if count > 0 {
			summary.AvgCPU = round2(totalCPU / float64(count))
			summary.AvgMemory = round2(totalMem / float64(count))
		}
		summary.MaxCPU = round2(maxCPU)
		summary.MaxCPUName = maxCPUName
		summary.MaxMemory = round2(maxMem)
		summary.MaxMemoryName = maxMemName

		if summary.TotalNFs > 0 {
			summary.Availability = round2(float64(summary.OnlineNFs) / float64(summary.TotalNFs) * 100)
		}
	}

	// ---- 告警统计（仅统计未清除的活跃告警） ----
	alarmsColl := h.Mongo.Database.Collection("alarms")
	activeFilter := bson.M{"cleared": false}

	alarmPipeline := bson.A{
		bson.M{"$match": activeFilter},
		bson.M{"$group": bson.M{
			"_id":   "$severity",
			"count": bson.M{"$sum": 1},
		}},
	}
	alarmCursor, err := alarmsColl.Aggregate(ctx, alarmPipeline)
	if err == nil {
		defer alarmCursor.Close(ctx)
		for alarmCursor.Next(ctx) {
			var doc struct {
				ID    string `bson:"_id"`
				Count int    `bson:"count"`
			}
			if err := alarmCursor.Decode(&doc); err != nil {
				continue
			}
			summary.TotalAlarms += doc.Count
			switch doc.ID {
			case "critical":
				summary.CriticalAlarms = doc.Count
			case "major":
				summary.MajorAlarms = doc.Count
			case "minor":
				summary.MinorAlarms = doc.Count
			case "warning":
				summary.WarningAlarms = doc.Count
			}
		}
	}

	ackCount, _ := alarmsColl.CountDocuments(ctx, bson.M{"cleared": false, "acknowledged": true})
	summary.Acknowledged = int(ackCount)
	summary.Unacknowledged = summary.TotalAlarms - summary.Acknowledged

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"summary": summary,
	})
}
