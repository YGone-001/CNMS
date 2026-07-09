package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/signaling"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// signalingTraceRequest 创建追踪任务请求体
type signalingTraceRequest struct {
	QueryType  string    `json:"query_type"`
	QueryValue string    `json:"query_value"`
	Scenario   string    `json:"scenario"`
	TimeRange  timeRange `json:"time_range"`
	Sources    []string  `json:"sources"`
}

type timeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// signalingResponse 统一信令 API 响应
type signalingResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// signalingTracesResponse 追踪列表响应
type signalingTracesResponse struct {
	Status  string               `json:"status"`
	Traces  []model.SignalingTrace `json:"traces"`
	Total   int64                `json:"total"`
	Page    int                  `json:"page"`
	PerPage int                  `json:"per_page"`
}

// signalingMessagesResponse 信令消息列表响应
type signalingMessagesResponse struct {
	Status   string                  `json:"status"`
	Messages []model.SignalingMessage `json:"messages"`
	Total    int64                   `json:"total"`
	Page     int                     `json:"page"`
	PerPage  int                     `json:"per_page"`
}

// signalingMediaResponse 媒体质量列表响应
type signalingMediaResponse struct {
	Status  string               `json:"status"`
	Media   []model.MediaQuality `json:"media"`
	Total   int64                `json:"total"`
	Page    int                  `json:"page"`
	PerPage int                  `json:"per_page"`
}

// validQueryTypes 合法的查询类型
var validQueryTypes = map[string]bool{
	"imsi": true, "supi": true, "msisdn": true, "sip_uri": true,
	"impu": true, "impi": true, "ip": true, "teid": true,
	"call_id": true, "guti": true, "fiveg_guti": true,
}

// validScenarios 合法的追踪场景
var validScenarios = map[string]bool{
	"5g_registration": true, "4g_attach": true, "ims_registration": true,
	"volte_call": true, "vonr_call": true, "sms_sgs": true,
	"sms_nas": true, "sms_ims": true, "all": true,
}

// -----------------------------------------------------------
// POST /api/v1/signaling/trace — 创建追踪任务
// -----------------------------------------------------------

// HandleSignalingCreateTrace 创建新的信令追踪任务
func (h *Handler) HandleSignalingCreateTrace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req signalingTraceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, signalingResponse{Status: "error", Message: "invalid request body"})
		return
	}

	// 参数校验
	if !validQueryTypes[req.QueryType] {
		writeJSON(w, http.StatusBadRequest, signalingResponse{
			Status: "error", Message: "invalid query_type: " + req.QueryType,
		})
		return
	}
	if req.QueryValue == "" {
		writeJSON(w, http.StatusBadRequest, signalingResponse{
			Status: "error", Message: "query_value is required",
		})
		return
	}
	if req.Scenario == "" {
		req.Scenario = "all"
	}
	if !validScenarios[req.Scenario] {
		writeJSON(w, http.StatusBadRequest, signalingResponse{
			Status: "error", Message: "invalid scenario: " + req.Scenario,
		})
		return
	}

	// 时间范围默认值：最近 24 小时
	if req.TimeRange.Start.IsZero() {
		req.TimeRange.Start = time.Now().Add(-24 * time.Hour)
	}
	if req.TimeRange.End.IsZero() {
		req.TimeRange.End = time.Now()
	}

	// 数据来源默认值
	if len(req.Sources) == 0 {
		req.Sources = []string{"logs", "pcap"}
	}

	// 生成 trace ID
	traceID := uuid.New().String()

	// 获取操作用户
	createdBy := "anonymous"
	if claims := auth.GetClaimsFromContext(r.Context()); claims != nil {
		createdBy = claims.Username
	}

	// 创建 SignalingTrace 文档
	trace := model.SignalingTrace{
		ID:         bson.NewObjectID(),
		TraceID:    traceID,
		QueryType:  req.QueryType,
		QueryValue: req.QueryValue,
		Scenario:   req.Scenario,
		Status:     "running",
		TimeRange: model.TimeRange{
			Start: req.TimeRange.Start,
			End:   req.TimeRange.End,
		},
		CreatedAt: time.Now(),
		CreatedBy: createdBy,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("signaling_traces")
	if _, err := coll.InsertOne(ctx, trace); err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{
			Status: "error", Message: "create trace failed: " + err.Error(),
		})
		return
	}

	// 审计日志
	h.writeAuditLog(r, "SIGNALING_TRACE_CREATE", "signaling",
		fmt.Sprintf("trace_id=%s query=%s:%s scenario=%s", traceID, req.QueryType, req.QueryValue, req.Scenario))

	// 异步执行解析任务
	go h.runSignalingTrace(traceID, req)

	writeJSON(w, http.StatusOK, signalingResponse{
		Status:  "ok",
		Message: "trace started",
		Data:    map[string]string{"trace_id": traceID},
	})
}

// runSignalingTrace 异步执行信令追踪
// 数据来源优先级：
//  1. HEPListener — Kamailio siptrace 通过 HEPv3 推送的 SIP 消息（优先）
//  2. Homer API — 从 Homer 查询已存储的 SIP 消息（辅助）
//  3. TsharkQuery — 从环形缓冲区 pcap 查询所有协议（兜底）
func (h *Handler) runSignalingTrace(traceID string, req signalingTraceRequest) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	correlator := signaling.NewCorrelator()
	var allMessages []model.SignalingMessage

	// 1. HEP 监听器 — 优先从 Kamailio siptrace 获取 SIP 消息
	if h.HEPListener != nil && h.HEPListener.IsRunning() {
		start, end := req.TimeRange.Start, req.TimeRange.End
		var hepMsgs []model.SignalingMessage

		switch req.QueryType {
		case "imsi", "supi":
			hepMsgs = h.HEPListener.QueryByIMSI(req.QueryValue, start, end)
		case "call_id":
			hepMsgs = h.HEPListener.QueryByCallID(req.QueryValue)
		default:
			// 对于其他查询类型，获取全量后由 matchFilters 过滤
			hepMsgs = h.HEPListener.QueryAll(start, end, 10000)
		}

		if len(hepMsgs) > 0 {
			for i := range hepMsgs {
				hepMsgs[i].TraceID = traceID
			}
			allMessages = append(allMessages, hepMsgs...)
			log.Printf("runSignalingTrace %s: HEP listener returned %d SIP messages", traceID, len(hepMsgs))
		} else {
			log.Printf("runSignalingTrace %s: HEP listener returned 0 messages", traceID)
		}
	}

	// 2. Homer API — 从 Homer 查询 SIP 消息（辅助，如有 HEP 结果则跳过）
	if len(allMessages) == 0 && h.Homer != nil && h.HomerCfg.Enabled {
		log.Printf("runSignalingTrace %s: no HEP data, trying Homer API", traceID)
		homerMsgs, err := h.Homer.Search(ctx, req.QueryType, req.QueryValue, req.TimeRange.Start, req.TimeRange.End, traceID)
		if err != nil {
			log.Printf("runSignalingTrace %s: homer search failed: %v", traceID, err)
		} else if len(homerMsgs) > 0 {
			for i := range homerMsgs {
				homerMsgs[i].DataSource = "homer"
			}
			log.Printf("runSignalingTrace %s: got %d messages from Homer", traceID, len(homerMsgs))
			allMessages = append(allMessages, homerMsgs...)
		}
	}

	// 3. TsharkQuery — 从 pcap 环形缓冲区查询所有协议
	//    HEP 有 SIP 数据时，tshark 补充非 SIP 协议（Diameter/GTPv2/PFCP/S1AP 等）
	//    HEP 无数据时，tshark 全量查询
	if h.TsharkQ != nil {
		tqTimeRange := model.TimeRange{
			Start: req.TimeRange.Start,
			End:   req.TimeRange.End,
		}
		msgs, err := h.TsharkQ.Query(req.QueryType, req.QueryValue, tqTimeRange)
		if err != nil {
			log.Printf("runSignalingTrace %s: tshark query: %v", traceID, err)
		} else if len(msgs) > 0 {
			// 如果 HEP 已有 SIP 数据，去重：跳过 tshark 中与 HEP 重复的 SIP 消息
			hasHEPSIP := false
			for _, m := range allMessages {
				if m.Protocol == "SIP" {
					hasHEPSIP = true
					break
				}
			}
			for i := range msgs {
				msgs[i].TraceID = traceID
				// HEP 已有 SIP 时，跳过 tshark 的 SIP 消息（避免重复）
				if hasHEPSIP && msgs[i].Protocol == "SIP" {
					continue
				}
				allMessages = append(allMessages, msgs[i])
			}
			log.Printf("runSignalingTrace %s: tshark query returned %d messages (HEP SIP=%v)", traceID, len(msgs), hasHEPSIP)
		} else {
			log.Printf("runSignalingTrace %s: tshark query returned 0 messages", traceID)
		}
	}

	// 关联消息
	allMessages = correlator.Correlate(allMessages)

	// 生成摘要
	summary := correlator.GenerateSummary(allMessages)

	// 提取参与网元
	entities := correlator.DeriveEntities(allMessages)

	// 批量写入 MongoDB
	if len(allMessages) > 0 {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel2()

		msgColl := h.Mongo.Database.Collection("signaling_messages")
		docs := make([]interface{}, len(allMessages))
		for i := range allMessages {
			docs[i] = allMessages[i]
		}
		if _, err := msgColl.InsertMany(ctx2, docs); err != nil {
			log.Printf("runSignalingTrace %s: insert messages failed: %v", traceID, err)
		}
	}

	// 更新 SignalingTrace 状态
	ctx3, cancel3 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel3()

	var timeRange model.TimeRange
	if len(allMessages) > 0 {
		timeRange = model.TimeRange{
			Start: allMessages[0].Timestamp,
			End:   allMessages[len(allMessages)-1].Timestamp,
		}
	}

	// 确定最终状态
	status := "completed"
	if len(allMessages) == 0 {
		status = "no_data"
	}

	traceColl := h.Mongo.Database.Collection("signaling_traces")
	traceColl.UpdateOne(ctx3,
		bson.M{"trace_id": traceID},
		bson.M{"$set": bson.M{
			"status":        status,
			"message_count": len(allMessages),
			"entities":      entities,
			"time_range":    timeRange,
			"summary":       summary,
		}},
	)

	log.Printf("runSignalingTrace %s: %s, %d messages, %d entities", traceID, status, len(allMessages), len(entities))
}

// -----------------------------------------------------------
// GET /api/v1/signaling/trace/{traceId} — 查询追踪任务
// -----------------------------------------------------------

// HandleSignalingGetTrace 查询追踪任务状态和摘要
func (h *Handler) HandleSignalingGetTrace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	traceID := strings.TrimPrefix(r.URL.Path, "/api/v1/signaling/trace/")
	if traceID == "" {
		writeJSON(w, http.StatusBadRequest, signalingResponse{Status: "error", Message: "trace_id is required"})
		return
	}

	// 去除可能的子路径（如 /messages, /media）
	if idx := strings.Index(traceID, "/"); idx != -1 {
		traceID = traceID[:idx]
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("signaling_traces")
	var trace model.SignalingTrace
	err := coll.FindOne(ctx, bson.M{"trace_id": traceID}).Decode(&trace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, signalingResponse{Status: "error", Message: "trace not found"})
		return
	}

	writeJSON(w, http.StatusOK, signalingResponse{Status: "ok", Data: trace})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/trace/{traceId}/messages — 查询关联消息
// -----------------------------------------------------------

// HandleSignalingGetMessages 查询追踪关联的全部信令消息
func (h *Handler) HandleSignalingGetMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	traceID := extractTraceIDFromPath(r.URL.Path, "/api/v1/signaling/trace/", "/messages")
	if traceID == "" {
		writeJSON(w, http.StatusBadRequest, signalingResponse{Status: "error", Message: "trace_id is required"})
		return
	}

	// 分页参数
	page, pageSize := parsePagination(r)

	// 过滤参数
	filter := bson.M{"trace_id": traceID}
	if protocol := r.URL.Query().Get("protocol"); protocol != "" {
		filter["protocol"] = protocol
	}
	if entity := r.URL.Query().Get("entity"); entity != "" {
		filter["$or"] = []bson.M{
			{"src_entity": entity},
			{"dst_entity": entity},
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("signaling_messages")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().
		SetSort(bson.M{"timestamp": 1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var messages []model.SignalingMessage
	if err := cursor.All(ctx, &messages); err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if messages == nil {
		messages = []model.SignalingMessage{}
	}

	writeJSON(w, http.StatusOK, signalingMessagesResponse{
		Status:   "ok",
		Messages: messages,
		Total:    total,
		Page:     page,
		PerPage:  pageSize,
	})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/trace/{traceId}/media — 查询媒体质量
// -----------------------------------------------------------

// HandleSignalingGetMedia 查询追踪关联的媒体质量数据
func (h *Handler) HandleSignalingGetMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	traceID := extractTraceIDFromPath(r.URL.Path, "/api/v1/signaling/trace/", "/media")
	if traceID == "" {
		writeJSON(w, http.StatusBadRequest, signalingResponse{Status: "error", Message: "trace_id is required"})
		return
	}

	page, pageSize := parsePagination(r)

	filter := bson.M{"trace_id": traceID}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("media_quality")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().
		SetSort(bson.M{"timestamp": 1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var media []model.MediaQuality
	if err := cursor.All(ctx, &media); err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if media == nil {
		media = []model.MediaQuality{}
	}

	writeJSON(w, http.StatusOK, signalingMediaResponse{
		Status:  "ok",
		Media:   media,
		Total:   total,
		Page:    page,
		PerPage: pageSize,
	})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/traces — 列出历史追踪记录
// -----------------------------------------------------------

// HandleSignalingListTraces 列出历史追踪记录
func (h *Handler) HandleSignalingListTraces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	page, pageSize := parsePagination(r)

	filter := bson.M{}
	if status := r.URL.Query().Get("status"); status != "" {
		filter["status"] = status
	}
	if queryType := r.URL.Query().Get("query_type"); queryType != "" {
		filter["query_type"] = queryType
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("signaling_traces")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var traces []model.SignalingTrace
	if err := cursor.All(ctx, &traces); err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if traces == nil {
		traces = []model.SignalingTrace{}
	}

	writeJSON(w, http.StatusOK, signalingTracesResponse{
		Status:  "ok",
		Traces:  traces,
		Total:   total,
		Page:    page,
		PerPage: pageSize,
	})
}

// -----------------------------------------------------------
// DELETE /api/v1/signaling/trace/{traceId} — 删除追踪记录
// -----------------------------------------------------------

// HandleSignalingDeleteTrace 删除追踪记录及关联消息
func (h *Handler) HandleSignalingDeleteTrace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	traceID := strings.TrimPrefix(r.URL.Path, "/api/v1/signaling/trace/")
	if traceID == "" {
		writeJSON(w, http.StatusBadRequest, signalingResponse{Status: "error", Message: "trace_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 删除关联消息
	msgColl := h.Mongo.Database.Collection("signaling_messages")
	msgResult, err := msgColl.DeleteMany(ctx, bson.M{"trace_id": traceID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "delete messages failed: " + err.Error()})
		return
	}

	// 删除关联媒体质量
	mediaColl := h.Mongo.Database.Collection("media_quality")
	mediaResult, _ := mediaColl.DeleteMany(ctx, bson.M{"trace_id": traceID})

	// 删除追踪记录
	traceColl := h.Mongo.Database.Collection("signaling_traces")
	traceResult, err := traceColl.DeleteOne(ctx, bson.M{"trace_id": traceID})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, signalingResponse{Status: "error", Message: "delete trace failed: " + err.Error()})
		return
	}

	if traceResult.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, signalingResponse{Status: "error", Message: "trace not found"})
		return
	}

	// 审计日志
	h.writeAuditLog(r, "SIGNALING_TRACE_DELETE", "signaling",
		fmt.Sprintf("trace_id=%s messages=%d media=%d", traceID, msgResult.DeletedCount, mediaResult.DeletedCount))

	writeJSON(w, http.StatusOK, signalingResponse{
		Status:  "ok",
		Message: fmt.Sprintf("deleted %d messages, %d media records", msgResult.DeletedCount, mediaResult.DeletedCount),
	})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/homer/status — 检查 Homer 连接状态
// -----------------------------------------------------------

// HandleSignalingHomerStatus 检查 Homer 连接状态
func (h *Handler) HandleSignalingHomerStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	// 检查 Homer 是否启用
	if !h.HomerCfg.Enabled || h.Homer == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"enabled": false,
			"message": "Homer integration is disabled",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	health, err := h.Homer.Health(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"enabled": true,
			"healthy": false,
			"message": fmt.Sprintf("Homer connection failed: %v", err),
			"api_url": h.HomerCfg.APIURL,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"enabled": true,
		"healthy": true,
		"version": health.Version,
		"api_url": h.HomerCfg.APIURL,
	})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/capture/status — 信令抓包守护进程状态
// -----------------------------------------------------------

// HandleSignalingCaptureStatus 返回信令持续抓包守护进程的运行状态
func (h *Handler) HandleSignalingCaptureStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	if h.CapDaemon == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"enabled": false,
			"message": "signaling capture daemon is not configured",
		})
		return
	}

	status := h.CapDaemon.Status()

	// 列出环形缓冲区文件详情（文件名、大小、修改时间）
	var ringFiles []map[string]any
	if files, err := h.CapDaemon.ListRingFiles(); err == nil {
		for _, f := range files {
			info, err := os.Stat(f)
			if err != nil {
				continue
			}
			ringFiles = append(ringFiles, map[string]any{
				"name":    filepath.Base(f),
				"size":    info.Size(),
				"mod_time": info.ModTime().Format(time.RFC3339),
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"enabled":    true,
		"running":    status.Running,
		"pid":        status.PID,
		"files_count": status.FilesCount,
		"disk_bytes": status.DiskBytes,
		"ring_dir":   status.RingDir,
		"interface":  status.Interface,
		"bpf_filter": status.BPFFilter,
		"start_time": status.StartTime,
		"ring_files": ringFiles,
	})
}

// -----------------------------------------------------------
// GET /api/v1/signaling/hep/status — HEP 监听器状态
// -----------------------------------------------------------

// HandleSignalingHEPStatus 返回 HEP 监听器的运行状态
func (h *Handler) HandleSignalingHEPStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, signalingResponse{Status: "error", Message: "method not allowed"})
		return
	}

	if h.HEPListener == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"enabled": false,
			"message": "HEP listener is not configured",
		})
		return
	}

	status := h.HEPListener.Status()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"enabled":       true,
		"running":       status.Running,
		"listen_addr":   status.ListenAddr,
		"received":      status.Received,
		"parsed":        status.Parsed,
		"errors":        status.Errors,
		"buffer_count":  status.BufferCount,
		"last_receive":  status.LastReceive,
	})
}

// -----------------------------------------------------------
// 辅助函数
// -----------------------------------------------------------

// extractTraceIDFromPath 从 URL 路径中提取 traceId
// 例如: /api/v1/signaling/trace/abc-123/messages → abc-123
func extractTraceIDFromPath(path, prefix, suffix string) string {
	remaining := strings.TrimPrefix(path, prefix)
	if remaining == path {
		return ""
	}
	if idx := strings.Index(remaining, "/"); idx != -1 {
		return remaining[:idx]
	}
	return remaining
}

// parsePagination 从查询参数解析分页
func parsePagination(r *http.Request) (page, pageSize int) {
	page = 1
	pageSize = 50

	if v := r.URL.Query().Get("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
		if page < 1 {
			page = 1
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
		if pageSize < 1 {
			pageSize = 1
		}
		if pageSize > 500 {
			pageSize = 500
		}
	}
	return page, pageSize
}
