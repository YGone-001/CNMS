package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// CaptureSession 抓包会话文档
type CaptureSession struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string        `bson:"name" json:"name"`                     // 用户自定义名称，如 "VoLTE调试-张工"
	Status      string        `bson:"status" json:"status"`                 // idle | running | stopping | completed | error
	Interface   string        `bson:"interface" json:"interface"`           // 网卡名，默认 "any"
	Filter      string        `bson:"filter" json:"filter"`                 // BPF 过滤表达式
	Protocol    string        `bson:"protocol" json:"protocol"`             // 预设模板名称：all | sip | diameter | gtp | s1ap | volte_full 等
	MaxDuration int           `bson:"max_duration" json:"max_duration"`     // 最大抓包时长（秒），默认 300，上限 3600
	MaxSize     int           `bson:"max_size" json:"max_size"`             // 最大文件大小（MB），默认 100，上限 500
	FilePath    string        `bson:"file_path" json:"file_path"`           // 服务器上 pcap 文件路径
	FileSize    int64         `bson:"file_size" json:"file_size"`           // 文件大小（字节）
	PacketCount int64         `bson:"packet_count" json:"packet_count"`     // 已捕获包数（从 tcpdump stderr 解析）
	PID         int           `bson:"pid" json:"pid"`                       // tcpdump 进程 PID
	StartedBy   string        `bson:"started_by" json:"started_by"`         // 操作用户
	StartedAt   time.Time     `bson:"started_at" json:"started_at"`
	StoppedAt   *time.Time    `bson:"stopped_at,omitempty" json:"stopped_at,omitempty"`
	Error       string        `bson:"error,omitempty" json:"error,omitempty"`
}

// ProtocolPreset 协议预设模板
type ProtocolPreset struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Filter string `json:"filter"`
}
