package signaling

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"
)

// HomerConfig Homer 连接配置
type HomerConfig struct {
	Enabled  bool   `json:"enabled"`
	APIURL   string `json:"api_url"`
	Username string `json:"username"`
	Password string `json:"password"`
	AuthToken string `json:"auth_token,omitempty"`
}

// HomerClient Homer API 客户端
type HomerClient struct {
	config     HomerConfig
	httpClient *http.Client
	authToken  string
}

// NewHomerClient 创建 Homer 客户端
func NewHomerClient(cfg HomerConfig) *HomerClient {
	return &HomerClient{
		config: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		authToken: cfg.AuthToken,
	}
}

// ---------------------------------------------------------------------------
// Homer API 请求/响应类型
// ---------------------------------------------------------------------------

// homerSearchRequest Homer 搜索请求
type homerSearchRequest struct {
	Timestamp struct {
		Start string `json:"start"`
		End   string `json:"end"`
	} `json:"timestamp"`
	Param struct {
		CallID  string `json:"callid,omitempty"`
		From    string `json:"from_user,omitempty"`
		To      string `json:"to_user,omitempty"`
		Method  string `json:"method,omitempty"`
		Custom  map[string]string `json:"custom,omitempty"`
	} `json:"param"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// homerSearchResponse Homer 搜索响应
type homerSearchResponse struct {
	Count int              `json:"count"`
	Data  []homerMessage   `json:"data"`
}

// homerMessage Homer 原始消息
type homerMessage struct {
	ID        string            `json:"_id"`
	CreateDate string           `json:"create_date"`
	Protocol  int               `json:"protocol"`
	ProtoType string            `json:"proto_type"`
	SrcIP     string            `json:"src_ip"`
	DstIP     string            `json:"dst_ip"`
	SrcPort   int               `json:"src_port"`
	DstPort   int               `json:"dst_port"`
	Method    string            `json:"method"`
	MsgType   string            `json:"msg_type"`
	CallID    string            `json:"callid"`
	FromUser  string            `json:"from_user"`
	FromTag   string            `json:"from_tag"`
	ToUser    string            `json:"to_user"`
	ToTag     string            `json:"to_tag"`
	UserAgent string            `json:"user_agent"`
	Body      string            `json:"body"`
	Raw       string            `json:"raw"`
	Node      string            `json:"node"`
	TimeValSec  int64           `json:"time_val_sec"`
	TimeValUsec int64           `json:"time_val_usec"`
}

// homerCallFlow Homer Call Flow 响应
type homerCallFlow struct {
	CallID string         `json:"callid"`
	Flow  []homerMessage  `json:"flow"`
}

// homerAuthRequest Homer 登录请求
type homerAuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// homerAuthResponse Homer 登录响应
type homerAuthResponse struct {
	Token   string `json:"token"`
	Expires string `json:"expires,omitempty"`
}

// homerStatusResponse Homer 状态响应
type homerStatusResponse struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
}

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

// Login 登录获取 token
func (c *HomerClient) Login(ctx context.Context) error {
	if c.config.AuthToken != "" {
		c.authToken = c.config.AuthToken
		return nil
	}

	body := homerAuthRequest{
		Username: c.config.Username,
		Password: c.config.Password,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal auth request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.config.APIURL+"/api/v3/auth", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("homer auth request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("homer auth failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var authResp homerAuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return fmt.Errorf("decode auth response: %w", err)
	}

	if authResp.Token == "" {
		return fmt.Errorf("homer auth returned empty token")
	}

	c.authToken = authResp.Token
	log.Printf("HomerClient: authenticated successfully")
	return nil
}

// Health 检查 Homer 连接状态
func (c *HomerClient) Health(ctx context.Context) (*homerStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.config.APIURL+"/api/v3/health", nil)
	if err != nil {
		return nil, fmt.Errorf("create health request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("homer health request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("homer health check failed: status %d", resp.StatusCode)
	}

	var status homerStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("decode health response: %w", err)
	}

	return &status, nil
}

// ---------------------------------------------------------------------------
// 搜索方法
// ---------------------------------------------------------------------------

// SearchCallData 按 Call-ID 和时间范围搜索 SIP 消息
func (c *HomerClient) SearchCallData(ctx context.Context, callID string, start, end time.Time, limit int) ([]model.SignalingMessage, error) {
	req := homerSearchRequest{
		Limit:  limit,
	}
	req.Timestamp.Start = start.UTC().Format(time.RFC3339)
	req.Timestamp.End = end.UTC().Format(time.RFC3339)
	req.Param.CallID = callID

	return c.doSearch(ctx, "/api/v3/search/call/data", req)
}

// SearchBySIPURI 按 SIP URI (From/To) 搜索
func (c *HomerClient) SearchBySIPURI(ctx context.Context, sipURI string, start, end time.Time, limit int) ([]model.SignalingMessage, error) {
	req := homerSearchRequest{
		Limit:  limit,
	}
	req.Timestamp.Start = start.UTC().Format(time.RFC3339)
	req.Timestamp.End = end.UTC().Format(time.RFC3339)
	req.Param.From = sipURI
	req.Param.To = sipURI

	return c.doSearch(ctx, "/api/v3/search/call/data", req)
}

// SearchByMethod 按 SIP 方法搜索
func (c *HomerClient) SearchByMethod(ctx context.Context, method string, start, end time.Time, limit int) ([]model.SignalingMessage, error) {
	req := homerSearchRequest{
		Limit:  limit,
	}
	req.Timestamp.Start = start.UTC().Format(time.RFC3339)
	req.Timestamp.End = end.UTC().Format(time.RFC3339)
	req.Param.Method = method

	return c.doSearch(ctx, "/api/v3/search/call/data", req)
}

// GetCallFlow 获取完整 Call Flow（时序图数据）
func (c *HomerClient) GetCallFlow(ctx context.Context, callID string, start, end time.Time) ([]model.SignalingMessage, error) {
	url := fmt.Sprintf("%s/api/v3/call/report/callid/%s?from_date=%s&to_date=%s",
		c.config.APIURL,
		callID,
		start.UTC().Format(time.RFC3339),
		end.UTC().Format(time.RFC3339),
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("create callflow request: %w", err)
	}
	c.setAuthHeader(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("homer callflow request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("homer callflow failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var flow homerCallFlow
	if err := json.NewDecoder(resp.Body).Decode(&flow); err != nil {
		return nil, fmt.Errorf("decode callflow response: %w", err)
	}

	return c.convertMessages(flow.Flow, ""), nil
}

// Search 通用搜索入口，根据查询类型自动选择搜索方式
func (c *HomerClient) Search(ctx context.Context, queryType, queryValue string, start, end time.Time, traceID string) ([]model.SignalingMessage, error) {
	if !c.config.Enabled {
		return nil, nil
	}

	// 确保已认证
	if c.authToken == "" {
		if err := c.Login(ctx); err != nil {
			return nil, fmt.Errorf("homer login: %w", err)
		}
	}

	limit := 5000

	switch queryType {
	case "call_id":
		return c.SearchCallData(ctx, queryValue, start, end, limit)
	case "sip_uri", "msisdn", "impu", "impi":
		return c.SearchBySIPURI(ctx, queryValue, start, end, limit)
	default:
		// 对于 IMSI/SUPI/TEID 等，先尝试通用搜索
		return c.searchCustom(ctx, queryType, queryValue, start, end, limit, traceID)
	}
}

// searchCustom 自定义搜索（使用 custom 参数）
func (c *HomerClient) searchCustom(ctx context.Context, queryType, queryValue string, start, end time.Time, limit int, traceID string) ([]model.SignalingMessage, error) {
	req := homerSearchRequest{
		Limit: limit,
	}
	req.Timestamp.Start = start.UTC().Format(time.RFC3339)
	req.Timestamp.End = end.UTC().Format(time.RFC3339)

	// 根据查询类型设置 custom 参数
	if req.Param.Custom == nil {
		req.Param.Custom = make(map[string]string)
	}

	switch queryType {
	case "imsi":
		req.Param.Custom["imsi"] = queryValue
	case "supi":
		req.Param.Custom["imsi"] = queryValue
	case "teid":
		req.Param.Custom["teid"] = queryValue
	case "ip":
		req.Param.Custom["src_ip"] = queryValue
		req.Param.Custom["dst_ip"] = queryValue
	}

	return c.doSearch(ctx, "/api/v3/search/call/data", req)
}

// ---------------------------------------------------------------------------
// 内部方法
// ---------------------------------------------------------------------------

// doSearch 执行搜索请求
func (c *HomerClient) doSearch(ctx context.Context, path string, reqBody homerSearchRequest) ([]model.SignalingMessage, error) {
	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal search request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.config.APIURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create search request: %w", err)
	}
	c.setAuthHeader(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("homer search request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		// Token 过期，重新登录
		log.Printf("HomerClient: token expired, re-authenticating")
		if err := c.Login(ctx); err != nil {
			return nil, fmt.Errorf("homer re-login: %w", err)
		}
		// 重试请求
		req, _ = http.NewRequestWithContext(ctx, "POST", c.config.APIURL+path, bytes.NewReader(data))
		c.setAuthHeader(req)
		req.Header.Set("Content-Type", "application/json")
		resp, err = c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("homer search retry: %w", err)
		}
		defer resp.Body.Close()
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("homer search failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var searchResp homerSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("decode search response: %w", err)
	}

	return c.convertMessages(searchResp.Data, ""), nil
}

// setAuthHeader 设置认证头
func (c *HomerClient) setAuthHeader(req *http.Request) {
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
}

// convertMessages 将 Homer 消息转换为统一的 SignalingMessage 格式
func (c *HomerClient) convertMessages(homerMsgs []homerMessage, traceID string) []model.SignalingMessage {
	messages := make([]model.SignalingMessage, 0, len(homerMsgs))

	for _, hm := range homerMsgs {
		// 解析时间戳
		var ts time.Time
		if hm.TimeValSec > 0 {
			ts = time.Unix(hm.TimeValSec, hm.TimeValUsec*1000)
		} else if hm.CreateDate != "" {
			t, err := time.Parse(time.RFC3339, hm.CreateDate)
			if err == nil {
				ts = t
			} else {
				ts = time.Now()
			}
		} else {
			ts = time.Now()
		}

		// 判断消息方向
		direction := "request"
		if hm.MsgType == "reply" || hm.MsgType == "response" {
			direction = "response"
		}

		// 提取状态码
		statusCode := 0
		statusText := ""
		if hm.Method == "SIP/2.0" || hm.MsgType == "reply" {
			// 从 method 字段解析状态行: "SIP/2.0 200 OK"
			fmt.Sscanf(hm.Method, "SIP/2.0 %d", &statusCode)
			if statusCode > 0 {
				direction = "response"
			}
		}

		// 提取 SIP 头信息
		details := make(map[string]any)
		if hm.FromUser != "" {
			details["from"] = hm.FromUser
			if hm.FromTag != "" {
				details["from_tag"] = hm.FromTag
			}
		}
		if hm.ToUser != "" {
			details["to"] = hm.ToUser
			if hm.ToTag != "" {
				details["to_tag"] = hm.ToTag
			}
		}
		if hm.UserAgent != "" {
			details["user_agent"] = hm.UserAgent
		}
		if hm.Node != "" {
			details["homer_node"] = hm.Node
		}
		if hm.Body != "" {
			details["sip_body"] = truncateStr(hm.Body, 5000)
		}

		// 判断是否包含 SDP
		if hm.Body != "" && (containsSDP(hm.Body)) {
			details["sdp"] = hm.Body
		}

		msg := model.SignalingMessage{
			TraceID:       traceID,
			Timestamp:     ts,
			Protocol:      "SIP",
			Interface:     "Gm",
			Direction:     direction,
			Method:        hm.Method,
			StatusCode:    statusCode,
			StatusText:    statusText,
			SourceEntity:  inferSIPSource(hm.Method, direction),
			DestEntity:    inferSIPDest(hm.Method, direction),
			SourceIP:      hm.SrcIP,
			DestIP:        hm.DstIP,
			SourcePort:    hm.SrcPort,
			DestPort:      hm.DstPort,
			Identifiers: model.MessageIdentifiers{
				SIPURI:  hm.FromUser,
				CallID:  hm.CallID,
			},
			CallID:     hm.CallID,
			Details:    details,
			RawPreview: truncateStr(hm.Raw, 2000),
		}

		messages = append(messages, msg)
	}

	return messages
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

// inferSIPSource 根据 SIP 方法推断源实体
func inferSIPSource(method string, direction string) string {
	if direction == "response" {
		return "S-CSCF"
	}
	// 请求方向
	switch method {
	case "REGISTER":
		return "UE"
	case "INVITE", "BYE", "CANCEL", "ACK":
		return "UE"
	case "MESSAGE":
		return "UE"
	default:
		return "UE"
	}
}

// inferSIPDest 根据 SIP 方法推断目的实体
func inferSIPDest(method string, direction string) string {
	if direction == "response" {
		return "UE"
	}
	// 请求方向
	switch method {
	case "REGISTER":
		return "P-CSCF"
	case "INVITE", "BYE", "CANCEL", "ACK":
		return "P-CSCF"
	case "MESSAGE":
		return "P-CSCF"
	default:
		return "P-CSCF"
	}
}

// containsSDP 检查是否包含 SDP
func containsSDP(body string) bool {
	return len(body) > 10 &&
		(bytes.Contains([]byte(body), []byte("v=0\r\n")) ||
			bytes.Contains([]byte(body), []byte("v=0\n")))
}

// truncateStr 截断字符串
func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
