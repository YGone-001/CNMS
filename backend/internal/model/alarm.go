package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Alarm 告警事件文档
type Alarm struct {
	ID              bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Severity        string        `bson:"severity" json:"severity"`                   // critical, major, minor, warning
	Source          string        `bson:"source" json:"source"`                       // 进程名或网元名
	Message         string        `bson:"message" json:"message"`
	Timestamp       time.Time     `bson:"timestamp" json:"timestamp"`
	FirstOccurrence time.Time     `bson:"first_occurrence,omitempty" json:"first_occurrence,omitempty"`
	Count           int           `bson:"count" json:"count"`                         // 去重计数
	Acknowledged    bool          `bson:"acknowledged" json:"acknowledged"`
	AckBy           string        `bson:"ack_by,omitempty" json:"ack_by,omitempty"`
	AckAt           *time.Time    `bson:"ack_at,omitempty" json:"ack_at,omitempty"`
	Cleared         bool          `bson:"cleared" json:"cleared"`
	ClearedBy       string        `bson:"cleared_by,omitempty" json:"cleared_by,omitempty"`
	ClearedAt       *time.Time    `bson:"cleared_at,omitempty" json:"cleared_at,omitempty"`
}

// AlarmRule 告警阈值规则
type AlarmRule struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name      string        `bson:"name" json:"name"`           // cpu_high, memory_high, process_down
	Threshold float64       `bson:"threshold" json:"threshold"` // 阈值百分比
	Severity  string        `bson:"severity" json:"severity"`   // 触发的告警级别
	Enabled   bool          `bson:"enabled" json:"enabled"`
}
