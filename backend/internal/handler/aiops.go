package handler

import (
	"context"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// GetAnomalies 查询异常事件
func (h *Handler) GetAnomalies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("anomaly_events")

	// 构建过滤条件
	filter := bson.M{}
	if nfName := r.URL.Query().Get("nf_name"); nfName != "" {
		filter["nf_name"] = nfName
	}
	if severity := r.URL.Query().Get("severity"); severity != "" {
		filter["severity"] = severity
	}
	if r.URL.Query().Get("active") == "true" {
		filter["resolved_at"] = nil
	}

	// 分页
	page := 1
	pageSize := 50
	if v := r.URL.Query().Get("page"); v != "" {
		if _, err := time.Parse("2006-01-02", v); err == nil {
			page = 1
		}
	}

	opts := options.Find().
		SetSort(bson.M{"detected_at": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	total, _ := coll.CountDocuments(ctx, filter)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   results,
		"total":  total,
	})
}

// GetRootCauses 查询根因分析结果
func (h *Handler) GetRootCauses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("root_cause_analysis")

	filter := bson.M{}
	if rootSource := r.URL.Query().Get("root_source"); rootSource != "" {
		filter["root_source"] = rootSource
	}

	opts := options.Find().SetSort(bson.M{"analyzed_at": -1}).SetLimit(100)

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   results,
		"total":  len(results),
	})
}

// GetPredictions 查询容量预测
func (h *Handler) GetPredictions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capacity_predictions")

	filter := bson.M{}
	if nfName := r.URL.Query().Get("nf_name"); nfName != "" {
		filter["nf_name"] = nfName
	}
	if metric := r.URL.Query().Get("metric"); metric != "" {
		filter["metric"] = metric
	}

	opts := options.Find().SetSort(bson.M{"predicted_at": -1})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   results,
		"total":  len(results),
	})
}

// GetTrends 查询趋势预警
func (h *Handler) GetTrends(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("trend_alerts")

	filter := bson.M{}
	if nfName := r.URL.Query().Get("nf_name"); nfName != "" {
		filter["nf_name"] = nfName
	}
	if direction := r.URL.Query().Get("direction"); direction != "" {
		filter["direction"] = direction
	}

	opts := options.Find().SetSort(bson.M{"detected_at": -1}).SetLimit(100)

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   results,
		"total":  len(results),
	})
}

// GetAIOpsSummary AIOps 概览摘要
func (h *Handler) GetAIOpsSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 统计各类型数据
	anomalyColl := h.Mongo.Database.Collection("anomaly_events")
	trendColl := h.Mongo.Database.Collection("trend_alerts")
	predColl := h.Mongo.Database.Collection("capacity_predictions")
	rcaColl := h.Mongo.Database.Collection("root_cause_analysis")

	// 活跃异常数
	activeAnomalies, _ := anomalyColl.CountDocuments(ctx, bson.M{"resolved_at": nil})

	// 严重异常数
	criticalAnomalies, _ := anomalyColl.CountDocuments(ctx, bson.M{
		"resolved_at": nil,
		"severity":    "critical",
	})
	majorAnomalies, _ := anomalyColl.CountDocuments(ctx, bson.M{
		"resolved_at": nil,
		"severity":    "major",
	})

	// 趋势预警数（最近 24 小时）
	last24h := time.Now().Add(-24 * time.Hour)
	trendAlerts, _ := trendColl.CountDocuments(ctx, bson.M{
		"detected_at": bson.M{"$gte": last24h},
	})

	// 容量预测数
	predictions, _ := predColl.CountDocuments(ctx, bson.M{})

	// 根因分析数（最近 7 天）
	last7d := time.Now().AddDate(0, 0, -7)
	rootCauses, _ := rcaColl.CountDocuments(ctx, bson.M{
		"analyzed_at": bson.M{"$gte": last7d},
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"summary": map[string]interface{}{
			"anomaly_count":      activeAnomalies,
			"critical_anomalies": criticalAnomalies,
			"major_anomalies":    majorAnomalies,
			"trend_alert_count":  trendAlerts,
			"prediction_count":   predictions,
			"root_cause_count":   rootCauses,
		},
	})
}
