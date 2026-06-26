package monitor

// ProcessState 进程状态枚举
type ProcessState string

const (
	// StateRunning 进程正在运行
	StateRunning ProcessState = "running"
	// StateStopped 进程已停止（应该运行但停止了）
	StateStopped ProcessState = "stopped"
	// StateDisabled 用户主动禁用
	StateDisabled ProcessState = "disabled"
	// StateNotInstalled 未安装
	StateNotInstalled ProcessState = "not_installed"
	// StateExpectedMissing 预期缺失（根据部署模板，不需要运行）
	StateExpectedMissing ProcessState = "expected_missing"
)

// DeploymentTemplate 部署模板定义
type DeploymentTemplate struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Components  []ComponentConfig `json:"components"`
}

// ComponentConfig 组件配置
type ComponentConfig struct {
	Name        string   `json:"name"`         // 显示名称
	ProcessName string   `json:"process_name"` // 进程名（用于精确匹配）
	MatchPatterns []string `json:"match_patterns"` // 匹配模式（用于命令行匹配，如 java 进程）
	Required    bool     `json:"required"`     // 是否必需
	Enabled     bool     `json:"enabled"`      // 是否启用
	Category    string   `json:"category"`     // 组件类别
	Desc        string   `json:"desc"`         // 描述
}

// ProcessStatusEnhanced 增强版进程状态
type ProcessStatusEnhanced struct {
	Name          string       `json:"name"`
	PID           int32        `json:"pid"`
	CPUPercent    float64      `json:"cpu_percent"`
	MemoryRSS     uint64       `json:"memory_rss"`
	MemoryVMS     uint64       `json:"memory_vms"`
	MemoryPercent float32      `json:"memory_percent"`
	State         ProcessState `json:"state"`
	Category      string       `json:"category"`
	Description   string       `json:"description"`
	Required      bool         `json:"required"`
}

// SystemStatusEnhanced 增强版系统状态
type SystemStatusEnhanced struct {
	Timestamp   int64                   `json:"timestamp"`
	Processes   []ProcessStatusEnhanced `json:"processes"`
	Template    string                  `json:"template"`
	Summary     StatusSummary           `json:"summary"`
}

// StatusSummary 状态摘要
type StatusSummary struct {
	Total           int `json:"total"`
	Running         int `json:"running"`
	Stopped         int `json:"stopped"`
	Disabled        int `json:"disabled"`
	NotInstalled    int `json:"not_installed"`
	ExpectedMissing int `json:"expected_missing"`
}

// GetDefaultTemplates 获取默认部署模板
func GetDefaultTemplates() map[string]*DeploymentTemplate {
	return map[string]*DeploymentTemplate{
		"auto": {
			Name:        "auto",
			Description: "自动检测（检测所有组件）",
			Components:  getAllComponents(),
		},
		"5g": {
			Name:        "5g",
			Description: "5G（5GC+IMS）",
			Components:  get5GComponents(),
		},
		"4g": {
			Name:        "4g",
			Description: "4G（EPC+IMS）",
			Components:  get4GComponents(),
		},
		"ims": {
			Name:        "ims",
			Description: "IMS",
			Components:  getIMSComponents(),
		},
	}
}

// getAllComponents 获取所有组件配置
func getAllComponents() []ComponentConfig {
	return []ComponentConfig{
		// 5G 核心网组件
		{Name: "amfd", ProcessName: "amfd", Required: true, Enabled: true, Category: "5G Core", Desc: "Access and Mobility Management Function"},
		{Name: "ausfd", ProcessName: "ausfd", Required: true, Enabled: true, Category: "5G Core", Desc: "Authentication Server Function"},
		{Name: "nssfd", ProcessName: "nssfd", Required: true, Enabled: true, Category: "5G Core", Desc: "Network Slice Selection Function"},
		{Name: "nrfd", ProcessName: "nrfd", Required: true, Enabled: true, Category: "5G Core", Desc: "Network Repository Function"},
		{Name: "smfd", ProcessName: "smfd", Required: true, Enabled: true, Category: "5G Core", Desc: "Session Management Function"},
		{Name: "upfd", ProcessName: "upfd", Required: true, Enabled: true, Category: "5G Core", Desc: "User Plane Function"},
		{Name: "pcfd", ProcessName: "pcfd", Required: false, Enabled: true, Category: "5G Core", Desc: "Policy Control Function"},
		{Name: "udmd", ProcessName: "udmd", Required: true, Enabled: true, Category: "5G Core", Desc: "Unified Data Management"},
		{Name: "udrd", ProcessName: "udrd", Required: true, Enabled: true, Category: "5G Core", Desc: "Unified Data Repository"},

		// 4G/EPC 组件
		{Name: "mmed", ProcessName: "mmed", Required: false, Enabled: true, Category: "4G/EPC", Desc: "Mobility Management Entity"},
		{Name: "hssd", ProcessName: "hssd", Required: false, Enabled: true, Category: "4G/EPC", Desc: "Home Subscriber Server"},
		{Name: "sgwcd", ProcessName: "sgwcd", Required: false, Enabled: true, Category: "4G/EPC", Desc: "Serving Gateway Control Plane"},
		{Name: "sgwud", ProcessName: "sgwud", Required: false, Enabled: true, Category: "4G/EPC", Desc: "Serving Gateway User Plane"},
		{Name: "pgwcd", ProcessName: "pgwcd", Required: false, Enabled: true, Category: "4G/EPC", Desc: "PDN Gateway Control Plane"},
		{Name: "pgwud", ProcessName: "pgwud", Required: false, Enabled: true, Category: "4G/EPC", Desc: "PDN Gateway User Plane"},

		// IMS/VoLTE 组件
		{Name: "pcscfd", ProcessName: "pcscfd", Required: false, Enabled: true, Category: "IMS", Desc: "Proxy Call Session Control Function"},
		{Name: "icscfd", ProcessName: "icscfd", Required: false, Enabled: true, Category: "IMS", Desc: "Interrogating Call Session Control Function"},
		{Name: "scscfd", ProcessName: "scscfd", Required: false, Enabled: true, Category: "IMS", Desc: "Serving Call Session Control Function"},
		// imsHss 是 java 进程，通过命令行参数匹配
		{Name: "imsHss", ProcessName: "java", MatchPatterns: []string{"HSSContainer", "imsHss", "FHoSS"}, Required: false, Enabled: true, Category: "IMS", Desc: "IMS Home Subscriber Server (Java)"},

		// 辅助组件
		{Name: "bsfd", ProcessName: "bsfd", Required: false, Enabled: true, Category: "Support", Desc: "Binding Support Function"},
		{Name: "drad", ProcessName: "drad", Required: false, Enabled: true, Category: "Support", Desc: "Data Repository Access"},
		{Name: "ocsd", ProcessName: "ocsd", Required: false, Enabled: true, Category: "Support", Desc: "Online Charging System"},
		{Name: "scpd", ProcessName: "scpd", Required: false, Enabled: true, Category: "Support", Desc: "Service Capability Platform"},
		{Name: "pcrfd", ProcessName: "pcrfd", Required: false, Enabled: true, Category: "EPC", Desc: "Policy and Charging Rules Function"},
	}
}

// get5GComponents 获取 5G 组件配置（5GC+IMS）
func get5GComponents() []ComponentConfig {
	// 5G 组件列表
	components5G := map[string]bool{
		"amfd":  true,
		"ausfd": true,
		"bsfd":  true,
		"nrfd":  true,
		"nssfd": true,
		"pcfd":  true,
		"scpd":  true,
		"smfd":  true,
		"udmd":  true,
		"udrd":  true,
		"upfd":  true,
	}
	// IMS 组件列表
	componentsIMS := map[string]bool{
		"pcscfd": true,
		"scscfd": true,
		"icscfd": true,
		"imsHss": true,
	}

	all := getAllComponents()
	var result []ComponentConfig
	for _, c := range all {
		if components5G[c.Name] || componentsIMS[c.Name] {
			c.Enabled = true
		} else {
			c.Enabled = false
		}
		result = append(result, c)
	}
	return result
}

// get4GComponents 获取 4G 组件配置（EPC+IMS）
func get4GComponents() []ComponentConfig {
	// 4G 组件列表
	components4G := map[string]bool{
		"drad":  true,
		"hssd":  true,
		"mmed":  true,
		"ocsd":  true,
		"pcrfd": true,
		"pgwcd": true,
		"pgwud": true,
		"sgwcd": true,
		"sgwud": true,
	}
	// IMS 组件列表
	componentsIMS := map[string]bool{
		"pcscfd": true,
		"scscfd": true,
		"icscfd": true,
		"imsHss": true,
	}

	all := getAllComponents()
	var result []ComponentConfig
	for _, c := range all {
		if components4G[c.Name] || componentsIMS[c.Name] {
			c.Enabled = true
		} else {
			c.Enabled = false
		}
		result = append(result, c)
	}
	return result
}

// getIMSComponents 获取 IMS 组件配置
func getIMSComponents() []ComponentConfig {
	// IMS 组件列表
	componentsIMS := map[string]bool{
		"pcscfd": true,
		"scscfd": true,
		"icscfd": true,
		"imsHss": true,
	}

	all := getAllComponents()
	var result []ComponentConfig
	for _, c := range all {
		if componentsIMS[c.Name] {
			c.Enabled = true
		} else {
			c.Enabled = false
		}
		result = append(result, c)
	}
	return result
}

// GetDefaultTemplate 获取默认部署模板（自动检测模式）
func GetDefaultTemplate() *DeploymentTemplate {
	return &DeploymentTemplate{
		Name:        "auto",
		Description: "自动检测（检测所有组件）",
		Components:  getAllComponents(),
	}
}
