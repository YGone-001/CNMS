// 字节数格式化为可读字符串 (B / KB / MB / GB)
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

// 百分比格式化
export function formatPercent(value: number, decimals = 1): string {
  return value.toFixed(decimals) + '%';
}

// Unix 时间戳格式化为本地时间字符串
export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}
