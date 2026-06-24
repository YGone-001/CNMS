package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

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

// GetReportSummary 生成统计摘要
// GET /api/v1/reports/summary
func (h *Handler) GetReportSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	// 时间范围：默认最近 24 小时
	period := "24h"
	from := time.Now().Add(-24 * time.Hour)
	if p := r.URL.Query().Get("period"); p != "" {
		switch p {
		case "1h":
			from = time.Now().Add(-1 * time.Hour)
			period = "1h"
		case "7d":
			from = time.Now().AddDate(0, 0, -7)
			period = "7d"
		case "30d":
			from = time.Now().AddDate(0, 0, -30)
			period = "30d"
		}
	}

	summary := ReportSummary{Period: period}

	// 指标统计
	metricsColl := h.Mongo.Database.Collection("metrics")

	// 最近一条每个 NF 的快照
	pipeline := bson.A{
		bson.M{"$match": bson.M{"timestamp": bson.M{"$gte": from}}},
		bson.M{"$sort": bson.M{"timestamp": -1}},
		bson.M{"$group": bson.M{
			"_id":           "$name",
			"cpu_percent":   bson.M{"$first": "$cpu_percent"},
			"memory_percent": bson.M{"$first": "$memory_percent"},
			"running":       bson.M{"$first": "$running"},
		}},
	}
	cursor, err := metricsColl.Aggregate(ctx, pipeline)
	if err == nil {
		defer cursor.Close(ctx)
		var maxCPU, maxMem float64
		var maxCPUName, maxMemName string
		var totalCPU, totalMem float64
		var count int

		for cursor.Next(ctx) {
			var doc struct {
				ID            string  `bson:"_id"`
				CPUPercent    float64 `bson:"cpu_percent"`
				MemoryPercent float64 `bson:"memory_percent"`
				Running       bool    `bson:"running"`
			}
			if err := cursor.Decode(&doc); err != nil {
				continue
			}
			count++
			summary.TotalNFs++
			if doc.Running {
				summary.OnlineNFs++
			} else {
				summary.OfflineNFs++
			}
			totalCPU += doc.CPUPercent
			totalMem += doc.MemoryPercent
			if doc.CPUPercent > maxCPU {
				maxCPU = doc.CPUPercent
				maxCPUName = doc.ID
			}
			if doc.MemoryPercent > maxMem {
				maxMem = doc.MemoryPercent
				maxMemName = doc.ID
			}
		}
		if count > 0 {
			summary.AvgCPU = float64(int(totalCPU/float64(count)*100)) / 100
			summary.AvgMemory = float64(int(totalMem/float64(count)*100)) / 100
		}
		summary.MaxCPU = maxCPU
		summary.MaxCPUName = maxCPUName
		summary.MaxMemory = maxMem
		summary.MaxMemoryName = maxMemName

		if summary.TotalNFs > 0 {
			summary.Availability = float64(int(float64(summary.OnlineNFs)/float64(summary.TotalNFs)*10000)) / 100
		}
	}

	// 告警统计
	alarmsColl := h.Mongo.Database.Collection("alarms")
	alarmFilter := bson.M{"timestamp": bson.M{"$gte": from}}

	// 按严重级别统计
	alarmPipeline := bson.A{
		bson.M{"$match": alarmFilter},
		bson.M{"$group": bson.M{
			"_id":     "$severity",
			"count":   bson.M{"$sum": 1},
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

	// 已确认/未确认统计
	ackFilter := bson.M{"timestamp": bson.M{"$gte": from}, "acknowledged": true}
	ackCount, _ := alarmsColl.CountDocuments(ctx, ackFilter)
	summary.Acknowledged = int(ackCount)
	summary.Unacknowledged = summary.TotalAlarms - summary.Acknowledged

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"summary": summary,
	})
}
