// ---------------------------------------------------------------------------
// Signaling Trace Types — matches backend model/signaling.go
// ---------------------------------------------------------------------------

/** 协议类型 */
export type SignalingProtocol =
  | 'NAS'
  | 'NGAP'
  | 'S1AP'
  | 'SBI'
  | 'Diameter'
  | 'GTPv2C'
  | 'GTPU'
  | 'PFCP'
  | 'SIP'
  | 'SDP'
  | 'RTP'
  | 'RTCP'
  | 'SGsAP'
  | 'MAP'
  | 'DNS';

/** 消息方向 */
export type MessageDirection = 'request' | 'response' | 'indication';

/** 查询类型 */
export type QueryType =
  | 'imsi'
  | 'supi'
  | 'msisdn'
  | 'sip_uri'
  | 'impu'
  | 'impi'
  | 'ip'
  | 'teid'
  | 'call_id'
  | 'guti'
  | 'fiveg_guti';

/** 追踪场景 */
export type TraceScenario =
  | '5g_registration'
  | '4g_attach'
  | 'ims_registration'
  | 'volte_call'
  | 'vonr_call'
  | 'sms_sgs'
  | 'sms_nas'
  | 'sms_ims'
  | 'all';

/** 追踪状态 */
export type TraceStatus = 'running' | 'completed' | 'error';

// ---------------------------------------------------------------------------
// MessageIdentifiers
// ---------------------------------------------------------------------------

export interface MessageIdentifiers {
  imsi?: string;
  supi?: string;
  msisdn?: string;
  impu?: string;
  impi?: string;
  sip_uri?: string;
  guti?: string;
  fiveg_guti?: string;
  teid?: string;
  ue_ipv4?: string;
  ue_ipv6?: string;
  call_id?: string;
}

// ---------------------------------------------------------------------------
// SignalingMessage
// ---------------------------------------------------------------------------

export interface SignalingMessage {
  id: string;
  trace_id: string;
  timestamp: string;
  protocol: SignalingProtocol;
  interface: string;
  direction: MessageDirection;
  method: string;
  status_code?: number;
  status_text?: string;
  src_entity: string;
  dst_entity: string;
  src_ip?: string;
  dst_ip?: string;
  src_port?: number;
  dst_port?: number;
  identifiers: MessageIdentifiers;
  details?: Record<string, unknown>;
  raw_preview?: string;
  session_id?: string;
  call_id?: string;
  /** data source: hep (L1 ring), hep_mongo (L2 overflow), tshark, homer */
  data_source?: 'hep' | 'hep_mongo' | 'tshark' | 'homer';
  /** whether this message was cross-layer correlated (SIP <-> NAS/S1AP) */
  cross_layer?: boolean;
}

// ---------------------------------------------------------------------------
// TraceSummary
// ---------------------------------------------------------------------------

export interface TraceSummary {
  reg_ok: boolean;
  auth_ok: boolean;
  session_ok: boolean;
  ims_reg_ok: boolean;
  call_ok: boolean;
  sms_ok: boolean;
  error_step?: string;
  error_detail?: string;
}

// ---------------------------------------------------------------------------
// SignalingTrace
// ---------------------------------------------------------------------------

export interface TimeRange {
  start: string;
  end: string;
}

export interface SignalingTrace {
  id: string;
  trace_id: string;
  query_type: QueryType;
  query_value: string;
  scenario: TraceScenario;
  status: TraceStatus;
  message_count: number;
  entities: string[];
  time_range: TimeRange;
  summary: TraceSummary;
  created_at: string;
  created_by: string;
}

// ---------------------------------------------------------------------------
// MediaQuality
// ---------------------------------------------------------------------------

export interface MediaQuality {
  id: string;
  trace_id: string;
  call_id: string;
  direction: string;
  codec: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  ssrc: string;
  pkts_sent: number;
  pkts_lost: number;
  loss_rate: number;
  jitter: number;
  mos: number;
  rtd: number;
  relay_ip?: string;
  relay_port?: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// API Request / Response
// ---------------------------------------------------------------------------

export interface TraceQuery {
  query_type: QueryType;
  query_value: string;
  scenario: TraceScenario;
  time_range?: {
    start: string;
    end: string;
  };
  sources?: string[];
}

export interface ApiResponse<T = unknown> {
  status: string;
  message?: string;
  data?: T;
}

export interface TracesListResponse {
  status: string;
  traces: SignalingTrace[];
  total: number;
  page: number;
  per_page: number;
}

export interface MessagesListResponse {
  status: string;
  messages: SignalingMessage[];
  total: number;
  page: number;
  per_page: number;
}

export interface MediaListResponse {
  status: string;
  media: MediaQuality[];
  total: number;
  page: number;
  per_page: number;
}

// ---------------------------------------------------------------------------
// HEP Listener Status (two-tier ring buffer)
// ---------------------------------------------------------------------------

export interface HepStatus {
  status: string;
  enabled: boolean;
  running?: boolean;
  listen_addr?: string;
  received?: number;
  parsed?: number;
  errors?: number;
  buffer_count?: number;
  last_receive?: string;
  message?: string;
}

/** Data source labels */
export const DATA_SOURCE_LABELS: Record<string, { zh: string; en: string; color: string }> = {
  hep:        { zh: 'HEP L1', en: 'HEP L1',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  hep_mongo:  { zh: 'HEP L2', en: 'HEP L2',     color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  tshark:     { zh: 'Pcap',   en: 'Pcap',       color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  homer:      { zh: 'Homer',  en: 'Homer',      color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 协议类型颜色映射 */
export const PROTOCOL_COLORS: Record<SignalingProtocol, string> = {
  NAS: '#3b82f6',      // blue
  NGAP: '#6366f1',     // indigo
  S1AP: '#8b5cf6',     // violet
  SBI: '#a855f7',      // purple
  Diameter: '#ec4899',  // pink
  GTPv2C: '#f43f5e',   // rose
  GTPU: '#ef4444',     // red
  PFCP: '#f97316',     // orange
  SIP: '#22c55e',      // green
  SDP: '#14b8a6',      // teal
  RTP: '#06b6d4',      // cyan
  RTCP: '#0ea5e9',     // sky
  SGsAP: '#eab308',    // yellow
  MAP: '#84cc16',      // lime
  DNS: '#6b7280',      // gray
};

/** 协议类型文字颜色（深色背景上） */
export const PROTOCOL_TEXT_COLORS: Record<SignalingProtocol, string> = {
  NAS: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  NGAP: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  S1AP: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  SBI: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Diameter: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  GTPv2C: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  GTPU: 'bg-red-500/20 text-red-400 border-red-500/30',
  PFCP: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  SIP: 'bg-green-500/20 text-green-400 border-green-500/30',
  SDP: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  RTP: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  RTCP: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  SGsAP: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  MAP: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  DNS: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

/** 网元图标映射（Emoji 占位，后续可替换为 SVG） */
export const ENTITY_ICONS: Record<string, string> = {
  UE: '📱',
  gNB: '🗼',
  eNodeB: '🗼',
  AMF: '🔷',
  SMF: '🔶',
  UPF: '⬛',
  MME: '🔷',
  HSS: '🗄️',
  AUSF: '🔐',
  UDM: '🗄️',
  UDR: '🗄️',
  PCF: '📋',
  PCRF: '📋',
  'P-CSCF': '📞',
  'I-CSCF': '📞',
  'S-CSCF': '📞',
  SGW: '⬜',
  PGW: '⬜',
  'SGW-C': '⬜',
  'SGW-U': '⬜',
  'PGW-C': '⬜',
  'PGW-U': '⬜',
  SMSF: '💬',
  MSC: '📞',
  FreeSWITCH: '🎙️',
  NRF: '🔍',
  NSSF: '🔍',
  SCP: '🔍',
};

/** 查询类型选项 */
export const QUERY_TYPE_OPTIONS: { value: QueryType; label_zh: string; label_en: string; placeholder: string }[] = [
  { value: 'imsi', label_zh: 'IMSI', label_en: 'IMSI', placeholder: '460001234567890' },
  { value: 'supi', label_zh: 'SUPI', label_en: 'SUPI', placeholder: 'imsi-460001234567890' },
  { value: 'msisdn', label_zh: 'MSISDN', label_en: 'MSISDN', placeholder: '13800138000' },
  { value: 'sip_uri', label_zh: 'SIP URI', label_en: 'SIP URI', placeholder: 'sip:+8613800138000@ims.mnc000.mcc460.3gppnetwork.org' },
  { value: 'impu', label_zh: 'IMPU', label_en: 'IMPU', placeholder: 'sip:+8613800138000@ims.mnc000.mcc460.3gppnetwork.org' },
  { value: 'impi', label_zh: 'IMPI', label_en: 'IMPI', placeholder: '460001234567890@ims.mnc000.mcc460.3gppnetwork.org' },
  { value: 'ip', label_zh: 'UE IP', label_en: 'UE IP', placeholder: '10.45.0.2' },
  { value: 'teid', label_zh: 'TEID', label_en: 'TEID', placeholder: '00000001' },
  { value: 'call_id', label_zh: 'Call-ID', label_en: 'Call-ID', placeholder: 'call-id-xyz@host' },
  { value: 'guti', label_zh: 'GUTI', label_en: 'GUTI', placeholder: 'GUTI value' },
  { value: 'fiveg_guti', label_zh: '5G-GUTI', label_en: '5G-GUTI', placeholder: '5G-GUTI value' },
];

/** 场景选项 */
export const SCENARIO_OPTIONS: { value: TraceScenario; label_zh: string; label_en: string; icon: string }[] = [
  { value: '5g_registration', label_zh: '5G 注册', label_en: '5G Registration', icon: '📶' },
  { value: '4g_attach', label_zh: '4G 附着', label_en: '4G Attach', icon: '📡' },
  { value: 'ims_registration', label_zh: 'IMS 注册', label_en: 'IMS Registration', icon: '📞' },
  { value: 'volte_call', label_zh: 'VoLTE 通话', label_en: 'VoLTE Call', icon: '🎙️' },
  { value: 'vonr_call', label_zh: 'VoNR 通话', label_en: 'VoNR Call', icon: '🔊' },
  { value: 'sms_sgs', label_zh: 'SMS over SGs', label_en: 'SMS over SGs', icon: '💬' },
  { value: 'sms_nas', label_zh: 'SMS over NAS', label_en: 'SMS over NAS', icon: '💬' },
  { value: 'sms_ims', label_zh: 'SMS over IMS', label_en: 'SMS over IMS', icon: '💬' },
  { value: 'all', label_zh: '全部协议', label_en: 'All Protocols', icon: '🌐' },
];

/** 摘要步骤配置 */
export const SUMMARY_STEPS: { key: keyof TraceSummary; label_zh: string; label_en: string }[] = [
  { key: 'reg_ok', label_zh: '注册', label_en: 'Registration' },
  { key: 'auth_ok', label_zh: '鉴权', label_en: 'Authentication' },
  { key: 'session_ok', label_zh: '会话', label_en: 'Session' },
  { key: 'ims_reg_ok', label_zh: 'IMS 注册', label_en: 'IMS Reg' },
  { key: 'call_ok', label_zh: '通话', label_en: 'Call' },
  { key: 'sms_ok', label_zh: '短信', label_en: 'SMS' },
];
