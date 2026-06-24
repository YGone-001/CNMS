package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"
)

// InterfaceHealth 单个 NF 接口健康状态
type InterfaceHealth struct {
	NFName    string    `bson:"nf_name" json:"nf_name"`
	Port      int       `bson:"port" json:"port"`
	Path      string    `bson:"path" json:"path"`
	Status    string    `bson:"status" json:"status"`     // healthy, degraded, down, unknown
	Latency   int64     `bson:"latency" json:"latency"`   // 响应延迟(ms)
	HTTPCode  int       `bson:"http_code" json:"http_code"`
	CheckedAt time.Time `bson:"checked_at" json:"checked_at"`
}

// HealthProber NF 接口健康探测器
type HealthProber struct {
	mongo      *mongo.Client
	httpClient *http.Client
	mu         sync.RWMutex
	cache      map[string]InterfaceHealth // nf_name -> last result
}

// NewHealthProber 创建健康探测器
func NewHealthProber(mc *mongo.Client) *HealthProber {
	return &HealthProber{
		mongo: mc,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		cache: make(map[string]InterfaceHealth),
	}
}

// nfEndpoint 定义每个 NF 的 SBI 探测端点
type nfEndpoint struct {
	Name string
	Port int
	Path string
}

// 默认 NF SBI 端点配置（可从 MongoDB 覆盖）
var defaultEndpoints = []nfEndpoint{
	{Name: "amfd",  Port: 8080, Path: "/namf-comm/v1/ue-contexts"},
	{Name: "smfd",  Port: 8080, Path: "/nsmf-pdusession/v1/pdu-sessions"},
	{Name: "upfd",  Port: 8080, Path: "/nupf-pdu/v1/"},
	{Name: "ausfd", Port: 8080, Path: "/nausf-auth/v1/"},
	{Name: "udmd",  Port: 8080, Path: "/nudm-sdm/v1/"},
	{Name: "udrd",  Port: 8080, Path: "/nudr-dr/v1/"},
	{Name: "pcfd",  Port: 8080, Path: "/npcf-policyauthorization/v1/"},
	{Name: "nrfd",  Port: 8080, Path: "/nnrf-nfm/v1/nf-instances"},
	{Name: "nssfd", Port: 8080, Path: "/nnssf-nsselection/v1/"},
	{Name: "scpd",  Port: 8080, Path: "/nscp/"},
	{Name: "bsfd",  Port: 8080, Path: "/nbsf-management/v1/"},
	{Name: "mmed",  Port: 8080, Path: "/"},
	{Name: "sgwcd", Port: 8080, Path: "/"},
	{Name: "pgwcd", Port: 8080, Path: "/"},
	{Name: "hssd",  Port: 8080, Path: "/"},
	{Name: "pcrfd", Port: 8080, Path: "/"},
}

// ProbeAll 探测所有 NF 接口健康状态
func (hp *HealthProber) ProbeAll() []InterfaceHealth {
	results := make([]InterfaceHealth, len(defaultEndpoints))

	var wg sync.WaitGroup
	for i, ep := range defaultEndpoints {
		wg.Add(1)
		go func(idx int, endpoint nfEndpoint) {
			defer wg.Done()
			results[idx] = hp.probeOne(endpoint)
		}(i, ep)
	}
	wg.Wait()

	// 更新缓存
	hp.mu.Lock()
	for _, r := range results {
		hp.cache[r.NFName] = r
	}
	hp.mu.Unlock()

	// 持久化到 MongoDB
	hp.persist(results)

	return results
}

// probeOne 探测单个 NF
func (hp *HealthProber) probeOne(ep nfEndpoint) InterfaceHealth {
	url := fmt.Sprintf("http://localhost:%d%s", ep.Port, ep.Path)
	result := InterfaceHealth{
		NFName:    ep.Name,
		Port:      ep.Port,
		Path:      ep.Path,
		Status:    "unknown",
		CheckedAt: time.Now(),
	}

	start := time.Now()
	resp, err := hp.httpClient.Get(url)
	latency := time.Since(start).Milliseconds()
	result.Latency = latency

	if err != nil {
		result.Status = "down"
		result.HTTPCode = 0
		return result
	}
	defer resp.Body.Close()

	result.HTTPCode = resp.StatusCode

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if latency < 500 {
			result.Status = "healthy"
		} else {
			result.Status = "degraded"
		}
	} else if resp.StatusCode >= 500 {
		result.Status = "down"
	} else {
		result.Status = "degraded"
	}

	return result
}

// persist 持久化探测结果
func (hp *HealthProber) persist(results []InterfaceHealth) {
	if hp.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := hp.mongo.Database.Collection("interface_health")

	// 每个 NF 更新或插入
	for _, r := range results {
		filter := bson.M{"nf_name": r.NFName}
		update := bson.M{"$set": r}
		if _, err := coll.UpdateOne(ctx, filter, update); err != nil {
			// 如果更新失败（文档不存在），尝试插入
			coll.InsertOne(ctx, r)
		}
	}

	// 清理 1 天前的旧数据
	dayAgo := time.Now().AddDate(0, 0, -1)
	coll.DeleteMany(ctx, bson.M{"checked_at": bson.M{"$lt": dayAgo}})
}

// GetCachedResults 获取缓存的探测结果
func (hp *HealthProber) GetCachedResults() map[string]InterfaceHealth {
	hp.mu.RLock()
	defer hp.mu.RUnlock()

	result := make(map[string]InterfaceHealth, len(hp.cache))
	for k, v := range hp.cache {
		result[k] = v
	}
	return result
}

// GetCachedResult 获取单个 NF 的缓存结果
func (hp *HealthProber) GetCachedResult(nfName string) (InterfaceHealth, bool) {
	hp.mu.RLock()
	defer hp.mu.RUnlock()
	r, ok := hp.cache[nfName]
	return r, ok
}

// StartPeriodicProbe 启动定期探测（每 30 秒一次）
func (hp *HealthProber) StartPeriodicProbe() {
	go func() {
		// 首次探测
		hp.ProbeAll()
		log.Println("health prober: initial probe completed")

		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			hp.ProbeAll()
		}
	}()
}

// nfKPIEndpoint 定义每个 NF 的 KPI 查询端点
type nfKPIEndpoint struct {
	Name     string
	NFType   string
	Port     int
	Path     string
	KPIParser func([]byte) map[string]interface{}
}

// 默认 NF KPI 端点配置
var defaultKPIEndpoints = []nfKPIEndpoint{
	{Name: "amfd", NFType: "AMF", Port: 8080, Path: "/namf-comm/v1/ue-contexts", KPIParser: parseAMFKPI},
	{Name: "smfd", NFType: "SMF", Port: 8080, Path: "/nsmf-pdusession/v1/pdu-sessions", KPIParser: parseSMFKPI},
	{Name: "upfd", NFType: "UPF", Port: 8080, Path: "/nupf-pdu/v1/", KPIParser: parseUPFKPI},
	{Name: "ausfd", NFType: "AUSF", Port: 8080, Path: "/nausf-auth/v1/", KPIParser: parseGenericKPI},
	{Name: "udmd", NFType: "UDM", Port: 8080, Path: "/nudm-sdm/v1/", KPIParser: parseGenericKPI},
	{Name: "udrd", NFType: "UDR", Port: 8080, Path: "/nudr-dr/v1/", KPIParser: parseGenericKPI},
	{Name: "pcfd", NFType: "PCF", Port: 8080, Path: "/npcf-policyauthorization/v1/", KPIParser: parseGenericKPI},
	{Name: "nrfd", NFType: "NRF", Port: 8080, Path: "/nnrf-nfm/v1/nf-instances", KPIParser: parseNRFKPI},
	{Name: "nssfd", NFType: "NSSF", Port: 8080, Path: "/nnssf-nsselection/v1/", KPIParser: parseGenericKPI},
	{Name: "scpd", NFType: "SCP", Port: 8080, Path: "/nscp/", KPIParser: parseGenericKPI},
	{Name: "bsfd", NFType: "BSF", Port: 8080, Path: "/nbsf-management/v1/", KPIParser: parseGenericKPI},
}

// parseAMFKPI 从 AMF 响应提取 KPI
func parseAMFKPI(data []byte) map[string]interface{} {
	kpi := make(map[string]interface{})
	var result struct {
		TotalCount int `json:"total_count"`
	}
	if err := json.Unmarshal(data, &result); err == nil && result.TotalCount > 0 {
		kpi["registered_subscribers"] = int64(result.TotalCount)
	}
	return kpi
}

// parseSMFKPI 从 SMF 响应提取 KPI
func parseSMFKPI(data []byte) map[string]interface{} {
	kpi := make(map[string]interface{})
	var result struct {
		TotalCount int `json:"total_count"`
	}
	if err := json.Unmarshal(data, &result); err == nil && result.TotalCount > 0 {
		kpi["active_sessions"] = int64(result.TotalCount)
	}
	return kpi
}

// parseUPFKPI 从 UPF 响应提取 KPI
func parseUPFKPI(data []byte) map[string]interface{} {
	kpi := make(map[string]interface{})
	var result struct {
		Throughput float64 `json:"throughput_mbps"`
		SessionCount int   `json:"session_count"`
	}
	if err := json.Unmarshal(data, &result); err == nil {
		if result.Throughput > 0 {
			kpi["throughput_mbps"] = result.Throughput
		}
		if result.SessionCount > 0 {
			kpi["active_sessions"] = int64(result.SessionCount)
		}
	}
	return kpi
}

// parseNRFKPI 从 NRF 响应提取 KPI
func parseNRFKPI(data []byte) map[string]interface{} {
	kpi := make(map[string]interface{})
	var result struct {
		TotalCount int `json:"total_count"`
	}
	if err := json.Unmarshal(data, &result); err == nil && result.TotalCount > 0 {
		kpi["registered_nfs"] = int64(result.TotalCount)
	}
	return kpi
}

// parseGenericKPI 通用 KPI 解析（从响应头或通用字段提取）
func parseGenericKPI(data []byte) map[string]interface{} {
	kpi := make(map[string]interface{})
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err == nil {
		// 尝试提取常见的 KPI 字段
		if v, ok := result["success_rate"]; ok {
			if rate, ok := v.(float64); ok {
				kpi["success_rate"] = rate
			}
		}
		if v, ok := result["avg_latency_ms"]; ok {
			if latency, ok := v.(float64); ok {
				kpi["avg_latency_ms"] = latency
			}
		}
	}
	return kpi
}

// ProbeTelecomKPI 探测电信域 KPI
func (hp *HealthProber) ProbeTelecomKPI() []model.TelecomKPI {
	results := make([]model.TelecomKPI, 0, len(defaultKPIEndpoints))

	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, ep := range defaultKPIEndpoints {
		wg.Add(1)
		go func(endpoint nfKPIEndpoint) {
			defer wg.Done()
			kpi := hp.probeOneKPI(endpoint)
			if kpi != nil {
				mu.Lock()
				results = append(results, *kpi)
				mu.Unlock()
			}
		}(ep)
	}
	wg.Wait()

	// 持久化到 MongoDB
	hp.persistKPI(results)

	return results
}

// probeOneKPI 探测单个 NF 的 KPI
func (hp *HealthProber) probeOneKPI(ep nfKPIEndpoint) *model.TelecomKPI {
	url := fmt.Sprintf("http://localhost:%d%s", ep.Port, ep.Path)

	resp, err := hp.httpClient.Get(url)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	// 解析 KPI
	customMetrics := ep.KPIParser(body)

	kpi := &model.TelecomKPI{
		NFName:        ep.Name,
		NFType:        ep.NFType,
		CustomMetrics: customMetrics,
		CollectedAt:   time.Now(),
	}

	// 提取标准 KPI 字段
	if v, ok := customMetrics["registered_subscribers"]; ok {
		kpi.RegisteredSubscribers = v.(int64)
	}
	if v, ok := customMetrics["active_sessions"]; ok {
		kpi.ActiveSessions = v.(int64)
	}
	if v, ok := customMetrics["throughput_mbps"]; ok {
		kpi.ThroughputMbps = v.(float64)
	}
	if v, ok := customMetrics["signaling_rate"]; ok {
		kpi.SignalingRate = v.(float64)
	}
	if v, ok := customMetrics["success_rate"]; ok {
		kpi.SuccessRate = v.(float64)
	}
	if v, ok := customMetrics["avg_latency_ms"]; ok {
		kpi.AvgLatencyMs = v.(float64)
	}

	return kpi
}

// persistKPI 持久化 KPI 数据
func (hp *HealthProber) persistKPI(results []model.TelecomKPI) {
	if hp.mongo == nil || len(results) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := hp.mongo.Database.Collection("telecom_kpi")

	for _, kpi := range results {
		filter := bson.M{"nf_name": kpi.NFName}
		update := bson.M{"$set": kpi}
		if _, err := coll.UpdateOne(ctx, filter, update); err != nil {
			coll.InsertOne(ctx, kpi)
		}
	}

	// 清理 1 天前的旧数据
	dayAgo := time.Now().AddDate(0, 0, -1)
	coll.DeleteMany(ctx, bson.M{"collected_at": bson.M{"$lt": dayAgo}})
}

// GetCachedKPI 获取缓存的 KPI 数据
func (hp *HealthProber) GetCachedKPI() []model.TelecomKPI {
	if hp.mongo == nil {
		return []model.TelecomKPI{}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := hp.mongo.Database.Collection("telecom_kpi")
	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return []model.TelecomKPI{}
	}
	defer cursor.Close(ctx)

	var results []model.TelecomKPI
	if err := cursor.All(ctx, &results); err != nil {
		return []model.TelecomKPI{}
	}
	if results == nil {
		results = []model.TelecomKPI{}
	}

	return results
}

// StartPeriodicKPIProbe 启动定期 KPI 探测（每 60 秒一次）
func (hp *HealthProber) StartPeriodicKPIProbe() {
	go func() {
		// 首次探测
		hp.ProbeTelecomKPI()
		log.Println("telecom KPI prober: initial probe completed")

		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			hp.ProbeTelecomKPI()
		}
	}()
}
