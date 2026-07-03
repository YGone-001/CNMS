package signaling

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Parser 信令日志解析器
type Parser struct {
	db *mongo.Database
}

// NewParser 创建解析器实例
func NewParser(db *mongo.Database) *Parser {
	return &Parser{db: db}
}

// -----------------------------------------------------------
// 包级正则：Open5GS 日志
// -----------------------------------------------------------

// 通用日志行: 01/15 10:30:45.123: [amf] INFO: [supi-xxx] message (path)
var reOpen5GSLine = regexp.MustCompile(
	`^(\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+):\s+\[(\w+)\]\s+(\w+):\s+(.*)$`,
)

// SUPI/IMSI 提取
var reSUPI = regexp.MustCompile(`supi-([0-9]+)`)
var reIMSI = regexp.MustCompile(`imsi-([0-9]+)`)

// TEID
var reTEID = regexp.MustCompile(`teid[=:]?\s*([0-9a-fA-F]+)`)

// UE IP
var reUEIPv4 = regexp.MustCompile(`ue_ip[=:]?\s*(\d+\.\d+\.\d+\.\d+)`)
var reUEIPv6 = regexp.MustCompile(`ue_ipv6[=:]?\s*([0-9a-fA-F:]+)`)

// PDU Session ID / Bearer ID
var reSessionID = regexp.MustCompile(`(?:pdu_session_id|bearer_id)[=:]?\s*(\d+)`)

// 5G 事件
var re5GRegistration = regexp.MustCompile(`(?i)registration\s+(request|accept|reject|complete)`)
var re5GAuth = regexp.MustCompile(`(?i)(authentication|security\s+mode)\s+(request|response|reject|complete|command)`)
var re5GPDU = regexp.MustCompile(`(?i)pdu\s+session\s+(establishment|modification|release)\s+(request|accept|reject|command|complete)`)
var re5GDeRegistration = regexp.MustCompile(`(?i)(de)?registration\s+(request|accept|command)`)

// 4G 事件
var re4GAttach = regexp.MustCompile(`(?i)attach\s+(request|accept|reject|complete)`)
var re4GDetach = regexp.MustCompile(`(?i)detach\s+(request|accept)`)
var re4GTAU = regexp.MustCompile(`(?i)tracking\s+area\s+update\s+(request|accept|reject|complete)`)
var re4GCreateSession = regexp.MustCompile(`(?i)create\s+session\s+(request|response)`)
var re4GModifyBearer = regexp.MustCompile(`(?i)modify\s+bearer\s+(request|response)`)
var re4GDeleteSession = regexp.MustCompile(`(?i)delete\s+session\s+(request|response)`)

// NF 名称 → 实体名映射
var open5gsNFMap = map[string]string{
	"amf":   "AMF",
	"ausf":  "AUSF",
	"bsf":   "BSF",
	"nrf":   "NRF",
	"nssf":  "NSSF",
	"pcf":   "PCF",
	"smf":   "SMF",
	"udm":   "UDM",
	"udr":   "UDR",
	"upf":   "UPF",
	"mme":   "MME",
	"hss":   "HSS",
	"sgwc":  "SGW-C",
	"sgwu":  "SGW-U",
	"pgwc":  "PGW-C",
	"pgwu":  "PGW-U",
	"pcrf":  "PCRF",
	"scp":   "SCP",
}

// -----------------------------------------------------------
// 包级正则：Kamailio 日志
// -----------------------------------------------------------

// Kamailio syslog: Jul  3 10:30:45 hostname kamailio[pid]: INFO: <script>: ...
var reKamailioLine = regexp.MustCompile(
	`^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+kamailio\[\d+\]:\s+(\w+):\s+<\w+>:\s+(.*)$`,
)

// SIP 消息行（Kamailio xlog 格式）
var reSIPMethod = regexp.MustCompile(`"(REGISTER|INVITE|ACK|BYE|CANCEL|UPDATE|PRACK|REFER|SUBSCRIBE|NOTIFY|MESSAGE|OPTIONS|INFO|PUBLISH)\s+\S+\s+SIP/2\.0"`)
var reSIPStatus = regexp.MustCompile(`"SIP/2\.0\s+(\d{3})\s+([^"]*)"`)
var reSIPFrom = regexp.MustCompile(`From:\s*<?([^>;]+)`)
var reSIPTo = regexp.MustCompile(`To:\s*<?([^>;]+)`)
var reSIPCallID = regexp.MustCompile(`Call-ID:\s*(\S+)`)
var reSIPCSeq = regexp.MustCompile(`CSeq:\s+(\d+)\s+(\w+)`)
var reSIPVia = regexp.MustCompile(`Via:\s*(\S+)`)

// Diameter Cx/Dx 消息
var reDiameterCx = regexp.MustCompile(`(?i)(uar|uaa|mar|maa|sar|saa|lir|lia)\s`)

// Kamailio 日志时间格式
const kamailioTimeLayout = "Jan  2 15:04:05"

// -----------------------------------------------------------
// 包级正则：FreeSWITCH 日志
// -----------------------------------------------------------

// FreeSWITCH 日志: 2026-07-03 10:30:45.123456 [INFO] mod_sofia.c:1234 ...
var reFSLine = regexp.MustCompile(
	`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+\[(\w+)\]\s+(\S+):\d+\s+(.*)$`,
)

var reFSChannel = regexp.MustCompile(`Channel\s+(\S+)\s+`)
var reFSCodec = regexp.MustCompile(`codec\s*[=:]\s*(\S+)`)
var reFSDuration = regexp.MustCompile(`duration[=:]\s*(\d+)`)
var reFSHangup = regexp.MustCompile(`Hangup\s+cause:\s*(\S+)`)
var reFSRTPStats = regexp.MustCompile(`rtp.*?loss(?:_rate)?[=:]\s*([\d.]+).*?jitter[=:]\s*([\d.]+)`)

// FreeSWITCH 时间格式
const fsTimeLayout = "2006-01-02 15:04:05.000000"

// -----------------------------------------------------------
// ParseOpen5GSLog 解析 Open5GS 日志
// -----------------------------------------------------------

func (p *Parser) ParseOpen5GSLog(ctx context.Context, logPath string, traceID string, filters map[string]string) ([]model.SignalingMessage, error) {
	f, err := os.Open(logPath)
	if err != nil {
		return nil, fmt.Errorf("open open5gs log %s: %w", logPath, err)
	}
	defer f.Close()

	var messages []model.SignalingMessage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

	lineNo := 0
	for scanner.Scan() {
		lineNo++
		select {
		case <-ctx.Done():
			return messages, ctx.Err()
		default:
		}

		line := scanner.Text()
		msg, ok := p.parseOpen5GSLine(lineNo, line)
		if !ok {
			continue
		}
		msg.TraceID = traceID

		// 应用过滤器
		if !matchFilters(msg, filters) {
			continue
		}
		messages = append(messages, *msg)
	}

	if err := scanner.Err(); err != nil {
		return messages, fmt.Errorf("scan open5gs log: %w", err)
	}

	log.Printf("ParseOpen5GSLog: %s parsed %d messages from %d lines", logPath, len(messages), lineNo)
	return messages, nil
}

func (p *Parser) parseOpen5GSLine(lineNo int, line string) (*model.SignalingMessage, bool) {
	m := reOpen5GSLine.FindStringSubmatch(line)
	if m == nil {
		return nil, false
	}

	tsStr, nf, level, body := m[1], m[2], m[3], m[4]

	// 解析时间（补年份为当前年）
	year := time.Now().Year()
	ts, err := time.ParseInLocation("2006/01/02 15:04:05.000",
		fmt.Sprintf("%d/%s", year, tsStr), time.Local)
	if err != nil {
		log.Printf("ParseOpen5GSLog line %d: bad timestamp %q: %v", lineNo, tsStr, err)
		return nil, false
	}

	nfUpper := strings.ToUpper(nf)
	entityName, ok := open5gsNFMap[strings.ToLower(nf)]
	if !ok {
		entityName = nfUpper
	}

	msg := &model.SignalingMessage{
		Timestamp:    ts,
		Protocol:     p.detectOpen5GSProtocol(nf, body),
		Direction:    p.detectOpen5GSDirection(body),
		SourceEntity: entityName,
		Details: map[string]any{
			"nf":    nf,
			"level": level,
			"line":  lineNo,
		},
		RawPreview: truncate(body, 2000),
	}

	// 提取用户标识
	if supi := reSUPI.FindStringSubmatch(body); supi != nil {
		msg.Identifiers.SUPI = supi[1]
		msg.Identifiers.IMSI = trimPrefix(supi[1], "999") // 简化：去掉 MCC 前缀示例
	} else if imsi := reIMSI.FindStringSubmatch(body); imsi != nil {
		msg.Identifiers.IMSI = imsi[1]
	}
	if teid := reTEID.FindStringSubmatch(body); teid != nil {
		msg.Identifiers.TEID = teid[1]
	}
	if ip := reUEIPv4.FindStringSubmatch(body); ip != nil {
		msg.Identifiers.UEIPv4 = ip[1]
	}
	if ip := reUEIPv6.FindStringSubmatch(body); ip != nil {
		msg.Identifiers.UEIPv6 = ip[1]
	}
	if sid := reSessionID.FindStringSubmatch(body); sid != nil {
		msg.SessionID = sid[1]
	}

	// 识别方法和事件
	msg.Method = p.detectOpen5GSMethod(nf, body)

	// 推断对端实体
	msg.DestEntity = p.inferOpen5GSDest(nf, msg.Method)

	// 接口
	msg.Interface = p.inferOpen5GSInterface(nf, msg.Method)

	return msg, true
}

// detectOpen5GSProtocol 根据 NF 和日志内容推断协议
func (p *Parser) detectOpen5GSProtocol(nf, body string) string {
	lower := strings.ToLower(body)
	switch strings.ToLower(nf) {
	case "amf":
		if strings.Contains(lower, "nas") || strings.Contains(lower, "registration") ||
			strings.Contains(lower, "authentication") || strings.Contains(lower, "security mode") {
			return "NAS"
		}
		if strings.Contains(lower, "ngap") || strings.Contains(lower, "ran") {
			return "NGAP"
		}
		return "NGAP"
	case "mme":
		if strings.Contains(lower, "nas") || strings.Contains(lower, "attach") ||
			strings.Contains(lower, "detach") || strings.Contains(lower, "tau") {
			return "NAS"
		}
		return "S1AP"
	case "smf", "sgwc", "pgwc":
		if strings.Contains(lower, "pfcp") {
			return "PFCP"
		}
		if strings.Contains(lower, "gtp") || strings.Contains(lower, "session") {
			return "GTPv2C"
		}
		return "GTPv2C"
	case "upf", "sgwu", "pgwu":
		return "PFCP"
	case "hss", "ausf", "udm", "udr":
		return "Diameter"
	case "pcrf", "pcf":
		return "Diameter"
	default:
		return "SBI"
	}
}

// detectOpen5GSDirection 从日志内容推断消息方向
func (p *Parser) detectOpen5GSDirection(body string) string {
	lower := strings.ToLower(body)
	if strings.Contains(lower, "request") || strings.Contains(lower, "send") ||
		strings.Contains(lower, "transmit") {
		return "request"
	}
	if strings.Contains(lower, "response") || strings.Contains(lower, "received") ||
		strings.Contains(lower, "accept") || strings.Contains(lower, "reject") {
		return "response"
	}
	if strings.Contains(lower, "indication") || strings.Contains(lower, "notification") {
		return "indication"
	}
	return "request"
}

// detectOpen5GSMethod 识别具体消息方法
func (p *Parser) detectOpen5GSMethod(nf, body string) string {
	if m := re5GRegistration.FindStringSubmatch(body); m != nil {
		return "Registration " + capitalizeFirst(m[1])
	}
	if m := re5GAuth.FindStringSubmatch(body); m != nil {
		return capitalizeFirst(m[1]) + " " + capitalizeFirst(m[2])
	}
	if m := re5GPDU.FindStringSubmatch(body); m != nil {
		return "PDU Session " + capitalizeFirst(m[1]) + " " + capitalizeFirst(m[2])
	}
	if m := re5GDeRegistration.FindStringSubmatch(body); m != nil {
		return "Deregistration " + capitalizeFirst(m[2])
	}
	if m := re4GAttach.FindStringSubmatch(body); m != nil {
		return "Attach " + capitalizeFirst(m[1])
	}
	if m := re4GDetach.FindStringSubmatch(body); m != nil {
		return "Detach " + capitalizeFirst(m[1])
	}
	if m := re4GTAU.FindStringSubmatch(body); m != nil {
		return "TAU " + capitalizeFirst(m[1])
	}
	if m := re4GCreateSession.FindStringSubmatch(body); m != nil {
		return "Create Session " + capitalizeFirst(m[1])
	}
	if m := re4GModifyBearer.FindStringSubmatch(body); m != nil {
		return "Modify Bearer " + capitalizeFirst(m[1])
	}
	if m := re4GDeleteSession.FindStringSubmatch(body); m != nil {
		return "Delete Session " + capitalizeFirst(m[1])
	}
	// 默认取前 60 字符
	if len(body) > 60 {
		return body[:60]
	}
	return body
}

// inferOpen5GSDest 推断对端实体
func (p *Parser) inferOpen5GSDest(nf, method string) string {
	lower := strings.ToLower(nf)
	lm := strings.ToLower(method)

	switch lower {
	case "amf":
		if strings.Contains(lm, "registration") || strings.Contains(lm, "authentication") ||
			strings.Contains(lm, "security") || strings.Contains(lm, "deregistration") {
			return "UE"
		}
		if strings.Contains(lm, "pdu session") {
			return "SMF"
		}
		return "gNB"
	case "mme":
		if strings.Contains(lm, "attach") || strings.Contains(lm, "detach") || strings.Contains(lm, "tau") {
			return "UE"
		}
		if strings.Contains(lm, "create session") || strings.Contains(lm, "delete session") {
			return "SGW"
		}
		return "eNodeB"
	case "smf":
		if strings.Contains(lm, "pfcp") {
			return "UPF"
		}
		return "AMF"
	case "upf":
		return "SMF"
	case "hss":
		return "MME"
	case "ausf":
		return "AMF"
	case "udm":
		return "AUSF"
	case "pgwc":
		return "SGW"
	case "sgwc":
		return "MME"
	case "pcrf":
		return "PGW"
	default:
		return "NF"
	}
}

// inferOpen5GSInterface 推断接口名称
func (p *Parser) inferOpen5GSInterface(nf, method string) string {
	lower := strings.ToLower(nf)
	lm := strings.ToLower(method)

	switch lower {
	case "amf":
		if strings.Contains(lm, "pdu session") {
			return "N11"
		}
		return "N1/N2"
	case "mme":
		if strings.Contains(lm, "session") {
			return "S11"
		}
		return "S1-MME"
	case "smf":
		if strings.Contains(lm, "pfcp") {
			return "N4"
		}
		return "N11"
	case "upf":
		return "N4"
	case "sgwc":
		return "S11"
	case "pgwc":
		return "S5/S8"
	case "hss":
		return "Cx"
	case "ausf":
		return "N12"
	case "udm":
		return "N8"
	case "pcrf":
		return "Gx"
	default:
		return "SBI"
	}
}

// -----------------------------------------------------------
// ParseKamailioLog 解析 Kamailio syslog
// -----------------------------------------------------------

func (p *Parser) ParseKamailioLog(ctx context.Context, logPath string, traceID string, filters map[string]string) ([]model.SignalingMessage, error) {
	f, err := os.Open(logPath)
	if err != nil {
		return nil, fmt.Errorf("open kamailio log %s: %w", logPath, err)
	}
	defer f.Close()

	var messages []model.SignalingMessage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

	lineNo := 0
	for scanner.Scan() {
		lineNo++
		select {
		case <-ctx.Done():
			return messages, ctx.Err()
		default:
		}

		line := scanner.Text()
		msg, ok := p.parseKamailioLine(lineNo, line)
		if !ok {
			continue
		}
		msg.TraceID = traceID

		if !matchFilters(msg, filters) {
			continue
		}
		messages = append(messages, *msg)
	}

	if err := scanner.Err(); err != nil {
		return messages, fmt.Errorf("scan kamailio log: %w", err)
	}

	log.Printf("ParseKamailioLog: %s parsed %d messages from %d lines", logPath, len(messages), lineNo)
	return messages, nil
}

func (p *Parser) parseKamailioLine(lineNo int, line string) (*model.SignalingMessage, bool) {
	m := reKamailioLine.FindStringSubmatch(line)
	if m == nil {
		return nil, false
	}

	tsStr, level, body := m[1], m[2], m[3]

	year := time.Now().Year()
	ts, err := time.ParseInLocation(fmt.Sprintf("%d %s", year, kamailioTimeLayout),
		fmt.Sprintf("%d %s", year, tsStr), time.Local)
	if err != nil {
		// syslog 可能没有年份，尝试直接解析
		ts, err = time.ParseInLocation(kamailioTimeLayout, tsStr, time.Local)
		if err != nil {
			log.Printf("ParseKamailioLog line %d: bad timestamp %q: %v", lineNo, tsStr, err)
			return nil, false
		}
	}

	msg := &model.SignalingMessage{
		Timestamp: ts,
		Direction: "request",
		Details: map[string]any{
			"level": level,
			"line":  lineNo,
		},
		RawPreview: truncate(body, 2000),
	}

	// 尝试解析 SIP 消息
	if p.tryParseSIP(msg, body) {
		return msg, true
	}

	// 尝试解析 Diameter Cx/Dx 消息
	if p.tryParseDiameterCx(msg, body) {
		return msg, true
	}

	// 非 SIP/Diameter 的 Kamailio 日志，记录为通用 SIP 事件
	msg.Protocol = "SIP"
	msg.SourceEntity = "P-CSCF"
	msg.Interface = "Gm"
	msg.Method = "LOG"
	return msg, true
}

// tryParseSIP 尝试从 Kamailio 日志中提取 SIP 信息
func (p *Parser) tryParseSIP(msg *model.SignalingMessage, body string) bool {
	// 检查是否包含 SIP 方法
	var method string
	if m := reSIPMethod.FindStringSubmatch(body); m != nil {
		method = m[1]
	} else if m := reSIPStatus.FindStringSubmatch(body); m != nil {
		code, _ := strconv.Atoi(m[1])
		msg.StatusCode = code
		msg.StatusText = m[2]
		msg.Direction = "response"
		method = p.extractCSeqMethod(body)
	} else {
		return false
	}

	msg.Protocol = "SIP"
	msg.Method = method

	// 提取 SIP 头
	if from := reSIPFrom.FindStringSubmatch(body); from != nil {
		msg.SourceEntity = "UE"
		msg.Details["from"] = from[1]
		msg.Identifiers.SIPURI = normalizeSIPURI(from[1])
	}
	if to := reSIPTo.FindStringSubmatch(body); to != nil {
		msg.DestEntity = "S-CSCF"
		msg.Details["to"] = to[1]
	}
	if callID := reSIPCallID.FindStringSubmatch(body); callID != nil {
		msg.CallID = callID[1]
		msg.Identifiers.CallID = callID[1]
	}

	// 推断 IMS 接口
	msg.Interface = p.inferSIPInterface(method, msg.SourceEntity, msg.DestEntity)

	// 从 SIP URI 中提取 IMPU/IMPI
	extractIMSIdentifiers(msg)

	return true
}

// tryParseDiameterCx 尝试解析 Diameter Cx/Dx 消息
func (p *Parser) tryParseDiameterCx(msg *model.SignalingMessage, body string) bool {
	m := reDiameterCx.FindStringSubmatch(strings.ToLower(body))
	if m == nil {
		return false
	}

	cmd := strings.ToUpper(m[1])
	msg.Protocol = "Diameter"
	msg.Interface = "Cx"
	msg.Method = cmd

	switch cmd {
	case "UAR", "MAR", "SAR":
		msg.Direction = "request"
		msg.SourceEntity = "I-CSCF"
		msg.DestEntity = "HSS"
	case "UAA", "MAA", "SAA":
		msg.Direction = "response"
		msg.SourceEntity = "HSS"
		msg.DestEntity = "I-CSCF"
	case "LIR":
		msg.Direction = "request"
		msg.SourceEntity = "I-CSCF"
		msg.DestEntity = "HSS"
	case "LIA":
		msg.Direction = "response"
		msg.SourceEntity = "HSS"
		msg.DestEntity = "I-CSCF"
	}

	// 尝试提取 SIP URI
	if sipURI := reSIPFrom.FindStringSubmatch(body); sipURI != nil {
		msg.Identifiers.SIPURI = normalizeSIPURI(sipURI[1])
	}

	return true
}

// extractCSeqMethod 从 CSeq 头提取方法名
func (p *Parser) extractCSeqMethod(body string) string {
	if m := reSIPCSeq.FindStringSubmatch(body); m != nil {
		return m[2]
	}
	return "RESPONSE"
}

// inferSIPInterface 推断 SIP 接口
func (p *Parser) inferSIPInterface(method, src, dst string) string {
	switch {
	case src == "UE" || dst == "UE":
		return "Gm"
	case src == "P-CSCF" || dst == "P-CSCF":
		return "Mw"
	case src == "S-CSCF" && dst == "I-CSCF":
		return "Mw"
	case src == "I-CSCF" && dst == "S-CSCF":
		return "Mw"
	case src == "S-CSCF" && dst == "HSS":
		return "Cx"
	case method == "INVITE" || method == "BYE" || method == "CANCEL":
		return "ISC"
	default:
		return "Mw"
	}
}

// extractIMSIdentifiers 从 SIP URI 提取 IMS 标识
func extractIMSIdentifiers(msg *model.SignalingMessage) {
	uri := msg.Identifiers.SIPURI
	if uri == "" {
		return
	}
	// sip:+8613800138000@ims.mnc000.mcc460.3gppnetwork.org
	if strings.Contains(uri, "tel:") || strings.HasPrefix(uri, "+") {
		msg.Identifiers.MSISDN = strings.TrimPrefix(uri, "+")
	}
	// 从 SIP URI 提取 IMPU
	if strings.HasPrefix(uri, "sip:") {
		msg.Identifiers.IMPU = uri
	}
}

// -----------------------------------------------------------
// ParseFreeSWITCHLog 解析 FreeSWITCH 日志
// -----------------------------------------------------------

func (p *Parser) ParseFreeSWITCHLog(ctx context.Context, logPath string, traceID string, filters map[string]string) ([]model.SignalingMessage, error) {
	f, err := os.Open(logPath)
	if err != nil {
		return nil, fmt.Errorf("open freeswitch log %s: %w", logPath, err)
	}
	defer f.Close()

	var messages []model.SignalingMessage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

	lineNo := 0
	for scanner.Scan() {
		lineNo++
		select {
		case <-ctx.Done():
			return messages, ctx.Err()
		default:
		}

		line := scanner.Text()
		msg, ok := p.parseFSLine(lineNo, line)
		if !ok {
			continue
		}
		msg.TraceID = traceID

		if !matchFilters(msg, filters) {
			continue
		}
		messages = append(messages, *msg)
	}

	if err := scanner.Err(); err != nil {
		return messages, fmt.Errorf("scan freeswitch log: %w", err)
	}

	log.Printf("ParseFreeSWITCHLog: %s parsed %d messages from %d lines", logPath, len(messages), lineNo)
	return messages, nil
}

func (p *Parser) parseFSLine(lineNo int, line string) (*model.SignalingMessage, bool) {
	m := reFSLine.FindStringSubmatch(line)
	if m == nil {
		return nil, false
	}

	tsStr, level, file, body := m[1], m[2], m[3], m[4]

	ts, err := time.ParseInLocation(fsTimeLayout, tsStr, time.Local)
	if err != nil {
		log.Printf("ParseFreeSWITCHLog line %d: bad timestamp %q: %v", lineNo, tsStr, err)
		return nil, false
	}

	msg := &model.SignalingMessage{
		Timestamp:    ts,
		SourceEntity: "FreeSWITCH",
		Protocol:     "SIP",
		Interface:    "Mw",
		Direction:    "request",
		Details: map[string]any{
			"level": level,
			"file":  file,
			"line":  lineNo,
		},
		RawPreview: truncate(body, 2000),
	}

	// 提取 SDP 信息
	if strings.Contains(strings.ToLower(body), "sdp") ||
		strings.Contains(strings.ToLower(body), "rtp") {
		msg.Protocol = "SDP"
		msg.Interface = "Mb"

		if codec := reFSCodec.FindStringSubmatch(body); codec != nil {
			msg.Details["codec"] = codec[1]
		}
		if ch := reFSChannel.FindStringSubmatch(body); ch != nil {
			msg.Details["channel"] = ch[1]
		}
	}

	// RTP 统计
	if reFSRTPStats.MatchString(body) {
		msg.Protocol = "RTP"
		stats := reFSRTPStats.FindStringSubmatch(body)
		if len(stats) >= 3 {
			msg.Details["loss_rate"] = stats[1]
			msg.Details["jitter"] = stats[2]
		}
	}

	// 呼叫事件
	if strings.Contains(strings.ToLower(body), "hangup") {
		if cause := reFSHangup.FindStringSubmatch(body); cause != nil {
			msg.Method = "Hangup"
			msg.Details["cause"] = cause[1]
		}
	}
	if strings.Contains(strings.ToLower(body), "channel_create") ||
		strings.Contains(strings.ToLower(body), "CHANNEL_CREATE") {
		msg.Method = "ChannelCreate"
	}
	if strings.Contains(strings.ToLower(body), "channel_answer") ||
		strings.Contains(strings.ToLower(body), "CHANNEL_ANSWER") {
		msg.Method = "ChannelAnswer"
	}
	if strings.Contains(strings.ToLower(body), "channel_bridge") ||
		strings.Contains(strings.ToLower(body), "CHANNEL_BRIDGE") {
		msg.Method = "ChannelBridge"
	}

	if msg.Method == "" {
		msg.Method = "LOG"
	}

	return msg, true
}

// -----------------------------------------------------------
// ParsePcap 解析 pcap 文件（调用 tshark）
// -----------------------------------------------------------

// tshark JSON 输出的简化结构
type tsharkFrame struct {
	Source string `json:"_source"`
}

type tsharkLayer struct {
	Frame    *tsharkFrameLayer    `json:"frame,omitempty"`
	SIP      *tsharkSIP           `json:"sip,omitempty"`
	Diameter *tsharkDiameter      `json:"diameter,omitempty"`
	GTPv2    *tsharkGTPv2         `json:"gtpv2,omitempty"`
	GTP      *tsharkGTP           `json:"gtp,omitempty"`
	PFCP     *tsharkPFCP          `json:"pfcp,omitempty"`
	S1AP     *tsharkS1AP          `json:"s1ap,omitempty"`
	NGAP     *tsharkNGAP          `json:"ngap,omitempty"`
	NAS5G    *tsharkNAS5G         `json:"nas-5gs,omitempty"`
	NASEPS   *tsharkNASEPS        `json:"nas-eps,omitempty"`
	IP       *tsharkIP            `json:"ip,omitempty"`
	IPv6     *tsharkIPv6          `json:"ipv6,omitempty"`
}

type tsharkFrameLayer struct {
	TimeEpoch  string `json:"frame.time_epoch"`
	TimeStr    string `json:"frame.time"`
	Protocols  string `json:"frame.protocols"`
	Len        string `json:"frame.len"`
}

type tsharkSIP struct {
	Method       string            `json:"sip.Method"`
	StatusCode   string            `json:"sip.Status-Code"`
	StatusPhrase string            `json:"sip.Status-Phrase"`
	From         string            `json:"sip.from.user"`
	To           string            `json:"sip.to.user"`
	CallID       string            `json:"sip.Call-ID"`
	Contact      string            `json:"sip.contact.addr"`
	RequestURI   string            `json:"sip.Request-URI"`
}

type tsharkDiameter struct {
	CommandCode  string `json:"diameter.cmd.code"`
	AppID        string `json:"diameter.app.id"`
	ResultCode   string `json:"diameter.flags.proxiable"`
	HopByHopID   string `json:"diameter.hopbyhopid"`
	EndToEndID   string `json:"diameter.endtoendid"`
}

type tsharkGTPv2 struct {
	MsgType string `json:"gtpv2.message_type"`
	TEID    string `json:"gtpv2.teid"`
	IMSI    string `json:"gtpv2.imsi"`
	APN     string `json:"gtpv2.apn"`
}

type tsharkGTP struct {
	MsgType string `json:"gtp.message_type"`
	TEID    string `json:"gtp.teid"`
}

type tsharkPFCP struct {
	MsgType    string `json:"pfcp.message_type"`
	SEID       string `json:"pfcp.seid"`
	SeqNumber  string `json:"pfcp.sequence_number"`
}

type tsharkS1AP struct {
	ProcedureCode string `json:"s1ap.procedureCode"`
	ProcName      string `json:"s1ap.procedureCode_tree"`
}

type tsharkNGAP struct {
	ProcedureCode string `json:"ngap.procedureCode"`
	ProcName      string `json:"ngap.procedureCode_tree"`
}

type tsharkNAS5G struct {
	MsgType string `json:"nas_5gs.message_type"`
	ExtendedProtoDisc string `json:"nas_5gs.extended_protocol_discriminator"`
}

type tsharkNASEPS struct {
	MsgType string `json:"nas_eps.message_type"`
	SecHdrType string `json:"nas_eps.security_header_type"`
}

type tsharkIP struct {
	Src string `json:"ip.src"`
	Dst string `json:"ip.dst"`
}

type tsharkIPv6 struct {
	Src string `json:"ipv6.src"`
	Dst string `json:"ipv6.dst"`
}

// tshark 顶层 JSON 数组元素
type tsharkEntry struct {
	Layers tsharkLayer `json:"_source"`
}

func (p *Parser) ParsePcap(ctx context.Context, pcapPath string, traceID string, filters map[string]string) ([]model.SignalingMessage, error) {
	// 构建 tshark 命令
	args := []string{
		"-r", pcapPath,
		"-T", "json",
		"-j", "frame sip diameter gtpv2 gtp pfcp s1ap ngap nas-5gs nas-eps ip ipv6",
		"-e", "frame.time_epoch",
		"-e", "frame.time",
		"-e", "frame.protocols",
	}

	// 应用 BPF 过滤
	if bpf, ok := filters["bpf"]; ok && bpf != "" {
		args = append(args, "-Y", bpf)
	}

	args = append(args, "-c", "10000") // 限制最大包数

	log.Printf("ParsePcap: running tshark %s", strings.Join(args, " "))

	cmd := exec.CommandContext(ctx, "tshark", args...)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("tshark failed (exit %d): %s: %w", exitErr.ExitCode(), string(exitErr.Stderr), err)
		}
		return nil, fmt.Errorf("tshark exec: %w", err)
	}

	// 解析 JSON 输出
	var entries []map[string]any
	if err := json.Unmarshal(output, &entries); err != nil {
		return nil, fmt.Errorf("tshark json parse: %w", err)
	}

	var messages []model.SignalingMessage
	for i, entry := range entries {
		select {
		case <-ctx.Done():
			return messages, ctx.Err()
		default:
		}

		msg, ok := p.parseTsharkEntry(i, entry)
		if !ok {
			continue
		}
		msg.TraceID = traceID

		if !matchFilters(msg, filters) {
			continue
		}
		messages = append(messages, *msg)
	}

	log.Printf("ParsePcap: %s parsed %d messages from %d packets", pcapPath, len(messages), len(entries))
	return messages, nil
}

func (p *Parser) parseTsharkEntry(idx int, entry map[string]any) (*model.SignalingMessage, bool) {
	// 提取 frame 层
	srcRaw, ok := entry["_source"]
	if !ok {
		return nil, false
	}
	src, ok := srcRaw.(map[string]any)
	if !ok {
		return nil, false
	}

	msg := &model.SignalingMessage{
		Details: map[string]any{"packet_index": idx},
	}

	// 解析 frame 时间
	if frameRaw, ok := src["frame"]; ok {
		if frame, ok := frameRaw.(map[string]any); ok {
			if epoch, ok := frame["frame.time_epoch"].(string); ok {
				if sec, err := strconv.ParseFloat(epoch, 64); err == nil {
					msg.Timestamp = time.Unix(int64(sec), int64((sec-float64(int64(sec)))*1e9))
				}
			}
			if proto, ok := frame["frame.protocols"].(string); ok {
				msg.Details["protocols"] = proto
			}
		}
	}

	// 解析 IP 层
	if ipRaw, ok := src["ip"]; ok {
		if ip, ok := ipRaw.(map[string]any); ok {
			if s, ok := ip["ip.src"].(string); ok {
				msg.SourceIP = s
			}
			if d, ok := ip["ip.dst"].(string); ok {
				msg.DestIP = d
			}
		}
	}

	// 解析协议层
	switch {
	case src["sip"] != nil:
		p.parseTsharkSIP(msg, src["sip"])
	case src["diameter"] != nil:
		p.parseTsharkDiameter(msg, src["diameter"])
	case src["gtpv2"] != nil:
		p.parseTsharkGTPv2(msg, src["gtpv2"])
	case src["pfcp"] != nil:
		p.parseTsharkPFCP(msg, src["pfcp"])
	case src["s1ap"] != nil:
		p.parseTsharkS1AP(msg, src["s1ap"])
	case src["ngap"] != nil:
		p.parseTsharkNGAP(msg, src["ngap"])
	case src["nas-5gs"] != nil:
		p.parseTsharkNAS5G(msg, src["nas-5gs"])
	case src["nas-eps"] != nil:
		p.parseTsharkNASEPS(msg, src["nas-eps"])
	default:
		return nil, false // 忽略非信令包
	}

	return msg, true
}

func (p *Parser) parseTsharkSIP(msg *model.SignalingMessage, raw any) {
	sip, ok := raw.(map[string]any)
	if !ok {
		return
	}
	msg.Protocol = "SIP"
	msg.Interface = "Gm"

	if m, ok := sip["sip.Method"].(string); ok {
		msg.Method = m
		msg.Direction = "request"
		msg.SourceEntity = "UE"
		msg.DestEntity = "P-CSCF"
	}
	if code, ok := sip["sip.Status-Code"].(string); ok && code != "" {
		c, _ := strconv.Atoi(code)
		msg.StatusCode = c
		msg.Direction = "response"
		if phrase, ok := sip["sip.Status-Phrase"].(string); ok {
			msg.StatusText = phrase
		}
	}
	if from, ok := sip["sip.from.user"].(string); ok {
		msg.Details["from"] = from
		msg.Identifiers.SIPURI = "sip:" + from
	}
	if to, ok := sip["sip.to.user"].(string); ok {
		msg.Details["to"] = to
	}
	if callID, ok := sip["sip.Call-ID"].(string); ok {
		msg.CallID = callID
		msg.Identifiers.CallID = callID
	}
}

func (p *Parser) parseTsharkDiameter(msg *model.SignalingMessage, raw any) {
	dia, ok := raw.(map[string]any)
	if !ok {
		return
	}
	msg.Protocol = "Diameter"
	msg.Interface = "Cx"

	if code, ok := dia["diameter.cmd.code"].(string); ok {
		msg.Method = diameterCmdName(code)
	}
	if appID, ok := dia["diameter.app.id"].(string); ok {
		msg.Details["app_id"] = appID
		msg.Interface = diameterAppInterface(appID)
	}
	msg.Direction = "request"
	msg.SourceEntity = "Client"
	msg.DestEntity = "Server"
}

func (p *Parser) parseTsharkGTPv2(msg *model.SignalingMessage, raw any) {
	gtp, ok := raw.(map[string]any)
	if !ok {
		return
	}
	msg.Protocol = "GTPv2C"
	msg.Interface = "S11"

	if mt, ok := gtp["gtpv2.message_type"].(string); ok {
		msg.Method = gtpv2MsgType(mt)
	}
	if teid, ok := gtp["gtpv2.teid"].(string); ok {
		msg.Identifiers.TEID = teid
	}
	if imsi, ok := gtp["gtpv2.imsi"].(string); ok {
		msg.Identifiers.IMSI = imsi
	}
	msg.Direction = "request"
	msg.SourceEntity = "MME"
	msg.DestEntity = "SGW"
}

func (p *Parser) parseTsharkPFCP(msg *model.SignalingMessage, raw any) {
	pfcp, ok := raw.(map[string]any)
	if !ok {
		return
	}
	msg.Protocol = "PFCP"
	msg.Interface = "N4"

	if mt, ok := pfcp["pfcp.message_type"].(string); ok {
		msg.Method = pfcpMsgType(mt)
	}
	if seid, ok := pfcp["pfcp.seid"].(string); ok {
		msg.Details["seid"] = seid
	}
	msg.Direction = "request"
	msg.SourceEntity = "SMF"
	msg.DestEntity = "UPF"
}

func (p *Parser) parseTsharkS1AP(msg *model.SignalingMessage, raw any) {
	msg.Protocol = "S1AP"
	msg.Interface = "S1-MME"
	msg.SourceEntity = "eNodeB"
	msg.DestEntity = "MME"
	msg.Direction = "initiatingMessage"

	if s1ap, ok := raw.(map[string]any); ok {
		if proc, ok := s1ap["s1ap.procedureCode"].(string); ok {
			msg.Method = "Procedure-" + proc
		}
	}
}

func (p *Parser) parseTsharkNGAP(msg *model.SignalingMessage, raw any) {
	msg.Protocol = "NGAP"
	msg.Interface = "N2"
	msg.SourceEntity = "gNB"
	msg.DestEntity = "AMF"
	msg.Direction = "initiatingMessage"

	if ngap, ok := raw.(map[string]any); ok {
		if proc, ok := ngap["ngap.procedureCode"].(string); ok {
			msg.Method = "Procedure-" + proc
		}
	}
}

func (p *Parser) parseTsharkNAS5G(msg *model.SignalingMessage, raw any) {
	msg.Protocol = "NAS"
	msg.Interface = "N1"

	if nas, ok := raw.(map[string]any); ok {
		if mt, ok := nas["nas_5gs.message_type"].(string); ok {
			msg.Method = nas5gMsgType(mt)
		}
	}
	msg.SourceEntity = "UE"
	msg.DestEntity = "AMF"
	msg.Direction = "request"
}

func (p *Parser) parseTsharkNASEPS(msg *model.SignalingMessage, raw any) {
	msg.Protocol = "NAS"
	msg.Interface = "S1-MME"

	if nas, ok := raw.(map[string]any); ok {
		if mt, ok := nas["nas_eps.message_type"].(string); ok {
			msg.Method = nasEpsMsgType(mt)
		}
	}
	msg.SourceEntity = "UE"
	msg.DestEntity = "MME"
	msg.Direction = "request"
}

// -----------------------------------------------------------
// 辅助函数
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

// truncate 截断字符串到指定长度
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// capitalizeFirst 首字母大写
func capitalizeFirst(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// trimPrefix 移除前缀（如果存在）
func trimPrefix(s, prefix string) string {
	if strings.HasPrefix(s, prefix) {
		return s[len(prefix):]
	}
	return s
}

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

// diameterCmdName Diameter 命令码转名称
func diameterCmdName(code string) string {
	switch code {
	case "272":
		return "CCR/CCA"
	case "274":
		return "AAR/AAA"
	case "275":
		return "RAR/RAA"
	case "280":
		return "DWR/DWA"
	case "300":
		return "UAR/UAA"
	case "301":
		return "LIR/LIA"
	case "303":
		return "MAR/MAA"
	case "304":
		return "SAR/SAA"
	case "316":
		return "UDR/UDA"
	default:
		return "CMD-" + code
	}
}

// diameterAppInterface 根据 Application ID 推断接口
func diameterAppInterface(appID string) string {
	switch appID {
	case "16777216":
		return "Cx"
	case "16777265":
		return "S6a"
	case "16777236":
		return "Rx"
	case "16777238":
		return "Gx"
	case "4":
		return "Gx"
	default:
		return "Diameter"
	}
}

// gtpv2MsgType GTPv2-C 消息类型名称
func gtpv2MsgType(mt string) string {
	switch mt {
	case "1":
		return "Echo Request"
	case "2":
		return "Echo Response"
	case "32":
		return "Create Session Request"
	case "33":
		return "Create Session Response"
	case "34":
		return "Modify Bearer Request"
	case "35":
		return "Modify Bearer Response"
	case "36":
		return "Delete Session Request"
	case "37":
		return "Delete Session Response"
	case "170":
		return "Create Bearer Request"
	case "171":
		return "Create Bearer Response"
	default:
		return "Type-" + mt
	}
}

// pfcpMsgType PFCP 消息类型名称
func pfcpMsgType(mt string) string {
	switch mt {
	case "1":
		return "Heartbeat Request"
	case "2":
		return "Heartbeat Response"
	case "50":
		return "PFD Management Request"
	case "51":
		return "PFD Management Response"
	case "56":
		return "Association Setup Request"
	case "57":
		return "Association Setup Response"
	case "58":
		return "Association Update Request"
	case "59":
		return "Association Update Response"
	case "60":
		return "Association Release Request"
	case "61":
		return "Association Release Response"
	case "100":
		return "Session Establishment Request"
	case "101":
		return "Session Establishment Response"
	case "102":
		return "Session Modification Request"
	case "103":
		return "Session Modification Response"
	case "104":
		return "Session Deletion Request"
	case "105":
		return "Session Deletion Response"
	default:
		return "Type-" + mt
	}
}

// nas5gMsgType 5G NAS 消息类型名称
func nas5gMsgType(mt string) string {
	switch mt {
	case "65":
		return "Registration Request"
	case "66":
		return "Registration Accept"
	case "67":
		return "Registration Complete"
	case "68":
		return "Registration Reject"
	case "69":
		return "Deregistration Request (UE)"
	case "70":
		return "Deregistration Accept (UE)"
	case "71":
		return "Deregistration Request (Network)"
	case "72":
		return "Deregistration Accept (Network)"
	case "77":
		return "Service Request"
	case "78":
		return "Service Reject"
	case "79":
		return "Service Accept"
	case "80":
		return "Authentication Request"
	case "81":
		return "Authentication Response"
	case "82":
		return "Authentication Reject"
	case "83":
		return "Authentication Failure"
	case "84":
		return "Security Mode Command"
	case "85":
		return "Security Mode Complete"
	case "86":
		return "Security Mode Reject"
	default:
		return "Type-" + mt
	}
}

// nasEpsMsgType EPS NAS 消息类型名称
func nasEpsMsgType(mt string) string {
	switch mt {
	case "65":
		return "Attach Request"
	case "66":
		return "Attach Accept"
	case "67":
		return "Attach Complete"
	case "68":
		return "Attach Reject"
	case "69":
		return "Detach Request"
	case "70":
		return "Detach Accept"
	case "72":
		return "TAU Request"
	case "73":
		return "TAU Accept"
	case "74":
		return "TAU Complete"
	case "75":
		return "TAU Reject"
	case "76":
		return "Extended Service Request"
	case "77":
		return "Service Request"
	case "78":
		return "Service Reject"
	case "80":
		return "Authentication Request"
	case "81":
		return "Authentication Response"
	case "82":
		return "Authentication Reject"
	case "83":
		return "Authentication Failure"
	case "84":
		return "Security Mode Command"
	case "85":
		return "Security Mode Complete"
	case "86":
		return "Security Mode Reject"
	default:
		return "Type-" + mt
	}
}
