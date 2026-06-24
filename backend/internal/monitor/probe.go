package monitor

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/process"
)

// xCloud 核心进程名列表
var TargetProcesses = []string{
	"amfd",
	"ausfd",
	"bsfd",
	"drad",
	"hssd",
	"mmed",
	"nrfd",
	"nssfd",
	"ocsd",
	"pcfd",
	"pcrfd",
	"pgwcd",
	"pgwud",
	"scpd",
	"sgwcd",
	"sgwud",
	"smfd",
	"udmd",
	"udrd",
	"upfd",
}

// ProcessStatus 单个进程的运行状态
type ProcessStatus struct {
	Name        string  `json:"name"`
	PID         int32   `json:"pid"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryRSS   uint64  `json:"memory_rss"`
	MemoryVMS   uint64  `json:"memory_vms"`
	MemoryPercent float32 `json:"memory_percent"`
	Running     bool    `json:"running"`
}

// SystemStatus 所有目标进程的快照
type SystemStatus struct {
	Timestamp int64            `json:"timestamp"`
	Processes []ProcessStatus  `json:"processes"`
}

// Probe 探针实例，持有配置
type Probe struct {
	targets []string
}

// New 创建探针实例，可自定义目标进程列表
func New(targets []string) *Probe {
	if len(targets) == 0 {
		targets = TargetProcesses
	}
	return &Probe{targets: targets}
}

// GetCurrentStatus 扫描所有目标进程，返回当前状态快照
func (p *Probe) GetCurrentStatus() (*SystemStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	allProcs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("enumerate processes: %w", err)
	}

	// 构建目标集合，用于快速查找
	targetSet := make(map[string]bool, len(p.targets))
	for _, t := range p.targets {
		targetSet[t] = true
	}

	// 并发采集每个匹配进程的信息
	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		seen = make(map[string]bool)
		out  []ProcessStatus
	)

	for _, proc := range allProcs {
		name, err := proc.NameWithContext(ctx)
		if err != nil {
			continue
		}

		// 精确匹配进程名
		if !targetSet[name] {
			continue
		}

		// 每个进程名只采集一次（取首个匹配）
		mu.Lock()
		if seen[name] {
			mu.Unlock()
			continue
		}
		seen[name] = true
		mu.Unlock()

		wg.Add(1)
		go func(proc *process.Process, name string) {
			defer wg.Done()
			ps := collectProcess(ctx, proc, name)
			mu.Lock()
			out = append(out, ps)
			mu.Unlock()
		}(proc, name)
	}

	wg.Wait()

	// 对未找到的进程标记 running=false
	for _, t := range p.targets {
		if !seen[t] {
			out = append(out, ProcessStatus{
				Name:    t,
				Running: false,
			})
		}
	}

	return &SystemStatus{
		Timestamp: time.Now().Unix(),
		Processes: out,
	}, nil
}

// collectProcess 采集单个进程的 CPU、内存信息
func collectProcess(ctx context.Context, proc *process.Process, name string) ProcessStatus {
	ps := ProcessStatus{
		Name:    name,
		PID:     proc.Pid,
		Running: true,
	}

	cpu, err := proc.CPUPercentWithContext(ctx)
	if err == nil {
		ps.CPUPercent = cpu
	}

	mem, err := proc.MemoryInfoWithContext(ctx)
	if err == nil && mem != nil {
		ps.MemoryRSS = mem.RSS
		ps.MemoryVMS = mem.VMS
	}

	memPct, err := proc.MemoryPercentWithContext(ctx)
	if err == nil {
		ps.MemoryPercent = memPct
	}

	return ps
}
