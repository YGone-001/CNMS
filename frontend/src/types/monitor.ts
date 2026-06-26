// 单个进程状态 (与后端 monitor.ProcessStatus JSON 标签一致)
export interface ProcessStatus {
  name: string;
  pid: number;
  cpu_percent: number;
  memory_rss: number;
  memory_vms: number;
  memory_percent: number;
  running: boolean;
}

// 进程状态枚举
export type ProcessState = 'running' | 'stopped' | 'disabled' | 'not_installed' | 'expected_missing';

// 增强版进程状态
export interface ProcessStatusEnhanced {
  name: string;
  pid: number;
  cpu_percent: number;
  memory_rss: number;
  memory_vms: number;
  memory_percent: number;
  state: ProcessState;
  category: string;
  description: string;
  required: boolean;
}

// 状态摘要
export interface StatusSummary {
  total: number;
  running: number;
  stopped: number;
  disabled: number;
  not_installed: number;
  expected_missing: number;
}

// 增强版系统状态
export interface SystemStatusEnhanced {
  timestamp: number;
  processes: ProcessStatusEnhanced[];
  template: string;
  summary: StatusSummary;
}

// 部署模板
export interface DeploymentTemplate {
  name: string;
  description: string;
  components: ComponentConfig[];
}

// 组件配置
export interface ComponentConfig {
  name: string;
  required: boolean;
  enabled: boolean;
  category: string;
  desc: string;
}

// WebSocket 推送的完整数据结构 (与后端 monitor.SystemStatus 一致)
export interface MonitorSnapshot {
  timestamp: number;
  processes: ProcessStatus[];
}

// WebSocket 连接状态
export type WsStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';

// MML 命令响应 (与后端 handler.mmlResponse 一致)
export interface MmlResponse {
  status: 'ok' | 'error';
  message: string;
  imsi?: string;
}

// MML 终端历史条目
export interface MmlHistoryEntry {
  id: number;
  command: string;
  response: MmlResponse | LstSubResponse | null;
  error: string | null;
  timestamp: Date;
}

// 用户数据
export interface Subscriber {
  _id: string;
  imsi: string;
  subscribed_rau_tau_timer: number;
  network_access_mode: number;
  subscriber_status: number;
  access_restriction_data: number;
  security: { k: string; amf: string; op?: string; opc?: string };
  ambr: { downlink: { value: number; unit: number }; uplink: { value: number; unit: number } };
  sessions: { name: string; type: number; qos: number; ambr?: { downlink: { value: number; unit: number }; uplink: { value: number; unit: number } } }[];
}

// LST-SUB 响应 (含分页)
export interface LstSubResponse {
  status: 'ok' | 'error';
  message: string;
  subscribers?: Subscriber[];
  count?: number;
  page?: number;
  page_size?: number;
  total?: number;
}

// 告警事件
export interface Alarm {
  _id: string;
  severity: 'critical' | 'major' | 'minor' | 'warning';
  source: string;
  message: string;
  timestamp: string;
  first_occurrence?: string;
  count: number;
  acknowledged: boolean;
  ack_by?: string;
  ack_at?: string;
  cleared: boolean;
  cleared_by?: string;
  cleared_at?: string;
}

// NF 日志行
export interface LogLine {
  timestamp: string;
  level: string;
  message: string;
}

// 指标历史数据点
export interface MetricPoint {
  _id: string;
  name: string;
  pid: number;
  cpu_percent: number;
  memory_rss: number;
  memory_vms: number;
  memory_percent: number;
  running: boolean;
  timestamp: string;
}

// 审计日志
export interface AuditLogEntry {
  _id: string;
  user: string;
  action: string;
  resource: string;
  detail: string;
  ip: string;
  timestamp: string;
}

// 定时任务
export interface ScheduledTask {
  _id: string;
  name: string;
  type: string;
  cron: string;
  target: string;
  command: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
}

// 系统用户
export interface SystemUser {
  _id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  enabled: boolean;
  created_at: string;
  last_login?: string;
}

// P3: 站点
export interface Site {
  _id: string;
  name: string;
  address?: string;
  description?: string;
  enabled: boolean;
  nrf_url?: string;
  type?: 'region' | 'dc' | 'node';  // 站点类型
  parent_id?: string;                // 父站点 ID
  nf_ids?: string[];                 // 关联的 NF 进程名列表
  created_at: string;
}

// P3: 配置备份
export interface ConfigBackup {
  _id: string;
  nf_name: string;
  file_path: string;
  content?: string;
  checksum: string;
  size: number;
  version: number;
  comment?: string;
  created_at: string;
}

// P3: 统计摘要
export interface ReportSummary {
  period: string;
  total_nfs: number;
  online_nfs: number;
  offline_nfs: number;
  avg_cpu: number;
  avg_memory: number;
  max_cpu: number;
  max_cpu_name: string;
  max_memory: number;
  max_memory_name: string;
  total_alarms: number;
  critical_alarms: number;
  major_alarms: number;
  minor_alarms: number;
  warning_alarms: number;
  acknowledged_alarms: number;
  unacknowledged_alarms: number;
  availability_pct: number;
}

// P3: 发现的 NF
export interface DiscoveredNF {
  nf_type: string;
  nf_instance_id: string;
  ipv4: string[];
  sbi_endpoint: string;
  status: string;
  heart_beat_timer: number;
  last_seen: string;
}

// P5: 知识库附件
export interface KbAttachment {
  original_name: string;
  url: string;
  size: number;
  type: string;
}

// P5: 知识库条目
export interface KbSolution {
  _id: string;
  title: string;
  protocol: string;
  phenomenon: string;
  root_cause: string;
  solution: string;
  tags: string[];
  attachments: KbAttachment[];
  created_at: string;
  owner_id: string;
}

// P5: 知识库统计
export interface KbStats {
  status: string;
  total_solutions: number;
  top_tags: { tag: string; count: number }[];
  top_protocols: { protocol: string; count: number }[];
}

// P5: 知识库搜索响应
export interface KbSearchResponse {
  status: string;
  message: string;
  solutions: KbSolution[];
  count: number;
  page: number;
  page_size: number;
  total: number;
}
