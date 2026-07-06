package config

import (
	"encoding/json"
	"fmt"
	"os"
)

// ServerConfig 服务端配置
type ServerConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// MongoDBConfig MongoDB 连接配置
type MongoDBConfig struct {
	URI      string `json:"uri"`
	Database string `json:"database"`
}

// NotifyConfig 告警通知配置
type NotifyConfig struct {
	WebhookURL string `json:"webhook_url,omitempty"`
	MinLevel   string `json:"min_level,omitempty"` // critical, major, minor, warning
}

// HomerConfig Homer HEP 集成配置
type HomerConfig struct {
	Enabled   bool   `json:"enabled,omitempty"`
	APIURL    string `json:"api_url,omitempty"`
	Username  string `json:"username,omitempty"`
	Password  string `json:"password,omitempty"`
	AuthToken string `json:"auth_token,omitempty"`
}

// AuthConfig 认证配置
type AuthConfig struct {
	Enabled  bool   `json:"enabled,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	JWTKey   string `json:"jwt_key,omitempty"`
}

// SignalingCaptureConfig 信令持续抓包配置
type SignalingCaptureConfig struct {
	Enabled        bool   `json:"enabled"`
	Interface      string `json:"interface"`          // 网卡名，默认 "any"
	RingDir        string `json:"ring_dir"`           // pcap 存储目录，默认 "/var/spool/xcloud/signaling"
	RingFileSizeMB int    `json:"ring_file_size_mb"`  // 每个文件大小 (MB)，默认 100
	RingFileCount  int    `json:"ring_file_count"`    // 环形文件数量，默认 20
	BPFFilter      string `json:"bpf_filter"`         // BPF 过滤表达式
}

// HEPListenerConfig HEP 监听器配置（接收 Kamailio siptrace HEP 数据）
type HEPListenerConfig struct {
	Enabled    bool   `json:"enabled"`
	ListenAddr string `json:"listen_addr"` // 默认 ":9060"
	BufferSize int    `json:"buffer_size"` // 环形缓冲区大小，默认 50000
}

// AppConfig 应用全局配置
type AppConfig struct {
	Server  ServerConfig  `json:"server"`
	MongoDB MongoDBConfig `json:"mongodb"`
	LogDir  string        `json:"log_dir"`
	Notify  NotifyConfig  `json:"notify,omitempty"`
	Auth    AuthConfig    `json:"auth,omitempty"`
	Homer   HomerConfig   `json:"homer,omitempty"`
	SignalingCapture SignalingCaptureConfig `json:"signaling_capture,omitempty"`
	HEPListener HEPListenerConfig `json:"hep_listener,omitempty"`
}

// Load 从指定路径加载配置文件
func Load(path string) (*AppConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	if cfg.Server.Host == "" {
		cfg.Server.Host = "0.0.0.0"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.LogDir == "" {
		cfg.LogDir = "/var/log/xCloud"
	}

	return &cfg, nil
}
