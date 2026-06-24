import { formatBytes, formatPercent } from '@/utils/format';
import type { ProcessStatus } from '@/types/monitor';

// 进程表格属性
interface ProcessTableProps {
  processes: ProcessStatus[];
  compact?: boolean;
}

// CPU 百分比颜色阈值
function cpuColor(cpu: number): string {
  if (cpu >= 80) return 'text-noc-error';
  if (cpu >= 50) return 'text-noc-warning';
  return 'text-noc-success';
}

// 网元进程状态表格
export default function ProcessTable({ processes, compact = false }: ProcessTableProps) {
  // 排序：运行中的在前，其余按名称字母序
  const sorted = [...processes].sort((a, b) => {
    if (a.running !== b.running) return a.running ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="bg-noc-surface border border-noc-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-noc-border">
            <th className="text-left px-4 py-3 text-noc-muted font-medium">Status</th>
            <th className="text-left px-4 py-3 text-noc-muted font-medium">Name</th>
            {!compact && (
              <th className="text-left px-4 py-3 text-noc-muted font-medium">PID</th>
            )}
            <th className="text-left px-4 py-3 text-noc-muted font-medium">CPU %</th>
            <th className="text-left px-4 py-3 text-noc-muted font-medium">Memory RSS</th>
            <th className="text-left px-4 py-3 text-noc-muted font-medium">Memory %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.name}
              className="border-b border-noc-border-50 hover:bg-noc-bg-50 transition-colors"
            >
              {/* 状态指示 */}
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.running ? 'bg-noc-success' : 'bg-noc-error'
                    }`}
                  />
                  <span className={p.running ? 'text-noc-success' : 'text-noc-error'}>
                    {p.running ? 'Running' : 'Stopped'}
                  </span>
                </span>
              </td>

              {/* 进程名 */}
              <td className="px-4 py-2.5 font-mono text-noc-text">{p.name}</td>

              {/* PID (仅完整模式) */}
              {!compact && (
                <td className="px-4 py-2.5 text-noc-muted">
                  {p.running ? p.pid : '-'}
                </td>
              )}

              {/* CPU 使用率 */}
              <td className={`px-4 py-2.5 font-mono ${p.running ? cpuColor(p.cpu_percent) : 'text-noc-muted'}`}>
                {p.running ? formatPercent(p.cpu_percent, 2) : '-'}
              </td>

              {/* 内存 RSS */}
              <td className="px-4 py-2.5 text-noc-text font-mono">
                {p.running ? formatBytes(p.memory_rss) : '-'}
              </td>

              {/* 内存百分比 + 进度条 */}
              <td className="px-4 py-2.5">
                {p.running ? (
                  <span className="flex items-center gap-2">
                    <span className="text-noc-text font-mono text-xs w-12">
                      {formatPercent(p.memory_percent)}
                    </span>
                    <span className="w-20 h-1.5 bg-noc-border rounded-full overflow-hidden">
                      <span
                        className="block h-full bg-noc-accent rounded-full"
                        style={{ width: `${Math.min(p.memory_percent, 100)}%` }}
                      />
                    </span>
                  </span>
                ) : (
                  <span className="text-noc-muted">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
