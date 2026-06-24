package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// TelecomKPI 电信域 KPI 指标
type TelecomKPI struct {
	ID                   bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName               string        `bson:"nf_name" json:"nf_name"`
	NFType               string        `bson:"nf_type" json:"nf_type"`
	RegisteredSubscribers int64        `bson:"registered_subscribers,omitempty" json:"registered_subscribers,omitempty"`
	ActiveSessions       int64         `bson:"active_sessions,omitempty" json:"active_sessions,omitempty"`
	ThroughputMbps       float64       `bson:"throughput_mbps,omitempty" json:"throughput_mbps,omitempty"`
	SignalingRate        float64       `bson:"signaling_rate,omitempty" json:"signaling_rate,omitempty"`
	SuccessRate          float64       `bson:"success_rate,omitempty" json:"success_rate,omitempty"`
	AvgLatencyMs         float64       `bson:"avg_latency_ms,omitempty" json:"avg_latency_ms,omitempty"`
	CustomMetrics        map[string]interface{} `bson:"custom_metrics,omitempty" json:"custom_metrics,omitempty"`
	CollectedAt          time.Time     `bson:"collected_at" json:"collected_at"`
}
