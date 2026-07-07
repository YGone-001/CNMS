package signaling

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"xcloud-cnms/internal/model"
)

// -----------------------------------------------------------
// HEPv3 协议常量
// -----------------------------------------------------------

// HEPv3 魔数: "HEP3"
var hepMagic = []byte{0x48, 0x45, 0x50, 0x33}

// HEP Chunk 类型
const (
	hepChunkIPFamily   = 0x0001 // 1=IPv4, 2=IPv6
	hepChunkSrcIP4     = 0x0002
	hepChunkDstIP4     = 0x0003
	hepChunkSrcPort    = 0x0004
	hepChunkDstPort    = 0x0005
	hepChunkTimestamp  = 0x0009 // Unix 秒
	hepChunkTimestampUS = 0x000a // 微秒
	hepChunkProtoType  = 0x000b // 0x01=SIP, 0x00=RTP/RTCP
	hepChunkPayload    = 0x000f
	hepChunkSrcIP6     = 0x0010
	hepChunkDstIP6     = 0x0011
)

// HEPListenerConfig HEP 监听器配置
type HEPListenerConfig struct {
	Enabled     bool   `json:"enabled"`
	ListenAddr  string `json:"listen_addr"`  // 默认 ":9060"
	BufferSize  int    `json:"buffer_size"`  // 环形缓冲区大小，默认 50000
}

// HEPListenerStatus HEP 监听器状态
type HEPListenerStatus struct {
	Running     bool   `json:"running"`
	ListenAddr  string `json:"listen_addr"`
	Received    int64  `json:"received"`     // 收到的 HEP 包总数
	Parsed      int64  `json:"parsed"`       // 成功解析的 SIP 消息数
	Errors      int64  `json:"errors"`       // 解析错误数
	BufferCount int    `json:"buffer_count"` // 缓冲区中当前消息数
	LastReceive string `json:"last_receive"` // 最后收到消息的时间
}

// -----------------------------------------------------------
// HEP 包解析结构
// -----------------------------------------------------------

// hepChunk HEPv3 TLV chunk
type hepChunk struct {
	Type   uint16
	Length uint16
	Value  []byte
}

// hepPacket 解析后的 HEP 包
type hepPacket struct {
	IPFamily  int
	SrcIP     string
	DstIP     string
	SrcPort   int
	DstPort   int
	Timestamp time.Time
	ProtoType int // 1=SIP
	Payload   []byte
}

// -----------------------------------------------------------
// SIP 消息正则
// -----------------------------------------------------------

var (
	// SIP 请求行: METHOD sip:user@domain SIP/2.0
	reSIPRequestLine = regexp.MustCompile(`^(INVITE|REGISTER|BYE|CANCEL|ACK|OPTIONS|INFO|UPDATE|PRACK|REFER|SUBSCRIBE|NOTIFY|MESSAGE|PUBLISH)\s+sip:`)
	// SIP 状态行: SIP/2.0 200 OK
	reSIPStatusLine = regexp.MustCompile(`^SIP/2\.0\s+(\d{3})\s+(.*)`)
	// SIP From: <sip:user@domain> 或 "Name" <sip:user@domain>
	reSIPFrom = regexp.MustCompile(`(?i)^From:\s*.*?sip:([^@>\s]+)`)
	// SIP To: <sip:user@domain>
	reSIPTo = regexp.MustCompile(`(?i)^To:\s*.*?sip:([^@>\s]+)`)
	// SIP Call-ID
	reSIPCallID = regexp.MustCompile(`(?i)^Call-ID:\s*(.+)`)
	// SIP CSeq
	reSIPCSeq = regexp.MustCompile(`(?i)^CSeq:\s*(\d+)\s+(\S+)`)
	// IMSI in SIP URI: sip:460001234567890@domain
	reIMSIFromURI = regexp.MustCompile(`sip:(\d{14,15})@`)
)

// -----------------------------------------------------------
// HEPListener 核心结构
// -----------------------------------------------------------

// HEPListener 在 UDP 端口上监听 HEPv3 协议包，
// 解析 SIP 消息并存储在环形缓冲区中，支持按 IMSI/CallID 查询。
type HEPListener struct {
	cfg HEPListenerConfig

	conn    *net.UDPConn
	running bool
	mu      sync.RWMutex

	// 环形缓冲区
	buf     []*model.SignalingMessage
	bufSize int
	bufHead int // 下一个写入位置
	bufMu   sync.RWMutex

	// 按 IMSI 和 CallID 建立索引（存消息在 buf 中的下标）
	imsiIndex   map[string][]int
	callIDIndex map[string][]int

	// 统计
	received    int64
	parsed      int64
	errors      int64
	lastReceive time.Time
}

// NewHEPListener 创建 HEP 监听器
func NewHEPListener(cfg HEPListenerConfig) *HEPListener {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":9060"
	}
	if cfg.BufferSize <= 0 {
		cfg.BufferSize = 50000
	}

	return &HEPListener{
		cfg:         cfg,
		buf:         make([]*model.SignalingMessage, cfg.BufferSize),
		bufSize:     cfg.BufferSize,
		imsiIndex:   make(map[string][]int),
		callIDIndex: make(map[string][]int),
	}
}

// Start 启动 UDP 监听
func (l *HEPListener) Start() error {
	addr, err := net.ResolveUDPAddr("udp", l.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("resolve udp addr: %w", err)
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("listen udp %s: %w", l.cfg.ListenAddr, err)
	}

	l.conn = conn
	l.running = true

	log.Printf("[HEPListener] listening on %s (buffer=%d)", l.cfg.ListenAddr, l.bufSize)

	// 设置读缓冲区大小（1MB）
	_ = conn.SetReadBuffer(1024 * 1024)

	go l.readLoop()

	return nil
}

// Stop 停止监听
func (l *HEPListener) Stop() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.conn != nil {
		l.conn.Close()
	}
	l.running = false
	log.Printf("[HEPListener] stopped (received=%d, parsed=%d, errors=%d)",
		l.received, l.parsed, l.errors)
}

// IsRunning 检查是否运行中
func (l *HEPListener) IsRunning() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.running
}

// Status 返回运行状态
func (l *HEPListener) Status() HEPListenerStatus {
	l.mu.RLock()
	running := l.running
	l.mu.RUnlock()

	l.bufMu.RLock()
	bufCount := 0
	for _, msg := range l.buf {
		if msg != nil {
			bufCount++
		}
	}
	l.bufMu.RUnlock()

	var lastStr string
	if !l.lastReceive.IsZero() {
		lastStr = l.lastReceive.Format(time.RFC3339)
	}

	return HEPListenerStatus{
		Running:     running,
		ListenAddr:  l.cfg.ListenAddr,
		Received:    l.received,
		Parsed:      l.parsed,
		Errors:      l.errors,
		BufferCount: bufCount,
		LastReceive: lastStr,
	}
}

// -----------------------------------------------------------
// UDP 读取循环
// -----------------------------------------------------------

// readLoop 持续读取 UDP 包并解析
func (l *HEPListener) readLoop() {
	buf := make([]byte, 65535)

	for {
		n, remoteAddr, err := l.conn.ReadFromUDP(buf)
		if err != nil {
			l.mu.RLock()
			running := l.running
			l.mu.RUnlock()
			if !running {
				return
			}
			log.Printf("[HEPListener] read error: %v", err)
			continue
		}

		l.received++
		l.lastReceive = time.Now()

		if n < 6 {
			l.errors++
			if l.errors <= 3 {
				log.Printf("[HEPListener] packet too short: %d bytes", n)
			}
			continue
		}

		packet, err := parseHEP(buf[:n])
		if err != nil {
			l.errors++
			if l.errors <= 3 {
				log.Printf("[HEPListener] parse error: %v, first 32 bytes: %x", err, buf[:min(32, n)])
			}
			continue
		}

		// 只处理 SIP 协议
		if packet.ProtoType != 1 || len(packet.Payload) == 0 {
			continue
		}

		msg := l.parseSIPPayload(packet)
		if msg != nil {
			l.storeMessage(msg)
			l.parsed++
		}

		_ = remoteAddr // 避免 unused 警告
	}
}

// -----------------------------------------------------------
// HEPv3 协议解析
// -----------------------------------------------------------

// parseHEP 解析 HEPv3 包
func parseHEP(data []byte) (*hepPacket, error) {
	// 验证魔数 "HEP3"
	if len(data) < 4 || string(data[:4]) != "HEP3" {
		return nil, fmt.Errorf("invalid HEP magic: %x", data[:min(4, len(data))])
	}

	// 包总长度 (bytes 4-5)
	if len(data) < 6 {
		return nil, fmt.Errorf("HEP packet too short: %d bytes", len(data))
	}
	totalLen := binary.BigEndian.Uint16(data[4:6])
	if int(totalLen) > len(data) {
		return nil, fmt.Errorf("HEP packet truncated: expected %d, got %d", totalLen, len(data))
	}

	pkt := &hepPacket{}
	offset := 6 // 跳过 "HEP3" + 长度

	// 解析所有 chunks
	for offset+4 <= int(totalLen) {
		chunkType := binary.BigEndian.Uint16(data[offset : offset+2])
		chunkLen := binary.BigEndian.Uint16(data[offset+2 : offset+4])

		if chunkLen < 4 || offset+int(chunkLen) > int(totalLen) {
			break
		}

		chunkVal := data[offset+4 : offset+int(chunkLen)]

		switch chunkType {
		case hepChunkIPFamily:
			if len(chunkVal) >= 1 {
				pkt.IPFamily = int(chunkVal[0])
			}
		case hepChunkSrcIP4:
			if len(chunkVal) >= 4 {
				pkt.SrcIP = net.IP(chunkVal[:4]).String()
			}
		case hepChunkDstIP4:
			if len(chunkVal) >= 4 {
				pkt.DstIP = net.IP(chunkVal[:4]).String()
			}
		case hepChunkSrcIP6:
			if len(chunkVal) >= 16 {
				pkt.SrcIP = net.IP(chunkVal[:16]).String()
			}
		case hepChunkDstIP6:
			if len(chunkVal) >= 16 {
				pkt.DstIP = net.IP(chunkVal[:16]).String()
			}
		case hepChunkSrcPort:
			if len(chunkVal) >= 2 {
				pkt.SrcPort = int(binary.BigEndian.Uint16(chunkVal[:2]))
			}
		case hepChunkDstPort:
			if len(chunkVal) >= 2 {
				pkt.DstPort = int(binary.BigEndian.Uint16(chunkVal[:2]))
			}
		case hepChunkTimestamp:
			if len(chunkVal) >= 4 {
				sec := int64(binary.BigEndian.Uint32(chunkVal[:4]))
				pkt.Timestamp = time.Unix(sec, 0)
			}
		case hepChunkTimestampUS:
			if len(chunkVal) >= 4 {
				usec := int64(binary.BigEndian.Uint32(chunkVal[:4]))
				if !pkt.Timestamp.IsZero() {
					pkt.Timestamp = pkt.Timestamp.Add(time.Duration(usec) * time.Microsecond)
				}
			}
		case hepChunkProtoType:
			if len(chunkVal) >= 1 {
				pkt.ProtoType = int(chunkVal[0])
			}
		case hepChunkPayload:
			pkt.Payload = make([]byte, len(chunkVal))
			copy(pkt.Payload, chunkVal)
		}

		offset += int(chunkLen)
	}

	if len(pkt.Payload) == 0 {
		return nil, fmt.Errorf("HEP packet has no payload")
	}

	return pkt, nil
}

// -----------------------------------------------------------
// SIP 消息解析
// -----------------------------------------------------------

// parseSIPPayload 从 HEP payload 解析 SIP 消息
func (l *HEPListener) parseSIPPayload(pkt *hepPacket) *model.SignalingMessage {
	sipBody := string(pkt.Payload)

	// 跳过空行（SIP 头和 body 之间）
	lines := strings.Split(sipBody, "\r\n")
	if len(lines) == 0 {
		lines = strings.Split(sipBody, "\n")
	}

	msg := &model.SignalingMessage{
		Protocol:   "SIP",
		SourceIP:   pkt.SrcIP,
		DestIP:     pkt.DstIP,
		SourcePort: pkt.SrcPort,
		DestPort:   pkt.DstPort,
		Timestamp:  pkt.Timestamp,
		Details:    make(map[string]any),
	}

	if pkt.Timestamp.IsZero() {
		msg.Timestamp = time.Now()
	}

	// 解析第一行（请求行或状态行）
	if len(lines) > 0 {
		firstLine := strings.TrimSpace(lines[0])

		if m := reSIPRequestLine.FindStringSubmatch(firstLine); m != nil {
			msg.Method = m[1]
			msg.Direction = "request"
		} else if m := reSIPStatusLine.FindStringSubmatch(firstLine); m != nil {
			code, _ := strconv.Atoi(m[1])
			msg.StatusCode = code
			msg.StatusText = strings.TrimSpace(m[2])
			msg.Direction = "response"
		}
	}

	// 解析头部
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			break // 空行表示头部结束
		}

		if m := reSIPFrom.FindStringSubmatch(line); m != nil {
			msg.Identifiers.MSISDN = extractMSISDN(m[1])
			msg.Identifiers.SIPURI = m[1]
			// 尝试从 From 提取 IMSI
			if imsi := reIMSIFromURI.FindStringSubmatch(line); imsi != nil {
				msg.Identifiers.IMSI = imsi[1]
			}
		} else if m := reSIPTo.FindStringSubmatch(line); m != nil {
			if msg.Identifiers.MSISDN == "" {
				msg.Identifiers.MSISDN = extractMSISDN(m[1])
			}
			// 尝试从 To 提取 IMSI
			if msg.Identifiers.IMSI == "" {
				if imsi := reIMSIFromURI.FindStringSubmatch(line); imsi != nil {
					msg.Identifiers.IMSI = imsi[1]
				}
			}
		} else if m := reSIPCallID.FindStringSubmatch(line); m != nil {
			callID := strings.TrimSpace(m[1])
			msg.CallID = callID
			msg.Identifiers.CallID = callID
		} else if m := reSIPCSeq.FindStringSubmatch(line); m != nil {
			msg.Details["cseq"] = m[1] + " " + m[2]
		}
	}

	// 推断接口和网元
	msg.Interface = guessSIPInterface(pkt.SrcPort, pkt.DstPort)
	msg.SourceEntity, msg.DestEntity = guessSIPEntities(msg.Interface, msg.Direction)

	// 存储原始 SIP 消息预览
	if len(pkt.Payload) > 2000 {
		msg.RawPreview = string(pkt.Payload[:2000])
	} else {
		msg.RawPreview = string(pkt.Payload)
	}

	return msg
}

// -----------------------------------------------------------
// 环形缓冲区存储与索引
// -----------------------------------------------------------

// storeMessage 将消息存入环形缓冲区并更新索引
func (l *HEPListener) storeMessage(msg *model.SignalingMessage) {
	l.bufMu.Lock()
	defer l.bufMu.Unlock()

	// 如果缓冲区满了，清除旧索引
	old := l.buf[l.bufHead]
	if old != nil {
		l.removeFromIndex(old, l.bufHead)
	}

	// 存入缓冲区
	l.buf[l.bufHead] = msg
	idx := l.bufHead

	// 更新索引
	if msg.Identifiers.IMSI != "" {
		l.imsiIndex[msg.Identifiers.IMSI] = append(l.imsiIndex[msg.Identifiers.IMSI], idx)
	}
	if msg.CallID != "" {
		l.callIDIndex[msg.CallID] = append(l.callIDIndex[msg.CallID], idx)
	}

	// 移动 head
	l.bufHead = (l.bufHead + 1) % l.bufSize
}

// removeFromIndex 从索引中移除消息
func (l *HEPListener) removeFromIndex(msg *model.SignalingMessage, idx int) {
	if msg.Identifiers.IMSI != "" {
		indices := l.imsiIndex[msg.Identifiers.IMSI]
		for i, v := range indices {
			if v == idx {
				l.imsiIndex[msg.Identifiers.IMSI] = append(indices[:i], indices[i+1:]...)
				break
			}
		}
	}
	if msg.CallID != "" {
		indices := l.callIDIndex[msg.CallID]
		for i, v := range indices {
			if v == idx {
				l.callIDIndex[msg.CallID] = append(indices[:i], indices[i+1:]...)
				break
			}
		}
	}
}

// -----------------------------------------------------------
// 查询方法
// -----------------------------------------------------------

// QueryByIMSI 按 IMSI 查询 SIP 消息
func (l *HEPListener) QueryByIMSI(imsi string, start, end time.Time) []model.SignalingMessage {
	l.bufMu.RLock()
	defer l.bufMu.RUnlock()

	indices := l.imsiIndex[imsi]
	var result []model.SignalingMessage

	for _, idx := range indices {
		msg := l.buf[idx]
		if msg == nil {
			continue
		}
		if !start.IsZero() && msg.Timestamp.Before(start) {
			continue
		}
		if !end.IsZero() && msg.Timestamp.After(end) {
			continue
		}
		result = append(result, *msg)
	}

	return result
}

// QueryByCallID 按 Call-ID 查询 SIP 消息
func (l *HEPListener) QueryByCallID(callID string) []model.SignalingMessage {
	l.bufMu.RLock()
	defer l.bufMu.RUnlock()

	indices := l.callIDIndex[callID]
	var result []model.SignalingMessage

	for _, idx := range indices {
		msg := l.buf[idx]
		if msg != nil {
			result = append(result, *msg)
		}
	}

	return result
}

// QueryAll 查询时间范围内的所有 SIP 消息
func (l *HEPListener) QueryAll(start, end time.Time, limit int) []model.SignalingMessage {
	l.bufMu.RLock()
	defer l.bufMu.RUnlock()

	if limit <= 0 {
		limit = 10000
	}

	var result []model.SignalingMessage
	count := 0

	// 从 head 开始遍历（最新的在前）
	for i := 0; i < l.bufSize && count < limit; i++ {
		idx := (l.bufHead - 1 - i + l.bufSize) % l.bufSize
		msg := l.buf[idx]
		if msg == nil {
			continue
		}
		if !start.IsZero() && msg.Timestamp.Before(start) {
			continue
		}
		if !end.IsZero() && msg.Timestamp.After(end) {
			continue
		}
		result = append(result, *msg)
		count++
	}

	return result
}

// min returns the smaller of a or b
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
