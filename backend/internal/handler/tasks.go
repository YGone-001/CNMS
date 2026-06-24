package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// CreateTaskRequest 创建任务请求
type CreateTaskRequest struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Cron    string `json:"cron"`
	Target  string `json:"target"`
	Command string `json:"command"`
	Enabled bool   `json:"enabled"`
}

// CreateTask 创建定时任务
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if req.Name == "" || req.Type == "" || req.Cron == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "name, type, cron are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	task := model.ScheduledTask{
		Name:      req.Name,
		Type:      req.Type,
		Cron:      req.Cron,
		Target:    req.Target,
		Command:   req.Command,
		Enabled:   req.Enabled,
		CreatedAt: time.Now(),
	}

	coll := h.Mongo.Database.Collection("scheduled_tasks")
	result, err := coll.InsertOne(ctx, task)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "insert failed: " + err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-TASK", "task", req.Name)

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "task created: " + result.InsertedID.(bson.ObjectID).Hex(),
	})
}

// UpdateTask 更新定时任务
func (h *Handler) UpdateTask(w http.ResponseWriter, r *http.Request) {
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

	var req CreateTaskRequest
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
	if req.Type != "" {
		setFields["type"] = req.Type
	}
	if req.Cron != "" {
		setFields["cron"] = req.Cron
	}
	if req.Target != "" {
		setFields["target"] = req.Target
	}
	if req.Command != "" {
		setFields["command"] = req.Command
	}

	coll := h.Mongo.Database.Collection("scheduled_tasks")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "task not found"})
		return
	}

	h.writeAuditLog(r, "UPDATE-TASK", "task", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "task updated"})
}

// DeleteTask 删除定时任务
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
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

	coll := h.Mongo.Database.Collection("scheduled_tasks")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "delete failed: " + err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "task not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-TASK", "task", id)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "task deleted"})
}
