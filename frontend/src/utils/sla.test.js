import { describe, it, expect } from 'vitest';
import { getSlaStatus, formatDateTime } from './sla';

// A fixed "now" keeps every assertion deterministic. The deadline values below
// are expressed relative to it, exactly as a persisted slaDeadline would be.
const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const HOUR = 3600_000;

const incident = (over = {}) => ({
  status: 'OPEN',
  slaDeadline: at(2 * HOUR),
  resolvedAt: null,
  ...over,
});

describe('getSlaStatus', () => {
  it('reports remaining time for a future deadline on an open incident', () => {
    const r = getSlaStatus(incident({ slaDeadline: at(2 * HOUR + 15 * 60_000) }), NOW);
    expect(r.label).toBe('2h 15m remaining');
    expect(r.breached).toBe(false);
    expect(r.resolved).toBe(false);
  });

  it('reports a breach for a past deadline on an unresolved incident', () => {
    const r = getSlaStatus(incident({ slaDeadline: at(-90 * 60_000) }), NOW);
    expect(r.label).toBe('SLA breached: 1h 30m ago');
    expect(r.breached).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('treats IN_PROGRESS past its deadline as breached', () => {
    const r = getSlaStatus(incident({ status: 'IN_PROGRESS', slaDeadline: at(-HOUR) }), NOW);
    expect(r.breached).toBe(true);
  });

  it('reports "Resolved within SLA" when resolved before the deadline', () => {
    const r = getSlaStatus(
      incident({ status: 'RESOLVED', slaDeadline: at(2 * HOUR), resolvedAt: at(HOUR) }),
      NOW
    );
    expect(r.label).toBe('Resolved within SLA');
    expect(r.breached).toBe(false);
    expect(r.resolved).toBe(true);
  });

  it('reports "Resolved (SLA breached)" when resolved after the deadline', () => {
    const r = getSlaStatus(
      incident({ status: 'RESOLVED', slaDeadline: at(-2 * HOUR), resolvedAt: at(-HOUR) }),
      NOW
    );
    expect(r.label).toBe('Resolved (SLA breached)');
    expect(r.breached).toBe(true);
    expect(r.resolved).toBe(true);
  });

  it('keeps the historical verdict fixed as time passes after resolution', () => {
    // Judged against resolvedAt, not the current clock: an incident resolved in
    // time must never later flip to "breached" simply because time moved on.
    const resolved = incident({
      status: 'RESOLVED',
      slaDeadline: at(2 * HOUR),
      resolvedAt: at(HOUR),
    });
    expect(getSlaStatus(resolved, NOW).breached).toBe(false);
    expect(getSlaStatus(resolved, NOW + 100 * HOUR).breached).toBe(false);
  });

  it('is not breached exactly at the deadline (boundary)', () => {
    const r = getSlaStatus(incident({ slaDeadline: at(0) }), NOW);
    expect(r.breached).toBe(false);
    expect(r.label).toBe('0m remaining');
  });

  it('formats durations spanning days', () => {
    expect(getSlaStatus(incident({ slaDeadline: at(72 * HOUR) }), NOW).label).toBe('3d remaining');
    expect(getSlaStatus(incident({ slaDeadline: at(25 * HOUR) }), NOW).label).toBe('1d 1h remaining');
  });

  it('omits a zero minute or hour component', () => {
    expect(getSlaStatus(incident({ slaDeadline: at(2 * HOUR) }), NOW).label).toBe('2h remaining');
    expect(getSlaStatus(incident({ slaDeadline: at(45 * 60_000) }), NOW).label).toBe('45m remaining');
  });

  it('degrades safely when no deadline is present', () => {
    expect(getSlaStatus({ status: 'OPEN' }, NOW)).toEqual({
      label: 'No SLA',
      breached: false,
      resolved: false,
    });
    expect(getSlaStatus(null, NOW).label).toBe('No SLA');
  });

  it('falls back to the current time when a resolved incident has no resolvedAt', () => {
    const r = getSlaStatus(
      { status: 'RESOLVED', slaDeadline: at(-HOUR), resolvedAt: null },
      NOW
    );
    expect(r.breached).toBe(true);
    expect(r.resolved).toBe(true);
  });
});

describe('formatDateTime', () => {
  it('renders an em dash for missing or unparseable values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  it('renders a real timestamp', () => {
    expect(formatDateTime('2026-09-22T12:00:00.000Z')).toMatch(/2026/);
  });
});
