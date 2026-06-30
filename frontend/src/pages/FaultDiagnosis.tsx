import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Network,
  Server,
  FileText,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Zap,
  Link2,
  Radio,
  Wifi,
  Phone,
  Search,
  Sparkles,
  Hash,
} from 'lucide-react';
import { authFetch } from '@/App';

// Fault types
type FaultType = 'ue_register' | 'volte_call' | 'no_audio' | 'dedicated_bearer' | 'nf_discovery';

interface FaultTypeOption {
  id: FaultType;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  count: number;
  recommended: boolean;
  alarmKeywords: string[];
}

const FAULT_TYPES_BASE: Omit<FaultTypeOption, 'count' | 'recommended'>[] = [
  {
    id: 'ue_register',
    label: 'UE 注册失败',
    icon: <Wifi className="w-5 h-5" />,
    description: '5G/LTE 注册流程异常',
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    alarmKeywords: ['注册', 'register', '鉴权', 'AUSF', 'authentication', 'reject'],
  },
  {
    id: 'volte_call',
    label: 'VoLTE 呼叫失败',
    icon: <Phone className="w-5 h-5" />,
    description: '语音通话建立失败',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    alarmKeywords: ['呼叫', 'call', 'INVITE', 'VoLTE', 'SIP', 'CSCF'],
  },
  {
    id: 'no_audio',
    label: '无声音',
    icon: <Radio className="w-5 h-5" />,
    description: '通话接通但无声音',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    alarmKeywords: ['RTP', 'rtpengine', '媒体', 'audio', '声音', 'SDP'],
  },
  {
    id: 'dedicated_bearer',
    label: '专用承载失败',
    icon: <Link2 className="w-5 h-5" />,
    description: 'QoS 流建立失败',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    alarmKeywords: ['承载', 'bearer', 'PFCP', 'QoS', 'UPF', 'SMF'],
  },
  {
    id: 'nf_discovery',
    label: 'NF 发现失败',
    icon: <Server className="w-5 h-5" />,
    description: '服务发现异常',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    alarmKeywords: ['NRF', 'discovery', '发现', '注册超时', '服务'],
  },
];

// Diagnosis result interfaces
interface DiagnosisStep {
  id: string;
  protocol: 'SIP' | 'Diameter' | 'HTTP' | 'GTP' | 'PFCP' | 'NAS' | 'RTP';
  step: string;
  status: 'success' | 'failure' | 'warning' | 'skipped';
  message: string;
  timestamp: string;
  source: string;
  destination: string;
  detail?: string;
}

interface DiagnosisResult {
  faultType: FaultType;
  status: 'success' | 'failure' | 'partial';
  summary: string;
  failureStep?: string;
  failureReason: string;
  evidence: string[];
  recommendations: string[];
  steps: DiagnosisStep[];
  affectedElements: string[];
}

export default function FaultDiagnosis() {
  const [selectedFault, setSelectedFault] = useState<FaultType | 'custom' | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [alarmMessages, setAlarmMessages] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    imsi: '',
    msisdn: '',
    timeFrom: '',
    timeTo: '',
    callingNumber: '',
    calledNumber: '',
    site: '',
    networkElement: '',
  });

  // Fetch alarms for AI recommendation
  useEffect(() => {
    const fetchAlarms = async () => {
      try {
        const resp = await authFetch('/api/v1/alarms?active=true&acknowledged=false&page_size=50');
        const data = await resp.json();
        if (data.status === 'ok' && data.alarms) {
          setAlarmMessages(data.alarms.map((a: { message: string }) => a.message));
        }
      } catch { /* ignore */ }
    };
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, []);

  // Build fault types with occurrence counts and AI recommendation
  const faultTypes = useMemo(() => {
    // Mock occurrence counts (in production, fetch from API)
    const counts: Record<FaultType, number> = {
      ue_register: 23,
      volte_call: 15,
      no_audio: 8,
      dedicated_bearer: 5,
      nf_discovery: 3,
    };

    const alarmText = alarmMessages.join(' ').toLowerCase();

    return FAULT_TYPES_BASE.map((ft) => {
      const matchCount = ft.alarmKeywords.filter((kw) => alarmText.includes(kw.toLowerCase())).length;
      return {
        ...ft,
        count: counts[ft.id],
        recommended: matchCount >= 2,
      };
    });
  }, [alarmMessages]);

  // Sort: recommended first, then by count
  const sortedFaultTypes = useMemo(() => {
    return [...faultTypes].sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return b.count - a.count;
    });
  }, [faultTypes]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const runDiagnosis = useCallback(async () => {
    if (!selectedFault) return;

    setIsDiagnosing(true);
    setResult(null);

    // Simulate diagnosis delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock diagnosis results based on fault type
    const mockResults: Record<FaultType, DiagnosisResult> = {
      ue_register: {
        faultType: 'ue_register',
        status: 'failure',
        summary: 'UE 注册流程在 AUSF 鉴权阶段失败',
        failureStep: 'Step 5: AUSF 鉴权向量获取',
        failureReason: 'AUSF 返回 5G-AV 失败，错误码: 5011 (Authentication Failure)',
        evidence: [
          'N12 接口: AMF -> AUSF POST /authentications 返回 401',
          'AUSF 日志: SUPI 验证失败，HSS 返回的鉴权向量无效',
          'HSS 日志: 用户 IMSI 460110000000001 状态正常',
        ],
        recommendations: [
          '检查 AUSF 与 UDM/ARPF 的 N35 接口连通性',
          '验证 HSS 鉴权向量生成配置',
          '确认 SUPI/SUPI 隐私保护配置正确',
          '检查 AUSF 鉴权算法配置 (5G-AKA vs EAP-AKA\')',
        ],
        steps: [
          { id: '1', protocol: 'NAS', step: 'RRC 建立', status: 'success', message: 'RRC 连接建立成功', timestamp: '10:30:01.100', source: 'UE', destination: 'gNB' },
          { id: '2', protocol: 'NAS', step: 'Registration Request', status: 'success', message: '初始注册请求发送', timestamp: '10:30:01.150', source: 'UE', destination: 'AMF' },
          { id: '3', protocol: 'HTTP', step: 'N8 查询 (AMF -> UDM)', status: 'success', message: '订阅数据获取成功', timestamp: '10:30:01.200', source: 'AMF', destination: 'UDM' },
          { id: '4', protocol: 'HTTP', step: 'N12 鉴权请求 (AMF -> AUSF)', status: 'success', message: '鉴权请求发送成功', timestamp: '10:30:01.250', source: 'AMF', destination: 'AUSF' },
          { id: '5', protocol: 'HTTP', step: 'N12 鉴权响应', status: 'failure', message: 'AUSF 返回 401 Unauthorized', timestamp: '10:30:01.300', source: 'AUSF', destination: 'AMF', detail: '错误码: 5011 - Authentication Failure\nAUSF 日志: 5G-AV 获取失败\n原因: UDM/ARPF 返回的鉴权向量无效' },
          { id: '6', protocol: 'NAS', step: 'Registration Reject', status: 'failure', message: '注册被拒绝', timestamp: '10:30:01.350', source: 'AMF', destination: 'UE', detail: 'Cause: #71 (Authentication failure)' },
        ],
        affectedElements: ['AMF', 'AUSF', 'UDM', 'HSS'],
      },
      volte_call: {
        faultType: 'volte_call',
        status: 'failure',
        summary: 'VoLTE 呼叫在 SIP INVITE 阶段失败',
        failureStep: 'Step 3: SIP INVITE 转发',
        failureReason: 'P-CSCF 返回 488 Not Acceptable Here，编解码协商失败',
        evidence: [
          'SIP 信令: INVITE sip:+8613800138000@ims.mnc011.mcc460.3gppnetwork.org',
          'P-CSCF 返回 488 (Not Acceptable Here)',
          'SDP 协商失败: 无法匹配编解码器',
        ],
        recommendations: [
          '检查 P-CSCF 的编解码器配置',
          '验证 UE 的 SDP offer 中的媒体格式',
          '确认 S-CSCF 的媒体协商策略',
          '检查 TAS 是否修改了 SDP',
        ],
        steps: [
          { id: '1', protocol: 'SIP', step: 'INVITE (UE -> P-CSCF)', status: 'success', message: 'INVITE 发送成功', timestamp: '10:35:01.100', source: 'UE', destination: 'P-CSCF' },
          { id: '2', protocol: 'SIP', step: 'INVITE (P-CSCF -> S-CSCF)', status: 'success', message: 'INVITE 转发成功', timestamp: '10:35:01.150', source: 'P-CSCF', destination: 'S-CSCF' },
          { id: '3', protocol: 'SIP', step: 'INVITE (S-CSCF -> TAS)', status: 'failure', message: 'TAS 返回 488', timestamp: '10:35:01.200', source: 'TAS', destination: 'S-CSCF', detail: 'SDP 协商失败\n原因: 编解码器不匹配\nOffer: AMR-WB, AMR\nAnswer: 无匹配编解码器' },
          { id: '4', protocol: 'SIP', step: '488 响应', status: 'failure', message: '呼叫失败', timestamp: '10:35:01.250', source: 'S-CSCF', destination: 'UE' },
        ],
        affectedElements: ['P-CSCF', 'S-CSCF', 'TAS', 'IMS'],
      },
      no_audio: {
        faultType: 'no_audio',
        status: 'partial',
        summary: '通话建立成功但 RTP 媒体流异常',
        failureStep: 'Step 6: RTP 媒体流建立',
        failureReason: 'RTPENGINE 未正确转发 RTP 包，SDP 中的 c= 行 IP 地址错误',
        evidence: [
          'SIP 信令: 200 OK 正常，SDP 协商成功',
          'RTPENGINE 日志: offer/answer 处理正常',
          '抓包: RTP 包发送到错误的 IP 地址',
        ],
        recommendations: [
          '检查 rtpengine_sock 配置',
          '验证 route[NATMANAGE] 路由逻辑',
          '检查 SDP 中的 c= 行和 m= 行',
          '确认 RTPENGINE 的 interface 配置',
        ],
        steps: [
          { id: '1', protocol: 'SIP', step: 'INVITE', status: 'success', message: 'INVITE 正常', timestamp: '10:40:01.100', source: 'UE-A', destination: 'P-CSCF' },
          { id: '2', protocol: 'SIP', step: '183 Session Progress', status: 'success', message: '183 正常', timestamp: '10:40:01.200', source: 'P-CSCF', destination: 'UE-A' },
          { id: '3', protocol: 'SIP', step: 'PRACK', status: 'success', message: 'PRACK 正常', timestamp: '10:40:01.300', source: 'UE-A', destination: 'P-CSCF' },
          { id: '4', protocol: 'SIP', step: '200 OK (PRACK)', status: 'success', message: '200 OK 正常', timestamp: '10:40:01.400', source: 'P-CSCF', destination: 'UE-A' },
          { id: '5', protocol: 'SIP', step: 'UPDATE', status: 'success', message: 'UPDATE 正常', timestamp: '10:40:01.500', source: 'UE-A', destination: 'P-CSCF' },
          { id: '6', protocol: 'RTP', step: 'RTP 媒体流', status: 'warning', message: 'RTP 包发送到错误 IP', timestamp: '10:40:02.000', source: 'UE-A', destination: 'RTPENGINE', detail: 'SDP c= 行: 192.168.1.100\n实际发送到: 10.0.0.1\n原因: RTPENGINE 未正确处理 NAT' },
          { id: '7', protocol: 'SIP', step: '200 OK (INVITE)', status: 'success', message: '通话建立', timestamp: '10:40:02.100', source: 'P-CSCF', destination: 'UE-A' },
        ],
        affectedElements: ['P-CSCF', 'RTPENGINE', 'SBC'],
      },
      dedicated_bearer: {
        faultType: 'dedicated_bearer',
        status: 'failure',
        summary: '专用承载建立失败',
        failureStep: 'Step 2: PFCP 会话建立',
        failureReason: 'SMF 返回 PFCP Session Establishment Response 失败，原因: 资源不足',
        evidence: [
          'N4 接口: SMF -> UPF PFCP Session Establishment Request',
          'UPF 返回: Cause: Request Rejected (Insufficient Resources)',
          'UPF 日志: QoS Flow 配置失败',
        ],
        recommendations: [
          '检查 UPF 的资源配额配置',
          '验证 QoS Flow 的 QER/FAR 配置',
          '确认 UPF 的接口带宽限制',
          '检查 SMF 的 PCC 规则配置',
        ],
        steps: [
          { id: '1', protocol: 'HTTP', step: 'N4 Session Establishment Request', status: 'success', message: '请求发送成功', timestamp: '10:45:01.100', source: 'SMF', destination: 'UPF' },
          { id: '2', protocol: 'PFCP', step: 'PFCP Session Establishment Response', status: 'failure', message: '请求被拒绝', timestamp: '10:45:01.200', source: 'UPF', destination: 'SMF', detail: 'Cause: Request Rejected\n原因: Insufficient Resources\nQFI: 5\nQER 配置失败' },
          { id: '3', protocol: 'HTTP', step: 'N11 响应', status: 'failure', message: '承载建立失败', timestamp: '10:45:01.300', source: 'SMF', destination: 'AMF' },
        ],
        affectedElements: ['SMF', 'UPF', 'PCF'],
      },
      nf_discovery: {
        faultType: 'nf_discovery',
        status: 'failure',
        summary: 'NF 服务发现失败',
        failureStep: 'Step 1: NRF 服务发现',
        failureReason: 'NRF 返回 404 Not Found，请求的 NF 服务不存在',
        evidence: [
          'Nnrf-disc 接口: NFProfile 查询失败',
          'NRF 日志: 未找到匹配的 NF 实例',
          '服务注册日志: NF 实例注册超时',
        ],
        recommendations: [
          '检查 NF 实例是否正常运行',
          '验证 NF 注册配置 (NRF 地址/端口)',
          '确认 NF 的 ServiceName 配置正确',
          '检查网络连通性 (NF -> NRF)',
        ],
        steps: [
          { id: '1', protocol: 'HTTP', step: 'Nnrf-disc 查询请求', status: 'success', message: '请求发送成功', timestamp: '10:50:01.100', source: 'Consumer NF', destination: 'NRF' },
          { id: '2', protocol: 'HTTP', step: 'Nnrf-disc 查询响应', status: 'failure', message: 'NRF 返回 404', timestamp: '10:50:01.200', source: 'NRF', destination: 'Consumer NF', detail: 'Status: 404 Not Found\n原因: 未找到匹配的 NF Profile\nServiceName: nsmf-pdusession\nTarget NF: SMF' },
          { id: '3', protocol: 'HTTP', step: '服务调用失败', status: 'failure', message: '无法调用目标服务', timestamp: '10:50:01.300', source: 'Consumer NF', destination: 'N/A' },
        ],
        affectedElements: ['NRF', 'SMF', 'AMF'],
      },
    };

    setResult(mockResults[selectedFault]);
    setIsDiagnosing(false);
  }, [selectedFault]);

  const runCustomDiagnosis = useCallback(async () => {
    if (!formData.imsi && !formData.msisdn) return;
    setIsDiagnosing(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 2500));
    const identifier = formData.imsi || formData.msisdn;
    setResult({
      faultType: 'ue_register',
      status: 'partial',
      summary: `用户 ${identifier} 全链路追踪完成`,
      failureReason: '检测到注册流程中存在鉴权延迟，呼叫流程正常，承载建立正常',
      evidence: [
        `IMSI: ${formData.imsi || '未提供'}, MSISDN: ${formData.msisdn || '未提供'}`,
        '注册流程: AMF → AUSF 鉴权延迟 1200ms（阈值 500ms）',
        '呼叫流程: INVITE → 200 OK 正常，RTP 媒体流正常',
        '承载流程: PFCP Session Establishment 正常',
      ],
      recommendations: [
        '检查 AUSF 服务器负载和响应时间',
        '验证 HSS 鉴权向量缓存配置',
        '监控 AUSF N35 接口延迟趋势',
      ],
      steps: [
        { id: '1', protocol: 'NAS', step: 'RRC 建立', status: 'success', message: 'RRC 连接建立成功', timestamp: '10:30:01.100', source: 'UE', destination: 'gNB' },
        { id: '2', protocol: 'NAS', step: 'Registration Request', status: 'success', message: '初始注册请求', timestamp: '10:30:01.150', source: 'UE', destination: 'AMF' },
        { id: '3', protocol: 'HTTP', step: 'N12 鉴权请求', status: 'warning', message: 'AUSF 响应延迟 1200ms', timestamp: '10:30:02.350', source: 'AMF', destination: 'AUSF', detail: '正常响应时间 < 500ms\n实际响应时间: 1200ms\n原因: AUSF 负载较高' },
        { id: '4', protocol: 'HTTP', step: 'N12 鉴权响应', status: 'success', message: '鉴权成功', timestamp: '10:30:02.400', source: 'AUSF', destination: 'AMF' },
        { id: '5', protocol: 'NAS', step: 'Registration Accept', status: 'success', message: '注册成功', timestamp: '10:30:02.500', source: 'AMF', destination: 'UE' },
        { id: '6', protocol: 'SIP', step: 'SIP REGISTER', status: 'success', message: 'IMS 注册成功', timestamp: '10:30:03.000', source: 'UE', destination: 'P-CSCF' },
        { id: '7', protocol: 'SIP', step: 'INVITE (测试呼叫)', status: 'success', message: '呼叫建立成功', timestamp: '10:30:05.000', source: 'UE', destination: 'P-CSCF' },
        { id: '8', protocol: 'RTP', step: 'RTP 媒体流', status: 'success', message: '媒体流正常', timestamp: '10:30:06.000', source: 'UE-A', destination: 'UE-B' },
      ],
      affectedElements: ['AMF', 'AUSF', 'P-CSCF'],
    });
    setIsDiagnosing(false);
  }, [formData.imsi, formData.msisdn]);

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'SIP': return 'bg-blue-500/10 text-blue-400';
      case 'Diameter': return 'bg-purple-500/10 text-purple-400';
      case 'HTTP': return 'bg-emerald-500/10 text-emerald-400';
      case 'GTP': return 'bg-amber-500/10 text-amber-400';
      case 'PFCP': return 'bg-red-500/10 text-red-400';
      case 'NAS': return 'bg-cyan-500/10 text-cyan-400';
      case 'RTP': return 'bg-orange-500/10 text-orange-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'failure': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'skipped': return <Clock className="w-4 h-4 text-gray-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'border-emerald-500/30';
      case 'failure': return 'border-red-500/30';
      case 'warning': return 'border-amber-500/30';
      case 'skipped': return 'border-gray-500/30';
      default: return 'border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-noc-text">故障诊断</h1>
        <p className="text-sm text-noc-muted mt-1">基于信令分析的自动化故障定位</p>
      </div>

      {/* Fault Type Selection */}
      <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-noc-text mb-4">选择故障类型</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {sortedFaultTypes.map((fault) => (
            <button
              key={fault.id}
              onClick={() => setSelectedFault(fault.id)}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                selectedFault === fault.id
                  ? `${fault.color} border-current shadow-lg`
                  : 'bg-noc-bg border-noc-border text-noc-muted hover:border-noc-accent/50'
              }`}
            >
              {/* AI recommendation badge */}
              {fault.recommended && (
                <div className="absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 bg-noc-accent text-white text-[10px] font-bold rounded-full shadow-lg">
                  <Sparkles className="w-3 h-3" />
                  AI 推荐
                </div>
              )}
              {/* Occurrence count badge */}
              <div className="absolute top-2 right-2">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  fault.count > 10 ? 'bg-red-500/20 text-red-400' : fault.count > 5 ? 'bg-amber-500/20 text-amber-400' : 'bg-noc-bg text-noc-muted'
                }`}>
                  <Hash className="w-2.5 h-2.5" />
                  {fault.count}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 pt-2">
                {fault.icon}
                <span className="text-sm font-medium">{fault.label}</span>
                <span className="text-xs opacity-75">{fault.description}</span>
                <span className="text-[10px] text-noc-muted">近7天发生 {fault.count} 次</span>
              </div>
            </button>
          ))}
          {/* Custom diagnosis card */}
          <button
            onClick={() => setSelectedFault('custom')}
            className={`relative p-4 rounded-lg border-2 transition-all ${
              selectedFault === 'custom'
                ? 'bg-noc-accent/10 border-noc-accent text-noc-accent shadow-lg'
                : 'bg-noc-bg border-dashed border-noc-border text-noc-muted hover:border-noc-accent/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2 pt-2">
              <Search className="w-5 h-5" />
              <span className="text-sm font-medium">自定义诊断</span>
              <span className="text-xs opacity-75">IMSI/MSISDN 全链路追踪</span>
            </div>
          </button>
        </div>
      </div>

      {/* Input Form */}
      {selectedFault && selectedFault !== 'custom' && (
        <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-noc-text mb-4">诊断参数</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-noc-muted mb-1">IMSI / MSISDN / SUPI</label>
              <input
                type="text"
                value={formData.imsi}
                onChange={(e) => handleInputChange('imsi', e.target.value)}
                placeholder="460110000000001"
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">时间范围 (从)</label>
              <input
                type="datetime-local"
                value={formData.timeFrom}
                onChange={(e) => handleInputChange('timeFrom', e.target.value)}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">时间范围 (到)</label>
              <input
                type="datetime-local"
                value={formData.timeTo}
                onChange={(e) => handleInputChange('timeTo', e.target.value)}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">主叫号码</label>
              <input
                type="text"
                value={formData.callingNumber}
                onChange={(e) => handleInputChange('callingNumber', e.target.value)}
                placeholder="+8613800138000"
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">被叫号码</label>
              <input
                type="text"
                value={formData.calledNumber}
                onChange={(e) => handleInputChange('calledNumber', e.target.value)}
                placeholder="+8613800138001"
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">站点</label>
              <select
                value={formData.site}
                onChange={(e) => handleInputChange('site', e.target.value)}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              >
                <option value="">全部站点</option>
                <option value="shanghai">上海数据中心</option>
                <option value="beijing">北京数据中心</option>
                <option value="guangzhou">广州数据中心</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">网元</label>
              <select
                value={formData.networkElement}
                onChange={(e) => handleInputChange('networkElement', e.target.value)}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              >
                <option value="">全部网元</option>
                <option value="amf">AMF</option>
                <option value="smf">SMF</option>
                <option value="upf">UPF</option>
                <option value="ausf">AUSF</option>
                <option value="pcscf">P-CSCF</option>
                <option value="scscf">S-CSCF</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={runDiagnosis}
                disabled={isDiagnosing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isDiagnosing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    诊断中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    开始诊断
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Diagnosis Form */}
      {selectedFault === 'custom' && (
        <div className="bg-noc-surface border border-noc-accent/30 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-noc-text mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-noc-accent" />
            自定义全链路追踪
          </h2>
          <p className="text-sm text-noc-muted mb-4">输入 IMSI 或 MSISDN，系统将自动追踪该用户的完整信令流程，覆盖注册、呼叫、承载等全部环节。</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-noc-muted mb-1">IMSI / SUPI <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={formData.imsi}
                onChange={(e) => handleInputChange('imsi', e.target.value)}
                placeholder="460110000000001"
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">MSISDN / 电话号码</label>
              <input
                type="text"
                value={formData.msisdn}
                onChange={(e) => handleInputChange('msisdn', e.target.value)}
                placeholder="+8613800138000"
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text placeholder-noc-muted focus:outline-none focus:border-noc-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-noc-muted mb-1">时间范围</label>
              <input
                type="datetime-local"
                value={formData.timeFrom}
                onChange={(e) => handleInputChange('timeFrom', e.target.value)}
                className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runCustomDiagnosis}
              disabled={isDiagnosing || (!formData.imsi && !formData.msisdn)}
              className="flex items-center justify-center gap-2 px-6 py-2 bg-noc-accent text-white rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isDiagnosing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  追踪中...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  启动全链路追踪
                </>
              )}
            </button>
            <span className="text-xs text-noc-muted">至少填写 IMSI 或 MSISDN 其中一项</span>
          </div>
        </div>
      )}

      {/* Diagnosis Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className={`bg-noc-surface border rounded-lg p-6 ${
            result.status === 'failure' ? 'border-red-500/30' :
            result.status === 'partial' ? 'border-amber-500/30' :
            'border-emerald-500/30'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {result.status === 'failure' ? (
                    <XCircle className="w-6 h-6 text-red-400" />
                  ) : result.status === 'partial' ? (
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  )}
                  <h3 className="text-lg font-semibold text-noc-text">诊断结果</h3>
                </div>
                <p className="text-noc-text">{result.summary}</p>
                {result.failureStep && (
                  <p className="text-sm text-red-400 mt-1">失败步骤: {result.failureStep}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 text-noc-muted hover:text-noc-text transition-colors" title="复制">
                  <Copy className="w-4 h-4" />
                </button>
                <button className="p-2 text-noc-muted hover:text-noc-text transition-colors" title="下载">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Affected Elements */}
          <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-noc-text mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-noc-accent" />
              影响网元
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.affectedElements.map((element) => (
                <span key={element} className="px-3 py-1.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text">
                  {element}
                </span>
              ))}
            </div>
          </div>

          {/* Failure Reason */}
          <div className="bg-noc-surface border border-red-500/20 rounded-lg p-6">
            <h3 className="text-base font-semibold text-red-400 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              失败原因
            </h3>
            <p className="text-noc-text bg-red-500/5 p-4 rounded-lg font-mono text-sm">
              {result.failureReason}
            </p>
          </div>

          {/* Link Diagram */}
          <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-noc-text mb-4 flex items-center gap-2">
              <Network className="w-4 h-4 text-noc-accent" />
              信令流程图
            </h3>
            <div className="space-y-2">
              {result.steps.map((step, index) => (
                <div key={step.id}>
                  <div
                    className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer border-l-4 ${getStatusColor(step.status)} ${
                      expandedSteps.has(step.id) ? 'bg-noc-bg' : 'hover:bg-noc-bg/50'
                    } transition-colors`}
                    onClick={() => toggleStep(step.id)}
                  >
                    <div className="flex-shrink-0 w-8 text-center">
                      {expandedSteps.has(step.id) ? (
                        <ChevronDown className="w-4 h-4 text-noc-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-noc-muted" />
                      )}
                    </div>
                    <div className="flex-shrink-0">{getStatusIcon(step.status)}</div>
                    <div className="flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getProtocolColor(step.protocol)}`}>
                        {step.protocol}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-noc-text">{step.step}</div>
                      <div className="text-xs text-noc-muted truncate">{step.message}</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs text-noc-muted">{step.source} → {step.destination}</div>
                      <div className="text-xs text-noc-muted">{step.timestamp}</div>
                    </div>
                  </div>
                  {expandedSteps.has(step.id) && step.detail && (
                    <div className="ml-12 mt-2 mb-4 p-4 bg-noc-bg rounded-lg border border-noc-border">
                      <pre className="text-xs text-noc-text whitespace-pre-wrap font-mono">{step.detail}</pre>
                    </div>
                  )}
                  {index < result.steps.length - 1 && (
                    <div className="ml-12 h-2 border-l border-dashed border-noc-border" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Evidence */}
          <div className="bg-noc-surface border border-noc-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-noc-text mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-noc-accent" />
              证据日志
            </h3>
            <div className="space-y-2">
              {result.evidence.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-noc-bg rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-noc-surface border border-noc-border rounded-full text-xs text-noc-muted">
                    {index + 1}
                  </span>
                  <p className="text-sm text-noc-text font-mono">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-noc-surface border border-emerald-500/20 rounded-lg p-6">
            <h3 className="text-base font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              推荐修复动作
            </h3>
            <div className="space-y-2">
              {result.recommendations.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-emerald-500/5 rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold">
                    {index + 1}
                  </span>
                  <p className="text-sm text-noc-text">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
