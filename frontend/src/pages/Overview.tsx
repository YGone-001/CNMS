import { useMonitor } from '@/context/MonitorContext';
import { Server, ServerCrash, Cpu, MemoryStick } from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import ProcessTable from '@/components/ProcessTable';
import ResourceChart from '@/components/ResourceChart';
import { formatBytes, formatPercent } from '@/utils/format';

// 概览仪表盘页面
export default function Overview() {
  const { snapshot, onlineCount, offlineCount, totalCpu, totalMemoryRss } = useMonitor();

  const processes = snapshot?.processes ?? [];

  return (
    <div className="space-y-6">
      {/* 汇总卡片行 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Online"
          value={onlineCount}
          icon={Server}
          accentColor="text-noc-success"
        />
        <SummaryCard
          title="Offline"
          value={offlineCount}
          icon={ServerCrash}
          accentColor="text-noc-error"
        />
        <SummaryCard
          title="Total CPU"
          value={formatPercent(totalCpu, 1)}
          icon={Cpu}
          accentColor="text-noc-accent"
          subtitle="across running processes"
        />
        <SummaryCard
          title="Total Memory"
          value={formatBytes(totalMemoryRss)}
          icon={MemoryStick}
          accentColor="text-noc-warning"
          subtitle="RSS across running processes"
        />
      </div>

      {/* 资源趋势图 */}
      {processes.length > 0 && <ResourceChart processes={processes} />}

      {/* 网元状态列表 (紧凑模式) */}
      <div>
        <div className="text-sm font-medium text-noc-warning mb-3">
          Network Element Status
        </div>
        {processes.length > 0 ? (
          <ProcessTable processes={processes} compact />
        ) : (
          <div className="bg-noc-surface border border-noc-border rounded-lg p-8 text-center text-noc-muted">
            Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
}
