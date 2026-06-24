package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// CreateAlarmRuleRequest 创建告警规则请求
type CreateAlarmRuleRequest struct {
	Name      string  `json:"name"`
	Threshold float64 `json:"threshold"`
	Severity  string  `json:"severity"`
	Enabled   bool    `json:"enabled"`
}

// GetAlarmRules 查询所有告警规则
func (h *Handler) GetAlarmRules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("alarm_rules")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var rules []model.AlarmRule
	if err := cursor.All(ctx, &rules); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if rules == nil {
		rules = []model.AlarmRule{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"rules":  rules,
		"total":  len(rules),
	})
}

// CreateAlarmRule 创建告警规则
func (h *Handler) CreateAlarmRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req CreateAlarmRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "name is required"})
		return
	}

	if req.Severity == "" {
		req.Severity = "minor"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("alarm_rules")

	// 检查名称是否已存在
	count, _ := coll.CountDocuments(ctx, bson.M{"name": req.Name})
	if count > 0 {
		writeJSON(w, http.StatusConflict, mmlResponse{Status: "error", Message: "rule name already exists"})
		return
	}

	rule := model.AlarmRule{
		Name:      req.Name,
		Threshold: req.Threshold,
		Severity:  req.Severity,
		Enabled:   req.Enabled,
	}

	result, err := coll.InsertOne(ctx, rule)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "insert failed: " + err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-ALARM-RULE", "alarm_rule", req.Name)

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "alarm rule created: " + result.InsertedID.(bson.ObjectID).Hex(),
	})
}

// UpdateAlarmRule 更新告警规则
func (h *Handler) UpdateAlarmRule(w http.ResponseWriter, r *http.Request) {
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

	var req CreateAlarmRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	setFields := bson.M{"enabled": req.Enabled}
	if req.Name != "" {
		setFields["name"] = req.Name
	}
	if req.Threshold != 0 {
		setFields["threshold"] = req.Threshold
	}
	if req.Severity != "" {
		setFields["severity"] = req.Severity
	}

	coll := h.Mongo.Database.Collection("alarm_rules")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "alarm rule not found"})
		return
	}

	h.writeAuditLog(r, "UPDATE-ALARM-RULE", "alarm_rule", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "alarm rule updated"})
}

// DeleteAlarmRule 删除告警规则
func (h *Handler) DeleteAlarmRule(w http.ResponseWriter, r *http.Request) {
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

	coll := h.Mongo.Database.Collection("alarm_rules")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "delete failed: " + err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "alarm rule not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-ALARM-RULE", "alarm_rule", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "alarm rule deleted"})
}
