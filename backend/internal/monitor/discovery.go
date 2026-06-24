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
	"xcloud-cnms/internal/mongo"
)

// DiscoveredNF 从 NRF 发现的 NF 信息
type DiscoveredNF struct {
	NFType      string   `json:"nf_type"`      // AMF, SMF, UPF, ...
	NFInstanceID string  `json:"nf_instance_id"`
	IPv4        []string `json:"ipv4"`          // IPv4 地址列表
	SBIEndpoint string   `json:"sbi_endpoint"`  // SBI 服务地址
	Status      string   `json:"status"`        // REGISTERED, SUSPENDED
	HeartBeatTimer int   `json:"heart_beat_timer"`
	LastSeen    time.Time `json:"last_seen"`
}

// nfProfile NRF 返回的 NFProfile 结构（简化）
type nfProfile struct {
	NFInstanceID  string            `json:"nfInstanceId"`
	NFType        string            `json:"nfType"`
	NFStatus      string            `json:"nfStatus"`
	IPv4Addresses []string          `json:"ipv4Addresses"`
	HeartBeatTimer int              `json:"heartBeatTimer"`
	SNssais       []interface{}     `json:"snssais"`
	NFServices    []nfService       `json:"nfServices"`
}

type nfService struct {
	ServiceName  string   `json:"serviceName"`
	IPs          []string `json:"ipEndPoints"`
	Scheme       string   `json:"scheme"`
	NfServiceStatus string `json:"nfServiceStatus"`
}

// nrfResponse NRF /nnrf-nfm/v1/nf-instances 响应
type nrfResponse struct {
	NFProfileList []nfProfile `json:"nfProfileList"`
	NumInstances  int         `json:"numInstances"`
}

// NFDiscovery NRF NF 自动发现器
type NFDiscovery struct {
	mu         sync.RWMutex
	nrfURL     string
	discovered []DiscoveredNF
	httpClient *http.Client
	mongo      *mongo.Client
}

// NewNFDiscovery 创建 NF 发现器（无数据库）
func NewNFDiscovery(nrfURL string) *NFDiscovery {
	return &NFDiscovery{
		nrfURL: nrfURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// NewNFDiscoveryWithDB 创建带数据库的 NF 发现器（支持从 Sites 动态读取 NRF URL）
func NewNFDiscoveryWithDB(nrfURL string, mc *mongo.Client) *NFDiscovery {
	return &NFDiscovery{
		nrfURL: nrfURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		mongo: mc,
	}
}

// loadNRFURLFromSites 从 MongoDB Sites 集合读取第一个启用站点的 NRF URL
func (nd *NFDiscovery) loadNRFURLFromSites() string {
	if nd.mongo == nil {
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	coll := nd.mongo.Database.Collection("sites")
	var site struct {
		NRFURL string `bson:"nrf_url"`
	}
	err := coll.FindOne(ctx, bson.M{"enabled": true, "nrf_url": bson.M{"$ne": ""}}).Decode(&site)
	if err != nil {
		return ""
	}
	return site.NRFURL
}

// SetNRFURL 动态更新 NRF 地址
func (nd *NFDiscovery) SetNRFURL(url string) {
	nd.mu.Lock()
	defer nd.mu.Unlock()
	nd.nrfURL = url
}

// Discover 执行一次 NF 发现
func (nd *NFDiscovery) Discover() ([]DiscoveredNF, error) {
	nd.mu.RLock()
	nrfURL := nd.nrfURL
	nd.mu.RUnlock()

	// 优先从 Sites 动态获取 NRF URL
	if siteURL := nd.loadNRFURLFromSites(); siteURL != "" {
		nrfURL = siteURL
	}

	if nrfURL == "" {
		return nil, fmt.Errorf("NRF URL not configured")
	}

	url := fmt.Sprintf("%s/nnrf-nfm/v1/nf-instances", nrfURL)
	resp, err := nd.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("NRF request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("NRF returned %d: %s", resp.StatusCode, string(body))
	}

	var nrfResp nrfResponse
	if err := json.NewDecoder(resp.Body).Decode(&nrfResp); err != nil {
		return nil, fmt.Errorf("NRF response decode failed: %w", err)
	}

	var discovered []DiscoveredNF
	for _, profile := range nrfResp.NFProfileList {
		nf := DiscoveredNF{
			NFType:       profile.NFType,
			NFInstanceID: profile.NFInstanceID,
			IPv4:         profile.IPv4Addresses,
			Status:       profile.NFStatus,
			HeartBeatTimer: profile.HeartBeatTimer,
			LastSeen:     time.Now(),
		}

		// 提取 SBI 端点
		if len(profile.NFServices) > 0 {
			for _, svc := range profile.NFServices {
				if len(svc.IPs) > 0 {
					nf.SBIEndpoint = fmt.Sprintf("%s://%s", svc.Scheme, svc.IPs[0])
					break
				}
			}
		}

		discovered = append(discovered, nf)
	}

	nd.mu.Lock()
	nd.discovered = discovered
	nd.mu.Unlock()

	log.Printf("discovery: found %d NFs from NRF", len(discovered))
	return discovered, nil
}

// GetDiscovered 获取最近一次发现的 NF 列表
func (nd *NFDiscovery) GetDiscovered() []DiscoveredNF {
	nd.mu.RLock()
	defer nd.mu.RUnlock()
	result := make([]DiscoveredNF, len(nd.discovered))
	copy(result, nd.discovered)
	return result
}

// StartPeriodicDiscovery 启动定期发现（每 60 秒一次）
func (nd *NFDiscovery) StartPeriodicDiscovery(ctx context.Context) {
	go func() {
		// 首次发现
		if _, err := nd.Discover(); err != nil {
			log.Printf("discovery: initial discovery failed: %v", err)
		}

		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := nd.Discover(); err != nil {
					log.Printf("discovery: periodic discovery failed: %v", err)
				}
			}
		}
	}()
}
