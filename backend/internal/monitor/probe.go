package monitor

import (
	"context"
	"fmt"
	"strings"
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
	targets  []string
	template *DeploymentTemplate
}

// New 创建探针实例，可自定义目标进程列表
func New(targets []string) *Probe {
	if len(targets) == 0 {
		targets = TargetProcesses
	}
	return &Probe{targets: targets, template: GetDefaultTemplate()}
}

// NewWithTemplate 创建带部署模板的探针实例
func NewWithTemplate(template *DeploymentTemplate) *Probe {
	if template == nil {
		template = GetDefaultTemplate()
	}
	// 从模板中提取启用的组件名
	var targets []string
	for _, c := range template.Components {
		if c.Enabled {
			targets = append(targets, c.Name)
		}
	}
	return &Probe{targets: targets, template: template}
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

// GetCurrentStatusEnhanced 获取增强版系统状态（支持部署模板）
func (p *Probe) GetCurrentStatusEnhanced() (*SystemStatusEnhanced, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	allProcs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("enumerate processes: %w", err)
	}

	// 构建进程名到组件配置的映射（只包含启用的组件）
	processNameMap := make(map[string]*ComponentConfig)  // 进程名 -> 组件
	componentNameMap := make(map[string]*ComponentConfig) // 组件名 -> 组件
	if p.template != nil {
		for i := range p.template.Components {
			comp := &p.template.Components[i]
			// 只处理启用的组件
			if !comp.Enabled {
				continue
			}
			componentNameMap[comp.Name] = comp
			if comp.ProcessName != "" {
				// 如果有多个组件使用同一个进程名（如 java），需要特殊处理
				if existing, ok := processNameMap[comp.ProcessName]; ok {
					// 已存在，说明需要通过命令行匹配区分
					_ = existing
				} else {
					processNameMap[comp.ProcessName] = comp
				}
			}
		}
	}

	// 构建目标集合，用于快速查找（包含组件名和进程名）
	targetSet := make(map[string]bool, len(p.targets))
	for _, t := range p.targets {
		targetSet[t] = true
	}
	// 添加进程名到目标集合
	for _, comp := range componentNameMap {
		if comp.ProcessName != "" {
			targetSet[comp.ProcessName] = true
		}
	}

	// 并发采集每个匹配进程的信息
	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		seen = make(map[string]bool) // 记录已匹配的组件名
		out  []ProcessStatusEnhanced
	)

	for _, proc := range allProcs {
		name, err := proc.NameWithContext(ctx)
		if err != nil {
			continue
		}

		// 检查进程名是否在目标集合中
		if !targetSet[name] {
			continue
		}

		// 获取进程的命令行参数（用于区分同名进程）
		cmdline := ""
		if cmd, err := proc.CmdlineWithContext(ctx); err == nil {
			cmdline = cmd
		}

		// 查找匹配的组件
		var matchedComp *ComponentConfig
		comp := processNameMap[name]
		if comp != nil {
			// 检查是否需要命令行匹配
			if len(comp.MatchPatterns) > 0 {
				// 需要匹配命令行
				matched := false
				for _, pattern := range comp.MatchPatterns {
					if strings.Contains(cmdline, pattern) {
						matched = true
						break
					}
				}
				if matched {
					matchedComp = comp
				}
			} else {
				// 精确匹配
				matchedComp = comp
			}
		}

		if matchedComp == nil {
			continue
		}

		// 每个组件名只采集一次（取首个匹配）
		mu.Lock()
		if seen[matchedComp.Name] {
			mu.Unlock()
			continue
		}
		seen[matchedComp.Name] = true
		mu.Unlock()

		wg.Add(1)
		go func(proc *process.Process, comp *ComponentConfig) {
			defer wg.Done()
			ps := collectProcessEnhanced(ctx, proc, comp.Name, comp)
			mu.Lock()
			out = append(out, ps)
			mu.Unlock()
		}(proc, matchedComp)
	}

	wg.Wait()

	// 处理未找到的进程
	for _, t := range p.targets {
		if !seen[t] {
			comp := componentNameMap[t]
			state := StateStopped
			category := "Unknown"
			description := ""
			required := false

			if comp != nil {
				category = comp.Category
				description = comp.Desc
				required = comp.Required

				if !comp.Enabled {
					state = StateDisabled
				}
			}

			out = append(out, ProcessStatusEnhanced{
				Name:        t,
				State:       state,
				Category:    category,
				Description: description,
				Required:    required,
			})
		}
	}

	// 计算摘要
	summary := StatusSummary{
		Total: len(out),
	}
	for _, ps := range out {
		switch ps.State {
		case StateRunning:
			summary.Running++
		case StateStopped:
			summary.Stopped++
		case StateDisabled:
			summary.Disabled++
		case StateNotInstalled:
			summary.NotInstalled++
		case StateExpectedMissing:
			summary.ExpectedMissing++
		}
	}

	templateName := ""
	if p.template != nil {
		templateName = p.template.Name
	}

	return &SystemStatusEnhanced{
		Timestamp: time.Now().Unix(),
		Processes: out,
		Template:  templateName,
		Summary:   summary,
	}, nil
}

// collectProcessEnhanced 采集单个进程的增强信息
func collectProcessEnhanced(ctx context.Context, proc *process.Process, name string, comp *ComponentConfig) ProcessStatusEnhanced {
	ps := ProcessStatusEnhanced{
		Name:  name,
		PID:   proc.Pid,
		State: StateRunning,
	}

	if comp != nil {
		ps.Category = comp.Category
		ps.Description = comp.Desc
		ps.Required = comp.Required
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
