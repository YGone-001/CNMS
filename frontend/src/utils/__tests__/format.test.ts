import { describe, it, expect } from 'vitest';
import { formatBytes, formatPercent, formatTimestamp } from '../format';

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5242880)).toBe('5.0 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('formatPercent', () => {
  it('formats with default decimals', () => {
    expect(formatPercent(50)).toBe('50.0%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('formats with custom decimals', () => {
    expect(formatPercent(50.123, 2)).toBe('50.12%');
    expect(formatPercent(33.333, 0)).toBe('33%');
  });

  it('handles decimal values', () => {
    expect(formatPercent(33.456, 1)).toBe('33.5%');
  });
});

describe('formatTimestamp', () => {
  it('formats unix timestamp', () => {
    const result = formatTimestamp(1700000000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
