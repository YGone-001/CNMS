import { useMemo, useState, useRef, useCallback, useEffect, memo } from 'react';
import type { SignalingMessage, SignalingProtocol } from '@/types/signaling';
import { PROTOCOL_COLORS } from '@/types/signaling';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_HEIGHT = 56;       // column header area height
const ROW_HEIGHT = 52;          // vertical space per message
const MIN_COL_WIDTH = 120;
const MAX_COL_WIDTH = 200;
const TIME_COL_WIDTH = 90;      // left time column width
const LIFELINE_PAD = 24;        // padding above/below lifeline
const ARROW_LABEL_OFFSET = -6;  // label offset above arrow
const MIN_MSG_GAP = 40;         // min px between messages
const MAX_MSG_GAP = 80;         // max px between messages
const BREAK_THRESHOLD_MS = 1000; // time gap > 1s → break marker

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LadderDiagramProps {
  messages: SignalingMessage[];
  entities: string[];
  selectedMessageId?: string;
  onMessageSelect: (msg: SignalingMessage) => void;
  protocolFilter?: SignalingProtocol | 'ALL';
  searchKeyword?: string;
}

interface LayoutRow {
  msg: SignalingMessage;
  y: number;
  srcCol: number;
  dstCol: number;
  isError: boolean;
  isMedia: boolean;
  isSelf: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return ts;
  }
}

function isError(msg: SignalingMessage): boolean {
  if (msg.status_code && msg.status_code >= 400) return true;
  const lm = msg.method.toLowerCase();
  if (lm.includes('reject') || lm.includes('failure') || lm.includes('error')) return true;
  return false;
}

function isMedia(msg: SignalingMessage): boolean {
  return msg.protocol === 'RTP' || msg.protocol === 'RTCP';
}

function msgLabel(msg: SignalingMessage): string {
  const parts: string[] = [];
  parts.push(`[${msg.protocol}]`);
  parts.push(msg.method);
  if (msg.status_code) parts.push(String(msg.status_code));
  return parts.join(' ');
}

function msgTooltip(msg: SignalingMessage): string {
  const lines: string[] = [];
  lines.push(`${msg.protocol} ${msg.method}`);
  if (msg.status_code) lines.push(`Status: ${msg.status_code} ${msg.status_text || ''}`);
  lines.push(`${msg.src_entity} → ${msg.dst_entity}`);
  lines.push(`${msg.interface} / ${msg.direction}`);
  if (msg.src_ip) lines.push(`IP: ${msg.src_ip}:${msg.src_port || ''} → ${msg.dst_ip}:${msg.dst_port || ''}`);
  if (msg.identifiers.imsi) lines.push(`IMSI: ${msg.identifiers.imsi}`);
  if (msg.call_id) lines.push(`Call-ID: ${msg.call_id}`);
  lines.push(formatTimestamp(msg.timestamp));
  return lines.join('\n');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Column header with entity name */
const ColumnHeader = memo(function ColumnHeader({
  name,
  x,
  width,
}: {
  name: string;
  x: number;
  width: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={0}
        width={width}
        height={HEADER_HEIGHT}
        className="fill-noc-surface"
        stroke="none"
      />
      <text
        x={x + width / 2}
        y={HEADER_HEIGHT / 2 + 4}
        textAnchor="middle"
        className="fill-noc-text text-[11px] font-semibold"
        style={{ fontFamily: 'monospace' }}
      >
        {name}
      </text>
      {/* bottom separator */}
      <line
        x1={x}
        y1={HEADER_HEIGHT}
        x2={x + width}
        y2={HEADER_HEIGHT}
        className="stroke-noc-border"
        strokeWidth={1}
      />
    </g>
  );
});

/** Vertical lifeline */
const Lifeline = memo(function Lifeline({
  x,
  y1,
  y2,
}: {
  x: number;
  y1: number;
  y2: number;
}) {
  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      className="stroke-gray-300 dark:stroke-gray-600"
      strokeWidth={1}
      strokeDasharray="4 3"
    />
  );
});

/** Time break marker (wavy line) */
const TimeBreak = memo(function TimeBreak({ y, width }: { y: number; width: number }) {
  const d = useMemo(() => {
    let path = `M 0 ${y}`;
    const waveW = 8;
    const waveH = 3;
    const count = Math.floor(width / waveW);
    for (let i = 0; i < count; i++) {
      const x1 = i * waveW + waveW / 4;
      const x2 = i * waveW + (waveW * 3) / 4;
      const x3 = (i + 1) * waveW;
      path += ` Q ${x1} ${y - waveH} ${x2} ${y + waveH} L ${x3} ${y}`;
    }
    return path;
  }, [y, width]);

  return (
    <path
      d={d}
      fill="none"
      className="stroke-yellow-400 dark:stroke-yellow-500"
      strokeWidth={1.5}
      opacity={0.6}
    />
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function LadderDiagramInner({
  messages,
  entities,
  selectedMessageId,
  onMessageSelect,
  protocolFilter = 'ALL',
  searchKeyword = '',
}: LadderDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Observe container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Column positions
  const { colPositions, colWidth, totalWidth } = useMemo(() => {
    const n = entities.length;
    if (n === 0) return { colPositions: [] as number[], colWidth: MIN_COL_WIDTH, totalWidth: TIME_COL_WIDTH + MIN_COL_WIDTH };
    const avail = Math.max(MIN_COL_WIDTH * n, 800);
    const w = clamp(Math.floor(avail / n), MIN_COL_WIDTH, MAX_COL_WIDTH);
    const positions = entities.map((_, i) => TIME_COL_WIDTH + i * w + w / 2);
    return { colPositions: positions, colWidth: w, totalWidth: TIME_COL_WIDTH + n * w };
  }, [entities]);

  // Filter messages
  const filtered = useMemo(() => {
    let list = messages;
    if (protocolFilter !== 'ALL') {
      list = list.filter((m) => m.protocol === protocolFilter);
    }
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(
        (m) =>
          m.method.toLowerCase().includes(kw) ||
          m.protocol.toLowerCase().includes(kw) ||
          m.src_entity.toLowerCase().includes(kw) ||
          m.dst_entity.toLowerCase().includes(kw) ||
          (m.identifiers.imsi || '').includes(kw) ||
          (m.call_id || '').includes(kw),
      );
    }
    return list;
  }, [messages, protocolFilter, searchKeyword]);

  // Layout rows
  const { rows, totalHeight } = useMemo(() => {
    if (filtered.length === 0) return { rows: [] as LayoutRow[], totalHeight: HEADER_HEIGHT + LIFELINE_PAD * 2 };

    const entityIdx = new Map(entities.map((e, i) => [e, i]));
    const result: LayoutRow[] = [];
    let y = HEADER_HEIGHT + LIFELINE_PAD;

    for (let i = 0; i < filtered.length; i++) {
      const msg = filtered[i];
      const srcCol = entityIdx.get(msg.src_entity) ?? -1;
      const dstCol = entityIdx.get(msg.dst_entity) ?? -1;

      // Calculate gap from previous message
      if (i > 0) {
        const prev = filtered[i - 1];
        const dt = new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime();
        const gap = clamp(dt / 10, MIN_MSG_GAP, MAX_MSG_GAP);
        y += gap;
      }

      result.push({
        msg,
        y,
        srcCol,
        dstCol,
        isError: isError(msg),
        isMedia: isMedia(msg),
        isSelf: srcCol === dstCol,
      });
    }

    return { rows: result, totalHeight: y + LIFELINE_PAD + ROW_HEIGHT };
  }, [filtered, entities]);

  // Time break points
  const breakPoints = useMemo(() => {
    const breaks: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const dt = new Date(rows[i].msg.timestamp).getTime() - new Date(rows[i - 1].msg.timestamp).getTime();
      if (dt > BREAK_THRESHOLD_MS) {
        breaks.push((rows[i].y + rows[i - 1].y) / 2);
      }
    }
    return breaks;
  }, [rows]);

  // Visible range for virtual scrolling
  const visibleRange = useMemo(() => {
    const start = Math.max(0, scrollTop - 200);
    const end = scrollTop + containerHeight + 200;
    const startIdx = rows.findIndex((r) => r.y + ROW_HEIGHT >= start);
    const endIdx = rows.findIndex((r) => r.y > end);
    return {
      start: startIdx >= 0 ? startIdx : 0,
      end: endIdx >= 0 ? endIdx + 1 : rows.length,
    };
  }, [scrollTop, containerHeight, rows]);

  // Hover handlers
  const handleArrowEnter = useCallback(
    (msg: SignalingMessage, e: React.MouseEvent) => {
      setHoveredId(msg.id);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltip({
          x: e.clientX - rect.left + 12,
          y: e.clientY - rect.top - 8,
          text: msgTooltip(msg),
        });
      }
    },
    [],
  );

  const handleArrowLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  const handleArrowClick = useCallback(
    (msg: SignalingMessage) => {
      onMessageSelect(msg);
    },
    [onMessageSelect],
  );

  // Render — 防御性检查，防止空数据导致渲染错误
  if (!entities || entities.length === 0 || !messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-noc-muted text-sm">
        No messages to display
      </div>
    );
  }

  const svgHeight = Math.max(totalHeight, containerHeight);
  const lifelineY1 = HEADER_HEIGHT;
  const lifelineY2 = svgHeight;

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto border border-noc-border rounded-lg bg-noc-bg"
      onScroll={handleScroll}
      style={{ height: '100%', minHeight: 400 }}
    >
      <svg
        width={totalWidth}
        height={svgHeight}
        className="select-none"
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect width={totalWidth} height={svgHeight} className="fill-noc-bg" />

        {/* Column headers (sticky via transform) */}
        <g transform={`translate(0, 0)`}>
          {/* Header background */}
          <rect x={0} y={0} width={totalWidth} height={HEADER_HEIGHT} className="fill-noc-surface" />
          {/* Time column header */}
          <text
            x={TIME_COL_WIDTH / 2}
            y={HEADER_HEIGHT / 2 + 4}
            textAnchor="middle"
            className="fill-noc-muted text-[10px] font-medium"
            style={{ fontFamily: 'monospace' }}
          >
            Time
          </text>
          {/* Entity headers */}
          {entities.map((entity, i) => (
            <ColumnHeader
              key={entity}
              name={entity}
              x={TIME_COL_WIDTH + i * colWidth}
              width={colWidth}
            />
          ))}
          {/* Header bottom border */}
          <line
            x1={0}
            y1={HEADER_HEIGHT}
            x2={totalWidth}
            y2={HEADER_HEIGHT}
            className="stroke-noc-border"
            strokeWidth={1.5}
          />
        </g>

        {/* Lifelines */}
        {colPositions.map((x, i) => (
          <Lifeline key={`ll-${i}`} x={x} y1={lifelineY1} y2={lifelineY2} />
        ))}

        {/* Time break markers */}
        {breakPoints.map((y, i) => (
          <TimeBreak key={`brk-${i}`} y={y} width={totalWidth - TIME_COL_WIDTH} />
        ))}

        {/* Messages (virtual scroll: only visible rows) */}
        {rows.slice(visibleRange.start, visibleRange.end).map((row) => {
          const { msg, y, srcCol, dstCol, isError: err, isMedia: media, isSelf: self } = row;
          const isSelected = msg.id === selectedMessageId;
          const isHovered = msg.id === hoveredId;
          const color = PROTOCOL_COLORS[msg.protocol] || '#6b7280';
          const label = msgLabel(msg);

          // Source and destination x positions
          const srcX = srcCol >= 0 ? colPositions[srcCol] : TIME_COL_WIDTH + 10;
          const dstX = dstCol >= 0 ? colPositions[dstCol] : totalWidth - 10;
          const arrowY = y + ROW_HEIGHT / 2;

          // Highlight background for selected/hovered
          const bgOpacity = isSelected ? 0.12 : isHovered ? 0.06 : 0;

          return (
            <g key={msg.id}>
              {/* Row highlight */}
              {bgOpacity > 0 && (
                <rect
                  x={0}
                  y={y}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  fill={color}
                  opacity={bgOpacity}
                />
              )}

              {/* Time label */}
              <text
                x={TIME_COL_WIDTH - 8}
                y={arrowY + 4}
                textAnchor="end"
                className="fill-noc-muted text-[10px]"
                style={{ fontFamily: 'monospace' }}
              >
                {formatTimestamp(msg.timestamp)}
              </text>

              {/* Arrow */}
              {self ? (
                /* Self-loop arrow (same entity) */
                <g>
                  <path
                    d={`M ${srcX} ${arrowY} C ${srcX + 30} ${arrowY - 18} ${srcX + 30} ${arrowY - 18} ${srcX + 12} ${arrowY - 8}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected || isHovered ? 2.5 : err ? 2 : 1.5}
                    strokeDasharray={msg.direction === 'response' ? '5 3' : undefined}
                  />
                  <polygon
                    points={`${srcX} ${arrowY} ${srcX + 6} ${arrowY - 4} ${srcX + 6} ${arrowY + 4}`}
                    fill={color}
                  />
                </g>
              ) : media ? (
                /* Media stream: double line */
                <g>
                  <line
                    x1={srcX}
                    y1={arrowY - 2}
                    x2={dstX}
                    y2={arrowY - 2}
                    stroke={color}
                    strokeWidth={isSelected || isHovered ? 2 : 1.5}
                    opacity={0.7}
                  />
                  <line
                    x1={srcX}
                    y1={arrowY + 2}
                    x2={dstX}
                    y2={arrowY + 2}
                    stroke={color}
                    strokeWidth={isSelected || isHovered ? 2 : 1.5}
                    opacity={0.7}
                  />
                  <polygon
                    points={`${dstX} ${arrowY - 2} ${dstX - 8} ${arrowY - 6} ${dstX - 8} ${arrowY + 2}`}
                    fill={color}
                    opacity={0.7}
                  />
                </g>
              ) : (
                /* Normal arrow */
                <g>
                  <line
                    x1={srcX}
                    y1={arrowY}
                    x2={dstX}
                    y2={arrowY}
                    stroke={err ? '#ef4444' : color}
                    strokeWidth={isSelected || isHovered ? 2.5 : err ? 2 : 1.5}
                    strokeDasharray={msg.direction === 'response' ? '5 3' : undefined}
                  />
                  {/* Arrowhead */}
                  <polygon
                    points={
                      srcX < dstX
                        ? `${dstX} ${arrowY} ${dstX - 8} ${arrowY - 4} ${dstX - 8} ${arrowY + 4}`
                        : `${dstX} ${arrowY} ${dstX + 8} ${arrowY - 4} ${dstX + 8} ${arrowY + 4}`
                    }
                    fill={err ? '#ef4444' : color}
                  />
                  {/* Error warning icon */}
                  {err && (
                    <text
                      x={(srcX + dstX) / 2}
                      y={arrowY - 14}
                      textAnchor="middle"
                      className="text-[10px]"
                      fill="#ef4444"
                    >
                      ⚠
                    </text>
                  )}
                </g>
              )}

              {/* Arrow label */}
              <text
                x={self ? srcX + 36 : Math.min(srcX, dstX) + Math.abs(dstX - srcX) / 2}
                y={arrowY + ARROW_LABEL_OFFSET - 2}
                textAnchor="middle"
                fill={err ? '#ef4444' : color}
                className="text-[10px] font-medium"
                style={{ fontFamily: 'monospace' }}
              >
                {label}
              </text>

              {/* Invisible hit area for interaction */}
              <rect
                x={Math.min(srcX, dstX) - 10}
                y={y}
                width={Math.abs(dstX - srcX) + 20}
                height={ROW_HEIGHT}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(e) => handleArrowEnter(msg, e)}
                onMouseLeave={handleArrowLeave}
                onClick={() => handleArrowClick(msg)}
              />
            </g>
          );
        })}

        {/* Selected message highlight ring */}
        {selectedMessageId &&
          rows
            .filter((r) => r.msg.id === selectedMessageId)
            .map((row) => {
              const srcX = row.srcCol >= 0 ? colPositions[row.srcCol] : TIME_COL_WIDTH + 10;
              const dstX = row.dstCol >= 0 ? colPositions[row.dstCol] : totalWidth - 10;
              return (
                <rect
                  key={`sel-${row.msg.id}`}
                  x={Math.min(srcX, dstX) - 12}
                  y={row.y - 2}
                  width={Math.abs(dstX - srcX) + 24}
                  height={ROW_HEIGHT + 4}
                  rx={4}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.8}
                />
              );
            })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 px-3 py-2 text-[11px] leading-relaxed rounded-lg shadow-lg border pointer-events-none whitespace-pre
            bg-gray-900 text-gray-100 border-gray-700
            dark:bg-gray-800 dark:border-gray-600"
          style={{ left: tooltip.x, top: tooltip.y, maxWidth: 360, fontFamily: 'monospace' }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Scroll-to-top button */}
      {scrollTop > 200 && (
        <button
          onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-noc-surface border border-noc-border shadow-md text-noc-muted hover:text-noc-text transition-colors"
          title="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}

export default memo(LadderDiagramInner);
