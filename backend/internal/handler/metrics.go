package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// metricsHistoryResponse 指标历史响应
type metricsHistoryResponse struct {
	Status  string              `json:"status"`
	Message string              `json:"message,omitempty"`
	Data    []model.MetricPoint `json:"data,omitempty"`
	Total   int                 `json:"total,omitempty"`
}

// GetMetricsHistory 查询指标历史数据
func (h *Handler) GetMetricsHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, metricsHistoryResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	filter := bson.M{}

	// 进程名过滤
	if name := r.URL.Query().Get("name"); name != "" {
		filter["name"] = name
	}

	// 时间范围过滤
	if from := r.URL.Query().Get("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			if filter["timestamp"] == nil {
				filter["timestamp"] = bson.M{}
			}
			filter["timestamp"].(bson.M)["$gte"] = t
		}
	}
	if to := r.URL.Query().Get("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			if filter["timestamp"] == nil {
				filter["timestamp"] = bson.M{}
			}
			filter["timestamp"].(bson.M)["$lte"] = t
		}
	}

	// 默认最近 1 小时
	if filter["timestamp"] == nil {
		filter["timestamp"] = bson.M{"$gte": time.Now().Add(-1 * time.Hour)}
	}

	// 分页
	page := 1
	pageSize := 500
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5000 {
			pageSize = n
		}
	}

	coll := h.Mongo.Database.Collection("metrics")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, metricsHistoryResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().
		SetSort(bson.M{"timestamp": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, metricsHistoryResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var data []model.MetricPoint
	if err := cursor.All(ctx, &data); err != nil {
		writeJSON(w, http.StatusInternalServerError, metricsHistoryResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if data == nil {
		data = []model.MetricPoint{}
	}

	writeJSON(w, http.StatusOK, metricsHistoryResponse{Status: "ok", Message: "ok", Data: data, Total: int(total)})
}

// auditLogResponse 审计日志响应
type auditLogResponse struct {
	Status  string           `json:"status"`
	Message string           `json:"message,omitempty"`
	Logs    []model.AuditLog `json:"logs,omitempty"`
	Total   int              `json:"total,omitempty"`
}

// GetAuditLogs 查询审计日志
func (h *Handler) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, auditLogResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	filter := bson.M{}

	if user := r.URL.Query().Get("user"); user != "" {
		filter["user"] = user
	}
	if action := r.URL.Query().Get("action"); action != "" {
		filter["action"] = action
	}
	if resource := r.URL.Query().Get("resource"); resource != "" {
		filter["resource"] = resource
	}

	page := 1
	pageSize := 50
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			pageSize = n
		}
	}

	coll := h.Mongo.Database.Collection("audit_logs")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, auditLogResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().
		SetSort(bson.M{"timestamp": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, auditLogResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var logs []model.AuditLog
	if err := cursor.All(ctx, &logs); err != nil {
		writeJSON(w, http.StatusInternalServerError, auditLogResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if logs == nil {
		logs = []model.AuditLog{}
	}

	writeJSON(w, http.StatusOK, auditLogResponse{Status: "ok", Message: "ok", Logs: logs, Total: int(total)})
}

// scheduledTaskResponse 定时任务响应
type scheduledTaskResponse struct {
	Status  string               `json:"status"`
	Message string               `json:"message,omitempty"`
	Tasks   []model.ScheduledTask `json:"tasks,omitempty"`
	Total   int                  `json:"total,omitempty"`
}

// GetScheduledTasks 查询定时任务列表
func (h *Handler) GetScheduledTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, scheduledTaskResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("scheduled_tasks")

	total, err := coll.CountDocuments(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, scheduledTaskResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, scheduledTaskResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var tasks []model.ScheduledTask
	if err := cursor.All(ctx, &tasks); err != nil {
		writeJSON(w, http.StatusInternalServerError, scheduledTaskResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if tasks == nil {
		tasks = []model.ScheduledTask{}
	}

	writeJSON(w, http.StatusOK, scheduledTaskResponse{Status: "ok", Message: "ok", Tasks: tasks, Total: int(total)})
}

// usersResponse 用户列表响应
type usersResponse struct {
	Status  string       `json:"status"`
	Message string       `json:"message,omitempty"`
	Users   []model.User `json:"users,omitempty"`
	Total   int          `json:"total,omitempty"`
}

// GetUsers 查询用户列表
func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, usersResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("users")

	total, err := coll.CountDocuments(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, usersResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, usersResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var users []model.User
	if err := cursor.All(ctx, &users); err != nil {
		writeJSON(w, http.StatusInternalServerError, usersResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if users == nil {
		users = []model.User{}
	}

	// 清除密码字段
	for i := range users {
		users[i].Password = ""
	}

	writeJSON(w, http.StatusOK, usersResponse{Status: "ok", Message: "ok", Users: users, Total: int(total)})
}
