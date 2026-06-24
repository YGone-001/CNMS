package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// GetNotificationChannels 查询通知通道列表
func (h *Handler) GetNotificationChannels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("notification_channels")
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var channels []model.NotificationChannel
	if err := cursor.All(ctx, &channels); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if channels == nil {
		channels = []model.NotificationChannel{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "channels": channels})
}

// CreateNotificationChannel 创建通知通道
func (h *Handler) CreateNotificationChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var ch model.NotificationChannel
	if err := json.NewDecoder(r.Body).Decode(&ch); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if ch.Name == "" || ch.Type == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "name and type are required"})
		return
	}

	ch.CreatedAt = time.Now()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("notification_channels")
	if _, err := coll.InsertOne(ctx, ch); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-CHANNEL", "notification", ch.Name)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "channel created"})
}

// UpdateNotificationChannel 更新通知通道
func (h *Handler) UpdateNotificationChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "id parameter required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid id"})
		return
	}

	var ch model.NotificationChannel
	if err := json.NewDecoder(r.Body).Decode(&ch); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("notification_channels")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": bson.M{
		"name":      ch.Name,
		"type":      ch.Type,
		"enabled":   ch.Enabled,
		"min_level": ch.MinLevel,
		"config":    ch.Config,
	}})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "channel not found"})
		return
	}

	h.writeAuditLog(r, "UPDATE-CHANNEL", "notification", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "channel updated"})
}

// DeleteNotificationChannel 删除通知通道
func (h *Handler) DeleteNotificationChannel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "id parameter required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("notification_channels")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "channel not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-CHANNEL", "notification", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "channel deleted"})
}

// -- Escalation rules CRUD -----------------------------------------------

// GetEscalationRules 查询升级规则
func (h *Handler) GetEscalationRules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("escalation_rules")
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var rules []model.EscalationRule
	if err := cursor.All(ctx, &rules); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if rules == nil {
		rules = []model.EscalationRule{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "rules": rules})
}

// CreateEscalationRule 创建升级规则
func (h *Handler) CreateEscalationRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var rule model.EscalationRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if rule.Name == "" || rule.Severity == "" || rule.EscalateTo == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "name, severity, escalate_to are required"})
		return
	}

	rule.CreatedAt = time.Now()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("escalation_rules")
	if _, err := coll.InsertOne(ctx, rule); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-ESCALATION", "escalation", rule.Name)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "escalation rule created"})
}

// DeleteEscalationRule 删除升级规则
func (h *Handler) DeleteEscalationRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "id parameter required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("escalation_rules")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "rule not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-ESCALATION", "escalation", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "escalation rule deleted"})
}

// GetNotificationLogs 查询通知发送记录
func (h *Handler) GetNotificationLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("notification_logs")
	opts := options.Find().SetSort(bson.M{"sent_at": -1}).SetLimit(200)
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var logs []model.NotificationLog
	if err := cursor.All(ctx, &logs); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: err.Error()})
		return
	}
	if logs == nil {
		logs = []model.NotificationLog{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "logs": logs})
}
