package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/model"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// solutionListResponse 知识库列表响应
type solutionListResponse struct {
	Status    string             `json:"status"`
	Message   string             `json:"message,omitempty"`
	Solutions []model.Solution   `json:"solutions,omitempty"`
	Count     int                `json:"count,omitempty"`
	Page      int                `json:"page,omitempty"`
	PageSize  int                `json:"page_size,omitempty"`
	Total     int64              `json:"total,omitempty"`
}

// solutionStatsResponse 统计响应
type solutionStatsResponse struct {
	Status         string              `json:"status"`
	TotalSolutions int64               `json:"total_solutions"`
	TopTags        []tagCount          `json:"top_tags"`
	TopProtocols   []protocolCount     `json:"top_protocols"`
}

type tagCount struct {
	Tag   string `json:"tag"`
	Count int64  `json:"count"`
}

type protocolCount struct {
	Protocol string `json:"protocol"`
	Count    int64  `json:"count"`
}

// uploadResponse 文件上传响应
type uploadResponse struct {
	Status       string `json:"status"`
	OriginalName string `json:"original_name"`
	URL          string `json:"url"`
	Size         int64  `json:"size"`
	Type         string `json:"type"`
}

// GetSolutions 查询知识库列表（分页、按协议/标签过滤）
func (h *Handler) GetSolutions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, solutionListResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 构建过滤条件
	filter := bson.M{}
	if protocol := r.URL.Query().Get("protocol"); protocol != "" {
		filter["protocol"] = protocol
	}
	if tag := r.URL.Query().Get("tag"); tag != "" {
		filter["tags"] = bson.M{"$in": []string{tag}}
	}

	// 查询总数
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	// 分页参数
	page := 1
	pageSize := 20
	if v := r.URL.Query().Get("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
		if page < 1 {
			page = 1
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
		if pageSize < 1 || pageSize > 100 {
			pageSize = 20
		}
	}

	skip := int64((page - 1) * pageSize)
	limit := int64(pageSize)
	opts := options.Find().SetSkip(skip).SetLimit(limit).SetSort(bson.M{"created_at": -1})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var solutions []model.Solution
	if err := cursor.All(ctx, &solutions); err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if solutions == nil {
		solutions = []model.Solution{}
	}

	writeJSON(w, http.StatusOK, solutionListResponse{
		Status:    "ok",
		Message:   fmt.Sprintf("found %d solution(s), page %d/%d", total, page, (total+int64(pageSize)-1)/int64(pageSize)),
		Solutions: solutions,
		Count:     len(solutions),
		Page:      page,
		PageSize:  pageSize,
		Total:     total,
	})
}

// GetSolution 获取单个知识库条目
func (h *Handler) GetSolution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	// 从路径中提取 ID: /api/v1/solutions/{id}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/v1/solutions/")
	if idStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "id required"})
		return
	}

	objectID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")
	var solution model.Solution
	if err := coll.FindOne(ctx, bson.M{"_id": objectID}).Decode(&solution); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "solution not found"})
		return
	}

	writeJSON(w, http.StatusOK, solution)
}

// CreateSolution 创建知识库条目
func (h *Handler) CreateSolution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	var req model.Solution
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid request body"})
		return
	}

	if req.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "title is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 获取当前用户
	ownerID := "anonymous"
	if claims := auth.GetClaimsFromContext(r.Context()); claims != nil {
		ownerID = claims.Username
	}

	solution := model.Solution{
		ID:          bson.NewObjectID(),
		Title:       req.Title,
		Protocol:    req.Protocol,
		Phenomenon:  req.Phenomenon,
		RootCause:   req.RootCause,
		Solution:    req.Solution,
		Tags:        req.Tags,
		Attachments: req.Attachments,
		CreatedAt:   time.Now(),
		OwnerID:     ownerID,
	}

	if _, err := coll.InsertOne(ctx, solution); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "insert failed: " + err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-KB", "solution", req.Title)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "solution created", "id": solution.ID.Hex()})
}

// UpdateSolution 更新知识库条目
func (h *Handler) UpdateSolution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "id parameter required"})
		return
	}

	objectID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid id"})
		return
	}

	var req model.Solution
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 检查是否存在
	var existing model.Solution
	if err := coll.FindOne(ctx, bson.M{"_id": objectID}).Decode(&existing); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "solution not found"})
		return
	}

	// 构建更新字段
	setFields := bson.M{
		"title":       req.Title,
		"protocol":    req.Protocol,
		"phenomenon":  req.Phenomenon,
		"root_cause":  req.RootCause,
		"solution":    req.Solution,
		"tags":        req.Tags,
		"attachments": req.Attachments,
	}

	result, err := coll.UpdateOne(ctx, bson.M{"_id": objectID}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "solution not found"})
		return
	}

	// 清理被删除的附件文件
	h.cleanupOrphanFiles(existing.Attachments, req.Attachments)

	h.writeAuditLog(r, "UPDATE-KB", "solution", req.Title)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "solution updated"})
}

// DeleteSolution 删除知识库条目
func (h *Handler) DeleteSolution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "id parameter required"})
		return
	}

	objectID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "invalid id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 先查询以便清理文件
	var existing model.Solution
	if err := coll.FindOne(ctx, bson.M{"_id": objectID}).Decode(&existing); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "solution not found"})
		return
	}

	result, err := coll.DeleteOne(ctx, bson.M{"_id": objectID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "delete failed: " + err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "message": "solution not found"})
		return
	}

	// 清理所有关联文件
	h.deleteAllFiles(existing)

	h.writeAuditLog(r, "DELETE-KB", "solution", existing.Title)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "solution deleted"})
}

// SearchSolutions 全文搜索知识库
func (h *Handler) SearchSolutions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, solutionListResponse{Status: "error", Message: "method not allowed"})
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		// 无搜索词时返回全部
		h.GetSolutions(w, r)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 分页参数
	page := 1
	pageSize := 20
	if v := r.URL.Query().Get("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
		if page < 1 {
			page = 1
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
		if pageSize < 1 || pageSize > 100 {
			pageSize = 20
		}
	}

	// 使用 MongoDB text search 或 regex 模糊搜索
	filter := bson.M{
		"$or": []bson.M{
			{"title": bson.M{"$regex": q, "$options": "i"}},
			{"phenomenon": bson.M{"$regex": q, "$options": "i"}},
			{"root_cause": bson.M{"$regex": q, "$options": "i"}},
			{"solution": bson.M{"$regex": q, "$options": "i"}},
			{"tags": bson.M{"$regex": q, "$options": "i"}},
			{"protocol": bson.M{"$regex": q, "$options": "i"}},
		},
	}

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	skip := int64((page - 1) * pageSize)
	limit := int64(pageSize)
	opts := options.Find().SetSkip(skip).SetLimit(limit).SetSort(bson.M{"created_at": -1})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "search failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var solutions []model.Solution
	if err := cursor.All(ctx, &solutions); err != nil {
		writeJSON(w, http.StatusInternalServerError, solutionListResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if solutions == nil {
		solutions = []model.Solution{}
	}

	writeJSON(w, http.StatusOK, solutionListResponse{
		Status:    "ok",
		Message:   fmt.Sprintf("found %d solution(s) for '%s'", total, q),
		Solutions: solutions,
		Count:     len(solutions),
		Page:      page,
		PageSize:  pageSize,
		Total:     total,
	})
}

// GetSolutionStats 获取知识库统计信息
func (h *Handler) GetSolutionStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("solutions")

	// 总数
	total, err := coll.CountDocuments(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "count failed"})
		return
	}

	// 热门标签 (使用 aggregate)
	tagPipeline := bson.A{
		bson.M{"$unwind": "$tags"},
		bson.M{"$group": bson.M{"_id": "$tags", "count": bson.M{"$sum": 1}}},
		bson.M{"$sort": bson.M{"count": -1}},
		bson.M{"$limit": 10},
	}

	tagCursor, err := coll.Aggregate(ctx, tagPipeline)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "aggregate failed"})
		return
	}
	defer tagCursor.Close(ctx)

	var topTags []tagCount
	for tagCursor.Next(ctx) {
		var result struct {
			ID    string `bson:"_id"`
			Count int64  `bson:"count"`
		}
		if err := tagCursor.Decode(&result); err == nil {
			topTags = append(topTags, tagCount{Tag: result.ID, Count: result.Count})
		}
	}
	if topTags == nil {
		topTags = []tagCount{}
	}

	// 热门协议
	protoPipeline := bson.A{
		bson.M{"$group": bson.M{"_id": "$protocol", "count": bson.M{"$sum": 1}}},
		bson.M{"$sort": bson.M{"count": -1}},
		bson.M{"$limit": 10},
	}

	protoCursor, err := coll.Aggregate(ctx, protoPipeline)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "aggregate failed"})
		return
	}
	defer protoCursor.Close(ctx)

	var topProtocols []protocolCount
	for protoCursor.Next(ctx) {
		var result struct {
			ID    string `bson:"_id"`
			Count int64  `bson:"count"`
		}
		if err := protoCursor.Decode(&result); err == nil {
			topProtocols = append(topProtocols, protocolCount{Protocol: result.ID, Count: result.Count})
		}
	}
	if topProtocols == nil {
		topProtocols = []protocolCount{}
	}

	writeJSON(w, http.StatusOK, solutionStatsResponse{
		Status:         "ok",
		TotalSolutions: total,
		TopTags:        topTags,
		TopProtocols:   topProtocols,
	})
}

// UploadFile 上传文件
func (h *Handler) UploadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, uploadResponse{Status: "error"})
		return
	}

	// 解析 multipart form
	if err := r.ParseMultipartForm(32 << 20); err != nil { // 32MB max
		writeJSON(w, http.StatusBadRequest, uploadResponse{Status: "error"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, uploadResponse{Status: "error"})
		return
	}
	defer file.Close()

	// 确保上传目录存在
	uploadDir := h.UploadDir
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, uploadResponse{Status: "error"})
		return
	}

	// 生成 UUID 文件名
	ext := filepath.Ext(header.Filename)
	newName := uuid.New().String() + ext
	destPath := filepath.Join(uploadDir, newName)

	// 写入文件
	dst, err := os.Create(destPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, uploadResponse{Status: "error"})
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, uploadResponse{Status: "error"})
		return
	}

	// 确定文件类型
	fileType := "FILE"
	extLower := strings.ToLower(ext)
	switch extLower {
	case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg":
		fileType = "IMG"
	case ".pcap", ".pcapng":
		fileType = "PCAP"
	case ".pdf":
		fileType = "PDF"
	case ".doc", ".docx":
		fileType = "DOC"
	case ".xls", ".xlsx":
		fileType = "XLS"
	case ".txt", ".log":
		fileType = "TXT"
	}

	url := "/api/v1/solutions/files/" + newName

	writeJSON(w, http.StatusOK, uploadResponse{
		Status:       "ok",
		OriginalName: header.Filename,
		URL:          url,
		Size:         size,
		Type:         fileType,
	})
}

// DownloadFile 下载文件
func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 从路径提取文件名: /api/v1/solutions/files/{filename}
	filename := strings.TrimPrefix(r.URL.Path, "/api/v1/solutions/files/")
	if filename == "" {
		http.Error(w, "filename required", http.StatusBadRequest)
		return
	}

	// 安全检查：防止路径遍历
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.UploadDir, filename)

	// 检查文件是否存在
	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	// 设置响应头
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, filePath)
}

// cleanupOrphanFiles 清理被删除的附件文件
func (h *Handler) cleanupOrphanFiles(oldAttachments, newAttachments []model.KbAttachment) {
	newURLs := make(map[string]bool)
	for _, a := range newAttachments {
		newURLs[a.URL] = true
	}

	for _, old := range oldAttachments {
		if !newURLs[old.URL] {
			h.deleteFileByURL(old.URL)
		}
	}
}

// deleteAllFiles 删除条目关联的所有文件
func (h *Handler) deleteAllFiles(solution model.Solution) {
	for _, att := range solution.Attachments {
		h.deleteFileByURL(att.URL)
	}
	// 同时清理 solution 内容中引用的图片
	h.cleanupMarkdownFiles(solution.Solution)
}

// deleteFileByURL 根据 URL 删除文件
func (h *Handler) deleteFileByURL(url string) {
	// 从 URL 提取文件名
	filename := strings.TrimPrefix(url, "/api/v1/solutions/files/")
	if filename == "" || strings.Contains(filename, "..") {
		return
	}
	filePath := filepath.Join(h.UploadDir, filename)
	os.Remove(filePath) // 忽略错误
}

// cleanupMarkdownFiles 清理 Markdown 内容中引用的本地文件
func (h *Handler) cleanupMarkdownFiles(content string) {
	// 查找 ![img](/api/v1/solutions/files/xxx) 模式
	prefix := "/api/v1/solutions/files/"
	idx := 0
	for {
		pos := strings.Index(content[idx:], prefix)
		if pos == -1 {
			break
		}
		start := idx + pos + len(prefix)
		end := start
		for end < len(content) && content[end] != ')' && content[end] != ' ' && content[end] != '\n' {
			end++
		}
		filename := content[start:end]
		if filename != "" {
			h.deleteFileByURL(prefix + filename)
		}
		idx = end
	}
}
