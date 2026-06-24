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

// AuthConfig 认证配置
type AuthConfig struct {
	Enabled  bool   `json:"enabled,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	JWTKey   string `json:"jwt_key,omitempty"`
}

// AppConfig 应用全局配置
type AppConfig struct {
	Server  ServerConfig  `json:"server"`
	MongoDB MongoDBConfig `json:"mongodb"`
	LogDir  string        `json:"log_dir"`
	Notify  NotifyConfig  `json:"notify,omitempty"`
	Auth    AuthConfig    `json:"auth,omitempty"`
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
