package handler

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// BusinessMetrics 业务指标
type BusinessMetrics struct {
	EPCOnlineUsers   int64 `json:"epc_online_users"`  // EPC/5GC 在线用户数（有活跃会话）
	IMSOnlineUsers   int64 `json:"ims_online_users"`  // IMS 在线用户数（已注册）
	TotalSubscribers int64 `json:"total_subscribers"` // 总订户数（EPC/5GC）
	TotalIMSUsers    int64 `json:"total_ims_users"`   // 总 IMS 用户数
}

// GetBusinessMetrics 获取业务指标
func (h *Handler) GetBusinessMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	metrics := BusinessMetrics{}

	// 从 MongoDB (open5gs) 获取 EPC/5GC 订户数据
	if h.Mongo != nil {
		client := h.Mongo.GetClient()
		open5gsDB := client.Database("open5gs")

		// 获取总订户数
		subscribersColl := open5gsDB.Collection("subscribers")
		totalCount, err := subscribersColl.CountDocuments(ctx, bson.M{})
		if err == nil {
			metrics.TotalSubscribers = totalCount
		}
	}

	// 从 Prometheus metrics 接口获取 EPC/5GC 在线用户数
	// 访问 pgwc/smf 的 metrics 接口获取 ues_active 指标
	epcOnlineUsers, err := getEPCOnlineUsersFromMetrics()
	if err == nil {
		metrics.EPCOnlineUsers = epcOnlineUsers
	}

	// 从 MySQL (hss_db) 获取 IMS 用户数据
	if h.MySQLDB != nil {
		// 获取总 IMS 用户数
		var totalIMSUsers int64
		err := h.MySQLDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM hss_db.impi").Scan(&totalIMSUsers)
		if err == nil {
			metrics.TotalIMSUsers = totalIMSUsers
		}
	}

	// 从 S-CSCF (scscf) 获取 IMS 在线终端数
	// 查询当前未过期的 Contact 数
	if h.SCSCFDB != nil {
		var onlineIMSUsers int64
		query := `
			SELECT COUNT(DISTINCT c.id) AS ims_online_terminal_count
			FROM contact c
			JOIN impu_contact ic ON ic.contact_id = c.id
			JOIN impu i ON i.id = ic.impu_id
			WHERE c.expires IS NOT NULL
			  AND c.expires > NOW()
		`
		err := h.SCSCFDB.QueryRowContext(ctx, query).Scan(&onlineIMSUsers)
		if err == nil {
			metrics.IMSOnlineUsers = onlineIMSUsers
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   metrics,
	})
}

// InitMySQLDB 初始化 MySQL 连接 (HSS)
func InitMySQLDB() (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		"root", "root", "localhost", 3306, "hss_db")

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return nil, err
	}

	// 设置连接池
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// InitSCSCFMySQLDB 初始化 S-CSCF MySQL 连接
func InitSCSCFMySQLDB() (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		"scscf", "xscscf", "localhost", 3306, "scscf")

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return nil, err
	}

	// 设置连接池
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// getEPCOnlineUsersFromMetrics 从 Prometheus metrics 接口获取 EPC/5GC 在线用户数
// 访问 pgwc/smf 的 metrics 接口获取 ues_active 指标
func getEPCOnlineUsersFromMetrics() (int64, error) {
	// pgwc/smf 的 metrics 接口地址
	metricsURL := "http://127.0.0.4:9090/metrics"

	// 创建 HTTP 客户端，设置超时
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	// 发送请求
	resp, err := client.Get(metricsURL)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch metrics: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	// 解析 metrics，查找 ues_active 指标
	return parseUESActive(string(body))
}

// parseUESActive 从 Prometheus metrics 文本中解析 ues_active 指标
func parseUESActive(metricsText string) (int64, error) {
	scanner := bufio.NewScanner(strings.NewReader(metricsText))

	for scanner.Scan() {
		line := scanner.Text()

		// 跳过注释行
		if strings.HasPrefix(line, "#") {
			continue
		}

		// 查找 ues_active 指标
		if strings.HasPrefix(line, "ues_active") {
			// 格式: ues_active <value>
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				value, err := strconv.ParseInt(parts[1], 10, 64)
				if err != nil {
					return 0, fmt.Errorf("failed to parse ues_active value: %w", err)
				}
				return value, nil
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("failed to scan metrics: %w", err)
	}

	// 未找到 ues_active 指标
	return 0, nil
}
