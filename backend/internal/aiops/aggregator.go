package aiops

import (
	"context"
	"log"
	"math"
	"sort"
	"time"

	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Aggregator 指标聚合器
type Aggregator struct {
	mongo *mongo.Client
}

// NewAggregator 创建聚合器
func NewAggregator(mc *mongo.Client) *Aggregator {
	return &Aggregator{mongo: mc}
}

// AggregateHourlyMetrics 聚合最近一小时的指标数据
func (a *Aggregator) AggregateHourlyMetrics() {
	if a.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 计算上一个小时的时间范围
	now := time.Now()
	periodEnd := now.Truncate(time.Hour)
	periodStart := periodEnd.Add(-1 * time.Hour)

	log.Printf("aggregator: aggregating metrics for %s to %s", periodStart.Format(time.RFC3339), periodEnd.Format(time.RFC3339))

	// 获取所有 NF 名称
	metricsColl := a.mongo.Database.Collection("metrics")
	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"timestamp": bson.M{
				"$gte": periodStart,
				"$lt":  periodEnd,
			},
		}},
		bson.M{"$group": bson.M{
			"_id": "$name",
		}},
	}

	cursor, err := metricsColl.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("aggregator: failed to get NF names: %v", err)
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

	// 为每个 NF 聚合 CPU 和内存指标
	aggregatesColl := a.mongo.Database.Collection("metric_aggregates")
	for _, nfName := range nfNames {
		for _, metric := range []string{"cpu_percent", "memory_percent"} {
			agg := a.aggregateMetric(ctx, nfName, metric, periodStart, periodEnd)
			if agg != nil {
				// 写入聚合结果
				filter := bson.M{
					"nf_name":      nfName,
					"metric":       metric,
					"period":       "1h",
					"period_start": periodStart,
				}
				update := bson.M{"$set": agg}
				opts := options.UpdateOne().SetUpsert(true)
				aggregatesColl.UpdateOne(ctx, filter, update, opts)
			}
		}
	}

	// 清理 30 天前的聚合数据
	thirtyDaysAgo := now.AddDate(0, 0, -30)
	aggregatesColl.DeleteMany(ctx, bson.M{
		"period":       "1h",
		"period_start": bson.M{"$lt": thirtyDaysAgo},
	})

	log.Printf("aggregator: hourly aggregation completed for %d NFs", len(nfNames))
}

// aggregateMetric 聚合单个 NF 的单个指标
func (a *Aggregator) aggregateMetric(ctx context.Context, nfName, metric string, start, end time.Time) *model.MetricAggregate {
	metricsColl := a.mongo.Database.Collection("metrics")

	// 查询原始数据
	filter := bson.M{
		"name": nfName,
		"timestamp": bson.M{
			"$gte": start,
			"$lt":  end,
		},
	}

	cursor, err := metricsColl.Find(ctx, filter, options.Find().SetSort(bson.M{"timestamp": 1}))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var values []float64
	for cursor.Next(ctx) {
		var point struct {
			CPUPercent    float64 `bson:"cpu_percent"`
			MemoryPercent float32 `bson:"memory_percent"`
		}
		if err := cursor.Decode(&point); err != nil {
			continue
		}
		switch metric {
		case "cpu_percent":
			values = append(values, point.CPUPercent)
		case "memory_percent":
			values = append(values, float64(point.MemoryPercent))
		}
	}

	if len(values) == 0 {
		return nil
	}

	// 计算统计值
	sort.Float64s(values)
	min := values[0]
	max := values[len(values)-1]
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	avg := sum / float64(len(values))

	// 计算 P95 和 P99
	p95 := percentile(values, 95)
	p99 := percentile(values, 99)

	return &model.MetricAggregate{
		NFName:      nfName,
		Metric:      metric,
		Period:      "1h",
		Min:         min,
		Max:         max,
		Avg:         avg,
		P95:         p95,
		P99:         p99,
		Count:       len(values),
		PeriodStart: start,
		PeriodEnd:   end,
	}
}

// percentile 计算百分位数
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	index := (p / 100) * float64(len(sorted)-1)
	lower := int(math.Floor(index))
	upper := int(math.Ceil(index))
	if lower == upper {
		return sorted[lower]
	}
	fraction := index - float64(lower)
	return sorted[lower]*(1-fraction) + sorted[upper]*fraction
}

// AggregateDailyMetrics 聚合最近一天的指标数据
func (a *Aggregator) AggregateDailyMetrics() {
	if a.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 计算昨天的时间范围
	now := time.Now()
	periodEnd := now.Truncate(24 * time.Hour)
	periodStart := periodEnd.AddDate(0, 0, -1)

	log.Printf("aggregator: aggregating daily metrics for %s to %s", periodStart.Format(time.RFC3339), periodEnd.Format(time.RFC3339))

	// 从小时聚合数据计算日聚合
	hourlyColl := a.mongo.Database.Collection("metric_aggregates")
	dailyColl := a.mongo.Database.Collection("metric_aggregates")

	pipeline := bson.A{
		bson.M{"$match": bson.M{
			"period":       "1h",
			"period_start": bson.M{
				"$gte": periodStart,
				"$lt":  periodEnd,
			},
		}},
		bson.M{"$group": bson.M{
			"_id": bson.M{
				"nf_name": "$nf_name",
				"metric":  "$metric",
			},
			"min":   bson.M{"$min": "$min"},
			"max":   bson.M{"$max": "$max"},
			"avg":   bson.M{"$avg": "$avg"},
			"count": bson.M{"$sum": "$count"},
		}},
	}

	cursor, err := hourlyColl.Aggregate(ctx, pipeline)
	if err != nil {
		log.Printf("aggregator: failed to aggregate daily: %v", err)
		return
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var result struct {
			ID struct {
				NFName string `bson:"nf_name"`
				Metric string `bson:"metric"`
			} `bson:"_id"`
			Min   float64 `bson:"min"`
			Max   float64 `bson:"max"`
			Avg   float64 `bson:"avg"`
			Count int     `bson:"count"`
		}
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		agg := model.MetricAggregate{
			NFName:      result.ID.NFName,
			Metric:      result.ID.Metric,
			Period:      "1d",
			Min:         result.Min,
			Max:         result.Max,
			Avg:         result.Avg,
			Count:       result.Count,
			PeriodStart: periodStart,
			PeriodEnd:   periodEnd,
		}

		filter := bson.M{
			"nf_name":      result.ID.NFName,
			"metric":       result.ID.Metric,
			"period":       "1d",
			"period_start": periodStart,
		}
		update := bson.M{"$set": agg}
		opts := options.UpdateOne().SetUpsert(true)
		dailyColl.UpdateOne(ctx, filter, update, opts)
	}

	// 清理 90 天前的日聚合数据
	ninetyDaysAgo := now.AddDate(0, 0, -90)
	dailyColl.DeleteMany(ctx, bson.M{
		"period":       "1d",
		"period_start": bson.M{"$lt": ninetyDaysAgo},
	})

	log.Printf("aggregator: daily aggregation completed")
}

// EnsureIndexes 创建 AIOps 相关索引
func (a *Aggregator) EnsureIndexes() {
	if a.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 使用原生 MongoDB 命令创建索引
	// metrics 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "metrics"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "name", Value: 1}, {Key: "timestamp", Value: -1}}}, {Key: "name", Value: "idx_name_timestamp"}},
		}},
	})

	// anomaly_events 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "anomaly_events"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "nf_name", Value: 1}, {Key: "detected_at", Value: -1}}}, {Key: "name", Value: "idx_nf_detected"}},
			bson.D{{Key: "key", Value: bson.D{{Key: "severity", Value: 1}, {Key: "detected_at", Value: -1}}}, {Key: "name", Value: "idx_severity_detected"}},
		}},
	})

	// root_cause_analysis 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "root_cause_analysis"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "root_alarm_id", Value: 1}}}, {Key: "name", Value: "idx_root_alarm"}},
		}},
	})

	// capacity_predictions 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "capacity_predictions"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "nf_name", Value: 1}, {Key: "metric", Value: 1}}}, {Key: "name", Value: "idx_nf_metric"}},
		}},
	})

	// trend_alerts 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "trend_alerts"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "nf_name", Value: 1}, {Key: "detected_at", Value: -1}}}, {Key: "name", Value: "idx_nf_detected"}},
		}},
	})

	// metric_aggregates 集合索引
	a.mongo.Database.RunCommand(ctx, bson.D{
		{Key: "createIndexes", Value: "metric_aggregates"},
		{Key: "indexes", Value: bson.A{
			bson.D{{Key: "key", Value: bson.D{{Key: "nf_name", Value: 1}, {Key: "metric", Value: 1}, {Key: "period", Value: 1}, {Key: "period_start", Value: -1}}}, {Key: "name", Value: "idx_nf_metric_period"}},
		}},
	})

	log.Println("aggregator: indexes ensured")
}
