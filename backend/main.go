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
	"xcloud-cnms/internal/signaling"
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

	// 设置旧数据库引用（用于 subscribers 等共享数据）
	if cfg.MongoDB.LegacyDatabase != "" {
		mc.LegacyDB = mc.GetClient().Database(cfg.MongoDB.LegacyDatabase)
		log.Printf("mongodb connected: %s/%s (legacy: %s)", cfg.MongoDB.URI, cfg.MongoDB.Database, cfg.MongoDB.LegacyDatabase)
	} else {
		mc.LegacyDB = mc.Database
		log.Printf("mongodb connected: %s/%s", cfg.MongoDB.URI, cfg.MongoDB.Database)
	}

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
	// 初始化 Homer 客户端（如果启用）
	if cfg.Homer.Enabled {
		h.SetHomer(cfg.Homer)
		log.Printf("Homer integration enabled: %s", cfg.Homer.APIURL)
	}
	wh := ws.NewWSHandler(mc, cfg.Notify.WebhookURL, cfg.Notify.MinLevel, cfg.Auth.Enabled)
	lsh := ws.NewLogStreamHandler(cfg.LogDir, cfg.Auth.Enabled)
	// 添加额外日志目录
	lsh.AddLogDir("/usr/local/src/open5gs/install/var/log/open5gs")
	lsh.AddLogDir("/var/log/cscf")
	lsh.AddLogDir("/var/log/imsHss")
	dwh := ws.NewDeploymentWSHandler(mc, mysqlDB, scscfDB, cfg.Auth.Enabled)

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

	// 信令持续抓包守护进程（需要 root 权限或 CAP_NET_RAW）
	var captureDaemon *signaling.CaptureDaemon
	var tsharkQuery *signaling.TsharkQuery
	if cfg.SignalingCapture.Enabled {
		captureDaemon = signaling.NewCaptureDaemon(signaling.CaptureDaemonConfig{
			Enabled:        cfg.SignalingCapture.Enabled,
			Interface:      cfg.SignalingCapture.Interface,
			RingDir:        cfg.SignalingCapture.RingDir,
			RingFileSizeMB: cfg.SignalingCapture.RingFileSizeMB,
			RingFileCount:  cfg.SignalingCapture.RingFileCount,
			RingMaxDiskMB:  cfg.SignalingCapture.RingMaxDiskMB,
			BPFFilter:      cfg.SignalingCapture.BPFFilter,
		})
		if err := captureDaemon.Start(); err != nil {
			log.Printf("warning: signaling capture daemon start failed: %v", err)
		} else {
			defer captureDaemon.Stop()
		}

		// 创建环形缓冲区查询引擎（使用相同 ring_dir）
		tsharkQuery = signaling.NewTsharkQuery(cfg.SignalingCapture.RingDir)
		log.Printf("signaling capture enabled: ring_dir=%s, interface=%s",
			cfg.SignalingCapture.RingDir, cfg.SignalingCapture.Interface)
	}

	// 注入抓包组件到 handler
	h.SetSignalingCapture(captureDaemon, tsharkQuery)

	// HEP 监听器（接收 Kamailio siptrace HEPv3 数据）
	if cfg.HEPListener.Enabled {
		hepListener := signaling.NewHEPListener(signaling.HEPListenerConfig{
			Enabled:    cfg.HEPListener.Enabled,
			ListenAddr: cfg.HEPListener.ListenAddr,
			BufferSize: cfg.HEPListener.BufferSize,
			MongoDB:    mc.GetClient(),
			DBName:     cfg.MongoDB.Database,
		})
		if err := hepListener.Start(); err != nil {
			log.Printf("warning: HEP listener start failed: %v", err)
		} else {
			h.HEPListener = hepListener
			defer hepListener.Stop()
		}
	}

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
	mux := router.New(h, wh, lsh, dh, dwh, subFS)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("server starting on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
