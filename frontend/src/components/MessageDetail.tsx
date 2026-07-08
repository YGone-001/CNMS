import React, { useState, useCallback, memo, useMemo } from 'react';
import {
  X,
  Copy,
  ExternalLink,
  ArrowRight,
  FileText,
  Link2,
  Layers,
  Info,
  Database,
} from 'lucide-react';
import type { SignalingMessage, SignalingProtocol } from '@/types/signaling';
import { PROTOCOL_TEXT_COLORS, DATA_SOURCE_LABELS } from '@/types/signaling';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageDetailProps {
  message: SignalingMessage | null;
  onClose: () => void;
  onNavigate?: (queryType: string, queryValue: string) => void;
}

type TabKey = 'summary' | 'sdp' | 'raw' | 'relations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').replace('Z', '');
  } catch {
    return ts;
  }
}

function protoBadgeClass(proto: SignalingProtocol): string {
  return PROTOCOL_TEXT_COLORS[proto] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

function directionArrow(dir: string): string {
  switch (dir) {
    case 'request': return '→';
    case 'response': return '←';
    case 'indication': return '⇢';
    default: return '→';
  }
}

function directionColor(dir: string): string {
  switch (dir) {
    case 'request': return 'text-blue-400';
    case 'response': return 'text-green-400';
    case 'indication': return 'text-yellow-400';
    default: return 'text-gray-400';
  }
}

function statusCodeColor(code?: number): string {
  if (!code) return '';
  if (code >= 200 && code < 300) return 'text-green-400';
  if (code >= 400) return 'text-red-400';
  return 'text-yellow-400';
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Parse SDP from details or raw_preview */
function parseSDP(msg: SignalingMessage): SDPMedia[] {
  const raw = (msg.details?.sdp as string) || msg.raw_preview || '';
  if (!raw.includes('m=')) return [];

  const sections = raw.split(/\r?\n(?=m=)/);
  return sections
    .filter((s) => s.startsWith('m='))
    .map((section) => {
      const lines = section.split(/\r?\n/);
      const mLine = lines[0] || '';
      // m=audio 49170 RTP/AVP 0 8 97
      const mParts = mLine.split(/\s+/);
      const mediaType = mParts[0]?.replace('m=', '') || 'audio';
      const port = parseInt(mParts[1] || '0', 10);
      const payloads = mParts.slice(3).join(' ');

      let codec = '';
      let ip = '';
      let ptime = '';
      let direction = 'sendrecv';

      for (const line of lines) {
        if (line.startsWith('a=rtpmap:')) {
          // a=rtpmap:97 opus/48000/2
          const rp = line.replace('a=rtpmap:', '').split(/\s+/);
          codec = rp[1] || '';
        }
        if (line.startsWith('c=IN IP4 ')) {
          ip = line.replace('c=IN IP4 ', '').split('/')[0];
        }
        if (line.startsWith('a=ptime:')) {
          ptime = line.replace('a=ptime:', '');
        }
        if (line.startsWith('a=sendrecv') || line.startsWith('a=sendonly') ||
            line.startsWith('a=recvonly') || line.startsWith('a=inactive')) {
          direction = line.replace('a=', '');
        }
      }

      return { mediaType, port, payloads, codec, ip, ptime, direction };
    });
}

interface SDPMedia {
  mediaType: string;
  port: number;
  payloads: string;
  codec: string;
  ip: string;
  ptime: string;
  direction: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Key-value row */
const KVRow = memo(function KVRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (isEmpty(value) || value === '-') return null;
  return (
    <tr className="border-b border-noc-border/50 last:border-0">
      <td className="px-3 py-1.5 text-xs text-noc-muted whitespace-nowrap w-40 align-top">{label}</td>
      <td className={`px-3 py-1.5 text-xs text-noc-text break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </td>
    </tr>
  );
});

/** Tab button */
const TabBtn = memo(function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-sky-500 text-sky-400'
          : 'border-transparent text-noc-muted hover:text-noc-text hover:border-noc-border'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="px-1 py-0 text-[10px] rounded-full bg-noc-bg-50 text-noc-muted">{badge}</span>
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Protocol-specific summary fields
// ---------------------------------------------------------------------------

function getSummaryRows(msg: SignalingMessage): { label: string; value: string | number; mono?: boolean }[] {
  const rows: { label: string; value: string | number; mono?: boolean }[] = [];
  const d = msg.details || {};

  // Common fields
  rows.push({ label: 'Protocol', value: msg.protocol });
  rows.push({ label: 'Interface', value: msg.interface });
  rows.push({ label: 'Direction', value: msg.direction });
  rows.push({ label: 'Method', value: msg.method });

  if (msg.status_code) {
    rows.push({ label: 'Status Code', value: `${msg.status_code} ${msg.status_text || ''}` });
  }

  // Helper: safely convert unknown to string
  const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

  // Protocol-specific
  switch (msg.protocol) {
    case 'SIP':
      if (d.from) rows.push({ label: 'From', value: s(d.from), mono: true });
      if (d.to) rows.push({ label: 'To', value: s(d.to), mono: true });
      if (msg.call_id) rows.push({ label: 'Call-ID', value: msg.call_id, mono: true });
      if (d.cseq) rows.push({ label: 'CSeq', value: s(d.cseq) });
      if (d.via) rows.push({ label: 'Via', value: s(d.via), mono: true });
      if (d.contact) rows.push({ label: 'Contact', value: s(d.contact), mono: true });
      if (d['record-route']) rows.push({ label: 'Record-Route', value: s(d['record-route']), mono: true });
      if (d['content-type']) rows.push({ label: 'Content-Type', value: s(d['content-type']) });
      break;

    case 'NAS':
      if (d.message_type) rows.push({ label: 'Message Type', value: s(d.message_type) });
      if (d.security_header) rows.push({ label: 'Security Header', value: s(d.security_header) });
      if (d.protocol_discriminator) rows.push({ label: 'Protocol Discriminator', value: s(d.protocol_discriminator) });
      if (d.ie_list) rows.push({ label: 'IEs', value: s(d.ie_list) });
      break;

    case 'Diameter':
      if (d.cmd_code) rows.push({ label: 'Command Code', value: s(d.cmd_code) });
      if (d.app_id) rows.push({ label: 'Application ID', value: s(d.app_id) });
      if (d.session_id) rows.push({ label: 'Session-ID', value: s(d.session_id), mono: true });
      if (d.result_code) rows.push({ label: 'Result Code', value: s(d.result_code) });
      if (d.origin_host) rows.push({ label: 'Origin-Host', value: s(d.origin_host), mono: true });
      if (d.origin_realm) rows.push({ label: 'Origin-Realm', value: s(d.origin_realm) });
      if (d.avps) rows.push({ label: 'AVPs', value: s(d.avps) });
      break;

    case 'GTPv2C':
    case 'GTPU':
      if (d.message_type) rows.push({ label: 'Message Type', value: s(d.message_type) });
      if (msg.identifiers.teid) rows.push({ label: 'TEID', value: msg.identifiers.teid, mono: true });
      if (d.sequence_number) rows.push({ label: 'Sequence Number', value: s(d.sequence_number) });
      if (d.cause) rows.push({ label: 'Cause', value: s(d.cause) });
      if (d.apn) rows.push({ label: 'APN', value: s(d.apn) });
      if (d.bearer_id) rows.push({ label: 'Bearer ID', value: s(d.bearer_id) });
      break;

    case 'PFCP':
      if (d.message_type) rows.push({ label: 'Message Type', value: s(d.message_type) });
      if (d.seid) rows.push({ label: 'SEID', value: s(d.seid), mono: true });
      if (d.sequence_number) rows.push({ label: 'Sequence Number', value: s(d.sequence_number) });
      if (d.cause) rows.push({ label: 'Cause', value: s(d.cause) });
      if (d.pdr) rows.push({ label: 'PDR', value: s(d.pdr) });
      if (d.far) rows.push({ label: 'FAR', value: s(d.far) });
      if (d.qer) rows.push({ label: 'QER', value: s(d.qer) });
      break;

    case 'SBI':
      if (d.http_method) rows.push({ label: 'HTTP Method', value: s(d.http_method) });
      if (d.url_path) rows.push({ label: 'URL Path', value: s(d.url_path), mono: true });
      if (d.http_status) rows.push({ label: 'HTTP Status', value: s(d.http_status) });
      if (d.request_body) rows.push({ label: 'Request Body', value: s(d.request_body).slice(0, 500) });
      if (d.response_body) rows.push({ label: 'Response Body', value: s(d.response_body).slice(0, 500) });
      break;

    case 'NGAP':
    case 'S1AP':
      if (d.procedure_code) rows.push({ label: 'Procedure Code', value: s(d.procedure_code) });
      if (d.procedure_name) rows.push({ label: 'Procedure', value: s(d.procedure_name) });
      if (d.criticality) rows.push({ label: 'Criticality', value: s(d.criticality) });
      break;

    case 'RTP':
    case 'RTCP':
      if (d.ssrc) rows.push({ label: 'SSRC', value: s(d.ssrc), mono: true });
      if (d.payload_type) rows.push({ label: 'Payload Type', value: s(d.payload_type) });
      if (d.codec) rows.push({ label: 'Codec', value: s(d.codec) });
      if (d.sequence) rows.push({ label: 'Sequence', value: s(d.sequence) });
      if (d.timestamp_val) rows.push({ label: 'RTP Timestamp', value: s(d.timestamp_val) });
      break;
  }

  // Add remaining details not already shown
  const shownLabels = new Set(rows.map((r) => r.label.toLowerCase()));
  for (const [k, v] of Object.entries(d)) {
    if (!isEmpty(v) && !shownLabels.has(k.toLowerCase())) {
      rows.push({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v), mono: true });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function MessageDetailInner({ message, onClose, onNavigate }: MessageDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [copied, setCopied] = useState(false);

  // SDP parsed data
  const sdpMedia = useMemo(() => (message ? parseSDP(message) : []), [message]);
  const hasSDP = sdpMedia.length > 0;

  // Summary rows
  const summaryRows = useMemo(() => (message ? getSummaryRows(message) : []), [message]);

  // Identifiers (non-empty)
  const identifierEntries = useMemo(() => {
    if (!message) return [];
    return Object.entries(message.identifiers).filter(([, v]) => !isEmpty(v));
  }, [message]);

  // Copy JSON
  const handleCopyJSON = useCallback(async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(message, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(message, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [message]);

  // Copy raw preview
  const handleCopyRaw = useCallback(async () => {
    if (!message?.raw_preview) return;
    try {
      await navigator.clipboard.writeText(message.raw_preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [message]);

  // Navigate (new trace from identifier)
  const handleNavigate = useCallback(
    (key: string, value: string) => {
      if (onNavigate) {
        onNavigate(key, value);
      }
    },
    [onNavigate],
  );

  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-noc-muted text-sm">
        <FileText className="w-8 h-8 mb-2 opacity-30" />
        Select a message to view details
      </div>
    );
  }

  const badgeClass = protoBadgeClass(message.protocol);
  const isError = message.status_code ? message.status_code >= 400 : false;

  return (
    <div className="flex flex-col bg-noc-surface rounded-xl border border-noc-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-noc-border bg-noc-bg-50">
        <div className="flex items-center gap-2 min-w-0">
          {/* Protocol badge */}
          <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded border ${badgeClass}`}>
            {message.protocol}
          </span>
          {/* Method + status */}
          <span className="text-sm font-semibold text-noc-text truncate">{message.method}</span>
          {message.status_code && (
            <span className={`text-sm font-mono font-bold ${statusCodeColor(message.status_code)}`}>
              {message.status_code}
            </span>
          )}
          {isError && <span className="text-xs text-red-400">⚠</span>}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-noc-muted hover:text-noc-text transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Direction + addresses */}
      <div className="px-4 py-2 border-b border-noc-border flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {/* Entities */}
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-noc-text">{message.src_entity}</span>
          <span className={`text-base ${directionColor(message.direction)}`}>
            {directionArrow(message.direction)}
          </span>
          <span className="font-semibold text-noc-text">{message.dst_entity}</span>
        </div>
        {/* IP addresses */}
        {message.src_ip && (
          <span className="font-mono text-noc-muted">
            {message.src_ip}:{message.src_port || '?'} → {message.dst_ip}:{message.dst_port || '?'}
          </span>
        )}
        {/* Timestamp */}
        <span className="text-noc-muted ml-auto">{formatTimestamp(message.timestamp)}</span>
        {/* Data source badge */}
        {message.data_source && (() => {
          const ds = DATA_SOURCE_LABELS[message.data_source];
          return ds ? (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border ${ds.color}`}>
              {message.data_source === 'hep' && <Layers className="w-2.5 h-2.5" />}
              {message.data_source === 'hep_mongo' && <Database className="w-2.5 h-2.5" />}
              {ds.zh}
            </span>
          ) : null;
        })()}
        {/* Cross-layer indicator */}
        {message.cross_layer && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border bg-amber-500/20 text-amber-400 border-amber-500/30" title="Cross-layer correlated (SIP <-> NAS/S1AP)">
            <Link2 className="w-2.5 h-2.5" />
            Cross
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-noc-border px-2">
        <TabBtn active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} icon={Info} label="Summary" />
        {hasSDP && (
          <TabBtn active={activeTab === 'sdp'} onClick={() => setActiveTab('sdp')} icon={Layers} label="SDP" badge={sdpMedia.length} />
        )}
        <TabBtn active={activeTab === 'raw'} onClick={() => setActiveTab('raw')} icon={FileText} label="Raw" />
        <TabBtn active={activeTab === 'relations'} onClick={() => setActiveTab('relations')} icon={Link2} label="Relations" badge={identifierEntries.length} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto max-h-[400px]">
        {/* Summary tab */}
        {activeTab === 'summary' && (
          <table className="w-full">
            <tbody>
              {summaryRows.map((row) => (
                <KVRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
              ))}
              {summaryRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-xs text-noc-muted">
                    No summary fields available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* SDP tab */}
        {activeTab === 'sdp' && (
          <div className="p-3 space-y-3">
            {sdpMedia.map((m, i) => (
              <div key={i} className="bg-noc-bg rounded-lg border border-noc-border overflow-hidden">
                <div className="px-3 py-2 bg-noc-bg-50 border-b border-noc-border flex items-center gap-2">
                  <span className="text-xs font-semibold text-noc-text uppercase">{m.mediaType}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-noc-surface text-noc-muted border border-noc-border">
                    {m.direction}
                  </span>
                </div>
                <table className="w-full">
                  <tbody>
                    <KVRow label="Codec" value={m.codec || m.payloads} mono />
                    <KVRow label="Port" value={String(m.port)} />
                    <KVRow label="IP" value={m.ip} mono />
                    {m.ptime && <KVRow label="Ptime" value={`${m.ptime}ms`} />}
                    <KVRow label="Payloads" value={m.payloads} mono />
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Raw tab */}
        {activeTab === 'raw' && (
          <div className="relative">
            <button
              onClick={handleCopyRaw}
              className="absolute top-2 right-2 p-1.5 rounded bg-noc-surface border border-noc-border text-noc-muted hover:text-noc-text transition-colors z-10"
              title="Copy raw data"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <pre className="p-4 text-[11px] leading-relaxed text-noc-muted font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {message.raw_preview || 'No raw data available'}
            </pre>
          </div>
        )}

        {/* Relations tab */}
        {activeTab === 'relations' && (
          <div className="p-3 space-y-2">
            {/* Identifiers */}
            {identifierEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-noc-text mb-1.5 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> User Identifiers
                </h4>
                <div className="space-y-1">
                  {identifierEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 px-3 py-1.5 bg-noc-bg rounded border border-noc-border group"
                    >
                      <span className="text-[10px] font-semibold text-noc-muted uppercase w-20 shrink-0">
                        {key}
                      </span>
                      <span className="text-xs font-mono text-noc-text flex-1 truncate">{String(value)}</span>
                      <button
                        onClick={() => handleNavigate(key, String(value))}
                        className="p-0.5 text-noc-muted opacity-0 group-hover:opacity-100 hover:text-sky-400 transition-all"
                        title="Trace this identifier"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session / Call / TEID */}
            {(message.session_id || message.call_id || message.identifiers.teid) && (
              <div>
                <h4 className="text-xs font-semibold text-noc-text mb-1.5 mt-3">Session References</h4>
                <div className="space-y-1">
                  {message.session_id && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-noc-bg rounded border border-noc-border">
                      <span className="text-[10px] font-semibold text-noc-muted uppercase w-20 shrink-0">Session</span>
                      <span className="text-xs font-mono text-noc-text">{message.session_id}</span>
                    </div>
                  )}
                  {message.call_id && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-noc-bg rounded border border-noc-border">
                      <span className="text-[10px] font-semibold text-noc-muted uppercase w-20 shrink-0">Call-ID</span>
                      <span className="text-xs font-mono text-noc-text truncate flex-1">{message.call_id}</span>
                    </div>
                  )}
                  {message.identifiers.teid && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-noc-bg rounded border border-noc-border">
                      <span className="text-[10px] font-semibold text-noc-muted uppercase w-20 shrink-0">TEID</span>
                      <span className="text-xs font-mono text-noc-text">{message.identifiers.teid}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {identifierEntries.length === 0 && !message.session_id && !message.call_id && (
              <div className="text-center text-xs text-noc-muted py-6">
                No related identifiers
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-noc-border bg-noc-bg-50">
        <button
          onClick={handleCopyJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-noc-surface border border-noc-border text-noc-muted hover:text-noc-text hover:border-noc-border/80 transition-colors"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
        <button
          onClick={() => {
            const el = document.getElementById(`ladder-msg-${message.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-noc-surface border border-noc-border text-noc-muted hover:text-noc-text hover:border-noc-border/80 transition-colors"
        >
          <ArrowRight className="w-3 h-3" />
          Jump to Ladder
        </button>
      </div>
    </div>
  );
}

export default memo(MessageDetailInner);
