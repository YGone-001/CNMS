package handler

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/config"
	"xcloud-cnms/internal/mml"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"
	"xcloud-cnms/internal/signaling"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// Handler 持有 HTTP 处理器的依赖
type Handler struct {
	Mongo      *mongo.Client
	MySQLDB    *sql.DB
	SCSCFDB    *sql.DB
	LogDir     string
	Auth       config.AuthConfig
	UploadDir  string // 知识库文件上传目录
	Homer      *signaling.HomerClient
	HomerCfg   config.HomerConfig
	TsharkQ    *signaling.TsharkQuery   // tshark 环形缓冲区查询引擎
	CapDaemon  *signaling.CaptureDaemon // 信令持续抓包守护进程
	HEPListener *signaling.HEPListener  // HEP 监听器（接收 Kamailio siptrace）
}

// New 创建 Handler 实例
func New(mc *mongo.Client, logDir string, authCfg config.AuthConfig) *Handler {
	return &Handler{Mongo: mc, LogDir: logDir, Auth: authCfg, UploadDir: "uploads/kb"}
}

// NewWithMySQL 创建带 MySQL 的 Handler 实例
func NewWithMySQL(mc *mongo.Client, mysqlDB *sql.DB, logDir string, authCfg config.AuthConfig) *Handler {
	return &Handler{Mongo: mc, MySQLDB: mysqlDB, LogDir: logDir, Auth: authCfg, UploadDir: "uploads/kb"}
}

// NewWithAllDB 创建带所有数据库的 Handler 实例
func NewWithAllDB(mc *mongo.Client, mysqlDB *sql.DB, scscfDB *sql.DB, logDir string, authCfg config.AuthConfig) *Handler {
	return &Handler{Mongo: mc, MySQLDB: mysqlDB, SCSCFDB: scscfDB, LogDir: logDir, Auth: authCfg, UploadDir: "uploads/kb"}
}

// SetHomer 设置 Homer 客户端
func (h *Handler) SetHomer(cfg config.HomerConfig) {
	h.HomerCfg = cfg
	if cfg.Enabled {
		h.Homer = signaling.NewHomerClient(signaling.HomerConfig{
			Enabled:   cfg.Enabled,
			APIURL:    cfg.APIURL,
			Username:  cfg.Username,
			Password:  cfg.Password,
			AuthToken: cfg.AuthToken,
		})
	}
}

// SetSignalingCapture 设置信令持续抓包守护进程和环形缓冲区查询引擎
func (h *Handler) SetSignalingCapture(daemon *signaling.CaptureDaemon, query *signaling.TsharkQuery) {
	h.CapDaemon = daemon
	h.TsharkQ = query
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Token   string `json:"token,omitempty"`
}

// Login 用户登录接口
// 优先从 MongoDB users 集合查询（bcrypt 验证），回退到配置文件硬编码凭据
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, LoginResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, LoginResponse{Status: "error", Message: "invalid request body"})
		return
	}

	role := "viewer"

	// 尝试从 MongoDB users 集合查询
	if h.Mongo != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		coll := h.Mongo.Database.Collection("users")
		var user model.User
		err := coll.FindOne(ctx, bson.M{"username": req.Username, "enabled": true}).Decode(&user)

		if err == nil {
			if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
				writeJSON(w, http.StatusUnauthorized, LoginResponse{Status: "error", Message: "invalid credentials"})
				return
			}
			role = user.Role
			now := time.Now()
			coll.UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"last_login": now}})
		} else {
			// 回退到配置文件凭据
			if req.Username != h.Auth.Username || req.Password != h.Auth.Password {
				writeJSON(w, http.StatusUnauthorized, LoginResponse{Status: "error", Message: "invalid credentials"})
				return
			}
			role = "admin"
		}
	} else {
		// 无 MongoDB，使用配置文件凭据
		if req.Username != h.Auth.Username || req.Password != h.Auth.Password {
			writeJSON(w, http.StatusUnauthorized, LoginResponse{Status: "error", Message: "invalid credentials"})
			return
		}
		role = "admin"
	}

	token, err := auth.GenerateToken(req.Username, role, 24*time.Hour)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, LoginResponse{Status: "error", Message: "token generation failed"})
		return
	}

	h.writeAuditLog(r, "LOGIN", "auth", fmt.Sprintf("user=%s role=%s", req.Username, role))

	writeJSON(w, http.StatusOK, LoginResponse{Status: "ok", Message: "login successful", Token: token})
}

// mmlRequest MML 执行请求体
type mmlRequest struct {
	Command string `json:"command"`
}

// mmlResponse MML 执行响应体
type mmlResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	IMSI    string `json:"imsi,omitempty"`
}

// MMLExecute 解析 MML 命令并分发执行
func (h *Handler) MMLExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{
			Status:  "error",
			Message: "method not allowed",
		})
		return
	}

	var req mmlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: "invalid request body",
		})
		return
	}

	cmd, err := mml.Parse(req.Command)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	// 按命令类型分发执行，每个分支写审计日志
	switch cmd.Name {
	case "ADD-SUB":
		h.executeAddSub(w, r, cmd)
		h.writeAuditLog(r, "ADD-SUB", "subscriber", req.Command)
	case "DEL-SUB":
		h.executeDelSub(w, r, cmd)
		h.writeAuditLog(r, "DEL-SUB", "subscriber", req.Command)
	case "LST-SUB":
		h.executeLSTSub(w, r, cmd)
	case "MOD-SUB":
		h.executeMODSub(w, r, cmd)
		h.writeAuditLog(r, "MOD-SUB", "subscriber", req.Command)
	case "CTRL-NF":
		h.executeCtrlNF(w, r, cmd)
		h.writeAuditLog(r, "CTRL-NF", "nf", req.Command)
	case "ACK-ALARM":
		h.executeACKAlarm(w, r, cmd)
		h.writeAuditLog(r, "ACK-ALARM", "alarm", req.Command)
	case "CLR-ALARM":
		h.executeCLRAlarm(w, r, cmd)
		h.writeAuditLog(r, "CLR-ALARM", "alarm", req.Command)
	case "ADD-SUB-BATCH":
		h.executeBatchSub(w, r, cmd)
		h.writeAuditLog(r, "ADD-SUB-BATCH", "subscriber", req.Command)
	case "EXP-SUB":
		h.executeExportSub(w, r, cmd)
		h.writeAuditLog(r, "EXP-SUB", "subscriber", req.Command)
	case "IMP-SUB":
		h.executeImportSub(w, r, cmd)
		h.writeAuditLog(r, "IMP-SUB", "subscriber", req.Command)
	default:
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: "unsupported command: " + cmd.Name,
		})
	}
}

// executeAddSub 处理 ADD-SUB 命令，插入用户到 MongoDB
func (h *Handler) executeAddSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	// 转换为 Subscriber 文档
	sub, err := mml.ToSubscriber(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	// 写入 MongoDB subscribers 集合
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")
	if _, err := coll.InsertOne(ctx, sub); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{
			Status:  "error",
			Message: "insert failed: " + err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "subscriber added",
		IMSI:    sub.IMSI,
	})
}

// executeDelSub 处理 DEL-SUB 命令，从 MongoDB 删除指定 IMSI 的用户
func (h *Handler) executeDelSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	imsi, err := mml.ValidateDELSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")
	result, err := coll.DeleteOne(ctx, bson.M{"imsi": imsi})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{
			Status:  "error",
			Message: "delete failed: " + err.Error(),
		})
		return
	}

	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{
			Status:  "error",
			Message: "subscriber not found: " + imsi,
		})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "subscriber deleted",
		IMSI:    imsi,
	})
}

// lstSubResponse LST-SUB 命令响应体
type lstSubResponse struct {
	Status      string              `json:"status"`
	Message     string              `json:"message,omitempty"`
	Subscribers []model.Subscriber  `json:"subscribers,omitempty"`
	Count       int                 `json:"count,omitempty"`
	Page        int                 `json:"page,omitempty"`
	PageSize    int                 `json:"page_size,omitempty"`
	Total       int64               `json:"total,omitempty"`
}

// executeLSTSub 处理 LST-SUB 命令，查询 MongoDB 中的用户（支持分页）
func (h *Handler) executeLSTSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	imsi, page, pageSize, err := mml.ValidateLSTSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, lstSubResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	filter := bson.M{}
	if imsi != "" {
		filter["imsi"] = imsi
	}

	// 查询总数
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, lstSubResponse{
			Status:  "error",
			Message: "count failed: " + err.Error(),
		})
		return
	}

	// 分页查询
	skip := int64((page - 1) * pageSize)
	limit := int64(pageSize)
	opts := options.Find().SetSkip(skip).SetLimit(limit)

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, lstSubResponse{
			Status:  "error",
			Message: "query failed: " + err.Error(),
		})
		return
	}
	defer cursor.Close(ctx)

	var subs []model.Subscriber
	if err := cursor.All(ctx, &subs); err != nil {
		writeJSON(w, http.StatusInternalServerError, lstSubResponse{
			Status:  "error",
			Message: "decode failed: " + err.Error(),
		})
		return
	}

	if subs == nil {
		subs = []model.Subscriber{}
	}

	writeJSON(w, http.StatusOK, lstSubResponse{
		Status:      "ok",
		Message:     fmt.Sprintf("found %d subscriber(s), page %d/%d", total, page, (total+int64(pageSize)-1)/int64(pageSize)),
		Subscribers: subs,
		Count:       len(subs),
		Page:        page,
		PageSize:    pageSize,
		Total:       total,
	})
}

// executeMODSub 处理 MOD-SUB 命令，修改 MongoDB 中的用户数据
func (h *Handler) executeMODSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	imsi, updates, err := mml.ValidateMODSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	// 先查询现有用户，以便正确更新 sessions 数组
	var sub model.Subscriber
	if err := coll.FindOne(ctx, bson.M{"imsi": imsi}).Decode(&sub); err != nil {
		writeJSON(w, http.StatusNotFound, mmlResponse{
			Status:  "error",
			Message: "subscriber not found: " + imsi,
		})
		return
	}

	// 构建更新字段
	setFields := bson.M{}
	if apn, ok := updates["APN"]; ok {
		if len(sub.Sessions) > 0 {
			sub.Sessions[0].Name = apn
		} else {
			sub.Sessions = []model.Session{{Name: apn, Type: 3, QoS: 9}}
		}
		setFields["sessions"] = sub.Sessions
	}
	if qos, ok := updates["QOS"]; ok {
		var qosVal int
		if _, err := fmt.Sscanf(qos, "%d", &qosVal); err != nil {
			writeJSON(w, http.StatusBadRequest, mmlResponse{
				Status:  "error",
				Message: "invalid QOS value: " + qos,
			})
			return
		}
		if len(sub.Sessions) > 0 {
			sub.Sessions[0].QoS = qosVal
		} else {
			sub.Sessions = []model.Session{{Name: "internet", Type: 3, QoS: qosVal}}
		}
		setFields["sessions"] = sub.Sessions
	}
	if ambrDL, ok := updates["AMBR_DL"]; ok {
		var val int
		if _, err := fmt.Sscanf(ambrDL, "%d", &val); err != nil {
			writeJSON(w, http.StatusBadRequest, mmlResponse{
				Status:  "error",
				Message: "invalid AMBR_DL value: " + ambrDL,
			})
			return
		}
		setFields["ambr.downlink.value"] = val
	}
	if ambrUL, ok := updates["AMBR_UL"]; ok {
		var val int
		if _, err := fmt.Sscanf(ambrUL, "%d", &val); err != nil {
			writeJSON(w, http.StatusBadRequest, mmlResponse{
				Status:  "error",
				Message: "invalid AMBR_UL value: " + ambrUL,
			})
			return
		}
		setFields["ambr.uplink.value"] = val
	}
	if ambrUnit, ok := updates["AMBR_UNIT"]; ok {
		var val int
		if _, err := fmt.Sscanf(ambrUnit, "%d", &val); err != nil {
			writeJSON(w, http.StatusBadRequest, mmlResponse{
				Status:  "error",
				Message: "invalid AMBR_UNIT value: " + ambrUnit,
			})
			return
		}
		setFields["ambr.downlink.unit"] = val
		setFields["ambr.uplink.unit"] = val
	}

	result, err := coll.UpdateOne(ctx, bson.M{"imsi": imsi}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{
			Status:  "error",
			Message: "update failed: " + err.Error(),
		})
		return
	}

	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{
			Status:  "error",
			Message: "subscriber not found: " + imsi,
		})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: fmt.Sprintf("subscriber %s updated (%d field(s))", imsi, len(setFields)),
		IMSI:    imsi,
	})
}

// executeCtrlNF 处理 CTRL-NF 命令，通过 systemctl 控制网元服务
func (h *Handler) executeCtrlNF(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	params, err := mml.ValidateCtrlNF(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{
			Status:  "error",
			Message: err.Error(),
		})
		return
	}

	// 安全检查：防止命令注入，只允许字母数字和连字符
	for _, c := range params.Name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			writeJSON(w, http.StatusBadRequest, mmlResponse{
				Status:  "error",
				Message: "invalid service name: only alphanumeric, hyphen and underscore allowed",
			})
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	serviceName := params.Name + ".service"
	execCmd := exec.CommandContext(ctx, "sudo", "systemctl", params.Action, serviceName)
	output, err := execCmd.CombinedOutput()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{
			Status:  "error",
			Message: "systemctl failed: " + err.Error() + " (" + string(output) + ")",
		})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: params.Name + " " + params.Action + " completed",
	})
}

// executeACKAlarm 处理 ACK-ALARM 命令，确认告警
func (h *Handler) executeACKAlarm(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	id, err := mml.ValidateACKAlarm(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid alarm ID"})
		return
	}

	now := time.Now()
	coll := h.Mongo.Database.Collection("alarms")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{
		"$set": bson.M{"acknowledged": true, "ack_by": "operator", "ack_at": now},
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "alarm not found"})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "alarm acknowledged"})
}

// executeCLRAlarm 处理 CLR-ALARM 命令，清除告警
func (h *Handler) executeCLRAlarm(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	id, err := mml.ValidateCLRAlarm(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	objID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid alarm ID"})
		return
	}

	now := time.Now()
	coll := h.Mongo.Database.Collection("alarms")
	result, err := coll.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{
		"$set": bson.M{"cleared": true, "cleared_by": "operator", "cleared_at": now},
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "alarm not found"})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{Status: "ok", Message: "alarm cleared"})
}

// alarmHistoryResponse 告警历史响应
type alarmHistoryResponse struct {
	Status  string        `json:"status"`
	Message string        `json:"message,omitempty"`
	Alarms  []model.Alarm `json:"alarms,omitempty"`
	Total   int           `json:"total,omitempty"`
}

// GetAlarmHistory 查询告警历史
func (h *Handler) GetAlarmHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, alarmHistoryResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	filter := bson.M{}

	if sev := r.URL.Query().Get("severity"); sev != "" {
		filter["severity"] = sev
	}
	if source := r.URL.Query().Get("source"); source != "" {
		filter["source"] = source
	}
	if r.URL.Query().Get("active") == "true" {
		filter["cleared"] = false
	}
	if r.URL.Query().Get("acknowledged") == "false" {
		filter["acknowledged"] = false
	}

	coll := h.Mongo.Database.Collection("alarms")

	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, alarmHistoryResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	// 分页参数
	page := 1
	pageSize := 50
	if v := r.URL.Query().Get("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
		if page < 1 {
			page = 1
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
		if pageSize < 1 || pageSize > 200 {
			pageSize = 50
		}
	}

	opts := options.Find().
		SetSort(bson.M{"timestamp": -1}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))
	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, alarmHistoryResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var alarms []model.Alarm
	if err := cursor.All(ctx, &alarms); err != nil {
		writeJSON(w, http.StatusInternalServerError, alarmHistoryResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if alarms == nil {
		alarms = []model.Alarm{}
	}

	writeJSON(w, http.StatusOK, alarmHistoryResponse{Status: "ok", Message: "ok", Alarms: alarms, Total: int(total)})
}

// batchSubResponse 批量导入响应
type batchSubResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Added   int    `json:"added,omitempty"`
	Failed  int    `json:"failed,omitempty"`
}

// executeBatchSub 处理 ADD-SUB-BATCH 命令，从 CSV 文件批量导入用户
func (h *Handler) executeBatchSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	file, err := mml.ValidateBatchSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: err.Error()})
		return
	}

	data, err := os.ReadFile(file)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: "read file failed: " + err.Error()})
		return
	}

	reader := csv.NewReader(strings.NewReader(string(data)))
	records, err := reader.ReadAll()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: "parse CSV failed: " + err.Error()})
		return
	}

	if len(records) == 0 {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: "CSV file is empty"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	// 跳过表头行
	start := 0
	if len(records) > 0 && (records[0][0] == "IMSI" || records[0][0] == "imsi") {
		start = 1
	}

	// 构建批量文档
	var docs []interface{}
	failed := 0
	for i := start; i < len(records); i++ {
		row := records[i]
		if len(row) < 1 {
			failed++
			continue
		}
		imsi := strings.TrimSpace(row[0])
		if imsi == "" {
			failed++
			continue
		}

		apn := "internet"
		if len(row) > 1 && strings.TrimSpace(row[1]) != "" {
			apn = strings.TrimSpace(row[1])
		}

		docs = append(docs, &model.Subscriber{
			ID:                    bson.NewObjectID(),
			IMSI:                  imsi,
			SubscribedRAUTAUTimer: 12,
			NetworkAccessMode:     0,
			SubscriberStatus:      0,
			AccessRestrData:       8,
			Security: model.Security{
				K:   "465B5CE8B199B49FAA5F0A2EE238A6BC",
				Amf: "8000",
			},
			Ambr: model.APNAMBR{
				Downlink: model.QoSValue{Value: 1, Unit: 3},
				Uplink:   model.QoSValue{Value: 1, Unit: 3},
			},
			Sessions: []model.Session{
				{
					Name: apn,
					Type: 3,
					Ambr: model.APNAMBR{
						Downlink: model.QoSValue{Value: 1, Unit: 3},
						Uplink:   model.QoSValue{Value: 1, Unit: 3},
					},
					QoS: 9,
				},
			},
		})
	}

	added := 0
	if len(docs) > 0 {
		result, err := coll.InsertMany(ctx, docs)
		if err != nil {
			failed += len(docs)
		} else {
			added = len(result.InsertedIDs)
		}
	}

	writeJSON(w, http.StatusOK, batchSubResponse{
		Status:  "ok",
		Message: fmt.Sprintf("batch import completed: %d added, %d failed", added, failed),
		Added:   added,
		Failed:  failed,
	})
}

// exportSubResponse 导出响应
type exportSubResponse struct {
	Status      string              `json:"status"`
	Message     string              `json:"message,omitempty"`
	Subscribers []model.Subscriber  `json:"subscribers,omitempty"`
	Count       int                 `json:"count,omitempty"`
}

// executeExportSub 处理 EXP-SUB 命令，导出全部用户为 JSON
func (h *Handler) executeExportSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	file, err := mml.ValidateExportSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var subs []model.Subscriber
	if err := cursor.All(ctx, &subs); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}

	if subs == nil {
		subs = []model.Subscriber{}
	}

	jsonData, err := json.MarshalIndent(subs, "", "  ")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "marshal failed: " + err.Error()})
		return
	}

	if err := os.WriteFile(file, jsonData, 0644); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "write file failed: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: fmt.Sprintf("exported %d subscribers to %s", len(subs), file),
	})
}

// executeImportSub 处理 IMP-SUB 命令，从 JSON 文件批量导入用户
func (h *Handler) executeImportSub(w http.ResponseWriter, r *http.Request, cmd *mml.Command) {
	file, err := mml.ValidateImportSub(cmd)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: err.Error()})
		return
	}

	data, err := os.ReadFile(file)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: "read file failed: " + err.Error()})
		return
	}

	var subs []model.Subscriber
	if err := json.Unmarshal(data, &subs); err != nil {
		writeJSON(w, http.StatusBadRequest, batchSubResponse{Status: "error", Message: "parse JSON failed: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")
	added := 0
	failed := 0

	for _, sub := range subs {
		if sub.IMSI == "" {
			failed++
			continue
		}
		sub.ID = bson.NewObjectID()
		if _, err := coll.InsertOne(ctx, sub); err != nil {
			failed++
		} else {
			added++
		}
	}

	writeJSON(w, http.StatusOK, batchSubResponse{
		Status:  "ok",
		Message: fmt.Sprintf("import completed: %d added, %d failed", added, failed),
		Added:   added,
		Failed:  failed,
	})
}

// writeJSON 统一 JSON 响应写入
func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// writeAuditLog 写入审计日志
func (h *Handler) writeAuditLog(r *http.Request, action, resource, detail string) {
	if h.Mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	user := "anonymous"
	if claims := auth.GetClaimsFromContext(r.Context()); claims != nil {
		user = claims.Username
	}

	entry := model.AuditLog{
		User:      user,
		Action:    action,
		Resource:  resource,
		Detail:    detail,
		IP:        r.RemoteAddr,
		Timestamp: time.Now(),
	}

	coll := h.Mongo.Database.Collection("audit_logs")
	coll.InsertOne(ctx, entry)
}

// CheckReadiness 检查应用就绪状态（用于 /readyz 端点）
func (h *Handler) CheckReadiness() error {
	if h.Mongo == nil {
		return fmt.Errorf("MongoDB client not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// 执行 ping 命令检查 MongoDB 连接
	if err := h.Mongo.Ping(ctx); err != nil {
		return fmt.Errorf("MongoDB ping failed: %w", err)
	}

	return nil
}
