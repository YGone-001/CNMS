package signaling

import (
	"log"
	"sort"
	"strings"

	"xcloud-cnms/internal/model"
)

// Correlator 跨协议关联引擎
type Correlator struct{}

// NewCorrelator 创建关联器实例
func NewCorrelator() *Correlator {
	return &Correlator{}
}

// Correlate 将不同来源的消息按用户标识关联，统一 TraceID 并按时间排序
//
// 关联规则（按优先级）：
//  1. IMSI/SUPI 直接关联 NAS/NGAP/S1AP/Diameter/GTP 消息
//  2. MSISDN → SIP URI → IMPU/IMPI 关联 IMS 侧 SIP 消息
//  3. SIP Call-ID 关联同一通话的所有 SIP 消息
//  4. TEID 关联 GTPv2-C 和 GTP-U 消息
//  5. UE IP 地址关联用户面（RTP/RTCP）消息
//  6. PDU Session ID / EPS Bearer ID 关联控制面和用户面
func (c *Correlator) Correlate(messages []model.SignalingMessage) []model.SignalingMessage {
	if len(messages) == 0 {
		return messages
	}

	// 构建关联索引
	type msgRef struct {
		idx int
		msg *model.SignalingMessage
	}

	// 按各标识维度建索引
	imsiIndex := make(map[string][]int)   // IMSI → msg indices
	supiIndex := make(map[string][]int)   // SUPI → msg indices
	msisdnIndex := make(map[string][]int) // MSISDN → msg indices
	sipURIIndex := make(map[string][]int) // SIP URI → msg indices
	impuIndex := make(map[string][]int)   // IMPU → msg indices
	impiIndex := make(map[string][]int)   // IMPI → msg indices
	callIDIndex := make(map[string][]int) // Call-ID → msg indices
	teidIndex := make(map[string][]int)   // TEID → msg indices
	ipv4Index := make(map[string][]int)   // UE IPv4 → msg indices
	sessionIndex := make(map[string][]int) // Session ID → msg indices

	for i := range messages {
		m := &messages[i]
		id := m.Identifiers

		if id.IMSI != "" {
			imsiIndex[id.IMSI] = append(imsiIndex[id.IMSI], i)
		}
		if id.SUPI != "" {
			supiIndex[id.SUPI] = append(supiIndex[id.SUPI], i)
		}
		if id.MSISDN != "" {
			msisdnIndex[id.MSISDN] = append(msisdnIndex[id.MSISDN], i)
		}
		if id.SIPURI != "" {
			normalized := normalizeSIPURI(id.SIPURI)
			sipURIIndex[normalized] = append(sipURIIndex[normalized], i)
		}
		if id.IMPU != "" {
			impuIndex[id.IMPU] = append(impuIndex[id.IMPU], i)
		}
		if id.IMPI != "" {
			impiIndex[id.IMPI] = append(impiIndex[id.IMPI], i)
		}
		if id.CallID != "" || m.CallID != "" {
			cid := id.CallID
			if cid == "" {
				cid = m.CallID
			}
			callIDIndex[cid] = append(callIDIndex[cid], i)
		}
		if id.TEID != "" {
			teidIndex[id.TEID] = append(teidIndex[id.TEID], i)
		}
		if id.UEIPv4 != "" {
			ipv4Index[id.UEIPv4] = append(ipv4Index[id.UEIPv4], i)
		}
		if m.SessionID != "" {
			sessionIndex[m.SessionID] = append(sessionIndex[m.SessionID], i)
		}
	}

	// Union-Find 用于合并关联组
	uf := newUnionFind(len(messages))

	// 规则 1: IMSI/SUPI 关联（去掉 MCC 前缀后也尝试匹配）
	for imsi, indices := range imsiIndex {
		unionAll(uf, indices)
		// 尝试匹配 SUPI = "imsi-" + IMSI
		if suPI, ok := supiIndex[imsi]; ok {
			unionAll(uf, append(indices, suPI...))
		}
		// 去掉 3 位 MCC 前缀尝试（支持常见 MCC：460/417/310/262/208 等）
		if len(imsi) > 3 {
			mcc := imsi[:3]
			for _, knownMCC := range []string{"999", "460", "417", "310", "311", "312", "262", "208", "234", "235", "440", "441", "450", "452", "520", "525"} {
				if mcc == knownMCC {
					trimmed := imsi[3:]
					if trimmed != imsi {
						if other, ok := imsiIndex[trimmed]; ok {
							unionAll(uf, append(indices, other...))
						}
					}
					break
				}
			}
		}
	}

	for supi, indices := range supiIndex {
		unionAll(uf, indices)
		// SUPI 格式: imsi-XXXXXXXXXXXX 或 nai-xxx
		imsi := strings.TrimPrefix(supi, "imsi-")
		if imsi != supi {
			if other, ok := imsiIndex[imsi]; ok {
				unionAll(uf, append(indices, other...))
			}
		}
	}

	// 规则 2: MSISDN/SIP URI/IMPU/IMPI 关联（IMS 侧）
	for msisdn, indices := range msisdnIndex {
		unionAll(uf, indices)
		// MSISDN 可能出现在 SIP URI 中
		for uri, uriIndices := range sipURIIndex {
			if strings.Contains(uri, msisdn) {
				unionAll(uf, append(indices, uriIndices...))
			}
		}
	}

	for uri, indices := range sipURIIndex {
		unionAll(uf, indices)
		// SIP URI 可能就是 IMPU
		for impu, impuIndices := range impuIndex {
			if strings.Contains(uri, impu) || strings.Contains(impu, uri) {
				unionAll(uf, append(indices, impuIndices...))
			}
		}
	}

	for _, indices := range impuIndex {
		unionAll(uf, indices)
	}
	for _, indices := range impiIndex {
		unionAll(uf, indices)
	}

	// 规则 3: SIP Call-ID 关联
	for _, indices := range callIDIndex {
		unionAll(uf, indices)
	}

	// 规则 4: TEID 关联
	for _, indices := range teidIndex {
		unionAll(uf, indices)
	}

	// 规则 5: UE IP 关联
	for _, indices := range ipv4Index {
		unionAll(uf, indices)
	}

	// 规则 6: Session ID 关联
	for _, indices := range sessionIndex {
		unionAll(uf, indices)
	}

	// 规则 7: Identity Context Tree — 跨层关联 (SIP ↔ NAS/S1AP/GTP)
	//
	// 问题: SIP REGISTER 携带 Call-ID + SIP URI (内嵌 IMSI)，
	// 但 S1AP/NAS/GTP 携带 e212.imsi 却没有 Call-ID。
	// 两层消息各自形成独立的关联组，无法合并为完整信令流程。
	//
	// 方案: 从 SIP 消息中提取 Call-ID → IMSI 映射，
	// 再用该映射将 IMSI 组与 Call-ID 组在 Union-Find 中合并。
	mergeCrossLayerIdentity(uf, messages, imsiIndex, callIDIndex)

	// 从 UF 组中确定每个消息的 TraceID
	// 策略：用组中第一条消息的 TraceID 作为组的 TraceID
	groupTraceID := make(map[int]string) // root → traceID
	for i := range messages {
		root := uf.find(i)
		if _, exists := groupTraceID[root]; !exists {
			groupTraceID[root] = messages[i].TraceID
		}
	}

	// 统一 TraceID
	for i := range messages {
		root := uf.find(i)
		messages[i].TraceID = groupTraceID[root]
	}

	// 按时间排序
	sort.SliceStable(messages, func(i, j int) bool {
		return messages[i].Timestamp.Before(messages[j].Timestamp)
	})

	// 统计关联结果
	groupCount := 0
	seen := make(map[int]bool)
	for i := range messages {
		root := uf.find(i)
		if !seen[root] {
			seen[root] = true
			groupCount++
		}
	}

	log.Printf("Correlate: %d messages → %d groups", len(messages), groupCount)
	return messages
}

// DeriveEntities 从消息列表中提取参与的全部网元，按 3GPP 架构顺序排序
//
// 排序参考：UE → eNodeB/gNB → MME/AMF → HSS/AUSF/UDM → SGW/SMF → PGW/UPF
//
//	→ PCRF/PCF → P-CSCF → I-CSCF → S-CSCF → HSS(IMS) → SMSF → MSC
func (c *Correlator) DeriveEntities(messages []model.SignalingMessage) []string {
	seen := make(map[string]bool)
	for _, m := range messages {
		if m.SourceEntity != "" {
			seen[m.SourceEntity] = true
		}
		if m.DestEntity != "" {
			seen[m.DestEntity] = true
		}
	}

	entities := make([]string, 0, len(seen))
	for e := range seen {
		entities = append(entities, e)
	}

	sort.Slice(entities, func(i, j int) bool {
		return entityOrder(entities[i]) < entityOrder(entities[j])
	})

	return entities
}

// entityOrder 返回实体在 3GPP 架构中的排序权重
func entityOrder(entity string) int {
	switch strings.ToUpper(entity) {
	case "UE":
		return 0
	case "ENODEB", "ENB":
		return 10
	case "GNB":
		return 11
	case "MME":
		return 20
	case "AMF":
		return 21
	case "HSS":
		return 30
	case "AUSF":
		return 31
	case "UDM":
		return 32
	case "UDR":
		return 33
	case "SGW", "SGW-C", "SGW-U":
		return 40
	case "SMF":
		return 41
	case "PGW", "PGW-C", "PGW-U":
		return 50
	case "UPF":
		return 51
	case "PCRF":
		return 60
	case "PCF":
		return 61
	case "P-CSCF", "PCSCF":
		return 70
	case "I-CSCF", "ICSCF":
		return 71
	case "S-CSCF", "SCSCF":
		return 72
	case "HSS-IMS":
		return 73
	case "SMSF":
		return 80
	case "MSC":
		return 81
	case "FREESWITCH":
		return 75
	case "RTPENGINE":
		return 55
	case "NRF":
		return 90
	case "NSSF":
		return 91
	case "SCP":
		return 92
	case "BSF":
		return 93
	case "CLIENT", "SERVER":
		return 95
	default:
		return 100
	}
}

// GenerateSummary 分析消息列表，判断各环节是否成功完成
func (c *Correlator) GenerateSummary(messages []model.SignalingMessage) model.TraceSummary {
	summary := model.TraceSummary{}

	// 按协议分组统计
	var sipMessages, nasMessages, gtpMessages, diameterMessages, pfcpMessages []model.SignalingMessage
	for _, m := range messages {
		switch m.Protocol {
		case "SIP", "SDP":
			sipMessages = append(sipMessages, m)
		case "NAS":
			nasMessages = append(nasMessages, m)
		case "GTPv2C", "GTPU":
			gtpMessages = append(gtpMessages, m)
		case "Diameter":
			diameterMessages = append(diameterMessages, m)
		case "PFCP":
			pfcpMessages = append(pfcpMessages, m)
		}
	}

	// 检查注册（4G Attach 或 5G Registration）
	summary.RegistrationOK = c.checkRegistrationOK(nasMessages)
	if !summary.RegistrationOK {
		summary.ErrorStep = c.findErrorStep(nasMessages, []string{
			"Attach", "Registration", "TAU",
		})
		if summary.ErrorStep != "" {
			summary.ErrorDetail = c.findErrorDetail(nasMessages, summary.ErrorStep)
		}
	}

	// 检查鉴权
	summary.AuthOK = c.checkAuthOK(nasMessages, diameterMessages)

	// 检查会话建立（PDU Session / Create Session）
	summary.SessionOK = c.checkSessionOK(gtpMessages, pfcpMessages, nasMessages)

	// 检查 IMS 注册
	summary.IMSRegOK = c.checkIMSRegOK(sipMessages)

	// 检查 VoLTE/VoNR 呼叫
	summary.CallOK = c.checkCallOK(sipMessages)

	// 检查 SMS
	summary.SMSOK = c.checkSMSOK(sipMessages, nasMessages)

	// 如果有失败步骤，填充错误详情
	if !summary.RegistrationOK && summary.ErrorStep == "" {
		summary.ErrorStep = "registration"
		summary.ErrorDetail = "Registration procedure not completed"
	}
	if !summary.AuthOK && (summary.ErrorStep == "" || summary.ErrorStep == "registration") {
		if summary.ErrorStep == "" {
			summary.ErrorStep = "authentication"
			summary.ErrorDetail = "Authentication procedure not completed"
		}
	}

	return summary
}

// checkRegistrationOK 检查注册是否成功
func (c *Correlator) checkRegistrationOK(nas []model.SignalingMessage) bool {
	for _, m := range nas {
		lm := strings.ToLower(m.Method)
		// 5G Registration Accept
		if strings.Contains(lm, "registration") && strings.Contains(lm, "accept") {
			return true
		}
		// 4G Attach Accept
		if strings.Contains(lm, "attach") && strings.Contains(lm, "accept") {
			return true
		}
		// TAU Accept
		if strings.Contains(lm, "tau") && strings.Contains(lm, "accept") {
			return true
		}
		// Registration Reject → 注册失败
		if strings.Contains(lm, "registration") && strings.Contains(lm, "reject") {
			return false
		}
		if strings.Contains(lm, "attach") && strings.Contains(lm, "reject") {
			return false
		}
	}
	return false
}

// checkAuthOK 检查鉴权是否成功
func (c *Correlator) checkAuthOK(nas []model.SignalingMessage, diameter []model.SignalingMessage) bool {
	// NAS 层：有 Authentication Response（不是 Failure）即为成功
	hasAuthReq := false
	hasAuthResp := false
	hasAuthFail := false
	for _, m := range nas {
		lm := strings.ToLower(m.Method)
		if strings.Contains(lm, "authentication") && strings.Contains(lm, "request") {
			hasAuthReq = true
		}
		if strings.Contains(lm, "authentication") && strings.Contains(lm, "response") {
			hasAuthResp = true
		}
		if strings.Contains(lm, "authentication") && (strings.Contains(lm, "failure") || strings.Contains(lm, "reject")) {
			hasAuthFail = true
		}
	}

	if hasAuthReq && hasAuthResp && !hasAuthFail {
		return true
	}

	// Diameter 层：有 MAR/MAA 成功
	for _, m := range diameter {
		if strings.EqualFold(m.Method, "MAA") || strings.EqualFold(m.Method, "MAR/MAA") {
			if m.StatusCode == 2001 || m.StatusCode == 0 {
				return true
			}
		}
	}

	// Security Mode Complete 也表明鉴权通过
	for _, m := range nas {
		lm := strings.ToLower(m.Method)
		if strings.Contains(lm, "security mode") && strings.Contains(lm, "complete") {
			return true
		}
	}

	return false
}

// checkSessionOK 检查会话建立是否成功
func (c *Correlator) checkSessionOK(gtp []model.SignalingMessage, pfcp []model.SignalingMessage, nas []model.SignalingMessage) bool {
	// GTPv2-C: Create Session Response 成功 (Cause=16: Request Accepted, 3GPP TS 29.274)
	for _, m := range gtp {
		if strings.Contains(strings.ToLower(m.Method), "create session") &&
			strings.Contains(strings.ToLower(m.Method), "response") {
			cause := m.StatusCode
			if v, ok := m.Details["cause"].(int); ok {
				cause = v
			}
			// Cause=16 (Request Accepted) 或 Cause=0 (未解析) 视为成功
			if cause == 16 || cause == 0 {
				return true
			}
		}
	}

	// PFCP: Session Establishment Response 成功
	for _, m := range pfcp {
		if strings.Contains(strings.ToLower(m.Method), "session establishment") &&
			strings.Contains(strings.ToLower(m.Method), "response") {
			return true
		}
	}

	// NAS: PDU Session Establishment Accept
	for _, m := range nas {
		lm := strings.ToLower(m.Method)
		if strings.Contains(lm, "pdu session") && strings.Contains(lm, "accept") {
			return true
		}
	}

	return false
}

// checkIMSRegOK 检查 IMS 注册是否成功
func (c *Correlator) checkIMSRegOK(sip []model.SignalingMessage) bool {
	hasRegister := false
	for _, m := range sip {
		if strings.EqualFold(m.Method, "REGISTER") {
			hasRegister = true
		}
		// SIP 200 OK for REGISTER
		if m.StatusCode == 200 {
			// 检查 CSeq method 是否为 REGISTER（兼容两种 detail key）
			cseqMethod := ""
			if v, ok := m.Details["cseq_method"].(string); ok {
				cseqMethod = v
			} else if v, ok := m.Details["cseq"].(string); ok {
				cseqMethod = v
			}
			if strings.EqualFold(cseqMethod, "REGISTER") {
				return true
			}
			// 或者检查消息上下文中有 REGISTER
			if hasRegister {
				return true
			}
		}
	}
	return false
}

// checkCallOK 检查 VoLTE/VoNR 呼叫是否成功
func (c *Correlator) checkCallOK(sip []model.SignalingMessage) bool {
	hasInvite := false
	hasInvite200OK := false
	hasCancel := false

	for _, m := range sip {
		switch strings.ToUpper(m.Method) {
		case "INVITE":
			hasInvite = true
		case "CANCEL":
			hasCancel = true
		}

		// 获取 CSeq method（兼容两种 detail key）
		cseqMethod := ""
		if v, ok := m.Details["cseq_method"].(string); ok {
			cseqMethod = v
		} else if v, ok := m.Details["cseq"].(string); ok {
			cseqMethod = v
		}

		// 200 OK for INVITE = 呼叫建立成功
		if m.StatusCode == 200 && strings.EqualFold(cseqMethod, "INVITE") {
			hasInvite200OK = true
		}
		// 4xx/5xx/6xx for INVITE = 呼叫失败
		if m.StatusCode >= 400 && m.StatusCode < 700 {
			if strings.EqualFold(cseqMethod, "INVITE") {
				return false
			}
		}
	}

	// INVITE + 200 OK for INVITE = 呼叫建立成功
	if hasInvite && hasInvite200OK && !hasCancel {
		return true
	}

	return false
}

// checkSMSOK 检查短信是否成功
func (c *Correlator) checkSMSOK(sip []model.SignalingMessage, nas []model.SignalingMessage) bool {
	// SIP MESSAGE 方式
	hasMessage := false
	hasMessageOK := false
	for _, m := range sip {
		if strings.EqualFold(m.Method, "MESSAGE") {
			hasMessage = true
		}
		if m.StatusCode == 200 && hasMessage {
			hasMessageOK = true
		}
	}
	if hasMessage && hasMessageOK {
		return true
	}

	// NAS 方式（SGsAP 或 NAS SMS）
	for _, m := range nas {
		lm := strings.ToLower(m.Method)
		if strings.Contains(lm, "sms") || strings.Contains(lm, "short message") {
			if strings.Contains(lm, "complete") || strings.Contains(lm, "acknowledge") {
				return true
			}
		}
	}

	return false
}

// findErrorStep 找到第一个失败的步骤
func (c *Correlator) findErrorStep(messages []model.SignalingMessage, steps []string) string {
	for _, step := range steps {
		for _, m := range messages {
			if strings.Contains(strings.ToLower(m.Method), strings.ToLower(step)) {
				if strings.Contains(strings.ToLower(m.Method), "reject") ||
					strings.Contains(strings.ToLower(m.Method), "failure") {
					return strings.ToLower(step)
				}
				if m.StatusCode >= 400 {
					return strings.ToLower(step)
				}
			}
		}
	}
	return ""
}

// findErrorDetail 找到错误详情
func (c *Correlator) findErrorDetail(messages []model.SignalingMessage, errorStep string) string {
	for _, m := range messages {
		lm := strings.ToLower(m.Method)
		if strings.Contains(lm, errorStep) {
			if strings.Contains(lm, "reject") || strings.Contains(lm, "failure") {
				if m.StatusText != "" {
					return m.StatusText
				}
				if cause, ok := m.Details["cause"].(string); ok {
					return cause
				}
				return m.Method
			}
			if m.StatusCode >= 400 {
				if m.StatusText != "" {
					return m.StatusText
				}
				return m.Method
			}
		}
	}
	return ""
}

// -----------------------------------------------------------
// Union-Find 数据结构
// -----------------------------------------------------------

type unionFind struct {
	parent []int
	rank   []int
}

func newUnionFind(n int) *unionFind {
	parent := make([]int, n)
	rank := make([]int, n)
	for i := range parent {
		parent[i] = i
	}
	return &unionFind{parent: parent, rank: rank}
}

func (uf *unionFind) find(x int) int {
	if uf.parent[x] != x {
		uf.parent[x] = uf.find(uf.parent[x]) // 路径压缩
	}
	return uf.parent[x]
}

func (uf *unionFind) union(x, y int) {
	rx, ry := uf.find(x), uf.find(y)
	if rx == ry {
		return
	}
	// 按秩合并
	if uf.rank[rx] < uf.rank[ry] {
		rx, ry = ry, rx
	}
	uf.parent[ry] = rx
	if uf.rank[rx] == uf.rank[ry] {
		uf.rank[rx]++
	}
}

// unionAll 将一组索引全部合并到同一集合
func unionAll(uf *unionFind, indices []int) {
	if len(indices) < 2 {
		return
	}
	for i := 1; i < len(indices); i++ {
		uf.union(indices[0], indices[i])
	}
}

// mergeCrossLayerIdentity 通过 Identity Context Tree 实现 SIP ↔ NAS/S1AP/GTP 跨层关联。
//
// 信令断层场景:
//   EPC Attach 阶段: S1AP/NAS 消息携带 e212.imsi，但无 Call-ID
//   IMS Register 阶段: SIP REGISTER 携带 Call-ID + SIP URI (内嵌 IMSI)
//   两层消息在 Union-Find 中形成独立组，无法合并为完整流程
//
// 算法:
//  1. 遍历 SIP 消息，提取同时拥有 Call-ID 和 IMSI 的消息，建立 Call-ID → IMSI 映射
//  2. 对每个映射条目，将 IMSI 索引中的消息与 Call-ID 索引中的消息在 UF 中合并
//  3. 同时支持反向: 若 SIP 消息只有 Call-ID 无 IMSI，但同 Call-ID 的其他消息有 IMSI，也能关联
//
// 这样底层 (S1AP/NAS/GTP with IMSI) 和 SIP 层 (with Call-ID) 通过共享 IMSI 桥接。
func mergeCrossLayerIdentity(uf *unionFind, messages []model.SignalingMessage,
	imsiIndex map[string][]int, callIDIndex map[string][]int) {

	// Step 1: 从 SIP 消息中构建 Call-ID → IMSI 映射 (Identity Context Tree)
	//
	// 一个 IMSI 可能对应多个 Call-ID (多并发会话)，
	// 一个 Call-ID 只对应一个 IMSI (会话绑定)。
	callIDToIMSI := make(map[string]string)
	for _, indices := range callIDIndex {
		for _, idx := range indices {
			m := messages[idx]
			imsi := m.Identifiers.IMSI
			if imsi == "" {
				continue
			}
			cid := m.Identifiers.CallID
			if cid == "" {
				cid = m.CallID
			}
			if cid != "" {
				callIDToIMSI[cid] = imsi
			}
		}
	}

	if len(callIDToIMSI) == 0 {
		return
	}

	// Step 2: 用映射合并 IMSI 组与 Call-ID 组，收集跨层桥接的消息索引
	merged := 0
	crossLayerSet := make(map[int]struct{})
	for cid, imsi := range callIDToIMSI {
		imIndices, imsiOK := imsiIndex[imsi]
		cidIndices, cidOK := callIDIndex[cid]
		if !imsiOK || !cidOK {
			continue
		}
		// 合并 IMSI 组 (S1AP/NAS/GTP) + Call-ID 组 (SIP)
		combined := make([]int, 0, len(imIndices)+len(cidIndices))
		combined = append(combined, imIndices...)
		combined = append(combined, cidIndices...)
		unionAll(uf, combined)
		merged++
		// 标记所有参与跨层合并的消息
		for _, idx := range combined {
			crossLayerSet[idx] = struct{}{}
		}
	}

	// Step 3: 设置跨层关联标记
	for idx := range crossLayerSet {
		messages[idx].CrossLayer = true
	}

	if merged > 0 {
		log.Printf("Correlate: cross-layer identity merged %d Call-ID/IMSI bridges, tagged %d messages",
			merged, len(crossLayerSet))
	}
}
