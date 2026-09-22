'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { validateTransition, applyTransition, isValidTransition } = require('../src/rules/statusRules');
const { InvalidTransitionError, ValidationError } = require('../src/utils/errors');

// ---------------------------------------------------------------------------
// isValidTransition
// ---------------------------------------------------------------------------

test('OPEN → IN_PROGRESS is valid',   () => assert.equal(isValidTransition('OPEN', 'IN_PROGRESS'), true));
test('IN_PROGRESS → RESOLVED is valid', () => assert.equal(isValidTransition('IN_PROGRESS', 'RESOLVED'), true));
test('IN_PROGRESS → OPEN is valid',   () => assert.equal(isValidTransition('IN_PROGRESS', 'OPEN'), true));
test('RESOLVED → OPEN is valid',      () => assert.equal(isValidTransition('RESOLVED', 'OPEN'), true));
test('OPEN → RESOLVED is invalid',    () => assert.equal(isValidTransition('OPEN', 'RESOLVED'), false));
test('RESOLVED → IN_PROGRESS is invalid', () => assert.equal(isValidTransition('RESOLVED', 'IN_PROGRESS'), false));

// ---------------------------------------------------------------------------
// validateTransition — throws on bad transitions
// ---------------------------------------------------------------------------

test('OPEN → RESOLVED throws InvalidTransitionError', () => {
  assert.throws(
    () => validateTransition('OPEN', 'RESOLVED'),
    (err) => err instanceof InvalidTransitionError
  );
});

test('RESOLVED → IN_PROGRESS throws InvalidTransitionError', () => {
  assert.throws(
    () => validateTransition('RESOLVED', 'IN_PROGRESS'),
    (err) => err instanceof InvalidTransitionError
  );
});

test('same status → same status throws InvalidTransitionError', () => {
  assert.throws(
    () => validateTransition('OPEN', 'OPEN'),
    (err) => err instanceof InvalidTransitionError
  );
});

test('valid transition does not throw', () => {
  assert.doesNotThrow(() => validateTransition('OPEN', 'IN_PROGRESS'));
});

// ---------------------------------------------------------------------------
// applyTransition
// ---------------------------------------------------------------------------

const openIncident = { id: 'INC-TEST', status: 'OPEN', resolutionNote: null, resolvedAt: null };

test('applyTransition OPEN → IN_PROGRESS returns correct patch', () => {
  const patch = applyTransition(openIncident, 'IN_PROGRESS', null);
  assert.equal(patch.status, 'IN_PROGRESS');
  assert.ok(patch.updatedAt);
  assert.equal(patch.resolvedAt, undefined); // not set
});

test('applyTransition IN_PROGRESS → RESOLVED sets resolvedAt and resolutionNote', () => {
  const inProgress = { ...openIncident, status: 'IN_PROGRESS' };
  const patch = applyTransition(inProgress, 'RESOLVED', 'Fixed the database connection pool.');
  assert.equal(patch.status, 'RESOLVED');
  assert.ok(patch.resolvedAt);
  assert.equal(patch.resolutionNote, 'Fixed the database connection pool.');
});

test('applyTransition RESOLVED without resolution note throws ValidationError', () => {
  const inProgress = { ...openIncident, status: 'IN_PROGRESS' };
  assert.throws(
    () => applyTransition(inProgress, 'RESOLVED', null),
    (err) => err instanceof ValidationError && err.field === 'resolutionNote'
  );
});

test('applyTransition RESOLVED with note < 10 chars throws ValidationError', () => {
  const inProgress = { ...openIncident, status: 'IN_PROGRESS' };
  assert.throws(
    () => applyTransition(inProgress, 'RESOLVED', 'Fixed.'),
    (err) => err instanceof ValidationError
  );
});

test('applyTransition RESOLVED → OPEN clears resolvedAt and resolutionNote', () => {
  const resolved = { id: 'INC-TEST', status: 'RESOLVED', resolvedAt: '2026-01-01T00:00:00Z', resolutionNote: 'Fixed.' };
  const patch = applyTransition(resolved, 'OPEN', null);
  assert.equal(patch.status, 'OPEN');
  assert.equal(patch.resolvedAt, null);
  assert.equal(patch.resolutionNote, null);
});
