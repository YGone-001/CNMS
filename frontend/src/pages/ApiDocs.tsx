import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';

interface Endpoint {
  method: string;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  params?: { name: string; in: string; required?: boolean; type: string; description?: string }[];
  body?: { field: string; type: string; required?: boolean; example?: string }[];
  response?: string;
}

const MML_COMMANDS = [
  { cmd: 'ADD-SUB: IMSI=460110000000001, APN=internet;', desc: 'Add a subscriber' },
  { cmd: 'DEL-SUB: IMSI=460110000000001;', desc: 'Delete a subscriber' },
  { cmd: 'LST-SUB:;', desc: 'List all subscribers (paginated)' },
  { cmd: 'LST-SUB: IMSI=460110000000001;', desc: 'Query specific subscriber' },
  { cmd: 'LST-SUB: PAGE=1, PAGE_SIZE=10;', desc: 'List with pagination' },
  { cmd: 'MOD-SUB: IMSI=460110000000001, APN=5gnet, QOS=5;', desc: 'Modify subscriber' },
  { cmd: 'CTRL-NF: NAME=amfd, ACTION=restart;', desc: 'Restart a network function' },
  { cmd: 'ACK-ALARM: ID=<alarm_id>;', desc: 'Acknowledge an alarm' },
  { cmd: 'CLR-ALARM: ID=<alarm_id>;', desc: 'Clear an alarm' },
  { cmd: 'ADD-SUB-BATCH: FILE=subscribers.csv;', desc: 'Batch import from CSV' },
  { cmd: 'EXP-SUB: FILE=subscribers.json;', desc: 'Export all subscribers' },
  { cmd: 'IMP-SUB: FILE=subscribers.json;', desc: 'Import subscribers from JSON' },
];

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/health', tag: 'System', summary: 'Health check' },
  { method: 'POST', path: '/api/v1/auth/login', tag: 'Auth', summary: 'User login',
    body: [{ field: 'username', type: 'string', required: true, example: 'admin' }, { field: 'password', type: 'string', required: true, example: 'admin123' }] },
  { method: 'POST', path: '/api/v1/mml/execute', tag: 'MML', summary: 'Execute MML command',
    body: [{ field: 'command', type: 'string', required: true, example: 'LST-SUB:;' }] },
  { method: 'GET', path: '/api/v1/monitor/ws', tag: 'Monitor', summary: 'WebSocket real-time monitoring stream' },
  { method: 'GET', path: '/api/v1/alarms', tag: 'Alarms', summary: 'Query alarm history',
    params: [
      { name: 'severity', in: 'query', type: 'string', description: 'critical|major|minor|warning' },
      { name: 'active', in: 'query', type: 'string', description: 'true for active only' },
      { name: 'page', in: 'query', type: 'integer' }, { name: 'page_size', in: 'query', type: 'integer' },
    ] },
  { method: 'GET', path: '/api/v1/nf/logs', tag: 'Logs', summary: 'Get NF logs',
    params: [
      { name: 'name', in: 'query', required: true, type: 'string', description: 'NF process name' },
      { name: 'tail', in: 'query', type: 'integer', description: 'Last N lines (default 100)' },
      { name: 'keyword', in: 'query', type: 'string' }, { name: 'level', in: 'query', type: 'string', description: 'ERROR|WARN|INFO|DEBUG' },
    ] },
  { method: 'GET', path: '/api/v1/metrics/history', tag: 'Metrics', summary: 'Query metrics history',
    params: [
      { name: 'name', in: 'query', type: 'string' }, { name: 'from', in: 'query', type: 'ISO8601' },
      { name: 'to', in: 'query', type: 'ISO8601' }, { name: 'page_size', in: 'query', type: 'integer', description: 'Max 5000' },
    ] },
  { method: 'GET', path: '/api/v1/audit/logs', tag: 'Audit', summary: 'Query audit logs',
    params: [
      { name: 'user', in: 'query', type: 'string' }, { name: 'action', in: 'query', type: 'string' },
      { name: 'page', in: 'query', type: 'integer' }, { name: 'page_size', in: 'query', type: 'integer' },
    ] },
  { method: 'GET', path: '/api/v1/tasks', tag: 'Tasks', summary: 'List scheduled tasks' },
  { method: 'GET', path: '/api/v1/users', tag: 'Users', summary: 'List users' },
  { method: 'GET', path: '/api/docs', tag: 'Docs', summary: 'OpenAPI 3.0 specification (JSON)' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1 text-noc-muted hover:text-noc-accent transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-noc-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const methodColor: Record<string, string> = {
  GET: 'bg-noc-success-10 text-noc-success',
  POST: 'bg-noc-accent-10 text-noc-accent',
  PUT: 'bg-noc-warning-10 text-noc-warning',
  DELETE: 'bg-noc-error-10 text-noc-error',
};

export default function ApiDocs() {
  const [activeTag, setActiveTag] = useState<string>('all');
  const tags = ['all', ...new Set(ENDPOINTS.map(e => e.tag))];

  const filtered = activeTag === 'all' ? ENDPOINTS : ENDPOINTS.filter(e => e.tag === activeTag);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-noc-text">API Documentation</h2>
        <p className="text-sm text-noc-muted mt-0.5">
          xCloud-CNMS REST API Reference · <a href="/api/docs" target="_blank" className="text-noc-accent hover:underline">OpenAPI Spec <ExternalLink className="w-3 h-3 inline" /></a>
        </p>
      </div>

      {/* Tag filters */}
      <div className="flex gap-1 flex-wrap">
        {tags.map(tag => (
          <button key={tag} onClick={() => setActiveTag(tag)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTag === tag ? 'bg-noc-accent-20 text-noc-accent' : 'bg-noc-surface text-noc-muted hover:text-noc-text'
            }`}>{tag}</button>
        ))}
      </div>

      {/* Endpoints */}
      <div className="space-y-3">
        {filtered.map((ep, i) => (
          <div key={i} className="bg-noc-surface border border-noc-border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor[ep.method] || ''}`}>{ep.method}</span>
              <code className="text-sm text-noc-accent font-mono">{ep.path}</code>
              <CopyButton text={ep.path} />
              <span className="text-sm text-noc-text ml-auto">{ep.summary}</span>
            </div>
            {ep.description && <p className="text-xs text-noc-muted mb-2">{ep.description}</p>}
            {ep.params && ep.params.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-noc-muted mb-1">Parameters:</div>
                <div className="flex flex-wrap gap-2">
                  {ep.params.map((p, j) => (
                    <span key={j} className="px-2 py-0.5 bg-noc-bg rounded text-xs font-mono text-noc-text">
                      {p.required && <span className="text-noc-error mr-1">*</span>}{p.name}
                      <span className="text-noc-muted ml-1">({p.type})</span>
                      {p.description && <span className="text-noc-muted ml-1">- {p.description}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {ep.body && ep.body.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-noc-muted mb-1">Request Body:</div>
                <div className="flex flex-wrap gap-2">
                  {ep.body.map((b, j) => (
                    <span key={j} className="px-2 py-0.5 bg-noc-bg rounded text-xs font-mono text-noc-text">
                      {b.required && <span className="text-noc-error mr-1">*</span>}{b.field}: {b.type}
                      {b.example && <span className="text-noc-muted ml-1">= "{b.example}"</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* MML Commands Reference */}
      <div>
        <h3 className="text-base font-semibold text-noc-text mb-3">MML Commands Reference</h3>
        <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border">
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Command</th>
                <th className="text-left px-4 py-3 text-noc-muted font-medium">Description</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {MML_COMMANDS.map((m, i) => (
                <tr key={i} className="border-b border-noc-border-50 hover:bg-noc-bg-50">
                  <td className="px-4 py-3 font-mono text-noc-accent text-xs">{m.cmd}</td>
                  <td className="px-4 py-3 text-noc-muted">{m.desc}</td>
                  <td className="px-4 py-3"><CopyButton text={m.cmd} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
