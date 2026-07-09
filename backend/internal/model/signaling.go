package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// SignalingMessage 跨协议信令消息文档（集合: signaling_messages）
// 每条记录代表一条协议消息，如 SIP REGISTER、NAS Attach Request、GTPv2-C Create Session 等
type SignalingMessage struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"id"`
	TraceID    string        `bson:"trace_id" json:"trace_id"`               // 关联同一用户的所有消息
	Timestamp  time.Time     `bson:"timestamp" json:"timestamp"`             // 精确到微秒
	Protocol   string        `bson:"protocol" json:"protocol"`               // NAS, NGAP, S1AP, SBI, Diameter, GTPv2C, GTPU, PFCP, SIP, SDP, RTP, RTCP, SGsAP, MAP, DNS
	Interface  string        `bson:"interface" json:"interface"`             // N1, N2, N4, N3, S1-MME, S11, S5/S8, Cx, Rx, Gx, SGs, Mw, ISC, Gm 等
	Direction  string        `bson:"direction" json:"direction"`             // request, response, indication
	Method     string        `bson:"method" json:"method"`                   // REGISTER, INVITE, Attach Request, Create Session Request 等
	StatusCode int           `bson:"status_code,omitempty" json:"status_code,omitempty"` // SIP 200, Diameter 2001 等
	StatusText string        `bson:"status_text,omitempty" json:"status_text,omitempty"`
	SourceEntity string      `bson:"src_entity" json:"src_entity"`           // UE, gNB, AMF, SMF, P-CSCF, S-CSCF, HSS 等
	DestEntity   string      `bson:"dst_entity" json:"dst_entity"`
	SourceIP   string        `bson:"src_ip,omitempty" json:"src_ip,omitempty"`
	DestIP     string        `bson:"dst_ip,omitempty" json:"dst_ip,omitempty"`
	SourcePort int           `bson:"src_port,omitempty" json:"src_port,omitempty"`
	DestPort   int           `bson:"dst_port,omitempty" json:"dst_port,omitempty"`
	// 用户标识（用于跨协议关联）
	Identifiers MessageIdentifiers `bson:"identifiers" json:"identifiers"`
	// 协议特定详情
	Details map[string]any `bson:"details,omitempty" json:"details,omitempty"`
	// 原始数据预览（前 2000 字符，十六进制或文本）
	RawPreview string `bson:"raw_preview,omitempty" json:"raw_preview,omitempty"`
	// 关联信息
	SessionID string `bson:"session_id,omitempty" json:"session_id,omitempty"` // PDU Session ID / EPS Bearer ID
	CallID    string `bson:"call_id,omitempty" json:"call_id,omitempty"`       // SIP Call-ID
	// 数据来源与关联标记
	DataSource string `bson:"data_source,omitempty" json:"data_source,omitempty"` // hep, hep_mongo, tshark, homer
	CrossLayer bool   `bson:"cross_layer,omitempty" json:"cross_layer,omitempty"` // true: SIP ↔ NAS/S1AP 跨层关联
}

// MessageIdentifiers 信令消息关联标识，用于跨协议关联同一用户
type MessageIdentifiers struct {
	IMSI      string `bson:"imsi,omitempty" json:"imsi,omitempty"`
	SUPI      string `bson:"supi,omitempty" json:"supi,omitempty"`
	MSISDN    string `bson:"msisdn,omitempty" json:"msisdn,omitempty"`
	IMPU      string `bson:"impu,omitempty" json:"impu,omitempty"`
	IMPI      string `bson:"impi,omitempty" json:"impi,omitempty"`
	SIPURI    string `bson:"sip_uri,omitempty" json:"sip_uri,omitempty"`
	GUTI      string `bson:"guti,omitempty" json:"guti,omitempty"`
	FiveG_GUTI string `bson:"fiveg_guti,omitempty" json:"fiveg_guti,omitempty"`
	TEID      string `bson:"teid,omitempty" json:"teid,omitempty"`
	UEIPv4    string `bson:"ue_ipv4,omitempty" json:"ue_ipv4,omitempty"`
	UEIPv6    string `bson:"ue_ipv6,omitempty" json:"ue_ipv6,omitempty"`
	CallID    string `bson:"call_id,omitempty" json:"call_id,omitempty"`
}

// SignalingTrace 信令追踪会话文档（集合: signaling_traces）
type SignalingTrace struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	TraceID      string        `bson:"trace_id" json:"trace_id"`             // UUID
	QueryType    string        `bson:"query_type" json:"query_type"`         // imsi, supi, msisdn, sip_uri, impu, impi, ip, teid, call_id, guti, fiveg_guti
	QueryValue   string        `bson:"query_value" json:"query_value"`
	Scenario     string        `bson:"scenario" json:"scenario"`             // 5g_registration, 4g_attach, ims_registration, volte_call, vonr_call, sms_sgs, sms_nas, sms_ims, all
	Status       string        `bson:"status" json:"status"`                 // running, completed, error
	MessageCount int           `bson:"message_count" json:"message_count"`
	Entities     []string      `bson:"entities" json:"entities"`             // 参与的网元列表（用于 Ladder Diagram 列头）
	TimeRange    TimeRange     `bson:"time_range" json:"time_range"`
	Summary      TraceSummary  `bson:"summary" json:"summary"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	CreatedBy    string        `bson:"created_by" json:"created_by"`
}

// TimeRange 时间范围
type TimeRange struct {
	Start time.Time `bson:"start" json:"start"`
	End   time.Time `bson:"end" json:"end"`
}

// TraceSummary 信令追踪摘要
type TraceSummary struct {
	RegistrationOK bool   `bson:"reg_ok" json:"reg_ok"`
	AuthOK         bool   `bson:"auth_ok" json:"auth_ok"`
	SessionOK      bool   `bson:"session_ok" json:"session_ok"`
	IMSRegOK       bool   `bson:"ims_reg_ok" json:"ims_reg_ok"`
	CallOK         bool   `bson:"call_ok" json:"call_ok"`
	SMSOK          bool   `bson:"sms_ok" json:"sms_ok"`
	ErrorStep      string `bson:"error_step,omitempty" json:"error_step,omitempty"`
	ErrorDetail    string `bson:"error_detail,omitempty" json:"error_detail,omitempty"`
}

// MediaQuality 媒体质量文档（集合: media_quality）
// RTP/RTCP 统计信息，用于 VoLTE/VoNR 通话质量评估
type MediaQuality struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	TraceID   string        `bson:"trace_id" json:"trace_id"`
	CallID    string        `bson:"call_id" json:"call_id"`
	Direction string        `bson:"direction" json:"direction"` // caller_to_callee, callee_to_caller
	Codec     string        `bson:"codec" json:"codec"`         // AMR, AMR-WB, EVS
	SrcIP     string        `bson:"src_ip" json:"src_ip"`
	SrcPort   int           `bson:"src_port" json:"src_port"`
	DstIP     string        `bson:"dst_ip" json:"dst_ip"`
	DstPort   int           `bson:"dst_port" json:"dst_port"`
	SSRC      string        `bson:"ssrc" json:"ssrc"`
	// RTP/RTCP 统计
	PacketsSent    int     `bson:"pkts_sent" json:"pkts_sent"`
	PacketsLost    int     `bson:"pkts_lost" json:"pkts_lost"`
	PacketLossRate float64 `bson:"loss_rate" json:"loss_rate"`
	Jitter         float64 `bson:"jitter" json:"jitter"`         // ms
	MOS            float64 `bson:"mos" json:"mos"`               // 1.0 ~ 5.0
	RoundTripDelay float64 `bson:"rtd" json:"rtd"`               // ms
	// rtpengine 信息
	RelayIP   string    `bson:"relay_ip,omitempty" json:"relay_ip,omitempty"`
	RelayPort int       `bson:"relay_port,omitempty" json:"relay_port,omitempty"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
}

// -----------------------------------------------------------
// MongoDB 索引建议
// -----------------------------------------------------------
//
// signaling_messages 集合：
//
//	db.signaling_messages.createIndex({ trace_id: 1, timestamp: 1 })
//	db.signaling_messages.createIndex({ "identifiers.imsi": 1, timestamp: -1 })
//	db.signaling_messages.createIndex({ "identifiers.msisdn": 1, timestamp: -1 })
//	db.signaling_messages.createIndex({ "identifiers.call_id": 1 })
//	db.signaling_messages.createIndex({ "identifiers.sip_uri": 1, timestamp: -1 })
//	db.signaling_messages.createIndex({ protocol: 1, timestamp: -1 })
//	db.signaling_messages.createIndex({ timestamp: 1 }, { expireAfterSeconds: 604800 }) // TTL 7天
//
// signaling_traces 集合：
//
//	db.signaling_traces.createIndex({ trace_id: 1 }, { unique: true })
//	db.signaling_traces.createIndex({ query_type: 1, query_value: 1 })
//	db.signaling_traces.createIndex({ created_at: -1 })
//
// media_quality 集合：
//
//	db.media_quality.createIndex({ trace_id: 1, timestamp: 1 })
//	db.media_quality.createIndex({ call_id: 1 })
