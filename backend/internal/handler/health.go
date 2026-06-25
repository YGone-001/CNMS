package handler

import (
	"context"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// 应用启动时间（用于健康检查）
var startTime = time.Now()

// Health 返回应用健康状态（用于 /api/health 端点）
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	// 检查 MongoDB 连接
	mongoStatus := "ok"
	if err := h.Mongo.Ping(ctx); err != nil {
		mongoStatus = "error"
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"version":   "1.4.1",
		"uptime":    time.Since(startTime).String(),
		"components": map[string]interface{}{
			"mongodb": mongoStatus,
		},
	})
}

// GetInterfaceHealth 返回 NF 接口健康状态
func (h *Handler) GetInterfaceHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("interface_health")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "health": results})
}

// GetTelecomKPI 返回电信域 KPI 数据
func (h *Handler) GetTelecomKPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("telecom_kpi")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if results == nil {
		results = []bson.M{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "kpi": results})
}
