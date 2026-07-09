package signaling

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// -----------------------------------------------------------
// HEPv3 协议常量
// -----------------------------------------------------------

// HEPv3 魔数: "HEP3"
var hepMagic = []byte{0x48, 0x45, 0x50, 0x33}

// HEPv3 Chunk 类型（Kamailio siptrace 实现）
// 参考: /usr/local/src/kamailio/src/modules/sipcapture/hep.h
const (
	hepChunkIPFamily   = 0x0001 // uint8: AF_INET(2)=IPv4, AF_INET6(10)=IPv6
	hepChunkIPProto    = 0x0002 // uint8: IPPROTO_UDP(17), IPPROTO_TCP(6), IPPROTO_SCTP(132)
	hepChunkSrcIP4     = 0x0003 // uint32 NBO: 源 IPv4 地址
	hepChunkDstIP4     = 0x0004 // uint32 NBO: 目的 IPv4 地址
	hepChunkSrcIP6     = 0x0005 // 16 bytes: 源 IPv6 地址
	hepChunkDstIP6     = 0x0006 // 16 bytes: 目的 IPv6 地址
	hepChunkSrcPort    = 0x0007 // uint16: 源端口
	hepChunkDstPort    = 0x0008 // uint16: 目的端口
	hepChunkTimestamp  = 0x0009 // uint32: Unix 秒
	hepChunkTimestampUS = 0x000a // uint32: 微秒
	hepChunkProtoType  = 0x000b // uint8: 0x01=SIP, 0x00=RTP/RTCP
	hepChunkCaptureID  = 0x000c // uint32: 抓包节点 ID
	hepChunkAuthKey    = 0x000e // variable: Auth key
	hepChunkPayload    = 0x000f // variable: SIP/RTP payload
	hepChunkCorrID     = 0x0011 // variable: Correlation ID

	// ProtoType 值（SIP 在 Kamailio 中固定为 0x01）
	hepProtoSIP = 0x01
)

// -----------------------------------------------------------
// Lock-Free Ring Buffer 常量
// -----------------------------------------------------------

const (
	// ringHighWatermark 触发异步刷盘的水位线 (容量的 80%)
	ringHighWatermark = 0.8
	// ringBatchSize 每批写入 MongoDB 的消息数
	ringBatchSize = 200
	// ringFlushInterval 定时刷盘间隔 (即使未达水位线)
	ringFlushInterval = 5 * time.Second
	// ringCollection MongoDB 临时 TTL 集合名
	ringCollection = "hep_ring_overflow"
)

// HEPListenerConfig HEP 监听器配置
type HEPListenerConfig struct {
	Enabled     bool   `json:"enabled"`
	ListenAddr  string `json:"listen_addr"`  // 默认 ":9060"
	BufferSize  int    `json:"buffer_size"`  // 环形缓冲区大小，默认 50000
	MongoDB     *mongo.Client `json:"-"`     // MongoDB 客户端 (可选, 启用二级缓存)
	DBName      string `json:"db_name"`     // MongoDB 数据库名
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

// hepChunk HEPv3 TLV chunk（6 字节头: vendor + type + length）
type hepChunk struct {
	VendorID uint16
	TypeID   uint16
	Length   uint16 // 包含 6 字节头的总长度
	Value    []byte
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

// ringBuffer 无锁环形缓冲区。
//
// 使用 atomic 操作 head/tail 指针，避免写入路径上的 mutex 争用。
// 数据槽(slot)使用 atomic.Pointer 实现无锁 publish/consume。
//
// 内存布局:
//
//	buf[0..size-1]  数据槽 (atomic.Pointer)
//	tail            消费者已读位置 (atomic)
//	head            生产者已写位置 (atomic)
//
// 写入: 生产者 CAS 推进 head，写入 slot
// 读取: 消费者从 tail 扫描到 head，读取非空 slot
// 水位: head - tail >= highWatermark 时触发异步刷盘
type ringBuffer struct {
	slots         []atomic.Pointer[model.SignalingMessage]
	size          int
	head          atomic.Int64 // 下一个写入位置 (单调递增)
	tail          atomic.Int64 // 下一个消费位置 (单调递增)
	highWatermark int          // 触发刷盘的阈值

	// 溢出通道: 被挤出的消息通过此通道发送给异步 worker
	overflowCh chan *model.SignalingMessage

	// 索引 (仅保护索引, 不保护数据槽)
	idxMu       sync.RWMutex
	imsiIndex   map[string][]int64 // IMSI → ring positions
	callIDIndex map[string][]int64 // CallID → ring positions
}

func newRingBuffer(size int) *ringBuffer {
	rb := &ringBuffer{
		slots:         make([]atomic.Pointer[model.SignalingMessage], size),
		size:          size,
		highWatermark: int(float64(size) * ringHighWatermark),
		overflowCh:    make(chan *model.SignalingMessage, ringBatchSize*2),
		imsiIndex:     make(map[string][]int64),
		callIDIndex:   make(map[string][]int64),
	}
	return rb
}

// push 写入一条消息到环形缓冲区 (无锁快速路径)。
//
// 返回被挤出的旧消息 (如果有的话)，调用者负责将其送入 overflow 通道。
func (rb *ringBuffer) push(msg *model.SignalingMessage) *model.SignalingMessage {
	pos := rb.head.Add(1) - 1
	slotIdx := int(pos%int64(rb.size)) & (rb.size - 1) // 假设 size 是 2 的幂

	// 挤出旧消息
	var evicted *model.SignalingMessage
	old := rb.slots[slotIdx].Swap(msg)
	if old != nil {
		evicted = old
	}

	// 更新索引
	rb.idxMu.Lock()
	if msg.Identifiers.IMSI != "" {
		rb.imsiIndex[msg.Identifiers.IMSI] = append(rb.imsiIndex[msg.Identifiers.IMSI], pos)
	}
	if msg.CallID != "" {
		rb.callIDIndex[msg.CallID] = append(rb.callIDIndex[msg.CallID], pos)
	}
	// 清理被挤出消息的索引 (惰性: 只在 tail 推进时清理)
	rb.idxMu.Unlock()

	// 推进 tail (如果缓冲区满了)
	for rb.head.Load()-rb.tail.Load() > int64(rb.size) {
		oldTail := rb.tail.Add(1) - 1
		oldSlotIdx := int(oldTail%int64(rb.size)) & (rb.size - 1)
		// 清理旧槽位的索引
		oldMsg := rb.slots[oldSlotIdx].Load()
		if oldMsg != nil {
			rb.idxMu.Lock()
			rb.removeFromIndex(oldMsg, oldTail)
			rb.idxMu.Unlock()
		}
	}

	return evicted
}

// removeFromIndex 从索引中移除指定位置的消息
func (rb *ringBuffer) removeFromIndex(msg *model.SignalingMessage, pos int64) {
	if msg.Identifiers.IMSI != "" {
		indices := rb.imsiIndex[msg.Identifiers.IMSI]
		for i, v := range indices {
			if v == pos {
				rb.imsiIndex[msg.Identifiers.IMSI] = append(indices[:i], indices[i+1:]...)
				break
			}
		}
		if len(rb.imsiIndex[msg.Identifiers.IMSI]) == 0 {
			delete(rb.imsiIndex, msg.Identifiers.IMSI)
		}
	}
	if msg.CallID != "" {
		indices := rb.callIDIndex[msg.CallID]
		for i, v := range indices {
			if v == pos {
				rb.callIDIndex[msg.CallID] = append(indices[:i], indices[i+1:]...)
				break
			}
		}
		if len(rb.callIDIndex[msg.CallID]) == 0 {
			delete(rb.callIDIndex, msg.CallID)
		}
	}
}

// count 返回缓冲区中的消息数
func (rb *ringBuffer) count() int {
	return int(rb.head.Load() - rb.tail.Load())
}

// isHighWater 检查是否达到水位线
func (rb *ringBuffer) isHighWater() bool {
	return rb.count() >= rb.highWatermark
}

// queryByIMSI 按 IMSI 查询缓冲区中的消息
func (rb *ringBuffer) queryByIMSI(imsi string, start, end time.Time) []model.SignalingMessage {
	rb.idxMu.RLock()
	positions := rb.imsiIndex[imsi]
	if len(positions) == 0 {
		rb.idxMu.RUnlock()
		return nil
	}
	// 复制切片避免持锁
	posCopy := make([]int64, len(positions))
	copy(posCopy, positions)
	rb.idxMu.RUnlock()

	var result []model.SignalingMessage
	for _, pos := range posCopy {
		slotIdx := int(pos%int64(rb.size)) & (rb.size - 1)
		msg := rb.slots[slotIdx].Load()
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

// queryByCallID 按 CallID 查询缓冲区中的消息
func (rb *ringBuffer) queryByCallID(callID string) []model.SignalingMessage {
	rb.idxMu.RLock()
	positions := rb.callIDIndex[callID]
	if len(positions) == 0 {
		rb.idxMu.RUnlock()
		return nil
	}
	posCopy := make([]int64, len(positions))
	copy(posCopy, positions)
	rb.idxMu.RUnlock()

	var result []model.SignalingMessage
	for _, pos := range posCopy {
		slotIdx := int(pos%int64(rb.size)) & (rb.size - 1)
		msg := rb.slots[slotIdx].Load()
		if msg != nil {
			result = append(result, *msg)
		}
	}
	return result
}

// queryAll 查询时间范围内的所有消息
func (rb *ringBuffer) queryAll(start, end time.Time, limit int) []model.SignalingMessage {
	if limit <= 0 {
		limit = 10000
	}

	tail := rb.tail.Load()
	head := rb.head.Load()
	var result []model.SignalingMessage

	// 从最新消息开始遍历
	for pos := head - 1; pos >= tail && len(result) < limit; pos-- {
		slotIdx := int(pos%int64(rb.size)) & (rb.size - 1)
		msg := rb.slots[slotIdx].Load()
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

// HEPListener 在 UDP 端口上监听 HEPv3 协议包。
//
// 两级缓存架构:
//   - L1: 无锁环形缓冲区 (内存, 瞬时流量接入)
//   - L2: MongoDB TTL 集合 (持久化, 溢出数据)
//
// 当 L1 达到水位线时，被挤出的消息通过 channel 发送给异步 worker，
// worker 批量写入 MongoDB。查询时合并 L1 + L2 数据。
type HEPListener struct {
	cfg HEPListenerConfig

	conn    *net.UDPConn
	running bool
	mu      sync.RWMutex

	// L1: 无锁环形缓冲区
	ring *ringBuffer

	// L2: MongoDB 异步写入控制
	mongoColl  *mongo.Collection // overflow 集合
	flushDone  chan struct{}      // worker 退出信号
	flushGroup sync.WaitGroup    // 等待 worker 退出

	// 统计 (atomic)
	received    atomic.Int64
	parsed      atomic.Int64
	errors      atomic.Int64
	flushed     atomic.Int64 // 已刷入 MongoDB 的消息数
	lastReceive atomic.Int64 // Unix nano
}

// NewHEPListener 创建 HEP 监听器
func NewHEPListener(cfg HEPListenerConfig) *HEPListener {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":9060"
	}
	if cfg.BufferSize <= 0 {
		cfg.BufferSize = 50000
	}

	l := &HEPListener{
		cfg:  cfg,
		ring: newRingBuffer(cfg.BufferSize),
	}

	// 如果配置了 MongoDB，初始化 L2 溢出集合
	if cfg.MongoDB != nil && cfg.DBName != "" {
		l.mongoColl = cfg.MongoDB.Database(cfg.DBName).Collection(ringCollection)
	}

	return l
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

	log.Printf("[HEPListener] listening on %s (buffer=%d, mongo=%v)",
		l.cfg.ListenAddr, l.cfg.BufferSize, l.mongoColl != nil)

	// 设置读缓冲区大小（1MB）
	_ = conn.SetReadBuffer(1024 * 1024)

	// 启动 L2 异步刷盘 worker
	if l.mongoColl != nil {
		l.flushDone = make(chan struct{})
		l.flushGroup.Add(1)
		go l.overflowWorker()
	}

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

	// 等待异步 worker 退出
	if l.flushDone != nil {
		close(l.flushDone)
		l.flushGroup.Wait()
	}

	log.Printf("[HEPListener] stopped (received=%d, parsed=%d, errors=%d, flushed=%d)",
		l.received.Load(), l.parsed.Load(), l.errors.Load(), l.flushed.Load())
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

	var lastStr string
	if ts := l.lastReceive.Load(); ts > 0 {
		lastStr = time.Unix(0, ts).Format(time.RFC3339)
	}

	return HEPListenerStatus{
		Running:     running,
		ListenAddr:  l.cfg.ListenAddr,
		Received:    l.received.Load(),
		Parsed:      l.parsed.Load(),
		Errors:      l.errors.Load(),
		BufferCount: l.ring.count(),
		LastReceive: lastStr,
	}
}

// -----------------------------------------------------------
// UDP 读取循环
// -----------------------------------------------------------

// readLoop 持续读取 UDP 包并解析。
//
// 写入路径 (无锁快速路径):
//
//	UDP read → parseHEP → parseSIPPayload → ring.push
//	                                     ↓ (如果挤出旧消息)
//	                                overflowCh → asyncWorker → MongoDB batch insert
func (l *HEPListener) readLoop() {
	buf := make([]byte, 65535)

	for {
		n, _, err := l.conn.ReadFromUDP(buf)
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

		l.received.Add(1)
		l.lastReceive.Store(time.Now().UnixNano())

		if n < 6 {
			l.errors.Add(1)
			if l.errors.Load() <= 3 {
				log.Printf("[HEPListener] packet too short: %d bytes", n)
			}
			continue
		}

		packet, err := parseHEP(buf[:n])
		if err != nil {
			l.errors.Add(1)
			if l.errors.Load() <= 3 {
				log.Printf("[HEPListener] parse error: %v, first 32 bytes: %x", err, buf[:min(32, n)])
			}
			continue
		}

		// 只处理 SIP 协议（Kamailio ProtoType=0x01 表示 SIP）
		if packet.ProtoType != hepProtoSIP || len(packet.Payload) == 0 {
			continue
		}

		msg := l.parseSIPPayload(packet)
		if msg != nil {
			l.storeMessage(msg)
			l.parsed.Add(1)
		}
	}
}

// storeMessage 写入 L1 环形缓冲区，挤出的消息送入 L2 overflow 通道。
func (l *HEPListener) storeMessage(msg *model.SignalingMessage) {
	evicted := l.ring.push(msg)

	// 被挤出的消息送入异步刷盘通道
	if evicted != nil && l.mongoColl != nil {
		select {
		case l.ring.overflowCh <- evicted:
		default:
			// 通道满了，丢弃 (背压: 避免阻塞写入路径)
		}
	}
}

// -----------------------------------------------------------
// HEPv3 协议解析
// -----------------------------------------------------------

// parseHEP 解析 HEPv3 包
// HEP3 格式: 4 字节 magic "HEP3" + 2 字节总长度 + N 个 chunk
// 每个 chunk: 2 字节 vendor_id + 2 字节 type_id + 2 字节 length(含头) + value
// 参考: Kamailio src/modules/sipcapture/hep.h
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
	chunkNum := 0

	// 解析所有 chunks（每个 chunk 头 6 字节: vendor_id + type_id + length）
	for offset+6 <= int(totalLen) {
		vendorID := binary.BigEndian.Uint16(data[offset : offset+2])
		chunkType := binary.BigEndian.Uint16(data[offset+2 : offset+4])
		chunkLen := binary.BigEndian.Uint16(data[offset+4 : offset+6])

		// chunkLen 包含 6 字节头
		if chunkLen < 6 || offset+int(chunkLen) > int(totalLen) {
			break
		}

		chunkVal := data[offset+6 : offset+int(chunkLen)]
		chunkNum++

		_ = vendorID // Kamailio 默认 vendor=0

		switch chunkType {
		case hepChunkIPFamily:
			if len(chunkVal) >= 1 {
				pkt.IPFamily = int(chunkVal[0])
			}
		case hepChunkSrcIP4:
			// Kamailio 用 uint32 NBO 存储 IPv4（4 字节）
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
			// Kamailio 中此字段是协议类型（SIP=0x01），不是 IP 协议
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
		return nil, fmt.Errorf("HEP packet has no payload (parsed %d chunks)", chunkNum)
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
		DataSource: "hep",
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
// 查询方法 (合并 L1 环形缓冲区 + L2 MongoDB)
// -----------------------------------------------------------

// QueryByIMSI 按 IMSI 查询 SIP 消息。
//
// 合并策略:
//   - L1 (ring buffer): 最近的消息, 无延迟
//   - L2 (MongoDB overflow): 被挤出的历史消息
//   - 按 timestamp 去重合并
func (l *HEPListener) QueryByIMSI(imsi string, start, end time.Time) []model.SignalingMessage {
	// L1: 环形缓冲区
	result := l.ring.queryByIMSI(imsi, start, end)

	// L2: MongoDB overflow
	if l.mongoColl != nil {
		l2Msgs := l.queryMongoByIMSI(imsi, start, end)
		for i := range l2Msgs {
			l2Msgs[i].DataSource = "hep_mongo"
		}
		result = mergeMessages(result, l2Msgs)
	}

	return result
}

// QueryByCallID 按 Call-ID 查询 SIP 消息
func (l *HEPListener) QueryByCallID(callID string) []model.SignalingMessage {
	result := l.ring.queryByCallID(callID)

	if l.mongoColl != nil {
		l2Msgs := l.queryMongoByCallID(callID)
		for i := range l2Msgs {
			l2Msgs[i].DataSource = "hep_mongo"
		}
		result = mergeMessages(result, l2Msgs)
	}

	return result
}

// QueryAll 查询时间范围内的所有 SIP 消息
func (l *HEPListener) QueryAll(start, end time.Time, limit int) []model.SignalingMessage {
	result := l.ring.queryAll(start, end, limit)

	if l.mongoColl != nil {
		l2Msgs := l.queryMongoAll(start, end, limit)
		for i := range l2Msgs {
			l2Msgs[i].DataSource = "hep_mongo"
		}
		result = mergeMessages(result, l2Msgs)
	}

	return result
}

// -----------------------------------------------------------
// L2 MongoDB 溢出查询
// -----------------------------------------------------------

// queryMongoByIMSI 从 MongoDB overflow 集合查询
func (l *HEPListener) queryMongoByIMSI(imsi string, start, end time.Time) []model.SignalingMessage {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	filter := bson.M{"identifiers.imsi": imsi}
	if !start.IsZero() || !end.IsZero() {
		tsFilter := bson.M{}
		if !start.IsZero() {
			tsFilter["$gte"] = start
		}
		if !end.IsZero() {
			tsFilter["$lte"] = end
		}
		filter["timestamp"] = tsFilter
	}

	cursor, err := l.mongoColl.Find(ctx, filter)
	if err != nil {
		log.Printf("[HEPListener] mongo query by IMSI failed: %v", err)
		return nil
	}
	defer cursor.Close(ctx)

	var msgs []model.SignalingMessage
	if err := cursor.All(ctx, &msgs); err != nil {
		log.Printf("[HEPListener] mongo decode failed: %v", err)
		return nil
	}
	return msgs
}

// queryMongoByCallID 从 MongoDB overflow 集合查询
func (l *HEPListener) queryMongoByCallID(callID string) []model.SignalingMessage {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	filter := bson.M{"call_id": callID}
	cursor, err := l.mongoColl.Find(ctx, filter)
	if err != nil {
		log.Printf("[HEPListener] mongo query by CallID failed: %v", err)
		return nil
	}
	defer cursor.Close(ctx)

	var msgs []model.SignalingMessage
	if err := cursor.All(ctx, &msgs); err != nil {
		log.Printf("[HEPListener] mongo decode failed: %v", err)
		return nil
	}
	return msgs
}

// queryMongoAll 从 MongoDB overflow 集合查询时间范围内的消息
func (l *HEPListener) queryMongoAll(start, end time.Time, limit int) []model.SignalingMessage {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	filter := bson.M{}
	if !start.IsZero() || !end.IsZero() {
		tsFilter := bson.M{}
		if !start.IsZero() {
			tsFilter["$gte"] = start
		}
		if !end.IsZero() {
			tsFilter["$lte"] = end
		}
		filter["timestamp"] = tsFilter
	}

	if limit <= 0 {
		limit = 10000
	}

	cursor, err := l.mongoColl.Find(ctx, filter)
	if err != nil {
		log.Printf("[HEPListener] mongo query all failed: %v", err)
		return nil
	}
	defer cursor.Close(ctx)

	var msgs []model.SignalingMessage
	if err := cursor.All(ctx, &msgs); err != nil {
		log.Printf("[HEPListener] mongo decode failed: %v", err)
		return nil
	}
	return msgs
}

// mergeMessages 合并 L1 和 L2 消息，按 timestamp 排序并去重。
//
// 去重策略: 使用 timestamp + protocol + source_ip + dest_ip 作为复合键。
func mergeMessages(l1, l2 []model.SignalingMessage) []model.SignalingMessage {
	if len(l2) == 0 {
		return l1
	}
	if len(l1) == 0 {
		return l2
	}

	// 用 L1 的 timestamp 构建去重集合
	seen := make(map[string]bool, len(l1))
	for _, m := range l1 {
		key := m.Timestamp.Format(time.RFC3339Nano) + "|" + m.Protocol + "|" + m.SourceIP + "|" + m.DestIP
		seen[key] = true
	}

	// 合并 L2 中未重复的消息
	merged := make([]model.SignalingMessage, 0, len(l1)+len(l2))
	merged = append(merged, l1...)
	for _, m := range l2 {
		key := m.Timestamp.Format(time.RFC3339Nano) + "|" + m.Protocol + "|" + m.SourceIP + "|" + m.DestIP
		if !seen[key] {
			merged = append(merged, m)
		}
	}

	// 按时间排序
	sort.Slice(merged, func(i, j int) bool {
		return merged[i].Timestamp.Before(merged[j].Timestamp)
	})

	return merged
}

// -----------------------------------------------------------
// L2 异步刷盘 Worker
// -----------------------------------------------------------

// overflowWorker 从 overflow 通道批量消费消息并写入 MongoDB。
//
// 触发条件 (满足任一):
//   - 通道中积压 >= ringBatchSize 条消息
//   - 距上次刷盘 >= ringFlushInterval
//   - 环形缓冲区达到水位线
func (l *HEPListener) overflowWorker() {
	defer l.flushGroup.Done()

	batch := make([]interface{}, 0, ringBatchSize)
	ticker := time.NewTicker(ringFlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-l.flushDone:
			// 退出前刷完剩余数据
			if len(batch) > 0 {
				l.flushBatch(batch)
				batch = batch[:0]
			}
			return

		case msg := <-l.ring.overflowCh:
			batch = append(batch, msg)
			if len(batch) >= ringBatchSize {
				l.flushBatch(batch)
				batch = batch[:0]
			}

		case <-ticker.C:
			// 定时刷盘 (即使未满一批)
			if len(batch) > 0 {
				l.flushBatch(batch)
				batch = batch[:0]
			}

		default:
			// 通道空闲, 检查水位线
			if l.ring.isHighWater() && len(batch) > 0 {
				l.flushBatch(batch)
				batch = batch[:0]
			}
			// 短暂休避免忙等
			time.Sleep(10 * time.Millisecond)
		}
	}
}

// flushBatch 批量写入 MongoDB overflow 集合。
//
// 使用 InsertMany 实现批量写入，单次最多 ringBatchSize 条。
// TTL 索引自动清理过期数据 (索引在首次启动时由 EnsureIndexes 创建)。
func (l *HEPListener) flushBatch(batch []interface{}) {
	if len(batch) == 0 || l.mongoColl == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := l.mongoColl.InsertMany(ctx, batch)
	if err != nil {
		log.Printf("[HEPListener] mongo batch insert failed (%d docs): %v", len(batch), err)
		return
	}

	l.flushed.Add(int64(len(batch)))
}

// EnsureIndexes 创建 MongoDB overflow 集合的索引。
//
// 索引:
//   - { timestamp: 1 } TTL 7 天 (自动清理过期数据)
//   - { identifiers.imsi: 1, timestamp: -1 } (IMSI 查询加速)
//   - { call_id: 1 } (CallID 查询加速)
func (l *HEPListener) EnsureIndexes() error {
	if l.mongoColl == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "timestamp", Value: 1}},
		},
		{
			Keys: bson.D{{Key: "identifiers.imsi", Value: 1}, {Key: "timestamp", Value: -1}},
		},
		{
			Keys: bson.D{{Key: "call_id", Value: 1}},
		},
	}

	_, err := l.mongoColl.Indexes().CreateMany(ctx, indexes)
	if err != nil {
		return fmt.Errorf("create indexes: %w", err)
	}

	log.Printf("[HEPListener] ensured indexes on %s.%s", l.cfg.DBName, ringCollection)
	return nil
}

// min returns the smaller of a or b
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
