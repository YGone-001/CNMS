package ws

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"xcloud-cnms/internal/auth"
)

// LogStreamHandler 实时日志流 WebSocket 处理器
type LogStreamHandler struct {
	logDir      string
	logDirs     []string // 多日志目录
	authEnabled bool
}

// NewLogStreamHandler 创建日志流处理器
func NewLogStreamHandler(logDir string, authEnabled bool) *LogStreamHandler {
	return &LogStreamHandler{logDir: logDir, authEnabled: authEnabled}
}

// AddLogDir 添加额外的日志搜索目录
func (lsh *LogStreamHandler) AddLogDir(dir string) {
	lsh.logDirs = append(lsh.logDirs, dir)
}

// allLogDirs 返回所有日志目录（主目录 + 额外目录）
func (lsh *LogStreamHandler) allLogDirs() []string {
	dirs := []string{lsh.logDir}
	dirs = append(dirs, lsh.logDirs...)
	return dirs
}

// SetAuthEnabled 动态更新鉴权开关（供配置热加载使用）
func (lsh *LogStreamHandler) SetAuthEnabled(enabled bool) {
	lsh.authEnabled = enabled
}

// logStreamRequest 客户端订阅请求参数
type logStreamRequest struct {
	Name    string `json:"name"`    // NF 进程名 (如 amfd)
	Level   string `json:"level"`   // 日志级别过滤 (ERROR/WARN/INFO/DEBUG)
	Keyword string `json:"keyword"` // 关键字过滤
	Tail    int    `json:"tail"`    // 初始加载行数 (默认 50)
}

// logStreamFilter 客户端动态更新过滤器
type logStreamFilter struct {
	Type    string `json:"type"`    // "filter"
	Level   string `json:"level"`
	Keyword string `json:"keyword"`
}

// logStreamMessage 推送给客户端的日志行
type logStreamMessage struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Raw       string `json:"raw"`
}

// logStreamMeta 连接建立时推送的元信息
type logStreamMeta struct {
	Type      string `json:"type"`       // "meta"
	Name      string `json:"name"`
	Path      string `json:"path"`
	TailCount int    `json:"tail_count"` // 初始推送的行数
}

// logStreamStats 推送给客户端的统计信息
type logStreamStats struct {
	Type string `json:"type"` // "stats"
	Line int    `json:"line"` // 累计行数
}

// validateLogStreamToken 校验日志流 WS 的 JWT
func (lsh *LogStreamHandler) validateLogStreamToken(r *http.Request) error {
	if !lsh.authEnabled {
		return nil
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	if token == "" {
		return fmt.Errorf("missing authentication token")
	}

	_, err := auth.ValidateToken(token)
	return err
}

// StreamLogs 建立 WebSocket 连接，实时推送新日志行
func (lsh *LogStreamHandler) StreamLogs(w http.ResponseWriter, r *http.Request) {
	// JWT 鉴权
	if err := lsh.validateLogStreamToken(r); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": err.Error()})
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("logstream upgrade: %v", err)
		return
	}
	defer conn.Close()

	// 读取客户端发送的订阅参数
	_, msg, err := conn.ReadMessage()
	if err != nil {
		log.Printf("logstream read config: %v", err)
		return
	}

	var req logStreamRequest
	if err := json.Unmarshal(msg, &req); err != nil {
		log.Printf("logstream parse config: %v", err)
		return
	}

	if req.Name == "" {
		conn.WriteJSON(map[string]string{"error": "name is required"})
		return
	}

	// 安全检查：防止路径遍历
	if strings.Contains(req.Name, "..") || strings.Contains(req.Name, "/") {
		conn.WriteJSON(map[string]string{"error": "invalid name"})
		return
	}

	// 默认初始加载 50 行
	if req.Tail <= 0 {
		req.Tail = 50
	}
	if req.Tail > 1000 {
		req.Tail = 1000
	}

	// 查找日志文件
	logPath := lsh.findLogFile(req.Name)
	if logPath == "" {
		conn.WriteJSON(map[string]string{"error": "log file not found for " + req.Name})
		return
	}

	log.Printf("logstream: client subscribed to %s (%s)", req.Name, logPath)

	// 推送元信息
	conn.WriteJSON(logStreamMeta{
		Type: "meta",
		Name: req.Name,
		Path: logPath,
	})

	// 打开文件
	file, err := os.Open(logPath)
	if err != nil {
		conn.WriteJSON(map[string]string{"error": "cannot open log file: " + err.Error()})
		return
	}
	defer file.Close()

	// 加载初始 tail 行历史日志
	tailCount := lsh.pushTailLines(conn, file, req.Tail, req.Level, req.Keyword)

	// 推送初始统计
	conn.WriteJSON(logStreamStats{Type: "stats", Line: tailCount})

	// 定位到文件末尾，开始流式推送新增内容
	file.Seek(0, 2)

	// 用于动态更新过滤器（线程安全）
	var mu sync.Mutex
	level := req.Level
	keyword := req.Keyword
	totalLines := tailCount

	// 读取客户端后续消息（过滤器更新）
	filterDone := make(chan struct{})
	go func() {
		defer close(filterDone)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var f logStreamFilter
			if err := json.Unmarshal(raw, &f); err != nil {
				continue
			}
			if f.Type == "filter" {
				mu.Lock()
				level = f.Level
				keyword = f.Keyword
				mu.Unlock()
				log.Printf("logstream: filter updated for %s: level=%s keyword=%s", req.Name, f.Level, f.Keyword)
			}
		}
	}()

	// Ping/Pong 心跳
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// 日志轮询
	logTicker := time.NewTicker(500 * time.Millisecond)
	defer logTicker.Stop()

	for {
		select {
		case <-filterDone:
			log.Printf("logstream: client disconnected from %s", req.Name)
			return
		case <-pingTicker.C:
			if err := conn.WriteMessage(9, nil); err != nil { // ping
				return
			}
		case <-logTicker.C:
			mu.Lock()
			lvl := level
			kw := keyword
			mu.Unlock()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := scanner.Text()
				if line == "" {
					continue
				}

				if !matchesFilter(line, lvl, kw) {
					continue
				}

				parsed := parseLogLine(line)
				if err := conn.WriteJSON(parsed); err != nil {
					log.Printf("logstream write error: %v", err)
					return
				}
				totalLines++
			}
		}
	}
}

// pushTailLines 读取文件末尾 N 行并推送给客户端，返回推送行数
func (lsh *LogStreamHandler) pushTailLines(conn interface{ WriteJSON(interface{}) error }, file *os.File, tail int, level, keyword string) int {
	// 读取全部内容，保留最后 tail 行
	file.Seek(0, 0)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB buffer

	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	// 取最后 tail 行
	start := 0
	if len(lines) > tail {
		start = len(lines) - tail
	}

	count := 0
	for _, line := range lines[start:] {
		if line == "" {
			continue
		}
		if !matchesFilter(line, level, keyword) {
			continue
		}
		parsed := parseLogLine(line)
		parsed.Raw = line
		if err := conn.WriteJSON(parsed); err != nil {
			break
		}
		count++
	}

	return count
}

// findLogFile 查找 NF 的日志文件（搜索所有日志目录）
func (lsh *LogStreamHandler) findLogFile(name string) string {
	for _, dir := range lsh.allLogDirs() {
		// 精确匹配
		candidates := []string{
			filepath.Join(dir, name+".log"),
			filepath.Join(dir, name, name+".log"),
			filepath.Join(dir, name, "process.log"),
		}
		for _, path := range candidates {
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}

		// 子目录中查找
		subdir := filepath.Join(dir, name)
		if entries, err := os.ReadDir(subdir); err == nil {
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") {
					return filepath.Join(subdir, e.Name())
				}
			}
		}

		// 模糊匹配：文件名包含关键字（如 cscf-2026-06-30.log 匹配 "cscf"）
		if entries, err := os.ReadDir(dir); err == nil {
			lowerName := strings.ToLower(name)
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") && strings.Contains(strings.ToLower(e.Name()), lowerName) {
					return filepath.Join(dir, e.Name())
				}
			}
		}
	}
	return ""
}

// matchesFilter 检查日志行是否匹配过滤条件
func matchesFilter(line, level, keyword string) bool {
	if level != "" {
		upperLine := strings.ToUpper(line)
		if !strings.Contains(upperLine, strings.ToUpper(level)) {
			return false
		}
	}
	if keyword != "" {
		if !strings.Contains(strings.ToLower(line), strings.ToLower(keyword)) {
			return false
		}
	}
	return true
}

// parseLogLine 解析日志行，提取时间戳、级别、消息
func parseLogLine(line string) logStreamMessage {
	msg := logStreamMessage{Raw: line, Message: line}

	upper := strings.ToUpper(line)

	// 提取级别
	for _, lvl := range []string{"ERROR", "WARN", "WARNING", "INFO", "DEBUG"} {
		if strings.Contains(upper, lvl) {
			msg.Level = lvl
			break
		}
	}
	if msg.Level == "" {
		msg.Level = "INFO"
	}

	// 提取时间戳（前 19 个字符通常是时间）
	if len(line) >= 19 {
		ts := line[:19]
		if ts[4] == '-' && ts[7] == '-' {
			msg.Timestamp = ts
		}
	}
	if msg.Timestamp == "" {
		msg.Timestamp = time.Now().Format("2006-01-02 15:04:05")
	}

	return msg
}

// LogStreamStats 日志流统计（供 REST API 使用）
type LogStreamStats struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	ModTime string `json:"mod_time"`
}

// GetLogFiles 列出所有可用的 NF 日志文件（所有目录）
func (lsh *LogStreamHandler) GetLogFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var files []LogStreamStats
	seen := make(map[string]bool)

	for _, dir := range lsh.allLogDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, e := range entries {
			if e.IsDir() {
				subdir := filepath.Join(dir, e.Name())
				subEntries, _ := os.ReadDir(subdir)
				for _, se := range subEntries {
					if !se.IsDir() && strings.HasSuffix(se.Name(), ".log") {
						path := filepath.Join(subdir, se.Name())
						if seen[path] {
							continue
						}
						seen[path] = true
						info, _ := se.Info()
						files = append(files, LogStreamStats{
							Name:    e.Name(),
							Path:    path,
							Size:    info.Size(),
							ModTime: info.ModTime().Format(time.RFC3339),
						})
					}
				}
			} else if strings.HasSuffix(e.Name(), ".log") {
				name := strings.TrimSuffix(e.Name(), ".log")
				path := filepath.Join(dir, e.Name())
				if seen[path] {
					continue
				}
				seen[path] = true
				info, _ := e.Info()
				files = append(files, LogStreamStats{
					Name:    name,
					Path:    path,
					Size:    info.Size(),
					ModTime: info.ModTime().Format(time.RFC3339),
				})
			}
		}
	}

	if files == nil {
		files = []LogStreamStats{}
	}

	writeJSONHelper(w, http.StatusOK, map[string]interface{}{"status": "ok", "files": files})
}

func writeJSONHelper(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
