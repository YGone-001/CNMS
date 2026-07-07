package signaling

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

// 默认 BPF 过滤器，覆盖全部 4G/5G/IMS 信令协议端口：
//
//	36412  — S1AP   (4G eNB↔MME)
//	38412  — NGAP   (5G gNB↔AMF)
//	2123   — GTPv2-C (MME↔SGW↔PGW / AMF↔SMF)
//	8805   — PFCP   (SMF↔UPF)
//	3868   — Diameter (MME↔HSS, PGW↔PCRF)
//	5060   — SIP    (IMS)
//	5061   — SIP-TLS (IMS)
//	29118  — SGsAP  (MME↔MSC for SMS over SGs)
const DefaultBPF = "sctp port 36412 or sctp port 38412 or udp port 2123 or udp port 8805 or tcp port 3868 or sctp port 3868 or udp port 5060 or tcp port 5060 or tcp port 5061 or sctp port 29118"

// CaptureDaemonConfig 信令持续抓包配置
type CaptureDaemonConfig struct {
	Enabled         bool   `json:"enabled"`
	Interface       string `json:"interface"`         // 网卡名，默认 "any"
	RingDir         string `json:"ring_dir"`          // pcap 存储目录
	RingFileSizeMB  int    `json:"ring_file_size_mb"` // 每个文件大小 (MB)
	RingFileCount   int    `json:"ring_file_count"`   // 环形文件数量
	BPFFilter       string `json:"bpf_filter"`        // BPF 过滤表达式
}

// CaptureStatus 抓包守护进程状态
type CaptureStatus struct {
	Running    bool   `json:"running"`
	PID        int    `json:"pid,omitempty"`
	FilesCount int    `json:"files_count"`
	DiskBytes  int64  `json:"disk_bytes"`
	RingDir    string `json:"ring_dir"`
	Interface  string `json:"interface"`
	BPFFilter  string `json:"bpf_filter"`
	StartTime  string `json:"start_time,omitempty"`
	ErrorMsg   string `json:"error_msg,omitempty"`
}

// CaptureDaemon 管理一个后台 tshark 持续抓包进程，
// 使用环形缓冲区 (-b filesize:N -b files:M) 循环写入 pcap 文件。
//
// 注意：tshark 抓包需要 root 权限（或 CAP_NET_RAW capability）。
// 如果以非 root 用户运行，需要：
//   - sudo setcap cap_net_raw,cap_net_admin=eip /usr/bin/tshark
//   - 或以 root 身份运行本服务
type CaptureDaemon struct {
	cfg CaptureDaemonConfig

	mu      sync.Mutex
	cmd     *exec.Cmd
	cancel  context.CancelFunc
	running bool
	startAt time.Time

	maxRetries int // 崩溃自动重启最大次数
}

// NewCaptureDaemon 创建信令抓包守护进程
func NewCaptureDaemon(cfg CaptureDaemonConfig) *CaptureDaemon {
	// 填充默认值
	if cfg.Interface == "" {
		cfg.Interface = "any"
	}
	if cfg.RingDir == "" {
		cfg.RingDir = "/var/spool/xcloud/signaling"
	}
	if cfg.RingFileSizeMB <= 0 {
		cfg.RingFileSizeMB = 100
	}
	if cfg.RingFileCount <= 0 {
		cfg.RingFileCount = 20
	}
	if cfg.BPFFilter == "" {
		cfg.BPFFilter = DefaultBPF
	}

	return &CaptureDaemon{
		cfg:        cfg,
		maxRetries: 3,
	}
}

// Start 启动 tshark 后台持续抓包进程
func (d *CaptureDaemon) Start() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.running {
		return fmt.Errorf("capture daemon already running (pid %d)", d.cmd.Process.Pid)
	}

	// 确保存储目录存在
	if err := os.MkdirAll(d.cfg.RingDir, 0755); err != nil {
		return fmt.Errorf("create ring dir: %w", err)
	}

	if err := d.startTshark(); err != nil {
		return err
	}

	// 启动崩溃监控 goroutine
	go d.watchdog()

	return nil
}

// startTshark 启动 tshark 子进程（调用方需持有 d.mu）
func (d *CaptureDaemon) startTshark() error {
	ctx, cancel := context.WithCancel(context.Background())

	// 构建环形缓冲区文件名模板：ring_XXXXX.pcap
	filePattern := filepath.Join(d.cfg.RingDir, "ring_XXXXX.pcap")

	// tshark 命令参数：
	//   -i <interface>        抓包网卡
	//   -b filesize:<KB>      单文件大小上限
	//   -b files:<N>          环形文件数量
	//   -w <file>             输出文件模板
	//   -f <bpf>             BPF 过滤器
	//   -q                    安静模式（不输出包摘要）
	// 注意：tshark 需要 root 权限或 CAP_NET_RAW capability
	args := []string{
		"-i", d.cfg.Interface,
		"-b", fmt.Sprintf("filesize:%d", d.cfg.RingFileSizeMB*1024), // tshark 用 KB
		"-b", fmt.Sprintf("files:%d", d.cfg.RingFileCount),
		"-w", filePattern,
		"-f", d.cfg.BPFFilter,
		"-q",
		"-o", "tcp.check_checksum:FALSE", // 忽略校验和（Linux offload 常导致校验和错误）
	}

	cmd := exec.CommandContext(ctx, "tshark", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// 设置进程组，便于 Stop 时杀死所有子进程
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	log.Printf("[CaptureDaemon] starting tshark: tshark %s", strings.Join(args, " "))
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start tshark: %w", err)
	}

	d.cmd = cmd
	d.cancel = cancel
	d.running = true
	d.startAt = time.Now()

	log.Printf("[CaptureDaemon] tshark started, pid=%d, ring_dir=%s, filter=%s",
		cmd.Process.Pid, d.cfg.RingDir, d.cfg.BPFFilter)

	return nil
}

// watchdog 监控 tshark 进程，崩溃时自动重启（最多 maxRetries 次）
func (d *CaptureDaemon) watchdog() {
	retries := 0

	for {
		d.mu.Lock()
		cmd := d.cmd
		d.mu.Unlock()

		if cmd == nil {
			return
		}

		err := cmd.Wait()

		d.mu.Lock()
		if !d.running {
			// 正常 Stop() 调用，不需要重启
			d.mu.Unlock()
			return
		}

		exitCode := -1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}

		if retries >= d.maxRetries {
			log.Printf("[CaptureDaemon] tshark exited (code=%d), max retries (%d) reached, giving up",
				exitCode, d.maxRetries)
			d.running = false
			d.cancel()
			d.mu.Unlock()
			return
		}

		retries++
		waitSec := retries * 5 // 指数退避：5s, 10s, 15s
		log.Printf("[CaptureDaemon] tshark exited (code=%d), restarting in %ds (attempt %d/%d)",
			exitCode, waitSec, retries, d.maxRetries)
		d.cancel()
		d.running = false
		d.mu.Unlock()

		time.Sleep(time.Duration(waitSec) * time.Second)

		d.mu.Lock()
		if err := d.startTshark(); err != nil {
			log.Printf("[CaptureDaemon] restart failed: %v", err)
			d.running = false
			d.mu.Unlock()
			return
		}
		d.mu.Unlock()
	}
}

// Stop 发送 SIGTERM 优雅停止 tshark 进程
func (d *CaptureDaemon) Stop() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.running {
		return nil
	}

	d.running = false

	// 通过进程组发送 SIGTERM，确保子进程也被终止
	pgid, err := syscall.Getpgid(d.cmd.Process.Pid)
	if err != nil {
		d.cancel()
		return fmt.Errorf("get pgid: %w", err)
	}

	if err := syscall.Kill(-pgid, syscall.SIGTERM); err != nil {
		// 进程可能已退出
		d.cancel()
		log.Printf("[CaptureDaemon] SIGTERM failed (process may have exited): %v", err)
		return nil
	}

	// 等待进程退出，最多 10 秒
	done := make(chan struct{})
	go func() {
		_ = d.cmd.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Printf("[CaptureDaemon] tshark stopped gracefully")
	case <-time.After(10 * time.Second):
		log.Printf("[CaptureDaemon] tshark did not exit in 10s, sending SIGKILL")
		_ = syscall.Kill(-pgid, syscall.SIGKILL)
		<-done
	}

	d.cancel()
	return nil
}

// Restart 重启 tshark 进程
func (d *CaptureDaemon) Restart() error {
	if err := d.Stop(); err != nil {
		return fmt.Errorf("stop before restart: %w", err)
	}
	// 短暂等待确保端口/资源释放
	time.Sleep(2 * time.Second)
	return d.Start()
}

// IsRunning 检查 tshark 进程是否正在运行
func (d *CaptureDaemon) IsRunning() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.running && d.cmd != nil && d.cmd.Process != nil
}

// ListRingFiles 列出当前环形缓冲区中的 pcap 文件，按修改时间排序
func (d *CaptureDaemon) ListRingFiles() ([]string, error) {
	entries, err := os.ReadDir(d.cfg.RingDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read ring dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".pcap") {
			files = append(files, filepath.Join(d.cfg.RingDir, e.Name()))
		}
	}

	// 按修改时间排序（最新的在前）
	sort.Slice(files, func(i, j int) bool {
		si, _ := os.Stat(files[i])
		sj, _ := os.Stat(files[j])
		if si == nil || sj == nil {
			return false
		}
		return si.ModTime().After(sj.ModTime())
	})

	return files, nil
}

// DiskUsage 返回环形缓冲区目录占用的磁盘空间（字节）
func (d *CaptureDaemon) DiskUsage() (int64, error) {
	var total int64

	err := filepath.Walk(d.cfg.RingDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("walk ring dir: %w", err)
	}

	return total, nil
}

// Status 返回当前运行状态、文件数、磁盘占用
func (d *CaptureDaemon) Status() CaptureStatus {
	d.mu.Lock()
	running := d.running
	var pid int
	var startStr string
	if d.cmd != nil && d.cmd.Process != nil {
		pid = d.cmd.Process.Pid
	}
	if !d.startAt.IsZero() {
		startStr = d.startAt.Format(time.RFC3339)
	}
	d.mu.Unlock()

	files, _ := d.ListRingFiles()
	disk, _ := d.DiskUsage()

	return CaptureStatus{
		Running:    running,
		PID:        pid,
		FilesCount: len(files),
		DiskBytes:  disk,
		RingDir:    d.cfg.RingDir,
		Interface:  d.cfg.Interface,
		BPFFilter:  d.cfg.BPFFilter,
		StartTime:  startStr,
	}
}
