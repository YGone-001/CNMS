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

// TrendAnalyzer 趋势分析器
type TrendAnalyzer struct {
	mongo *mongo.Client
}

// NewTrendAnalyzer 创建趋势分析器
func NewTrendAnalyzer(mc *mongo.Client) *TrendAnalyzer {
	return &TrendAnalyzer{mongo: mc}
}

// ScanTrends 扫描趋势变化
func (t *TrendAnalyzer) ScanTrends() {
	if t.mongo == nil {
		return
	}

	log.Println("trend: scanning for trend changes...")

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 获取所有 NF 名称
	metricsColl := t.mongo.Database.Collection("metrics")
	pipeline := bson.A{
		bson.M{"$group": bson.M{"_id": "$name"}},
	}

	cursor, err := metricsColl.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("trend: failed to get NF names: %v", err)
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

	alertCount := 0
	for _, nfName := range nfNames {
		for _, metric := range []string{"cpu_percent", "memory_percent"} {
			alert := t.analyzeTrend(ctx, nfName, metric)
			if alert != nil {
				t.saveTrendAlert(ctx, alert)
				alertCount++
			}
		}
	}

	log.Printf("trend: trend scan completed, found %d alerts", alertCount)
}

// analyzeTrend 分析单个指标的趋势
func (t *TrendAnalyzer) analyzeTrend(ctx context.Context, nfName, metric string) *model.TrendAlert {
	metricsColl := t.mongo.Database.Collection("metrics")

	// 获取最近 24 小时的数据
	now := time.Now()
	last24h := now.Add(-24 * time.Hour)
	last1h := now.Add(-1 * time.Hour)

	// 查询 24 小时数据
	filter := bson.M{
		"name": nfName,
		"timestamp": bson.M{
			"$gte": last24h,
		},
	}

	cursor, err := metricsColl.Find(ctx, filter, options.Find().SetSort(bson.M{"timestamp": 1}))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var shortValues []float64 // 最近 1 小时
	var longValues []float64  // 最近 24 小时

	for cursor.Next(ctx) {
		var point struct {
			CPUPercent    float64   `bson:"cpu_percent"`
			MemoryPercent float32   `bson:"memory_percent"`
			Timestamp     time.Time `bson:"timestamp"`
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

		longValues = append(longValues, val)
		if point.Timestamp.After(last1h) {
			shortValues = append(shortValues, val)
		}
	}

	// 需要足够的数据点
	if len(shortValues) < 5 || len(longValues) < 20 {
		return nil
	}

	// 计算短期和长期移动平均
	shortMA := average(shortValues)
	longMA := average(longValues)

	// 计算变化率（最近 1 小时 vs 之前 1 小时）
	prev1hStart := last24h
	prev1hEnd := last1h
	prevFilter := bson.M{
		"name": nfName,
		"timestamp": bson.M{
			"$gte": prev1hStart,
			"$lt":  prev1hEnd,
		},
	}

	prevCursor, err := metricsColl.Find(ctx, prevFilter)
	if err != nil {
		return nil
	}
	defer prevCursor.Close(ctx)

	var prevValues []float64
	for prevCursor.Next(ctx) {
		var point struct {
			CPUPercent    float64 `bson:"cpu_percent"`
			MemoryPercent float32 `bson:"memory_percent"`
		}
		if err := prevCursor.Decode(&point); err != nil {
			continue
		}
		switch metric {
		case "cpu_percent":
			prevValues = append(prevValues, point.CPUPercent)
		case "memory_percent":
			prevValues = append(prevValues, float64(point.MemoryPercent))
		}
	}

	if len(prevValues) == 0 {
		return nil
	}

	prevMA := average(prevValues)

	// 避免除零
	if prevMA < 0.01 {
		prevMA = 0.01
	}

	// 计算变化率（每小时百分比）
	changeRate := ((shortMA - prevMA) / prevMA) * 100

	// 判断趋势方向和严重程度
	direction := ""
	severity := ""

	// 短期上穿长期 10% 以上 → 上升趋势
	if shortMA > longMA*1.1 && changeRate > 20 {
		direction = "rising"
		if changeRate > 50 {
			severity = "major"
		} else if changeRate > 30 {
			severity = "minor"
		} else {
			severity = "warning"
		}
	}

	// 短期下穿长期 10% 以上 → 下降趋势
	if shortMA < longMA*0.9 && changeRate < -20 {
		direction = "falling"
		if changeRate < -50 {
			severity = "major"
		} else if changeRate < -30 {
			severity = "minor"
		} else {
			severity = "warning"
		}
	}

	if direction == "" {
		return nil
	}

	return &model.TrendAlert{
		NFName:     nfName,
		Metric:     metric,
		Direction:  direction,
		ChangeRate: changeRate,
		ShortMA:    shortMA,
		LongMA:     longMA,
		Severity:   severity,
		DetectedAt: now,
	}
}

// saveTrendAlert 保存趋势预警
func (t *TrendAnalyzer) saveTrendAlert(ctx context.Context, alert *model.TrendAlert) {
	trendColl := t.mongo.Database.Collection("trend_alerts")

	// 检查是否已有相同 NF 和指标的最近预警（15 分钟内避免重复）
	fifteenMinAgo := time.Now().Add(-15 * time.Minute)
	filter := bson.M{
		"nf_name":     alert.NFName,
		"metric":      alert.Metric,
		"direction":   alert.Direction,
		"detected_at": bson.M{"$gte": fifteenMinAgo},
	}

	count, _ := trendColl.CountDocuments(ctx, filter)
	if count > 0 {
		return
	}

	trendColl.InsertOne(ctx, alert)
	log.Printf("trend: trend alert - %s %s %s: change_rate=%.2f%%, short_ma=%.2f, long_ma=%.2f",
		alert.NFName, alert.Metric, alert.Direction, alert.ChangeRate, alert.ShortMA, alert.LongMA)
}

// CleanOldTrendAlerts 清理旧的趋势预警
func (t *TrendAnalyzer) CleanOldTrendAlerts() {
	if t.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	trendColl := t.mongo.Database.Collection("trend_alerts")
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	trendColl.DeleteMany(ctx, bson.M{"detected_at": bson.M{"$lt": sevenDaysAgo}})
}

// average 计算平均值
func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

// movingAverage 计算移动平均
func movingAverage(values []float64, window int) []float64 {
	if len(values) < window {
		return nil
	}

	result := make([]float64, len(values)-window+1)
	for i := 0; i <= len(values)-window; i++ {
		sum := 0.0
		for j := 0; j < window; j++ {
			sum += values[i+j]
		}
		result[i] = sum / float64(window)
	}
	return result
}

// standardDeviation 计算标准差
func standardDeviation(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}

	mean := average(values)
	sumSqDiff := 0.0
	for _, v := range values {
		diff := v - mean
		sumSqDiff += diff * diff
	}
	return math.Sqrt(sumSqDiff / float64(len(values)-1))
}
