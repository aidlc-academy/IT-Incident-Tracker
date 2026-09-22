'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { triage, determinePriority, determineSeverity, determineCategory } = require('../src/rules/triageRules');

// ---------------------------------------------------------------------------
// Priority determination
// ---------------------------------------------------------------------------

test('P1 — keyword in title (production outage)', () => {
  const p = determinePriority('production outage in payments', '', '');
  assert.equal(p, 'P1');
});

test('P1 — keyword in description (all users affected)', () => {
  const p = determinePriority('DB issue', 'All users affected, complete failure', '');
  assert.equal(p, 'P1');
});

test('P1 — keyword case-insensitive', () => {
  const p = determinePriority('Production Outage', '', '');
  assert.equal(p, 'P1');
});

test('P1 — database unavailable keyword', () => {
  const p = determinePriority('Issue', 'Database unavailable for 30 minutes', '');
  assert.equal(p, 'P1');
});

test('P2 — payment failure keyword', () => {
  const p = determinePriority('Checkout broken', 'payment failure on checkout', '');
  assert.equal(p, 'P2');
});

test('P2 — authentication failure keyword', () => {
  const p = determinePriority('Login broken', 'authentication failure for multiple users', '');
  assert.equal(p, 'P2');
});

test('P2 — data loss keyword', () => {
  const p = determinePriority('Issue', 'Potential data loss detected', '');
  assert.equal(p, 'P2');
});

test('P3 — latency keyword', () => {
  const p = determinePriority('API slow', 'latency is above threshold', '');
  assert.equal(p, 'P3');
});

test('P3 — timeout keyword', () => {
  const p = determinePriority('Request timeout', 'Users experiencing timeout errors', '');
  assert.equal(p, 'P3');
});

test('P3 — intermittent keyword', () => {
  const p = determinePriority('Intermittent failures', '', '');
  assert.equal(p, 'P3');
});

test('P4 — default when no keyword matches', () => {
  const p = determinePriority('Minor UI glitch', 'Button colour is wrong', '');
  assert.equal(p, 'P4');
});

test('P1 wins over P3 when both keywords present', () => {
  const p = determinePriority('Slow response', 'production outage causing slow response for all users', '');
  assert.equal(p, 'P1');
});

test('businessImpact field is also searched', () => {
  const p = determinePriority('Unknown issue', 'no details', 'complete failure in production');
  assert.equal(p, 'P1');
});

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

test('severity: P1 → Critical', () => assert.equal(determineSeverity('P1'), 'Critical'));
test('severity: P2 → High',     () => assert.equal(determineSeverity('P2'), 'High'));
test('severity: P3 → Medium',   () => assert.equal(determineSeverity('P3'), 'Medium'));
test('severity: P4 → Low',      () => assert.equal(determineSeverity('P4'), 'Low'));

// ---------------------------------------------------------------------------
// Category determination
// ---------------------------------------------------------------------------

test('category: "Payment Gateway" service → Payment', () => {
  assert.equal(determineCategory('Payment Gateway'), 'Payment');
});

test('category: "Database" service → Database', () => {
  assert.equal(determineCategory('Database'), 'Database');
});

test('category: "Authentication Service" → Authentication', () => {
  assert.equal(determineCategory('Authentication Service'), 'Authentication');
});

test('category: "Frontend" service → Frontend', () => {
  assert.equal(determineCategory('Frontend'), 'Frontend');
});

test('category: unknown service → General', () => {
  assert.equal(determineCategory('Billing System'), 'General');
});

test('category: empty service → General', () => {
  assert.equal(determineCategory(''), 'General');
});

// ---------------------------------------------------------------------------
// Full triage pipeline
// ---------------------------------------------------------------------------

test('triage: Test A — production outage + all users affected → P1/Critical', () => {
  const result = triage(
    'Production outage',
    'All users affected, complete failure of payment service',
    'Payment Gateway'
  );
  assert.equal(result.priority, 'P1');
  assert.equal(result.severity, 'Critical');
  assert.equal(result.category, 'Payment');
});

test('triage: Test B — payment failure → P2/High', () => {
  const result = triage('Checkout error', 'payment failure on the checkout page', 'Backend API');
  assert.equal(result.priority, 'P2');
  assert.equal(result.severity, 'High');
});

test('triage: Test C — latency/slow → P3/Medium', () => {
  const result = triage('Slow API', 'Users reporting latency and slow response times', 'Backend API');
  assert.equal(result.priority, 'P3');
  assert.equal(result.severity, 'Medium');
});

test('triage: Test D — minor UI issue → P4/Low', () => {
  const result = triage('Button misaligned', 'Minor UI issue on profile page', 'Frontend');
  assert.equal(result.priority, 'P4');
  assert.equal(result.severity, 'Low');
  assert.equal(result.category, 'Frontend');
});
