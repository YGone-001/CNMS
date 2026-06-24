package handler

import (
	"net/http"

	"xcloud-cnms/internal/monitor"
)

// DiscoveryHandler NF 发现处理器
type DiscoveryHandler struct {
	discovery *monitor.NFDiscovery
}

// NewDiscoveryHandler 创建 NF 发现处理器
func NewDiscoveryHandler(d *monitor.NFDiscovery) *DiscoveryHandler {
	return &DiscoveryHandler{discovery: d}
}

// TriggerDiscovery 手动触发 NF 发现
// GET /api/v1/nf/discovery
func (dh *DiscoveryHandler) TriggerDiscovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	results, err := dh.discovery.Discover()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"count":    len(results),
		"nfs":      results,
	})
}

// GetDiscovered 获取已发现的 NF 列表
// GET /api/v1/nf/discovered
func (dh *DiscoveryHandler) GetDiscovered(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"status": "error", "message": "method not allowed"})
		return
	}

	results := dh.discovery.GetDiscovered()
	if results == nil {
		results = []monitor.DiscoveredNF{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"count":  len(results),
		"nfs":    results,
	})
}
