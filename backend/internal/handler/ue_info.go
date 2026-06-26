package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// UEInfo UE 信息
type UEInfo struct {
	SUPI      string      `json:"supi"`
	Domain    string      `json:"domain"`
	RAT       string      `json:"rat"`
	CMState   string      `json:"cm_state"`
	MMState   string      `json:"mm_state"`
	ENB       *ENBInfo    `json:"enb,omitempty"`
	Location  *Location   `json:"location,omitempty"`
	AMBR      *AMBR       `json:"ambr,omitempty"`
	PDN       []PDNInfo   `json:"pdn,omitempty"`
	PDNCount  int         `json:"pdn_count"`
}

// ENBInfo 基站信息
type ENBInfo struct {
	ostreamID int    `json:"ostream_id"`
	ENBID     int    `json:"enb_id"`
	CellID    int    `json:"cell_id"`
	Status    string `json:"status"`
}

// Location 位置信息
type Location struct {
	TAI struct {
		PLMN string `json:"plmn"`
		TAC  int    `json:"tac"`
	} `json:"tai"`
	Timestamp int64 `json:"timestamp"`
}

// AMBR 带宽信息
type AMBR struct {
	Downlink int64 `json:"downlink"`
	Uplink   int64 `json:"uplink"`
}

// PDNInfo PDN 会话信息
type PDNInfo struct {
	APN        string      `json:"apn"`
	QCI        int         `json:"qci"`
	EBI        int         `json:"ebi"`
	PDUState   string      `json:"pdu_state"`
	QoSFlows   []QoSFlow   `json:"qos_flows,omitempty"`
	IPv4       string      `json:"ipv4,omitempty"`
	IPv6       string      `json:"ipv6,omitempty"`
}

// QoSFlow QoS 流信息
type QoSFlow struct {
	EBI int `json:"ebi"`
	QCI int `json:"qci"`
}

// UEInfoResponse API 响应
type UEInfoResponse struct {
	Items  []UEInfo `json:"items"`
	Pager  Pager    `json:"pager"`
}

// Pager 分页信息
type Pager struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Count    int `json:"count"`
}

// GetUEInfo 获取 UE 信息
func (h *Handler) GetUEInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	// 获取所有 UE 信息
	allUEs := make([]UEInfo, 0)
	pager := Pager{}

	// 从 MME 获取 LTE/EPC UE 信息
	mmeUEs, err := getUEInfoFromAPI("http://127.0.0.2:9090/ue-info?page=-1")
	if err == nil {
		allUEs = append(allUEs, mmeUEs.Items...)
		pager.Count += mmeUEs.Pager.Count
	}

	// 从 AMF 获取 5G SA UE 信息
	amfUEs, err := getUEInfoFromAPI("http://127.0.0.5:9090/ue-info?page=-1")
	if err == nil {
		allUEs = append(allUEs, amfUEs.Items...)
		pager.Count += amfUEs.Pager.Count
	}

	// 从 SMF 获取 PDU 会话信息
	smfUEs, err := getPDUInfoFromAPI("http://127.0.0.4:9090/pdu-info?page=-1")
	if err == nil {
		// 合并 SMF 信息到对应的 UE
		for _, smfUE := range smfUEs.Items {
			found := false
			for i, ue := range allUEs {
				// 匹配 SUPI（需要处理 imsi- 前缀）
				supi := smfUE.SUPI
				if len(supi) > 5 && supi[:5] == "imsi-" {
					supi = supi[5:]
				}
				if ue.SUPI == supi {
					// 合并 PDU 信息
					allUEs[i].PDN = smfUE.PDN
					allUEs[i].PDNCount = len(smfUE.PDN)
					found = true
					break
				}
			}
			if !found {
				// 如果没有找到对应的 UE，添加新的
				supi := smfUE.SUPI
				if len(supi) > 5 && supi[:5] == "imsi-" {
					supi = supi[5:]
				}
				allUEs = append(allUEs, UEInfo{
					SUPI:     supi,
					Domain:   "EPS",
					RAT:      "E-UTRA",
					PDN:      smfUE.PDN,
					PDNCount: len(smfUE.PDN),
				})
			}
		}
	}

	pager.Page = 0
	pager.PageSize = len(allUEs)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data": map[string]interface{}{
			"items": allUEs,
			"pager": pager,
		},
	})
}

// getUEInfoFromAPI 从 API 获取 UE 信息
func getUEInfoFromAPI(url string) (*UEInfoResponse, error) {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch UE info: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result UEInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return &result, nil
}

// getPDUInfoFromAPI 从 SMF API 获取 PDU 会话信息
func getPDUInfoFromAPI(url string) (*UEInfoResponse, error) {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PDU info: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result UEInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return &result, nil
}
