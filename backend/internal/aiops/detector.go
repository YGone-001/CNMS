package aiops

import (
	"context"
	"log"
	"math"
	"time"

	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Detector 异常检测器
type Detector struct {
	mongo *mongo.Client
}

// NewDetector 创建异常检测器
func NewDetector(mc *mongo.Client) *Detector {
	return &Detector{mongo: mc}
}

// ScanAnomalies 扫描最近指标，检测异常
func (d *Detector) ScanAnomalies() {
	if d.mongo == nil {
		return
	}

	log.Println("detector: scanning for anomalies...")

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 获取所有 NF 名称
	metricsColl := d.mongo.Database.Collection("metrics")
	pipeline := bson.A{
		bson.M{"$group": bson.M{"_id": "$name"}},
	}

	cursor, err := metricsColl.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("detector: failed to get NF names: %v", err)
		return
	}
	defer cursor.Close(ctx)

	var nfNames []string
	for cursor.Next(ctx) {
		var result struct {
			ID string `bson:"_id"`
		}
		if err := cursor.Decode(&result); err == nil {
			nfNames = append(nfNames, result.ID)
		}
	}

	anomalyCount := 0
	for _, nfName := range nfNames {
		// 检测 CPU 异常
		if anomaly := d.detectMetricAnomaly(ctx, nfName, "cpu_percent", 90); anomaly != nil {
			d.saveAnomaly(ctx, anomaly)
			anomalyCount++
		}
		// 检测内存异常
		if anomaly := d.detectMetricAnomaly(ctx, nfName, "memory_percent", 90); anomaly != nil {
			d.saveAnomaly(ctx, anomaly)
			anomalyCount++
		}
	}

	log.Printf("detector: anomaly scan completed, found %d anomalies", anomalyCount)
}

// detectMetricAnomaly 检测单个指标的异常
func (d *Detector) detectMetricAnomaly(ctx context.Context, nfName, metric string, windowMinutes int) *model.AnomalyEvent {
	metricsColl := d.mongo.Database.Collection("metrics")

	// 获取滑动窗口内的数据
	now := time.Now()
	windowStart := now.Add(-time.Duration(windowMinutes) * time.Minute)

	filter := bson.M{
		"name": nfName,
		"timestamp": bson.M{
			"$gte": windowStart,
		},
	}

	cursor, err := metricsColl.Find(ctx, filter, options.Find().SetSort(bson.M{"timestamp": -1}))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var values []float64
	var latestValue float64
	first := true

	for cursor.Next(ctx) {
		var point struct {
			CPUPercent    float64 `bson:"cpu_percent"`
			MemoryPercent float32 `bson:"memory_percent"`
		}
		if err := cursor.Decode(&point); err != nil {
			continue
		}

		var val float64
		switch metric {
		case "cpu_percent":
			val = point.CPUPercent
		case "memory_percent":
			val = float64(point.MemoryPercent)
		}

		if first {
			latestValue = val
			first = false
		}
		values = append(values, val)
	}

	// 需要至少 10 个数据点才能进行有意义的检测
	if len(values) < 10 {
		return nil
	}

	// 计算均值和标准差（排除最新值）
	sum := 0.0
	for _, v := range values[1:] {
		sum += v
	}
	mean := sum / float64(len(values)-1)

	sumSqDiff := 0.0
	for _, v := range values[1:] {
		diff := v - mean
		sumSqDiff += diff * diff
	}
	stdDev := math.Sqrt(sumSqDiff / float64(len(values)-1))

	// 避免除零
	if stdDev < 0.01 {
		stdDev = 0.01
	}

	// 计算 Z-score
	zScore := math.Abs(latestValue-mean) / stdDev

	// Z-score > 3 视为异常（99.7% 置信度）
	if zScore < 3 {
		return nil
	}

	// 根据 Z-score 分级
	severity := "warning"
	if zScore > 4 {
		severity = "major"
	}
	if zScore > 5 {
		severity = "critical"
	}

	return &model.AnomalyEvent{
		NFName:     nfName,
		Metric:     metric,
		Value:      latestValue,
		Baseline:   mean,
		StdDev:     stdDev,
		ZScore:     zScore,
		Severity:   severity,
		DetectedAt: now,
	}
}

// saveAnomaly 保存异常事件
func (d *Detector) saveAnomaly(ctx context.Context, anomaly *model.AnomalyEvent) {
	anomalyColl := d.mongo.Database.Collection("anomaly_events")

	// 检查是否已有相同 NF 和指标的未解决异常（避免重复告警）
	filter := bson.M{
		"nf_name":     anomaly.NFName,
		"metric":      anomaly.Metric,
		"resolved_at": nil,
	}

	var existing model.AnomalyEvent
	err := anomalyColl.FindOne(ctx, filter).Decode(&existing)
	if err == nil {
		// 已有未解决异常，更新 Z-score 和时间
		anomalyColl.UpdateOne(ctx, bson.M{"_id": existing.ID}, bson.M{
			"$set": bson.M{
				"value":       anomaly.Value,
				"baseline":    anomaly.Baseline,
				"std_dev":     anomaly.StdDev,
				"z_score":     anomaly.ZScore,
				"severity":    anomaly.Severity,
				"detected_at": anomaly.DetectedAt,
			},
		})
		return
	}

	// 插入新异常
	anomalyColl.InsertOne(ctx, anomaly)
	log.Printf("detector: anomaly detected - %s %s: value=%.2f, baseline=%.2f, z=%.2f",
		anomaly.NFName, anomaly.Metric, anomaly.Value, anomaly.Baseline, anomaly.ZScore)
}

// ResolveOldAnomalies 解决已恢复的异常
func (d *Detector) ResolveOldAnomalies() {
	if d.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	anomalyColl := d.mongo.Database.Collection("anomaly_events")

	// 查找最近 1 小时内未解决的异常
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	filter := bson.M{
		"resolved_at": nil,
		"detected_at": bson.M{"$lt": oneHourAgo},
	}

	cursor, err := anomalyColl.Find(ctx, filter)
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	resolved := 0
	for cursor.Next(ctx) {
		var anomaly model.AnomalyEvent
		if err := cursor.Decode(&anomaly); err != nil {
			continue
		}

		// 检查当前值是否已恢复正常
		metricsColl := d.mongo.Database.Collection("metrics")
		var latest struct {
			CPUPercent    float64 `bson:"cpu_percent"`
			MemoryPercent float32 `bson:"memory_percent"`
		}

		err := metricsColl.FindOne(ctx,
			bson.M{"name": anomaly.NFName},
			options.FindOne().SetSort(bson.M{"timestamp": -1}),
		).Decode(&latest)

		if err != nil {
			continue
		}

		var currentValue float64
		switch anomaly.Metric {
		case "cpu_percent":
			currentValue = latest.CPUPercent
		case "memory_percent":
			currentValue = float64(latest.MemoryPercent)
		}

		// 如果当前值在基线 ± 2 个标准差内，视为恢复
		if math.Abs(currentValue-anomaly.Baseline) < 2*anomaly.StdDev {
			now := time.Now()
			anomalyColl.UpdateOne(ctx, bson.M{"_id": anomaly.ID}, bson.M{
				"$set": bson.M{"resolved_at": now},
			})
			resolved++
		}
	}

	if resolved > 0 {
		log.Printf("detector: resolved %d anomalies", resolved)
	}
}
