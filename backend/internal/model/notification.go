package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// NotificationChannel 通知通道配置
type NotificationChannel struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name      string        `bson:"name" json:"name"`                               // 通道名称
	Type      string        `bson:"type" json:"type"`                               // email, webhook, wechat, dingtalk
	Enabled   bool          `bson:"enabled" json:"enabled"`
	MinLevel  string        `bson:"min_level" json:"min_level"`                     // 触发的最低告警级别: critical, major, minor, warning
	Config    ChannelConfig `bson:"config" json:"config"`                           // 通道特定配置
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}

// ChannelConfig 通道配置（按类型使用不同字段）
type ChannelConfig struct {
	// Email (SMTP)
	SMTPHost string `bson:"smtp_host,omitempty" json:"smtp_host,omitempty"`
	SMTPPort int    `bson:"smtp_port,omitempty" json:"smtp_port,omitempty"`
	Username string `bson:"username,omitempty" json:"username,omitempty"`
	Password string `bson:"password,omitempty" json:"password,omitempty"`
	From     string `bson:"from,omitempty" json:"from,omitempty"`
	To       string `bson:"to,omitempty" json:"to,omitempty"` // 逗号分隔的收件人

	// Webhook / WeChat / DingTalk
	URL     string `bson:"url,omitempty" json:"url,omitempty"`
	Secret  string `bson:"secret,omitempty" json:"secret,omitempty"` // 签名密钥
}

// EscalationRule 告警升级规则
type EscalationRule struct {
	ID              bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name            string        `bson:"name" json:"name"`
	Severity        string        `bson:"severity" json:"severity"`                   // 匹配的告警级别
	MinutesWait     int           `bson:"minutes_wait" json:"minutes_wait"`           // 未确认等待分钟数
	EscalateTo      string        `bson:"escalate_to" json:"escalate_to"`             // 升级到的通知通道名称
	Enabled         bool          `bson:"enabled" json:"enabled"`
	CreatedAt       time.Time     `bson:"created_at" json:"created_at"`
}

// NotificationLog 通知发送记录
type NotificationLog struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Channel   string        `bson:"channel" json:"channel"`
	AlarmID   string        `bson:"alarm_id" json:"alarm_id"`
	Severity  string        `bson:"severity" json:"severity"`
	Source    string        `bson:"source" json:"source"`
	Message   string        `bson:"message" json:"message"`
	Status    string        `bson:"status" json:"status"` // sent, failed
	Error     string        `bson:"error,omitempty" json:"error,omitempty"`
	SentAt    time.Time     `bson:"sent_at" json:"sent_at"`
}
