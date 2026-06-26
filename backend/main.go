package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"

	"xcloud-cnms/internal/auth"
	"xcloud-cnms/internal/config"
	"xcloud-cnms/internal/handler"
	"xcloud-cnms/internal/monitor"
	"xcloud-cnms/internal/mongo"
	"xcloud-cnms/internal/router"
	"xcloud-cnms/internal/scheduler"
	"xcloud-cnms/internal/ws"

	_ "github.com/go-sql-driver/mysql"
	"go.mongodb.org/mongo-driver/v2/bson"
	mongoDrv "go.mongodb.org/mongo-driver/v2/mongo"
)

//go:embed public/dist/*
var distFS embed.FS

func main() {
	configPath := flag.String("config", "config/config.json", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	ctx := context.Background()

	// 连接 MongoDB
	mc, err := mongo.Connect(ctx, cfg.MongoDB.URI, cfg.MongoDB.Database)
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	defer mc.Close(ctx)
	log.Printf("mongodb connected: %s/%s", cfg.MongoDB.URI, cfg.MongoDB.Database)

	// 创建知识库全文索引
	solutionsColl := mc.Database.Collection("solutions")
	_, err = solutionsColl.Indexes().CreateOne(ctx, mongoDrv.IndexModel{
		Keys: bson.D{
			{Key: "title", Value: "text"},
			{Key: "phenomenon", Value: "text"},
			{Key: "root_cause", Value: "text"},
			{Key: "solution", Value: "text"},
			{Key: "tags", Value: "text"},
		},
	})
	if err != nil {
		log.Printf("warning: failed to create solutions text index: %v", err)
	} else {
		log.Println("solutions text index created/verified")
	}

	// 创建上传目录
	uploadsDir := "uploads/kb"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("warning: failed to create uploads dir: %v", err)
	}

	// 从 embed 文件系统中剥离 "public/dist" 前缀
	subFS, err := fs.Sub(distFS, "public/dist")
	if err != nil {
		log.Fatalf("embed sub filesystem: %v", err)
	}

	// 初始化 MySQL 连接（IMS HSS）
	mysqlDB, err := handler.InitMySQLDB()
	if err != nil {
		log.Printf("warning: failed to connect to MySQL HSS: %v", err)
	} else {
		log.Println("mysql connected: hss_db")
		defer mysqlDB.Close()
	}

	// 初始化 S-CSCF MySQL 连接
	scscfDB, err := handler.InitSCSCFMySQLDB()
	if err != nil {
		log.Printf("warning: failed to connect to MySQL S-CSCF: %v", err)
	} else {
		log.Println("mysql connected: scscf")
		defer scscfDB.Close()
	}

	// 初始化 JWT 密钥
	if cfg.Auth.JWTKey != "" {
		auth.SetSecret(cfg.Auth.JWTKey)
	}

	h := handler.NewWithAllDB(mc, mysqlDB, scscfDB, cfg.LogDir, cfg.Auth)
	wh := ws.NewWSHandler(mc, cfg.Notify.WebhookURL, cfg.Notify.MinLevel, cfg.Auth.Enabled)
	lsh := ws.NewLogStreamHandler(cfg.LogDir, cfg.Auth.Enabled)

	// 启动定时任务调度器
	sched := scheduler.New(mc)
	sched.Start()
	defer sched.Stop()

	// 启动 NF 接口健康探测（每 30 秒）
	healthProber := monitor.NewHealthProber(mc)
	healthProber.StartPeriodicProbe()

	// 启动电信 KPI 探测（每 60 秒）
	healthProber.StartPeriodicKPIProbe()

	// P3: NF 自动发现（支持从 Sites 动态读取 NRF URL）
	nfDiscovery := monitor.NewNFDiscoveryWithDB("http://localhost:8080", mc)
	dh := handler.NewDiscoveryHandler(nfDiscovery)
	nfDiscovery.StartPeriodicDiscovery(ctx)

	// 配置热加载
	watcher := config.NewWatcher(*configPath, cfg, func(newCfg *config.AppConfig) {
		// 更新 handler 的认证配置
		h.Auth = newCfg.Auth
		if newCfg.Auth.JWTKey != "" {
			auth.SetSecret(newCfg.Auth.JWTKey)
		}
		h.LogDir = newCfg.LogDir
		lsh.SetAuthEnabled(newCfg.Auth.Enabled)
	})
	watcher.Start()

	// 路由注册
	mux := router.New(h, wh, lsh, dh, subFS)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("server starting on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
