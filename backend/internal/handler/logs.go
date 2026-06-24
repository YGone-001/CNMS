package handler

import (
	"bufio"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// LogLine 单行日志
type LogLine struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// logResponse 日志查询响应
type logResponse struct {
	Status  string    `json:"status"`
	Message string    `json:"message,omitempty"`
	Logs    []LogLine `json:"logs,omitempty"`
	Total   int       `json:"total,omitempty"`
}

// GetNFLogs 读取指定网元的日志文件
func (h *Handler) GetNFLogs(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, logResponse{Status: "error", Message: "name parameter is required"})
		return
	}

	// 安全检查：防止路径遍历
	if strings.Contains(name, "..") || strings.Contains(name, "/") {
		writeJSON(w, http.StatusBadRequest, logResponse{Status: "error", Message: "invalid name"})
		return
	}

	tail := 100
	if v := r.URL.Query().Get("tail"); v != "" {
		if n, err := parsePositiveInt(v); err == nil && n > 0 && n <= 10000 {
			tail = n
		}
	}

	keyword := r.URL.Query().Get("keyword")
	level := strings.ToUpper(r.URL.Query().Get("level"))

	logDir := h.LogDir
	if logDir == "" {
		logDir = "/var/log/xCloud"
	}

	// 尝试读取目录下的日志文件
	dirPath := filepath.Join(logDir, name)
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		// 尝试直接读取文件
		filePath := dirPath + ".log"
		if _, statErr := os.Stat(filePath); statErr == nil {
			entries = nil
			lines, readErr := readLogFile(filePath, tail, keyword, level)
			if readErr != nil {
				writeJSON(w, http.StatusInternalServerError, logResponse{Status: "error", Message: "read failed: " + readErr.Error()})
				return
			}
			writeJSON(w, http.StatusOK, logResponse{Status: "ok", Message: "ok", Logs: lines, Total: len(lines)})
			return
		}
		writeJSON(w, http.StatusNotFound, logResponse{Status: "error", Message: "log not found for: " + name})
		return
	}

	// 收集所有 .log 文件
	var allLines []LogLine
	var logFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") {
			logFiles = append(logFiles, filepath.Join(dirPath, e.Name()))
		}
	}
	sort.Strings(logFiles)

	for _, fp := range logFiles {
		lines, err := readLogFile(fp, tail, keyword, level)
		if err != nil {
			continue
		}
		allLines = append(allLines, lines...)
	}

	// 只保留最后 tail 行
	if len(allLines) > tail {
		allLines = allLines[len(allLines)-tail:]
	}

	writeJSON(w, http.StatusOK, logResponse{
		Status:  "ok",
		Message: "ok",
		Logs:    allLines,
		Total:   len(allLines),
	})
}

func readLogFile(path string, tail int, keyword, level string) ([]LogLine, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []LogLine
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		raw := scanner.Text()
		if keyword != "" && !strings.Contains(strings.ToLower(raw), strings.ToLower(keyword)) {
			continue
		}

		line := parseLogLine(raw)
		if level != "" && line.Level != level {
			continue
		}
		lines = append(lines, line)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	// 只保留最后 tail 行
	if len(lines) > tail {
		lines = lines[len(lines)-tail:]
	}
	return lines, nil
}

func parseLogLine(raw string) LogLine {
	line := LogLine{Message: raw, Level: "INFO"}

	// 尝试解析常见日志格式: [2024-01-01 12:00:00] [LEVEL] message
	// 或: 2024-01-01T12:00:00Z LEVEL message
	upper := strings.ToUpper(raw)

	if strings.Contains(upper, "ERROR") || strings.Contains(upper, "FATAL") {
		line.Level = "ERROR"
	} else if strings.Contains(upper, "WARN") {
		line.Level = "WARN"
	} else if strings.Contains(upper, "DEBUG") {
		line.Level = "DEBUG"
	} else if strings.Contains(upper, "INFO") {
		line.Level = "INFO"
	}

	// 提取时间戳
	if len(raw) > 19 {
		if raw[0] == '[' {
			if idx := strings.Index(raw, "]"); idx > 1 {
				line.Timestamp = raw[1:idx]
			}
		} else if raw[4] == '-' && raw[7] == '-' {
			line.Timestamp = raw[:19]
		}
	}
	if line.Timestamp == "" {
		line.Timestamp = time.Now().Format("2006-01-02 15:04:05")
	}

	return line
}

func parsePositiveInt(s string) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, nil
		}
		n = n*10 + int(c-'0')
		if n > 10000 {
			return 10000, nil
		}
	}
	return n, nil
}
