package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// 协议预设模板表
var protocolPresets = map[string]struct {
	Label  string
	Filter string
}{
	"volte_full": {
		Label:  "VoLTE 全链路",
		Filter: "port 5060 or port 4060 or port 6060 or port 5080 or port 3868 or port 36412 or port 2123 or port 2152 or ip6 proto 50 or udp portrange 30000-40000",
	},
	"sip": {
		Label:  "SIP 信令",
		Filter: "port 5060 or port 4060 or port 6060 or port 5080",
	},
	"diameter": {
		Label:  "Diameter 信令",
		Filter: "port 3868",
	},
	"gtp": {
		Label:  "GTP 隧道",
		Filter: "port 2123 or port 2152",
	},
	"s1ap_ngap": {
		Label:  "S1AP/NGAP 信令",
		Filter: "sctp port 36412 or sctp port 38412",
	},
	"rtp_media": {
		Label:  "RTP 媒体流",
		Filter: "udp portrange 30000-40000",
	},
	"dns": {
		Label:  "DNS 查询",
		Filter: "port 53",
	},
	"pfcp": {
		Label:  "PFCP (N4)",
		Filter: "port 8805",
	},
	"gtpv2": {
		Label:  "GTPv2-C 控制面",
		Filter: "port 2123",
	},
	"ipsec_esp": {
		Label:  "IPsec ESP",
		Filter: "ip proto 50 or ip6 proto 50",
	},
	"icmp": {
		Label:  "ICMP/ICMPv6",
		Filter: "icmp or icmp6",
	},
	"all_telecom": {
		Label:  "全部电信协议",
		Filter: "port 5060 or port 4060 or port 6060 or port 5080 or port 3868 or sctp port 36412 or sctp port 38412 or port 2123 or port 2152 or port 8805 or ip proto 50 or ip6 proto 50 or udp portrange 30000-40000 or icmp or icmp6 or port 53",
	},
}

// BPF 合法字符正则（字母、数字、空格、常见 BPF 操作符）
var bpfValidPattern = regexp.MustCompile(`^[a-zA-Z0-9\s\-_.:()/=<>!|&]+$`)

// captureStartRequest 启动抓包请求体
type captureStartRequest struct {
	Name        string `json:"name"`
	Interface   string `json:"interface"`
	Protocol    string `json:"protocol"`
	Filter      string `json:"filter"`
	MaxDuration int    `json:"max_duration"`
	MaxSize     int    `json:"max_size"`
}

// captureStopRequest 停止抓包请求体
type captureStopRequest struct {
	ID string `json:"id"`
}

// captureResponse 通用抓包响应
type captureResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// captureSessionsResponse 抓包历史列表响应
type captureSessionsResponse struct {
	Status   string                 `json:"status"`
	Sessions []model.CaptureSession `json:"sessions"`
	Total    int64                  `json:"total"`
}

// validateBPF 校验 BPF 过滤表达式，防止 shell 注入
func validateBPF(filter string) error {
	if filter == "" {
		return nil
	}
	// 禁止 shell 特殊字符
	dangerous := []string{";", "|", "&", "$", "`", "(", ")", "{", "}", "\\", "'", "\"", "\n", "\r"}
	for _, ch := range dangerous {
		if strings.Contains(filter, ch) {
			return fmt.Errorf("filter contains forbidden character: %q", ch)
		}
	}
	if !bpfValidPattern.MatchString(filter) {
		return fmt.Errorf("filter contains invalid characters")
	}
	return nil
}

// HandleCaptureStart 启动抓包
// POST /api/v1/capture/start
func (h *Handler) HandleCaptureStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	// 权限检查：auth 启用时只有 admin/operator 可以操作，auth 未启用时放行
	claims := auth.GetClaimsFromContext(r.Context())
	if claims != nil && claims.Role != "admin" && claims.Role != "operator" {
		writeJSON(w, http.StatusForbidden, captureResponse{Status: "error", Message: "insufficient permissions: admin or operator required"})
		return
	}
	startedBy := "admin"
	if claims != nil {
		startedBy = claims.Username
	}

	var req captureStartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid request body"})
		return
	}

	// 参数校验与默认值
	if req.Interface == "" {
		req.Interface = "any"
	}
	if req.MaxDuration <= 0 {
		req.MaxDuration = 300
	}
	if req.MaxDuration > 3600 {
		req.MaxDuration = 3600
	}
	if req.MaxSize <= 0 {
		req.MaxSize = 100
	}
	if req.MaxSize > 500 {
		req.MaxSize = 500
	}

	// 确定 BPF filter
	filter := req.Filter
	if filter == "" {
		if preset, ok := protocolPresets[req.Protocol]; ok {
			filter = preset.Filter
		}
	}

	// 校验 BPF 表达式安全性
	if err := validateBPF(filter); err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid filter: " + err.Error()})
		return
	}

	// 检查是否已有 running 的抓包会话（同时只允许一个）
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capture_sessions")
	count, err := coll.CountDocuments(ctx, bson.M{"status": "running"})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "check running sessions failed: " + err.Error()})
		return
	}
	if count > 0 {
		writeJSON(w, http.StatusConflict, captureResponse{Status: "error", Message: "a capture session is already running, stop it first"})
		return
	}

	// 生成会话 ID 和文件路径
	sessionID := bson.NewObjectID()
	timestamp := time.Now().Format("20060102_150405")
	captureDir := "/tmp/xcloud-captures"
	if err := os.MkdirAll(captureDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "create capture dir failed: " + err.Error()})
		return
	}
	filePath := filepath.Join(captureDir, fmt.Sprintf("%s_%s.pcap", sessionID.Hex(), timestamp))

	// 自动生成名称
	name := req.Name
	if name == "" {
		name = fmt.Sprintf("抓包_%s", timestamp)
	}

	// 构建 tcpdump 命令: tcpdump -i {interface} -nn -s 0 -U -w {filepath} {filter}
	args := []string{"-i", req.Interface, "-nn", "-s", "0", "-U", "-w", filePath}
	if filter != "" {
		args = append(args, filter)
	}

	cmd := exec.Command("tcpdump", args...)
	// Setpgid: 创建独立进程组，便于停止时杀掉整个进程组
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	// 捕获 stderr 用于解析 tcpdump 统计输出
	stderr, err := cmd.StderrPipe()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "create stderr pipe failed: " + err.Error()})
		return
	}

	if err := cmd.Start(); err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "start tcpdump failed: " + err.Error()})
		return
	}

	pid := cmd.Process.Pid
	now := time.Now()

	// 创建会话文档
	session := model.CaptureSession{
		ID:          sessionID,
		Name:        name,
		Status:      "running",
		Interface:   req.Interface,
		Filter:      filter,
		Protocol:    req.Protocol,
		MaxDuration: req.MaxDuration,
		MaxSize:     req.MaxSize,
		FilePath:    filePath,
		PID:         pid,
		StartedBy:   startedBy,
		StartedAt:   now,
	}

	if _, err := coll.InsertOne(ctx, session); err != nil {
		killProcessGroup(pid)
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "insert session failed: " + err.Error()})
		return
	}

	// 启动后台监控 goroutine
	go h.monitorCapture(session, cmd, stderr)

	log.Printf("capture started: session=%s pid=%d filter=%q", sessionID.Hex(), pid, filter)
	h.writeAuditLog(r, "CAPTURE_START", "capture", fmt.Sprintf("session=%s pid=%d filter=%q", sessionID.Hex(), pid, filter))

	writeJSON(w, http.StatusOK, captureResponse{
		Status:  "ok",
		Message: "capture started",
		Data:    session,
	})
}

// monitorCapture 监控抓包进程，定时更新 MongoDB 中的 file_size / packet_count，
// 检查超时和文件大小上限，进程退出后更新最终状态。
// 同时通过 WebSocket 推送 capture_progress 消息。
// pcap 文件超过 24 小时未下载的清理由 scheduler 负责（TODO: 后续实现）。
func (h *Handler) monitorCapture(session model.CaptureSession, cmd *exec.Cmd, stderr interface{ Read([]byte) (int, error) }) {
	coll := h.Mongo.Database.Collection("capture_sessions")
	startTime := session.StartedAt
	maxDuration := time.Duration(session.MaxDuration) * time.Second
	maxSizeBytes := int64(session.MaxSize) * 1024 * 1024

	// 从 stderr 异步读取 tcpdump 统计输出，解析 packet count
	var packetCount int64
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			// tcpdump stderr 格式: "N packets captured" / "N packets received by filter" / "N packets dropped"
			if strings.Contains(line, "packets captured") || strings.Contains(line, "packets received") {
				parts := strings.Fields(line)
				if len(parts) > 0 {
					if n, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
						packetCount = n
					}
				}
			}
		}
	}()

	// 监控定时器：每 2 秒检查一次
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// tcpdump 进程退出通知
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	for {
		select {
		case err := <-done:
			// tcpdump 进程已退出
			finalStatus := "completed"
			errMsg := ""
			if err != nil {
				if exitErr, ok := err.(*exec.ExitError); ok {
					if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
						if status.Signaled() && status.Signal() == syscall.SIGTERM {
							// 被 SIGTERM 终止属于正常停止
							finalStatus = "completed"
						} else {
							finalStatus = "error"
							errMsg = fmt.Sprintf("exit code %d", status.ExitStatus())
						}
					} else {
						finalStatus = "error"
						errMsg = err.Error()
					}
				} else {
					finalStatus = "error"
					errMsg = err.Error()
				}
			}

			// 获取最终文件大小
			var fileSize int64
			if info, statErr := os.Stat(session.FilePath); statErr == nil {
				fileSize = info.Size()
			}

			now := time.Now()
			update := bson.M{
				"$set": bson.M{
					"status":       finalStatus,
					"file_size":    fileSize,
					"packet_count": packetCount,
					"stopped_at":   now,
				},
			}
			if errMsg != "" {
				update["$set"].(bson.M)["error"] = errMsg
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			coll.UpdateOne(ctx, bson.M{"_id": session.ID}, update)
			cancel()

			log.Printf("capture finished: session=%s status=%s fileSize=%d packets=%d",
				session.ID.Hex(), finalStatus, fileSize, packetCount)
			return

		case <-ticker.C:
			// 定期更新文件大小和包计数
			var fileSize int64
			if info, statErr := os.Stat(session.FilePath); statErr == nil {
				fileSize = info.Size()
			}

			elapsed := time.Since(startTime)

			// 检查是否超时
			if elapsed >= maxDuration {
				log.Printf("capture timeout: session=%s elapsed=%v", session.ID.Hex(), elapsed)
				killProcessGroup(session.PID)
				continue
			}

			// 检查是否超过文件大小上限
			if fileSize >= maxSizeBytes {
				log.Printf("capture max size reached: session=%s size=%d", session.ID.Hex(), fileSize)
				killProcessGroup(session.PID)
				continue
			}

			// 更新 MongoDB 中的实时数据
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			coll.UpdateOne(ctx, bson.M{"_id": session.ID}, bson.M{
				"$set": bson.M{
					"file_size":    fileSize,
					"packet_count": packetCount,
				},
			})
			cancel()
		}
	}
}

// HandleCaptureStop 停止抓包
// POST /api/v1/capture/stop
func (h *Handler) HandleCaptureStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req captureStopRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if req.ID == "" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "id is required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(req.ID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid id format"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capture_sessions")

	var session model.CaptureSession
	if err := coll.FindOne(ctx, bson.M{"_id": objID}).Decode(&session); err != nil {
		writeJSON(w, http.StatusNotFound, captureResponse{Status: "error", Message: "session not found"})
		return
	}

	if session.Status != "running" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "session is not running, current status: " + session.Status})
		return
	}

	// 更新状态为 stopping
	coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": bson.M{"status": "stopping"}})

	// 发送 SIGTERM 给 tcpdump 进程组
	killProcessGroup(session.PID)

	// 等待进程退出（最多 5 秒），超时则 SIGKILL
	deadline := time.After(5 * time.Second)
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()

	waitDone := false
	for !waitDone {
		select {
		case <-deadline:
			log.Printf("capture stop timeout, sending SIGKILL: pid=%d", session.PID)
			syscall.Kill(-session.PID, syscall.SIGKILL)
			waitDone = true
		case <-tick.C:
			if !isProcessAlive(session.PID) {
				waitDone = true
			}
		}
	}

	// 获取最终文件大小
	var fileSize int64
	if info, statErr := os.Stat(session.FilePath); statErr == nil {
		fileSize = info.Size()
	}

	now := time.Now()
	coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{
		"$set": bson.M{
			"status":     "completed",
			"file_size":  fileSize,
			"stopped_at": now,
		},
	})

	// 重新查询返回完整对象
	coll.FindOne(ctx, bson.M{"_id": objID}).Decode(&session)

	log.Printf("capture stopped: session=%s fileSize=%d", session.ID.Hex(), fileSize)
	h.writeAuditLog(r, "CAPTURE_STOP", "capture", fmt.Sprintf("session=%s", session.ID.Hex()))

	writeJSON(w, http.StatusOK, captureResponse{
		Status:  "ok",
		Message: "capture stopped",
		Data:    session,
	})
}

// HandleCaptureSessions 查询抓包历史
// GET /api/v1/capture/sessions?page=1&page_size=20&status=completed
func (h *Handler) HandleCaptureSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capture_sessions")

	// 构建过滤条件
	filter := bson.M{}
	if status := r.URL.Query().Get("status"); status != "" {
		filter["status"] = status
	}

	// 分页参数
	page, pageSize := parseCapturePageParams(r)

	// 查询总数
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	// 分页查询，按 started_at 倒序
	opts := options.Find().
		SetSort(bson.M{"started_at": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var sessions []model.CaptureSession
	if err := cursor.All(ctx, &sessions); err != nil {
		writeJSON(w, http.StatusInternalServerError, captureResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if sessions == nil {
		sessions = []model.CaptureSession{}
	}

	writeJSON(w, http.StatusOK, captureSessionsResponse{
		Status:   "ok",
		Sessions: sessions,
		Total:    total,
	})
}

// HandleCaptureDownload 下载 PCAP 文件
// GET /api/v1/capture/download?id=session_id
func (h *Handler) HandleCaptureDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "id is required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid id format"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capture_sessions")

	var session model.CaptureSession
	if err := coll.FindOne(ctx, bson.M{"_id": objID}).Decode(&session); err != nil {
		writeJSON(w, http.StatusNotFound, captureResponse{Status: "error", Message: "session not found"})
		return
	}

	if session.Status != "completed" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "capture not completed, current status: " + session.Status})
		return
	}

	// 检查文件存在
	if _, err := os.Stat(session.FilePath); os.IsNotExist(err) {
		writeJSON(w, http.StatusNotFound, captureResponse{Status: "error", Message: "pcap file not found on server"})
		return
	}

	// 构造下载文件名：名称_时间戳.pcap
	downloadName := fmt.Sprintf("%s_%s.pcap",
		session.Name,
		session.StartedAt.Format("20060102_150405"),
	)
	// 替换空格为下划线，避免文件名问题
	downloadName = strings.ReplaceAll(downloadName, " ", "_")

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, downloadName))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, session.FilePath)
}

// HandleCaptureDelete 删除抓包会话和文件
// DELETE /api/v1/capture/sessions?id=session_id
func (h *Handler) HandleCaptureDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "id is required"})
		return
	}

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "invalid id format"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("capture_sessions")

	var session model.CaptureSession
	if err := coll.FindOne(ctx, bson.M{"_id": objID}).Decode(&session); err != nil {
		writeJSON(w, http.StatusNotFound, captureResponse{Status: "error", Message: "session not found"})
		return
	}

	// 不允许删除正在运行的会话
	if session.Status == "running" || session.Status == "stopping" {
		writeJSON(w, http.StatusBadRequest, captureResponse{Status: "error", Message: "cannot delete a running session, stop it first"})
		return
	}

	// 删除 pcap 文件
	if session.FilePath != "" {
		os.Remove(session.FilePath)
	}

	// 删除 MongoDB 记录
	coll.DeleteOne(ctx, bson.M{"_id": objID})

	h.writeAuditLog(r, "CAPTURE_DELETE", "capture", fmt.Sprintf("session=%s file=%s", session.ID.Hex(), session.FilePath))

	writeJSON(w, http.StatusOK, captureResponse{Status: "ok", Message: "deleted"})
}

// HandleCapturePresets 获取协议预设模板列表
// GET /api/v1/capture/presets
func (h *Handler) HandleCapturePresets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, captureResponse{Status: "error", Message: "method not allowed"})
		return
	}

	// 按固定顺序返回，方便前端展示
	order := []string{"volte_full", "sip", "diameter", "gtp", "s1ap_ngap", "rtp_media", "dns", "pfcp", "gtpv2", "ipsec_esp", "icmp", "all_telecom"}
	presets := make([]model.ProtocolPreset, 0, len(order))
	for _, key := range order {
		if p, ok := protocolPresets[key]; ok {
			presets = append(presets, model.ProtocolPreset{
				Key:    key,
				Label:  p.Label,
				Filter: p.Filter,
			})
		}
	}

	writeJSON(w, http.StatusOK, captureResponse{Status: "ok", Data: presets})
}

// killProcessGroup 向进程组发送 SIGTERM（负 PID 表示进程组）
func killProcessGroup(pid int) {
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		// 回退到仅杀单个进程
		syscall.Kill(pid, syscall.SIGTERM)
	}
}

// isProcessAlive 检查进程是否仍在运行
func isProcessAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil
}

// parseCapturePageParams 从请求中解析分页参数
func parseCapturePageParams(r *http.Request) (int, int) {
	page := 1
	pageSize := 20

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

	return page, pageSize
}
