package handler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"xcloud-cnms/internal/model"
)

// BackupRequest 创建备份请求
type BackupRequest struct {
	NFName  string `json:"nf_name"`
	Comment string `json:"comment,omitempty"`
}

var backupNFList = []string{
	"amfd", "ausfd", "bsfd", "drad", "hssd", "mmed", "nrfd", "nssfd",
	"ocsd", "pcfd", "pcrfd", "pgwcd", "pgwud", "scpd", "sgwcd", "sgwud",
	"smfd", "udmd", "udrd", "upfd",
}

func init() {
	sort.Strings(backupNFList)
}

// CreateBackup 手动创建 NF 配置备份
// POST /api/v1/backups
func (h *Handler) CreateBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	var req BackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid request body"})
		return
	}

	if req.NFName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "nf_name is required"})
		return
	}

	if strings.Contains(req.NFName, "..") || strings.Contains(req.NFName, "/") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid nf_name"})
		return
	}

	// 查找配置文件
	configPaths := []string{
		filepath.Join("/etc/xcloud", req.NFName, "config.json"),
		filepath.Join("/etc/xcloud", req.NFName, "config.yaml"),
		filepath.Join("/etc/xcloud", req.NFName, req.NFName+".conf"),
	}

	var configPath string
	var content []byte
	for _, p := range configPaths {
		if data, err := os.ReadFile(p); err == nil {
			configPath = p
			content = data
			break
		}
	}

	if content == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("config file not found for %s", req.NFName),
		})
		return
	}

	checksum := sha256.Sum256(content)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("config_backups")
	opts := options.FindOne().SetSort(bson.M{"version": -1})
	var lastBackup model.ConfigBackup
	version := 1
	if err := coll.FindOne(ctx, bson.M{"nf_name": req.NFName}, opts).Decode(&lastBackup); err == nil {
		version = lastBackup.Version + 1
	}

	backup := model.ConfigBackup{
		NFName:    req.NFName,
		FilePath:  configPath,
		Content:   string(content),
		Checksum:  fmt.Sprintf("%x", checksum),
		Size:      int64(len(content)),
		Version:   version,
		Comment:   req.Comment,
		CreatedAt: time.Now(),
	}

	result, err := coll.InsertOne(ctx, backup)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	backup.ID = result.InsertedID.(bson.ObjectID)

	h.writeAuditLog(r, "BACKUP-CONFIG", req.NFName, fmt.Sprintf("v%d %s", version, configPath))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": fmt.Sprintf("backup created: v%d (%d bytes)", version, len(content)),
		"backup":  backup,
	})
}

// GetBackups 查询配置备份列表
// GET /api/v1/backups
func (h *Handler) GetBackups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("config_backups")
	filter := bson.M{}
	if nfName := r.URL.Query().Get("nf_name"); nfName != "" {
		filter["nf_name"] = nfName
	}

	opts := options.Find().SetSort(bson.M{"created_at": -1}).SetLimit(200)
	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var backups []model.ConfigBackup
	if err := cursor.All(ctx, &backups); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if backups == nil {
		backups = []model.ConfigBackup{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"total":   len(backups),
		"backups": backups,
	})
}

// GetBackupDiff 比较两个版本的配置差异
// GET /api/v1/backups/diff?v1=<id>&v2=<id>
func (h *Handler) GetBackupDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	v1ID := r.URL.Query().Get("v1")
	v2ID := r.URL.Query().Get("v2")
	if v1ID == "" || v2ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "v1 and v2 are required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("config_backups")

	objID1, err := bson.ObjectIDFromHex(v1ID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid v1 id"})
		return
	}
	objID2, err := bson.ObjectIDFromHex(v2ID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid v2 id"})
		return
	}

	var backup1, backup2 model.ConfigBackup
	if err := coll.FindOne(ctx, bson.M{"_id": objID1}).Decode(&backup1); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "v1 not found"})
		return
	}
	if err := coll.FindOne(ctx, bson.M{"_id": objID2}).Decode(&backup2); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "v2 not found"})
		return
	}

	lines1 := strings.Split(backup1.Content, "\n")
	lines2 := strings.Split(backup2.Content, "\n")

	type DiffLine struct {
		Type    string `json:"type"`
		LineNum int    `json:"line_num"`
		Content string `json:"content"`
	}

	var diff []DiffLine
	maxLen := len(lines1)
	if len(lines2) > maxLen {
		maxLen = len(lines2)
	}
	for i := 0; i < maxLen; i++ {
		var l1, l2 string
		if i < len(lines1) {
			l1 = lines1[i]
		}
		if i < len(lines2) {
			l2 = lines2[i]
		}
		if l1 == l2 {
			diff = append(diff, DiffLine{Type: "same", LineNum: i + 1, Content: l1})
		} else {
			if i < len(lines1) {
				diff = append(diff, DiffLine{Type: "del", LineNum: i + 1, Content: l1})
			}
			if i < len(lines2) {
				diff = append(diff, DiffLine{Type: "add", LineNum: i + 1, Content: l2})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"v1":       map[string]interface{}{"id": backup1.ID, "nf_name": backup1.NFName, "version": backup1.Version, "created_at": backup1.CreatedAt},
		"v2":       map[string]interface{}{"id": backup2.ID, "nf_name": backup2.NFName, "version": backup2.Version, "created_at": backup2.CreatedAt},
		"diff":     diff,
		"v1_lines": len(lines1),
		"v2_lines": len(lines2),
	})
}

// DeleteBackup 删除备份
// DELETE /api/v1/backups?id=<id>
func (h *Handler) DeleteBackup(w http.ResponseWriter, r *http.Request) {
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

	coll := h.Mongo.Database.Collection("config_backups")
	result, err := coll.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "backup not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "backup deleted"})
}

// GetBackupVersions 获取指定 NF 的版本列表（不含内容）
// GET /api/v1/backups/versions?nf_name=<name>
func (h *Handler) GetBackupVersions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	nfName := r.URL.Query().Get("nf_name")
	if nfName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "nf_name is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("config_backups")
	opts := options.Find().SetSort(bson.M{"version": -1}).SetProjection(bson.M{"content": 0})
	cursor, err := coll.Find(ctx, bson.M{"nf_name": nfName}, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var versions []model.ConfigBackup
	if err := cursor.All(ctx, &versions); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	if versions == nil {
		versions = []model.ConfigBackup{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"nf_name":  nfName,
		"versions": versions,
	})
}
