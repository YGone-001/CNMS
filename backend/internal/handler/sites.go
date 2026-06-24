package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"xcloud-cnms/internal/model"
)

// CreateSiteRequest 创建站点请求
type CreateSiteRequest struct {
	Name        string   `json:"name"`
	Address     string   `json:"address,omitempty"`
	Description string   `json:"description,omitempty"`
	Enabled     *bool    `json:"enabled"`
	NRFURL      string   `json:"nrf_url,omitempty"`
	Type        string   `json:"type,omitempty"`       // region, dc, node
	ParentID    string   `json:"parent_id,omitempty"`  // 父站点 ID
	NFIds       []string `json:"nf_ids,omitempty"`     // 关联的 NF 进程名列表
}

// GetSites 查询站点列表
// GET /api/v1/sites
func (h *Handler) GetSites(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("sites")
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var sites []model.Site
	if err := cursor.All(ctx, &sites); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if sites == nil {
		sites = []model.Site{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "total": len(sites), "sites": sites})
}

// CreateSite 创建站点
// POST /api/v1/sites
func (h *Handler) CreateSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	var req CreateSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid request body"})
		return
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "name is required"})
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	site := model.Site{
		Name:        req.Name,
		Address:     req.Address,
		Description: req.Description,
		Enabled:     enabled,
		NRFURL:      req.NRFURL,
		Type:        req.Type,
		ParentID:    req.ParentID,
		NFIds:       req.NFIds,
		CreatedAt:   time.Now(),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("sites")
	result, err := coll.InsertOne(ctx, site)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	site.ID = result.InsertedID.(bson.ObjectID)

	h.writeAuditLog(r, "ADD-SITE", req.Name, req.Address)

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "site": site})
}

// UpdateSite 更新站点
// PUT /api/v1/sites?id=<id>
func (h *Handler) UpdateSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "id is required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid id"})
		return
	}

	var req CreateSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid request body"})
		return
	}

	update := bson.M{}
	if req.Name != "" {
		update["name"] = req.Name
	}
	if req.Address != "" {
		update["address"] = req.Address
	}
	if req.Description != "" {
		update["description"] = req.Description
	}
	if req.Enabled != nil {
		update["enabled"] = *req.Enabled
	}
	if req.NRFURL != "" {
		update["nrf_url"] = req.NRFURL
	}
	if req.Type != "" {
		update["type"] = req.Type
	}
	if req.ParentID != "" {
		update["parent_id"] = req.ParentID
	}
	if req.NFIds != nil {
		update["nf_ids"] = req.NFIds
	}

	if len(update) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "no fields to update"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("sites")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": update})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "site not found"})
		return
	}

	h.writeAuditLog(r, "MOD-SITE", idStr, "")

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "site updated"})
}

// DeleteSite 删除站点
// DELETE /api/v1/sites?id=<id>
func (h *Handler) DeleteSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "id is required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("sites")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "site not found"})
		return
	}

	h.writeAuditLog(r, "DEL-SITE", idStr, "")

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "site deleted"})
}
