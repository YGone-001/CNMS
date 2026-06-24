import type { LucideIcon } from 'lucide-react';

// 汇总卡片属性
interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accentColor?: string;
  subtitle?: string;
}

// 仪表盘汇总卡片组件
export default function SummaryCard({
  title,
  value,
  icon: Icon,
  accentColor = 'text-noc-accent',
  subtitle,
}: SummaryCardProps) {
  return (
    <div className="bg-noc-surface border border-noc-border rounded-lg p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg bg-noc-bg ${accentColor}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-noc-text">{value}</div>
        <div className="text-sm text-noc-muted mt-0.5">{title}</div>
        {subtitle && <div className="text-xs text-noc-muted mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
