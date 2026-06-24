package scheduler

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/robfig/cron/v3"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"xcloud-cnms/internal/aiops"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"
)

// Scheduler 定时任务调度器
type Scheduler struct {
	cron       *cron.Cron
	mongo      *mongo.Client
	detector   *aiops.Detector
	trend      *aiops.TrendAnalyzer
	predictor  *aiops.Predictor
	rca        *aiops.RCAEngine
	aggregator *aiops.Aggregator
}

// New 创建调度器实例
func New(mc *mongo.Client) *Scheduler {
	return &Scheduler{
		cron:       cron.New(),
		mongo:      mc,
		detector:   aiops.NewDetector(mc),
		trend:      aiops.NewTrendAnalyzer(mc),
		predictor:  aiops.NewPredictor(mc),
		rca:        aiops.NewRCAEngine(mc),
		aggregator: aiops.NewAggregator(mc),
	}
}

// Start 启动调度器，从 MongoDB 加载已启用的任务
func (s *Scheduler) Start() {
	s.loadTasks()
	s.cron.Start()
	log.Println("task scheduler started")
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Println("task scheduler stopped")
}

// Reload 重新加载所有任务（用于 CRUD 后刷新）
func (s *Scheduler) Reload() {
	// 停止并清空所有任务
	ctx := s.cron.Stop()
	<-ctx.Done()
	s.cron = cron.New()
	s.loadTasks()
	s.cron.Start()
}

// loadTasks 从 MongoDB 加载已启用的任务并注册到 cron
func (s *Scheduler) loadTasks() {
	if s.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := s.mongo.Database.Collection("scheduled_tasks")
	cursor, err := coll.Find(ctx, bson.M{"enabled": true})
	if err != nil {
		log.Printf("scheduler load error: %v", err)
		return
	}
	defer cursor.Close(ctx)

	var tasks []model.ScheduledTask
	if err := cursor.All(ctx, &tasks); err != nil {
		log.Printf("scheduler decode error: %v", err)
		return
	}

	for _, task := range tasks {
		t := task // capture loop variable
		_, err := s.cron.AddFunc(t.Cron, func() {
			s.executeTask(t)
		})
		if err != nil {
			log.Printf("scheduler: invalid cron %q for task %q: %v", t.Cron, t.Name, err)
		}
	}
	log.Printf("scheduler: loaded %d task(s)", len(tasks))
}

// executeTask 执行单个任务
func (s *Scheduler) executeTask(task model.ScheduledTask) {
	log.Printf("scheduler: executing task %q (type=%s, target=%s)", task.Name, task.Type, task.Target)

	now := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 更新 last_run
	coll := s.mongo.Database.Collection("scheduled_tasks")
	coll.UpdateOne(ctx, bson.M{"_id": task.ID}, bson.M{"$set": bson.M{"last_run": now}})

	switch task.Type {
	case "health_check":
		// 检查目标进程是否在运行
		cmd := exec.CommandContext(ctx, "systemctl", "is-active", task.Target+".service")
		output, err := cmd.CombinedOutput()
		status := string(output)
		if err != nil {
			status = "inactive"
		}
		log.Printf("scheduler health_check %s: %s", task.Target, status)

	case "restart":
		cmd := exec.CommandContext(ctx, "sudo", "systemctl", "restart", task.Target+".service")
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("scheduler restart %s failed: %v (%s)", task.Target, err, string(output))
		} else {
			log.Printf("scheduler restart %s: ok", task.Target)
		}

	case "cleanup":
		// 清理旧指标数据
		metricsColl := s.mongo.Database.Collection("metrics")
		weekAgo := now.AddDate(0, 0, -7)
		result, err := metricsColl.DeleteMany(ctx, bson.M{"timestamp": bson.M{"$lt": weekAgo}})
		if err != nil {
			log.Printf("scheduler cleanup error: %v", err)
		} else {
			log.Printf("scheduler cleanup: deleted %d old metric(s)", result.DeletedCount)
		}

	case "custom":
		if task.Command != "" {
			cmd := exec.CommandContext(ctx, "sh", "-c", task.Command)
			output, err := cmd.CombinedOutput()
			if err != nil {
				log.Printf("scheduler custom %q failed: %v (%s)", task.Name, err, string(output))
			} else {
				log.Printf("scheduler custom %q: %s", task.Name, string(output))
			}
		}

	case "backup_config":
		s.executeBackupConfig(ctx, task)

	// AIOps 任务类型
	case "aiops_anomaly_scan":
		go s.detector.ScanAnomalies()
		go s.detector.ResolveOldAnomalies()

	case "aiops_trend_scan":
		go s.trend.ScanTrends()
		go s.trend.CleanOldTrendAlerts()

	case "aiops_predict":
		go s.predictor.PredictCapacity()
		go s.predictor.CleanOldPredictions()

	case "aiops_aggregate":
		go s.aggregator.AggregateHourlyMetrics()

	case "aiops_rca":
		// 根因分析由告警触发，此任务用于清理旧数据
		go s.rca.CleanOldRCA()
	}
}

// executeBackupConfig 执行配置备份任务
func (s *Scheduler) executeBackupConfig(ctx context.Context, task model.ScheduledTask) {
	nfNames := []string{task.Target}
	if task.Target == "" || task.Target == "all" {
		nfNames = []string{
			"amfd", "ausfd", "bsfd", "drad", "hssd", "mmed", "nrfd", "nssfd",
			"ocsd", "pcfd", "pcrfd", "pgwcd", "pgwud", "scpd", "sgwcd", "sgwud",
			"smfd", "udmd", "udrd", "upfd",
		}
	}

	backupColl := s.mongo.Database.Collection("config_backups")

	for _, nfName := range nfNames {
		configPaths := []string{
			filepath.Join("/etc/xcloud", nfName, "config.json"),
			filepath.Join("/etc/xcloud", nfName, "config.yaml"),
			filepath.Join("/etc/xcloud", nfName, nfName+".conf"),
		}

		var configPath string
		var content []byte
		for _, p := range configPaths {
			if data, err := os.ReadFile(p); err == nil {
				configPath = p
				content = data
				break
			}
		}
		if content == nil {
			continue
		}

		checksum := sha256.Sum256(content)
		checksumStr := fmt.Sprintf("%x", checksum)

		opts := options.FindOne().SetSort(bson.M{"version": -1})
		var last model.ConfigBackup
		version := 1
		if err := backupColl.FindOne(ctx, bson.M{"nf_name": nfName}, opts).Decode(&last); err == nil {
			if last.Checksum == checksumStr {
				continue
			}
			version = last.Version + 1
		}

		backup := model.ConfigBackup{
			NFName:    nfName,
			FilePath:  configPath,
			Content:   string(content),
			Checksum:  checksumStr,
			Size:      int64(len(content)),
			Version:   version,
			Comment:   fmt.Sprintf("auto backup by task %s", task.Name),
			CreatedAt: time.Now(),
		}

		if _, err := backupColl.InsertOne(ctx, backup); err != nil {
			log.Printf("scheduler backup_config %s error: %v", nfName, err)
		} else {
			log.Printf("scheduler backup_config %s: v%d (%d bytes)", nfName, version, len(content))
		}
	}
}
