import { describe, it, expect } from 'vitest';
import type { ProcessStatus, MonitorSnapshot, MmlResponse, Alarm, Subscriber } from '../monitor';

describe('Type interfaces', () => {
  it('ProcessStatus has correct shape', () => {
    const ps: ProcessStatus = {
      name: 'amfd',
      pid: 1234,
      cpu_percent: 50.5,
      memory_rss: 1048576,
      memory_vms: 2097152,
      memory_percent: 25.0,
      running: true,
    };
    expect(ps.name).toBe('amfd');
    expect(ps.running).toBe(true);
  });

  it('MonitorSnapshot has correct shape', () => {
    const snap: MonitorSnapshot = {
      timestamp: 1700000000,
      processes: [],
    };
    expect(snap.processes).toHaveLength(0);
  });

  it('MmlResponse has correct shape', () => {
    const resp: MmlResponse = {
      status: 'ok',
      message: 'success',
      imsi: '460110000000001',
    };
    expect(resp.status).toBe('ok');
  });

  it('Alarm has correct shape', () => {
    const alarm: Alarm = {
      _id: 'abc123',
      severity: 'critical',
      source: 'amfd',
      message: 'Process down',
      timestamp: '2024-01-01T00:00:00Z',
      count: 1,
      acknowledged: false,
      cleared: false,
    };
    expect(alarm.severity).toBe('critical');
  });

  it('Subscriber has correct shape', () => {
    const sub: Subscriber = {
      _id: 'abc',
      imsi: '460110000000001',
      subscribed_rau_tau_timer: 12,
      network_access_mode: 0,
      subscriber_status: 0,
      access_restriction_data: 8,
      security: { k: 'key', amf: '8000' },
      ambr: { downlink: { value: 1, unit: 3 }, uplink: { value: 1, unit: 3 } },
      sessions: [{ name: 'internet', type: 3, qos: 9 }],
    };
    expect(sub.imsi).toBe('460110000000001');
    expect(sub.sessions[0].name).toBe('internet');
  });
});
