'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { getSlaDurationHours, calculateSlaDeadline, isSlaBreached, getSlaRemainingMs } = require('../src/rules/slaRules');

// ---------------------------------------------------------------------------
// SLA duration mapping
// ---------------------------------------------------------------------------

test('P1 → 2 hours',  () => assert.equal(getSlaDurationHours('P1'), 2));
test('P2 → 8 hours',  () => assert.equal(getSlaDurationHours('P2'), 8));
test('P3 → 24 hours', () => assert.equal(getSlaDurationHours('P3'), 24));
test('P4 → 72 hours', () => assert.equal(getSlaDurationHours('P4'), 72));
test('unknown priority defaults to 72 hours', () => assert.equal(getSlaDurationHours('P9'), 72));

// ---------------------------------------------------------------------------
// Deadline calculation
// ---------------------------------------------------------------------------

const BASE_TIME = '2026-09-22T10:00:00.000Z';

test('P1 deadline = createdAt + 2 hours', () => {
  const deadline = calculateSlaDeadline('P1', BASE_TIME);
  assert.equal(deadline, '2026-09-22T12:00:00.000Z');
});

test('P2 deadline = createdAt + 8 hours', () => {
  const deadline = calculateSlaDeadline('P2', BASE_TIME);
  assert.equal(deadline, '2026-09-22T18:00:00.000Z');
});

test('P3 deadline = createdAt + 24 hours', () => {
  const deadline = calculateSlaDeadline('P3', BASE_TIME);
  assert.equal(deadline, '2026-09-23T10:00:00.000Z');
});

test('P4 deadline = createdAt + 72 hours', () => {
  const deadline = calculateSlaDeadline('P4', BASE_TIME);
  assert.equal(deadline, '2026-09-25T10:00:00.000Z');
});

test('deadline is a valid ISO 8601 string', () => {
  const deadline = calculateSlaDeadline('P1', BASE_TIME);
  assert.doesNotThrow(() => new Date(deadline));
  assert.match(deadline, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

// ---------------------------------------------------------------------------
// Breach detection
// ---------------------------------------------------------------------------

test('RESOLVED incident is never SLA breached', () => {
  const pastDeadline = new Date(Date.now() - 10000).toISOString();
  assert.equal(isSlaBreached(pastDeadline, 'RESOLVED'), false);
});

test('OPEN incident with past deadline is breached', () => {
  const pastDeadline = new Date(Date.now() - 10000).toISOString();
  assert.equal(isSlaBreached(pastDeadline, 'OPEN'), true);
});

test('OPEN incident with future deadline is not breached', () => {
  const futureDeadline = new Date(Date.now() + 10000).toISOString();
  assert.equal(isSlaBreached(futureDeadline, 'OPEN'), false);
});

test('IN_PROGRESS incident with past deadline is breached', () => {
  const pastDeadline = new Date(Date.now() - 1).toISOString();
  assert.equal(isSlaBreached(pastDeadline, 'IN_PROGRESS'), true);
});

// ---------------------------------------------------------------------------
// Remaining time
// ---------------------------------------------------------------------------

test('getSlaRemainingMs returns negative value for past deadline', () => {
  const past = new Date(Date.now() - 60000).toISOString();
  assert.ok(getSlaRemainingMs(past) < 0);
});

test('getSlaRemainingMs returns positive value for future deadline', () => {
  const future = new Date(Date.now() + 60000).toISOString();
  assert.ok(getSlaRemainingMs(future) > 0);
});
