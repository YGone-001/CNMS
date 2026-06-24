package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// AnomalyEvent 异常事件
type AnomalyEvent struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName     string        `bson:"nf_name" json:"nf_name"`
	Metric     string        `bson:"metric" json:"metric"`         // cpu, memory, latency, sessions, throughput
	Value      float64       `bson:"value" json:"value"`           // 异常值
	Baseline   float64       `bson:"baseline" json:"baseline"`     // 基线值（滑动均值）
	StdDev     float64       `bson:"std_dev" json:"std_dev"`       // 标准差
	ZScore     float64       `bson:"z_score" json:"z_score"`       // Z-score
	Severity   string        `bson:"severity" json:"severity"`     // warning, minor, major, critical
	DetectedAt time.Time     `bson:"detected_at" json:"detected_at"`
	ResolvedAt *time.Time    `bson:"resolved_at,omitempty" json:"resolved_at,omitempty"`
}

// RootCauseAnalysis 根因分析结果
type RootCauseAnalysis struct {
	ID            bson.ObjectID   `bson:"_id,omitempty" json:"_id"`
	RootAlarmID   bson.ObjectID   `bson:"root_alarm_id" json:"root_alarm_id"`
	RootSource    string          `bson:"root_source" json:"root_source"`       // 根因 NF
	RelatedAlarms []bson.ObjectID `bson:"related_alarms" json:"related_alarms"` // 关联告警 ID 列表
	NFChain       []string        `bson:"nf_chain" json:"nf_chain"`             // 受影响的 NF 链
	Confidence    float64         `bson:"confidence" json:"confidence"`         // 置信度 0-1
	Analysis      string          `bson:"analysis" json:"analysis"`             // 分析说明
	AnalyzedAt    time.Time       `bson:"analyzed_at" json:"analyzed_at"`
}

// CapacityPrediction 容量预测
type CapacityPrediction struct {
	ID             bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName         string        `bson:"nf_name" json:"nf_name"`
	Metric         string        `bson:"metric" json:"metric"`                     // cpu, memory, sessions
	CurrentValue   float64       `bson:"current_value" json:"current_value"`
	PredictedValue float64       `bson:"predicted_value" json:"predicted_value"`   // 24小时后预测值
	Threshold      float64       `bson:"threshold" json:"threshold"`               // 阈值
	ExhaustionETA  *time.Time    `bson:"exhaustion_eta,omitempty" json:"exhaustion_eta,omitempty"` // 预计耗尽时间
	Slope          float64       `bson:"slope" json:"slope"`                       // 趋势斜率（每小时变化量）
	RSquared       float64       `bson:"r_squared" json:"r_squared"`               // R² 拟合度
	PredictedAt    time.Time     `bson:"predicted_at" json:"predicted_at"`
}

// TrendAlert 趋势预警
type TrendAlert struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName     string        `bson:"nf_name" json:"nf_name"`
	Metric     string        `bson:"metric" json:"metric"`
	Direction  string        `bson:"direction" json:"direction"`     // rising, falling
	ChangeRate float64       `bson:"change_rate" json:"change_rate"` // 变化率（每小时百分比）
	ShortMA    float64       `bson:"short_ma" json:"short_ma"`       // 短期移动平均（1小时）
	LongMA     float64       `bson:"long_ma" json:"long_ma"`         // 长期移动平均（24小时）
	Severity   string        `bson:"severity" json:"severity"`
	DetectedAt time.Time     `bson:"detected_at" json:"detected_at"`
}

// MetricAggregate 指标聚合（小时/天级）
type MetricAggregate struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName      string        `bson:"nf_name" json:"nf_name"`
	Metric      string        `bson:"metric" json:"metric"`
	Period      string        `bson:"period" json:"period"` // "1h", "1d"
	Min         float64       `bson:"min" json:"min"`
	Max         float64       `bson:"max" json:"max"`
	Avg         float64       `bson:"avg" json:"avg"`
	P95         float64       `bson:"p95" json:"p95"`
	P99         float64       `bson:"p99" json:"p99"`
	Count       int           `bson:"count" json:"count"`
	PeriodStart time.Time     `bson:"period_start" json:"period_start"`
	PeriodEnd   time.Time     `bson:"period_end" json:"period_end"`
}

// AIOpsSummary AIOps 概览摘要
type AIOpsSummary struct {
	AnomalyCount      int `json:"anomaly_count"`
	TrendAlertCount   int `json:"trend_alert_count"`
	PredictionCount   int `json:"prediction_count"`
	RootCauseCount    int `json:"root_cause_count"`
	CriticalAnomalies int `json:"critical_anomalies"`
	MajorAnomalies    int `json:"major_anomalies"`
}
