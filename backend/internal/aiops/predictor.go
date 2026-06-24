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

// Predictor 容量预测器
type Predictor struct {
	mongo *mongo.Client
}

// NewPredictor 创建容量预测器
func NewPredictor(mc *mongo.Client) *Predictor {
	return &Predictor{mongo: mc}
}

// PredictCapacity 运行容量预测
func (p *Predictor) PredictCapacity() {
	if p.mongo == nil {
		return
	}

	log.Println("predictor: running capacity prediction...")

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 获取所有 NF 名称
	metricsColl := p.mongo.Database.Collection("metrics")
	pipeline := bson.A{
		bson.M{"$group": bson.M{"_id": "$name"}},
	}

	cursor, err := metricsColl.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("predictor: failed to get NF names: %v", err)
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

	predictionCount := 0
	for _, nfName := range nfNames {
		for _, metric := range []string{"cpu_percent", "memory_percent"} {
			prediction := p.predictMetric(ctx, nfName, metric)
			if prediction != nil {
				p.savePrediction(ctx, prediction)
				predictionCount++
			}
		}
	}

	log.Printf("predictor: prediction completed, generated %d predictions", predictionCount)
}

// predictMetric 预测单个指标
func (p *Predictor) predictMetric(ctx context.Context, nfName, metric string) *model.CapacityPrediction {
	// 获取最近 7 天的小时级聚合数据
	aggColl := p.mongo.Database.Collection("metric_aggregates")
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)

	filter := bson.M{
		"nf_name":      nfName,
		"metric":       metric,
		"period":       "1h",
		"period_start": bson.M{"$gte": sevenDaysAgo},
	}

	cursor, err := aggColl.Find(ctx, filter, options.Find().SetSort(bson.M{"period_start": 1}))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var timestamps []float64 // 小时数（从起点开始）
	var values []float64     // 平均值
	var baseTime time.Time

	for cursor.Next(ctx) {
		var agg model.MetricAggregate
		if err := cursor.Decode(&agg); err != nil {
			continue
		}

		if baseTime.IsZero() {
			baseTime = agg.PeriodStart
		}

		// 将时间转换为小时数
		hours := agg.PeriodStart.Sub(baseTime).Hours()
		timestamps = append(timestamps, hours)
		values = append(values, agg.Avg)
	}

	// 需要至少 24 个数据点（1 天）
	if len(timestamps) < 24 {
		return nil
	}

	// 线性回归: y = slope * x + intercept
	slope, intercept, rSquared := linearRegression(timestamps, values)

	// 当前值（最新数据点）
	currentValue := values[len(values)-1]

	// 预测 24 小时后的值
	futureHours := timestamps[len(timestamps)-1] + 24
	predictedValue := slope*futureHours + intercept

	// 限制预测值在合理范围内
	predictedValue = math.Max(0, math.Min(100, predictedValue))

	// 计算预计耗尽时间（当预测值达到 90% 时）
	threshold := 90.0
	var exhaustionETA *time.Time
	if slope > 0 && currentValue < threshold {
		// hoursUntilExhaustion = (threshold - intercept) / slope - currentHours
		hoursUntil := (threshold-intercept)/slope - timestamps[len(timestamps)-1]
		if hoursUntil > 0 && hoursUntil < 720 { // 最多预测 30 天
			eta := time.Now().Add(time.Duration(hoursUntil * float64(time.Hour)))
			exhaustionETA = &eta
		}
	}

	return &model.CapacityPrediction{
		NFName:         nfName,
		Metric:         metric,
		CurrentValue:   currentValue,
		PredictedValue: predictedValue,
		Threshold:      threshold,
		ExhaustionETA:  exhaustionETA,
		Slope:          slope, // 每小时变化量
		RSquared:       rSquared,
		PredictedAt:    time.Now(),
	}
}

// savePrediction 保存预测结果
func (p *Predictor) savePrediction(ctx context.Context, prediction *model.CapacityPrediction) {
	predColl := p.mongo.Database.Collection("capacity_predictions")

	// 更新或插入预测结果
	filter := bson.M{
		"nf_name": prediction.NFName,
		"metric":  prediction.Metric,
	}
	update := bson.M{"$set": prediction}
	opts := options.UpdateOne().SetUpsert(true)
	predColl.UpdateOne(ctx, filter, update, opts)

	if prediction.ExhaustionETA != nil {
		log.Printf("predictor: %s %s predicted to reach %.0f%% at %s (R²=%.3f)",
			prediction.NFName, prediction.Metric, prediction.Threshold,
			prediction.ExhaustionETA.Format(time.RFC3339), prediction.RSquared)
	}
}

// linearRegression 线性回归
// 返回 slope, intercept, rSquared
func linearRegression(x, y []float64) (float64, float64, float64) {
	n := float64(len(x))
	if n == 0 {
		return 0, 0, 0
	}

	// 计算均值
	meanX := 0.0
	meanY := 0.0
	for i := range x {
		meanX += x[i]
		meanY += y[i]
	}
	meanX /= n
	meanY /= n

	// 计算斜率和截距
	var ssXY, ssXX, ssYY float64
	for i := range x {
		dx := x[i] - meanX
		dy := y[i] - meanY
		ssXY += dx * dy
		ssXX += dx * dx
		ssYY += dy * dy
	}

	// 避免除零
	if ssXX == 0 {
		return 0, meanY, 0
	}

	slope := ssXY / ssXX
	intercept := meanY - slope*meanX

	// 计算 R²
	var ssRes, ssTot float64
	for i := range x {
		predicted := slope*x[i] + intercept
		ssRes += (y[i] - predicted) * (y[i] - predicted)
		ssTot += (y[i] - meanY) * (y[i] - meanY)
	}

	rSquared := 0.0
	if ssTot > 0 {
		rSquared = 1 - ssRes/ssTot
	}

	return slope, intercept, rSquared
}

// CleanOldPredictions 清理旧的预测结果
func (p *Predictor) CleanOldPredictions() {
	if p.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	predColl := p.mongo.Database.Collection("capacity_predictions")
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	predColl.DeleteMany(ctx, bson.M{"predicted_at": bson.M{"$lt": sevenDaysAgo}})
}
