package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/crypto/bcrypt"
)

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Enabled  bool   `json:"enabled"`
}

// UpdateUserRequest 更新用户请求
type UpdateUserRequest struct {
	Password string `json:"password,omitempty"`
	Role     string `json:"role,omitempty"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

// CreateUser 创建用户
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if req.Username == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "username and password are required"})
		return
	}

	if req.Role == "" {
		req.Role = "viewer"
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "role must be admin, operator, or viewer"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// 检查用户名是否已存在
	coll := h.Mongo.Database.Collection("users")
	count, _ := coll.CountDocuments(ctx, bson.M{"username": req.Username})
	if count > 0 {
		writeJSON(w, http.StatusConflict, mmlResponse{Status: "error", Message: "username already exists"})
		return
	}

	// bcrypt 密码哈希
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "password hash failed"})
		return
	}

	user := model.User{
		Username:  req.Username,
		Password:  string(hash),
		Role:      req.Role,
		Enabled:   req.Enabled,
		CreatedAt: time.Now(),
	}

	if _, err := coll.InsertOne(ctx, user); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "insert failed: " + err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-USER", "user", req.Username)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "user created: " + req.Username})
}

// UpdateUser 更新用户
func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	username := r.URL.Query().Get("username")
	if username == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "username parameter required"})
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("users")

	setFields := bson.M{}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "password hash failed"})
			return
		}
		setFields["password"] = string(hash)
	}
	if req.Role != "" {
		if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
			writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "role must be admin, operator, or viewer"})
			return
		}
		setFields["role"] = req.Role
	}
	if req.Enabled != nil {
		setFields["enabled"] = *req.Enabled
	}

	if len(setFields) == 0 {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "no fields to update"})
		return
	}

	result, err := coll.UpdateOne(ctx, bson.M{"username": username}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "user not found"})
		return
	}

	h.writeAuditLog(r, "UPDATE-USER", "user", username)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "user updated"})
}

// DeleteUser 删除用户
func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	username := r.URL.Query().Get("username")
	if username == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "username parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("users")
	result, err := coll.DeleteOne(ctx, bson.M{"username": username})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "delete failed: " + err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "user not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-USER", "user", username)

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "user deleted"})
}
