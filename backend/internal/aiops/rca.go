package aiops

import (
	"context"
	"log"
	"time"

	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// RCAEngine 根因分析引擎
type RCAEngine struct {
	mongo *mongo.Client
	// NF 依赖图 (上游 -> 下游)
	nfDependencies map[string][]string
}

// NewRCAEngine 创建根因分析引擎
func NewRCAEngine(mc *mongo.Client) *RCAEngine {
	rca := &RCAEngine{
		mongo: mc,
		nfDependencies: map[string][]string{
			// 3GPP 5GC SBA 依赖关系
			"nrfd":  {"amfd", "smfd", "ausfd", "udmd", "pcfd", "nssfd"}, // NRF 为所有 NF 提供发现服务
			"ausfd": {"amfd"},                                             // AUSF 为 AMF 提供认证
			"udmd":  {"amfd", "smfd"},                                     // UDM 为 AMF/SMF 提供订阅数据
			"udrd":  {"udmd"},                                             // UDR 为 UDM 提供数据存储
			"amfd":  {"smfd"},                                             // AMF 为 SMF 提供会话上下文
			"smfd":  {"upfd"},                                             // SMF 控制 UPF 用户面
			"pcfd":  {"smfd"},                                             // PCF 为 SMF 提供策略
			"nssfd": {"amfd"},                                             // NSSF 为 AMF 提供切片选择
			"bsfd":  {"smfd"},                                             // BSF 为 SMF 提供绑定
			"scpd":  {"amfd", "smfd"},                                     // SCP 为所有 NF 提供通信代理
		},
	}
	return rca
}

// AnalyzeAlarm 分析告警的根因
func (r *RCAEngine) AnalyzeAlarm(alarmID bson.ObjectID, source, severity string) {
	if r.mongo == nil {
		return
	}

	log.Printf("rca: analyzing root cause for alarm %s from %s", alarmID.Hex(), source)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 查找时间窗口内的相关告警（±5 分钟）
	fiveMinBefore := time.Now().Add(-5 * time.Minute)
	fiveMinAfter := time.Now().Add(5 * time.Minute)

	alarmColl := r.mongo.Database.Collection("alarms")
	filter := bson.M{
		"_id": bson.M{"$ne": alarmID},
		"timestamp": bson.M{
			"$gte": fiveMinBefore,
			"$lte": fiveMinAfter,
		},
		"cleared": false,
	}

	cursor, err := alarmColl.Find(ctx, filter)
	if err != nil {
		log.Printf("rca: failed to query related alarms: %v", err)
		return
	}
	defer cursor.Close(ctx)

	var relatedAlarms []bson.ObjectID
	relatedSources := make(map[string]bool)
	relatedSources[source] = true

	for cursor.Next(ctx) {
		var alarm model.Alarm
		if err := cursor.Decode(&alarm); err != nil {
			continue
		}
		relatedAlarms = append(relatedAlarms, alarm.ID)
		relatedSources[alarm.Source] = true
	}

	// 如果没有相关告警，不需要根因分析
	if len(relatedAlarms) == 0 {
		return
	}

	// 沿依赖图回溯，找到根因
	rootSource := r.findRootCause(source, relatedSources)
	nfChain := r.buildImpactChain(rootSource, relatedSources)

	// 计算置信度
	confidence := r.calculateConfidence(source, rootSource, relatedAlarms)

	// 生成分析说明
	analysis := r.generateAnalysis(rootSource, source, nfChain, relatedAlarms)

	rca := &model.RootCauseAnalysis{
		RootAlarmID:   alarmID,
		RootSource:    rootSource,
		RelatedAlarms: relatedAlarms,
		NFChain:       nfChain,
		Confidence:    confidence,
		Analysis:      analysis,
		AnalyzedAt:    time.Now(),
	}

	// 保存分析结果
	rcaColl := r.mongo.Database.Collection("root_cause_analysis")
	rcaColl.InsertOne(ctx, rca)

	// 更新告警的根因字段
	alarmColl.UpdateOne(ctx, bson.M{"_id": alarmID}, bson.M{
		"$set": bson.M{"root_cause_id": rca.ID},
	})

	log.Printf("rca: root cause identified - %s (confidence: %.2f)", rootSource, confidence)
}

// findRootCause 沿依赖图回溯找根因
func (r *RCAEngine) findRootCause(currentSource string, relatedSources map[string]bool) string {
	// 从当前告警源开始，向上游回溯
	visited := make(map[string]bool)
	return r.traceUpstream(currentSource, relatedSources, visited)
}

// traceUpstream 递归向上游查找
func (r *RCAEngine) traceUpstream(current string, relatedSources map[string]bool, visited map[string]bool) string {
	if visited[current] {
		return current
	}
	visited[current] = true

	// 查找当前 NF 的上游依赖
	for upstream, downstreams := range r.nfDependencies {
		for _, downstream := range downstreams {
			if downstream == current {
				// 如果上游也有告警，继续回溯
				if relatedSources[upstream] {
					return r.traceUpstream(upstream, relatedSources, visited)
				}
			}
		}
	}

	// 没有上游告警，当前就是根因
	return current
}

// buildImpactChain 构建影响链
func (r *RCAEngine) buildImpactChain(rootSource string, relatedSources map[string]bool) []string {
	chain := []string{rootSource}
	visited := make(map[string]bool)
	visited[rootSource] = true

	// BFS 构建影响链
	queue := []string{rootSource}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		// 查找下游
		if downstreams, ok := r.nfDependencies[current]; ok {
			for _, downstream := range downstreams {
				if !visited[downstream] && relatedSources[downstream] {
					visited[downstream] = true
					chain = append(chain, downstream)
					queue = append(queue, downstream)
				}
			}
		}
	}

	return chain
}

// calculateConfidence 计算置信度
func (r *RCAEngine) calculateConfidence(alarmSource, rootSource string, relatedAlarms []bson.ObjectID) float64 {
	confidence := 0.5 // 基础置信度

	// 如果根因和告警源不同，说明找到了上游依赖
	if alarmSource != rootSource {
		confidence += 0.2
	}

	// 相关告警越多，置信度越高
	if len(relatedAlarms) > 2 {
		confidence += 0.1
	}
	if len(relatedAlarms) > 4 {
		confidence += 0.1
	}

	// 限制在 0-1 范围
	if confidence > 1.0 {
		confidence = 1.0
	}

	return confidence
}

// generateAnalysis 生成分析说明
func (r *RCAEngine) generateAnalysis(rootSource, alarmSource string, nfChain []string, relatedAlarms []bson.ObjectID) string {
	if rootSource == alarmSource {
		return "告警源本身是根因，无上游依赖问题"
	}

	analysis := "根因分析: "
	analysis += rootSource + " 故障导致 "

	for i, nf := range nfChain {
		if i > 0 {
			if i == len(nfChain)-1 {
				analysis += " 和 "
			} else {
				analysis += "、"
			}
		}
		analysis += nf
	}

	analysis += " 连锁告警。"
	analysis += "建议优先处理 " + rootSource + " 问题。"

	return analysis
}

// CleanOldRCA 清理旧的根因分析结果
func (r *RCAEngine) CleanOldRCA() {
	if r.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rcaColl := r.mongo.Database.Collection("root_cause_analysis")
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	rcaColl.DeleteMany(ctx, bson.M{"analyzed_at": bson.M{"$lt": sevenDaysAgo}})
}
