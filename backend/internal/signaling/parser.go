package signaling

import (
	"strings"

	"xcloud-cnms/internal/model"
)

// -----------------------------------------------------------
// 信令消息过滤
// -----------------------------------------------------------

// matchFilters 检查消息是否匹配过滤器
func matchFilters(msg *model.SignalingMessage, filters map[string]string) bool {
	for k, v := range filters {
		switch k {
		case "protocol":
			if !strings.EqualFold(msg.Protocol, v) {
				return false
			}
		case "method":
			if !strings.Contains(strings.ToLower(msg.Method), strings.ToLower(v)) {
				return false
			}
		case "src_entity":
			if !strings.EqualFold(msg.SourceEntity, v) {
				return false
			}
		case "dst_entity":
			if !strings.EqualFold(msg.DestEntity, v) {
				return false
			}
		case "imsi":
			if msg.Identifiers.IMSI != v {
				return false
			}
		case "msisdn":
			if msg.Identifiers.MSISDN != v {
				return false
			}
		case "sip_uri":
			if !strings.Contains(msg.Identifiers.SIPURI, v) {
				return false
			}
		case "call_id":
			if msg.CallID != v {
				return false
			}
		case "direction":
			if !strings.EqualFold(msg.Direction, v) {
				return false
			}
		case "bpf":
			// pcap 专用，此处忽略
		}
	}
	return true
}

// -----------------------------------------------------------
// 通用工具函数（被 correlator.go / hep.go 使用）
// -----------------------------------------------------------

// normalizeSIPURI 规范化 SIP URI，去掉 sip: 前缀和参数
func normalizeSIPURI(raw string) string {
	uri := strings.TrimSpace(raw)
	uri = strings.TrimPrefix(uri, "sip:")
	uri = strings.TrimPrefix(uri, "sips:")
	// 去掉 @ 后面的参数（保留域名）
	if idx := strings.Index(uri, ";"); idx != -1 {
		uri = uri[:idx]
	}
	return uri
}

// trimPrefix 移除前缀（如果存在）
func trimPrefix(s, prefix string) string {
	if strings.HasPrefix(s, prefix) {
		return s[len(prefix):]
	}
	return s
}
