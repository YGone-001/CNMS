import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  CornerDownLeft,
  Plus,
  X,
  Columns,
  Square,
  Trash2,
  BookOpen,
  GitCompareArrows,
} from 'lucide-react';
import * as Diff from 'diff';
import type { MmlHistoryEntry, MmlResponse, LstSubResponse, Subscriber } from '@/types/monitor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayoutMode = 'single' | 'split';

interface PaneState {
  entries: MmlHistoryEntry[];
  input: string;
  commandHistory: string[];
  historyIndex: number;
  isExecuting: boolean;
}

interface TabState {
  id: string;
  title: string;
  layout: LayoutMode;
  left: PaneState;
  right: PaneState;
}

interface DiffLine {
  leftNum: number | null;
  rightNum: number | null;
  leftText: string;
  rightText: string;
  type: 'equal' | 'added' | 'removed' | 'modified';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MML_COMMANDS = [
  { cmd: 'ADD-SUB', desc: 'Add subscriber', params: 'IMSI=, APN=internet, QOS=9' },
  { cmd: 'DEL-SUB', desc: 'Delete subscriber', params: 'IMSI=' },
  { cmd: 'LST-SUB', desc: 'List subscribers', params: 'PAGE=1, PAGE_SIZE=20' },
  { cmd: 'MOD-SUB', desc: 'Modify subscriber', params: 'IMSI=, APN=, QOS=' },
  { cmd: 'CTRL-NF', desc: 'Control NF', params: 'NF=amfd, ACTION=start' },
  { cmd: 'ACK-ALARM', desc: 'Acknowledge alarm', params: 'ID=' },
  { cmd: 'CLR-ALARM', desc: 'Clear alarm', params: 'ID=' },
  { cmd: 'ADD-SUB-BATCH', desc: 'Batch add subscribers', params: 'COUNT=100, PREFIX=46011' },
  { cmd: 'EXP-SUB', desc: 'Export subscribers', params: 'FORMAT=json' },
  { cmd: 'IMP-SUB', desc: 'Import subscribers', params: 'FILE=import.json' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tabCounter = 1;
let entryCounter = 1;

function createPane(): PaneState {
  return {
    entries: [],
    input: '',
    commandHistory: [],
    historyIndex: -1,
    isExecuting: false,
  };
}

function createTab(): TabState {
  const id = `tab-${Date.now()}-${tabCounter++}`;
  return {
    id,
    title: `Session ${tabCounter - 1}`,
    layout: 'single',
    left: createPane(),
    right: createPane(),
  };
}

// Extract plain text output from terminal entries for diff comparison
function extractPaneText(entries: MmlHistoryEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`$ ${entry.command}`);
    if (entry.response) {
      const status = entry.response.status === 'ok' ? '[OK]' : '[ERROR]';
      lines.push(`  ${status} ${entry.response.message}`);
      if ('imsi' in entry.response && (entry.response as MmlResponse).imsi) {
        lines.push(`  IMSI: ${(entry.response as MmlResponse).imsi}`);
      }
      if ('subscribers' in entry.response && (entry.response as LstSubResponse).subscribers) {
        const subs = (entry.response as LstSubResponse).subscribers!;
        for (const s of subs) {
          lines.push(`  ${s.imsi}  ${s.sessions?.[0]?.name || '-'}  QoS:${s.sessions?.[0]?.qos ?? '-'}  ${s.subscriber_status === 0 ? 'Active' : 'Inactive'}`);
        }
      }
    }
    if (entry.error) {
      lines.push(`  [FAIL] ${entry.error}`);
    }
  }
  return lines.join('\n');
}

// Compute side-by-side diff lines from two text strings
function computeDiffLines(leftText: string, rightText: string): DiffLine[] {
  const changes = Diff.diffLines(leftText, rightText);
  const result: DiffLine[] = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const part of changes) {
    const partLines = part.value.replace(/\n$/, '').split('\n');

    if (part.added) {
      for (const line of partLines) {
        result.push({ leftNum: null, rightNum: rightLine++, leftText: '', rightText: line, type: 'added' });
      }
    } else if (part.removed) {
      for (const line of partLines) {
        result.push({ leftNum: leftLine++, rightNum: null, leftText: line, rightText: '', type: 'removed' });
      }
    } else {
      for (const line of partLines) {
        result.push({ leftNum: leftLine++, rightNum: rightLine++, leftText: line, rightText: line, type: 'equal' });
      }
    }
  }

  // Post-process: align removed/added pairs as modified lines
  const aligned: DiffLine[] = [];
  let i = 0;
  while (i < result.length) {
    if (result[i].type === 'removed' && i + 1 < result.length && result[i + 1].type === 'added') {
      aligned.push({
        leftNum: result[i].leftNum,
        rightNum: result[i + 1].rightNum,
        leftText: result[i].leftText,
        rightText: result[i + 1].rightText,
        type: 'modified',
      });
      i += 2;
    } else {
      aligned.push(result[i]);
      i++;
    }
  }

  return aligned;
}

// ---------------------------------------------------------------------------
// Subscriber table renderer
// ---------------------------------------------------------------------------

function SubscriberTable({ subs, page, total, pageSize }: { subs: Subscriber[]; page?: number; total?: number; pageSize?: number }) {
  if (subs.length === 0) return <div className="text-noc-success">No subscribers found.</div>;
  const totalPages = total && pageSize ? Math.ceil(total / pageSize) : 0;
  return (
    <div>
      {totalPages > 1 && (
        <div className="text-noc-success mb-1">Page {page}/{totalPages} ({total} total)</div>
      )}
      <table className="text-xs border-collapse">
        <thead>
          <tr className="text-noc-success border-b border-noc-border">
            <th className="text-left pr-4 py-0.5">IMSI</th>
            <th className="text-left pr-4 py-0.5">APN</th>
            <th className="text-left pr-4 py-0.5">QoS</th>
            <th className="text-left pr-4 py-0.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s._id} className="border-b border-noc-border">
              <td className="pr-4 py-0.5 font-mono">{s.imsi}</td>
              <td className="pr-4 py-0.5">{s.sessions?.[0]?.name || '-'}</td>
              <td className="pr-4 py-0.5">{s.sessions?.[0]?.qos ?? '-'}</td>
              <td className="pr-4 py-0.5">{s.subscriber_status === 0 ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry renderer
// ---------------------------------------------------------------------------

function EntryRenderer({ entry }: { entry: MmlHistoryEntry }) {
  return (
    <div className="mb-2">
      <div className="text-noc-success">
        <span className="text-noc-accent mr-1">$</span>
        {entry.command}
      </div>
      {entry.response && (
        <div className={`mt-0.5 pl-3 ${entry.response.status === 'ok' ? 'text-noc-success' : 'text-noc-error'}`}>
          {entry.response.status === 'ok' ? '[OK]' : '[ERROR]'}{' '}
          {entry.response.message}
          {'imsi' in entry.response && (entry.response as MmlResponse).imsi
            ? ` (IMSI: ${(entry.response as MmlResponse).imsi})`
            : ''}
          {'subscribers' in entry.response && (entry.response as LstSubResponse).subscribers && (
            <div className="mt-2">
              <SubscriberTable
                subs={(entry.response as LstSubResponse).subscribers!}
                page={(entry.response as LstSubResponse).page}
                total={(entry.response as LstSubResponse).total}
                pageSize={(entry.response as LstSubResponse).page_size}
              />
            </div>
          )}
        </div>
      )}
      {entry.error && (
        <div className="mt-0.5 pl-3 text-noc-error">[FAIL] {entry.error}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single terminal pane component
// ---------------------------------------------------------------------------

function TerminalPane({
  pane,
  side,
  onInputChange,
  onExecute,
  onClear,
  onHistoryUp,
  onHistoryDown,
  targetLabel,
}: {
  pane: PaneState;
  side: 'left' | 'right';
  onInputChange: (val: string) => void;
  onExecute: () => void;
  onClear: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  targetLabel?: string;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pane.entries]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          onExecute();
          break;
        case 'ArrowUp':
          e.preventDefault();
          onHistoryUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          onHistoryDown();
          break;
        case 'l':
          if (e.ctrlKey) {
            e.preventDefault();
            onClear();
          }
          break;
      }
    },
    [onExecute, onHistoryUp, onHistoryDown, onClear],
  );

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Pane header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-noc-bg border-b border-noc-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${side === 'left' ? 'bg-noc-accent' : 'bg-noc-warning'}`} />
          <span className="text-[11px] text-noc-muted uppercase tracking-wider font-semibold">
            {side === 'left' ? 'Primary' : 'Secondary'}
          </span>
          {targetLabel && (
            <span className="text-[11px] text-noc-muted font-mono">/ {targetLabel}</span>
          )}
        </div>
        <button
          onClick={onClear}
          className="p-1 text-noc-muted hover:text-noc-text transition-colors"
          title="Clear terminal (Ctrl+L)"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 bg-noc-terminal p-3 overflow-y-auto font-mono text-xs leading-relaxed cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {pane.entries.length === 0 && (
          <div className="text-noc-muted">
            xCloud MML Terminal -- Type a command and press Enter.
          </div>
        )}
        {pane.entries.map((entry) => (
          <EntryRenderer key={entry.id} entry={entry} />
        ))}
        {pane.isExecuting && (
          <div className="text-noc-warning animate-pulse">Executing...</div>
        )}
      </div>

      {/* Input line */}
      <div className="flex items-center gap-2 bg-noc-terminal border-t border-noc-border px-3 py-2">
        <span className="text-noc-accent font-mono text-xs">$</span>
        <input
          ref={inputRef}
          type="text"
          value={pane.input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pane.isExecuting}
          placeholder="Enter MML command..."
          className="flex-1 bg-transparent text-noc-success font-mono text-xs outline-none placeholder:text-noc-muted"
        />
        <CornerDownLeft className="w-3.5 h-3.5 text-noc-muted" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side-by-side diff viewer component
// ---------------------------------------------------------------------------

function DiffViewer({ diffLines, onClose }: { diffLines: DiffLine[]; onClose: () => void }) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Synchronized scrolling between left and right panels
  const handleScroll = useCallback((source: 'left' | 'right') => {
    const sourceEl = source === 'left' ? leftRef.current : rightRef.current;
    const targetEl = source === 'left' ? rightRef.current : leftRef.current;
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop;
    }
  }, []);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
      if (line.type === 'modified') modified++;
    }
    return { added, removed, modified, total: diffLines.length };
  }, [diffLines]);

  return (
    <div className="flex flex-col h-full">
      {/* Diff header */}
      <div className="flex items-center justify-between px-4 py-2 bg-noc-bg border-b border-noc-border">
        <div className="flex items-center gap-3">
          <GitCompareArrows className="w-4 h-4 text-noc-accent" />
          <span className="text-xs text-noc-text font-semibold">Diff Comparison</span>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] text-noc-error">-{stats.removed}</span>
            <span className="text-[10px] text-noc-success">+{stats.added}</span>
            <span className="text-[10px] text-noc-warning">~{stats.modified}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1 text-[11px] bg-noc-bg-50 text-noc-text rounded border border-noc-border hover:bg-noc-border transition-colors"
        >
          Exit Diff
        </button>
      </div>

      {/* Diff content - side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Left (Source / Primary) */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-noc-border">
          <div className="px-3 py-1.5 bg-noc-bg border-b border-noc-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-noc-accent" />
            <span className="text-[10px] text-noc-muted uppercase tracking-wider font-semibold">Source (Primary)</span>
          </div>
          <div
            ref={leftRef}
            className="flex-1 overflow-y-auto bg-noc-terminal font-mono text-xs leading-relaxed"
            onScroll={() => handleScroll('left')}
          >
            {diffLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex ${
                  line.type === 'removed' || line.type === 'modified'
                    ? 'bg-noc-error-10 border-l-2 border-l-noc-error'
                    : line.type === 'equal'
                    ? 'border-l-2 border-l-transparent'
                    : 'border-l-2 border-l-transparent opacity-30'
                }`}
              >
                <span className="w-10 shrink-0 text-right pr-2 text-noc-muted select-none py-0.5">
                  {line.leftNum ?? ''}
                </span>
                <span className="flex-1 py-0.5 pr-3 text-noc-text whitespace-pre-wrap break-all">
                  {line.leftText || (line.type === 'added' ? line.rightText : '')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right (Target / Secondary) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1.5 bg-noc-bg border-b border-noc-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-noc-warning" />
            <span className="text-[10px] text-noc-muted uppercase tracking-wider font-semibold">Target (Secondary)</span>
          </div>
          <div
            ref={rightRef}
            className="flex-1 overflow-y-auto bg-noc-terminal font-mono text-xs leading-relaxed"
            onScroll={() => handleScroll('right')}
          >
            {diffLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex ${
                  line.type === 'added' || line.type === 'modified'
                    ? 'bg-noc-success-10 border-l-2 border-l-noc-success'
                    : line.type === 'equal'
                    ? 'border-l-2 border-l-transparent'
                    : 'border-l-2 border-l-transparent opacity-30'
                }`}
              >
                <span className="w-10 shrink-0 text-right pr-2 text-noc-muted select-none py-0.5">
                  {line.rightNum ?? ''}
                </span>
                <span className="flex-1 py-0.5 pr-3 text-noc-text whitespace-pre-wrap break-all">
                  {line.rightText || (line.type === 'removed' ? line.leftText : '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MML Parameter Helper panel
// ---------------------------------------------------------------------------

function ParameterHelper({ onInsert }: { onInsert: (cmd: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-64 flex-shrink-0 bg-noc-surface border-l border-noc-border flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-noc-border flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5 text-noc-accent" />
        <span className="text-[11px] text-noc-text uppercase tracking-wider font-semibold">Parameter Helper</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {MML_COMMANDS.map((item) => (
          <div key={item.cmd} className="border-b border-noc-border">
            <button
              onClick={() => setExpanded(expanded === item.cmd ? null : item.cmd)}
              className="w-full text-left px-3 py-2 hover:bg-noc-bg-50 transition-colors"
            >
              <div className="text-xs text-noc-accent font-mono font-semibold">{item.cmd}</div>
              <div className="text-[10px] text-noc-muted mt-0.5">{item.desc}</div>
            </button>
            {expanded === item.cmd && (
              <div className="px-3 pb-2">
                <div className="text-[10px] text-noc-muted mb-1">Parameters:</div>
                <div className="text-[10px] text-noc-text font-mono bg-noc-bg-50 rounded px-2 py-1 mb-2">
                  {item.params}
                </div>
                <button
                  onClick={() => onInsert(`${item.cmd}: ${item.params};`)}
                  className="w-full text-[10px] px-2 py-1 bg-noc-accent-10 text-noc-accent border border-noc-accent-30 rounded hover:bg-noc-accent-20 transition-colors"
                >
                  Insert Command
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MmlTerminal component
// ---------------------------------------------------------------------------

export default function MmlTerminal() {
  // Tabs state
  const [tabs, setTabs] = useState<TabState[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [showHelper, setShowHelper] = useState(true);
  const [diffMode, setDiffMode] = useState(false);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  // Compute diff lines when in diff mode
  const diffLines = useMemo(() => {
    if (!diffMode) return [];
    const leftText = extractPaneText(activeTab.left.entries);
    const rightText = extractPaneText(activeTab.right.entries);
    return computeDiffLines(leftText, rightText);
  }, [diffMode, activeTab.left.entries, activeTab.right.entries]);

  const enterDiffMode = useCallback(() => {
    setDiffMode(true);
  }, []);

  const exitDiffMode = useCallback(() => {
    setDiffMode(false);
  }, []);

  // --- Tab operations ---

  const addTab = useCallback(() => {
    const newTab = createTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev; // keep at least one tab
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          setActiveTabId(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const toggleLayout = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, layout: t.layout === 'single' ? 'split' : 'single' } : t,
      ),
    );
  }, []);

  // --- Pane operations (update active tab's pane) ---

  const updatePane = useCallback(
    (side: 'left' | 'right', updater: (pane: PaneState) => PaneState) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId) return t;
          return { ...t, [side]: updater(t[side]) };
        }),
      );
    },
    [activeTabId],
  );

  const handleInputChange = useCallback(
    (side: 'left' | 'right', val: string) => {
      updatePane(side, (p) => ({ ...p, input: val, historyIndex: -1 }));
    },
    [updatePane],
  );

  const handleExecute = useCallback(
    async (side: 'left' | 'right') => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      const pane = tab[side];
      const cmd = pane.input.trim();
      if (!cmd || pane.isExecuting) return;

      // Start execution
      const entryId = entryCounter++;
      updatePane(side, (p) => ({
        ...p,
        entries: [
          ...p.entries,
          { id: entryId, command: cmd, response: null, error: null, timestamp: new Date() },
        ],
        input: '',
        commandHistory: [cmd, ...p.commandHistory].slice(0, 100),
        historyIndex: -1,
        isExecuting: true,
      }));

      try {
        const resp = await fetch('/api/v1/mml/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        });
        const data: MmlResponse = await resp.json();
        updatePane(side, (p) => ({
          ...p,
          entries: p.entries.map((e) => (e.id === entryId ? { ...e, response: data } : e)),
          isExecuting: false,
        }));
      } catch (err) {
        updatePane(side, (p) => ({
          ...p,
          entries: p.entries.map((e) =>
            e.id === entryId ? { ...e, error: (err as Error).message } : e,
          ),
          isExecuting: false,
        }));
      }
    },
    [tabs, activeTabId, updatePane],
  );

  const handleClear = useCallback(
    (side: 'left' | 'right') => {
      updatePane(side, (p) => ({ ...p, entries: [] }));
    },
    [updatePane],
  );

  const handleHistoryUp = useCallback(
    (side: 'left' | 'right') => {
      updatePane(side, (p) => {
        if (p.commandHistory.length === 0) return p;
        const newIndex = Math.min(p.historyIndex + 1, p.commandHistory.length - 1);
        return { ...p, historyIndex: newIndex, input: p.commandHistory[newIndex] };
      });
    },
    [updatePane],
  );

  const handleHistoryDown = useCallback(
    (side: 'left' | 'right') => {
      updatePane(side, (p) => {
        if (p.historyIndex <= 0) return { ...p, historyIndex: -1, input: '' };
        const newIndex = p.historyIndex - 1;
        return { ...p, historyIndex: newIndex, input: p.commandHistory[newIndex] };
      });
    },
    [updatePane],
  );

  // Insert command from helper into left pane by default
  const handleHelperInsert = useCallback(
    (cmd: string) => {
      updatePane('left', (p) => ({ ...p, input: cmd }));
    },
    [updatePane],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        <div className="flex items-center gap-1 bg-noc-surface rounded-lg p-1 border border-noc-border flex-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all whitespace-nowrap ${
                tab.id === activeTabId
                  ? 'bg-noc-accent-10 text-noc-accent border border-noc-accent-30'
                  : 'text-noc-muted hover:text-noc-text border border-transparent hover:border-noc-border'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <Terminal className="w-3 h-3" />
              <span>{tab.title}</span>
              {tab.layout === 'split' && <Columns className="w-3 h-3 text-noc-muted" />}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-noc-bg-50 text-noc-muted hover:text-noc-text transition-colors"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="p-1.5 rounded-md text-noc-muted hover:text-noc-text hover:bg-noc-bg-50 transition-colors"
            title="New tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Layout toggle + Diff toggle + Helper toggle */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => toggleLayout(activeTabId)}
            className={`p-2 rounded-lg border transition-all ${
              activeTab.layout === 'split'
                ? 'bg-noc-accent-10 text-noc-accent border-noc-accent-30'
                : 'bg-noc-surface text-noc-muted border-noc-border hover:text-noc-text'
            }`}
            title={activeTab.layout === 'split' ? 'Switch to single view' : 'Switch to split view'}
          >
            {activeTab.layout === 'split' ? (
              <Columns className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
          {/* Diff comparison button - only visible in split mode */}
          {activeTab.layout === 'split' && (
            <button
              onClick={diffMode ? exitDiffMode : enterDiffMode}
              className={`p-2 rounded-lg border transition-all ${
                diffMode
                  ? 'bg-noc-warning-10 text-noc-warning border-noc-warning-20'
                  : 'bg-noc-surface text-noc-muted border-noc-border hover:text-noc-text'
              }`}
              title={diffMode ? 'Exit diff view' : 'Run diff comparison'}
            >
              <GitCompareArrows className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowHelper(!showHelper)}
            className={`p-2 rounded-lg border transition-all ${
              showHelper
                ? 'bg-noc-accent-10 text-noc-accent border-noc-accent-30'
                : 'bg-noc-surface text-noc-muted border-noc-border hover:text-noc-text'
            }`}
            title="Toggle parameter helper"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex min-h-0 rounded-xl overflow-hidden border border-noc-border">
        {/* Diff mode: side-by-side diff viewer */}
        {diffMode && activeTab.layout === 'split' ? (
          <div className="flex-1 min-w-0">
            <DiffViewer diffLines={diffLines} onClose={exitDiffMode} />
          </div>
        ) : (
          <>
            {/* Left pane (always visible) */}
            <div className={`flex-1 min-w-0 ${activeTab.layout === 'split' ? 'border-r border-noc-border' : ''}`}>
              <TerminalPane
                pane={activeTab.left}
                side="left"
                onInputChange={(val) => handleInputChange('left', val)}
                onExecute={() => handleExecute('left')}
                onClear={() => handleClear('left')}
                onHistoryUp={() => handleHistoryUp('left')}
                onHistoryDown={() => handleHistoryDown('left')}
                targetLabel="Primary NF"
              />
            </div>

            {/* Right pane (only in split mode) */}
            {activeTab.layout === 'split' && (
              <div className="flex-1 min-w-0">
                <TerminalPane
                  pane={activeTab.right}
                  side="right"
                  onInputChange={(val) => handleInputChange('right', val)}
                  onExecute={() => handleExecute('right')}
                  onClear={() => handleClear('right')}
                  onHistoryUp={() => handleHistoryUp('right')}
                  onHistoryDown={() => handleHistoryDown('right')}
                  targetLabel="Secondary NF"
                />
              </div>
            )}
          </>
        )}

        {/* Parameter helper panel */}
        {showHelper && !diffMode && <ParameterHelper onInsert={handleHelperInsert} />}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-3 text-[10px] text-noc-muted">
          <span>Ctrl+L: Clear</span>
          <span>Arrow Up/Down: History</span>
          <span>Enter: Execute</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-noc-muted">
          <span>Tab: {activeTab.title}</span>
          <span>Layout: {activeTab.layout}</span>
        </div>
      </div>
    </div>
  );
}
