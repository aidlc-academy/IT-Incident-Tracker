'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { validateCreatePayload, validateUpdatePayload, validateEngineer } = require('../src/validators/incidentValidator');
const { ValidationError } = require('../src/utils/errors');

const VALID_BODY = {
  title:          'Production outage in payment service',
  description:    'All users affected and experiencing complete failure of the payment gateway.',
  service:        'Payment Gateway',
  businessImpact: 'Revenue loss — all transactions failing.',
};

// ---------------------------------------------------------------------------
// validateCreatePayload — valid
// ---------------------------------------------------------------------------

test('valid payload passes without throwing', () => {
  assert.doesNotThrow(() => validateCreatePayload(VALID_BODY));
});

test('valid payload returns sanitised fields', () => {
  const result = validateCreatePayload(VALID_BODY);
  assert.equal(result.title, VALID_BODY.title);
  assert.ok(result.businessImpact);
});

// ---------------------------------------------------------------------------
// validateCreatePayload — required fields
// ---------------------------------------------------------------------------

test('missing title throws ValidationError', () => {
  const body = { ...VALID_BODY, title: undefined };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'title');
});

test('empty title throws ValidationError', () => {
  const body = { ...VALID_BODY, title: '' };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'title');
});

test('title too short (< 5 chars) throws ValidationError', () => {
  const body = { ...VALID_BODY, title: 'Hi' };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'title');
});

test('title too long (> 200 chars) throws ValidationError', () => {
  const body = { ...VALID_BODY, title: 'A'.repeat(201) };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'title');
});

test('missing description throws ValidationError', () => {
  const body = { ...VALID_BODY, description: undefined };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'description');
});

test('description too short (< 10 chars) throws ValidationError', () => {
  const body = { ...VALID_BODY, description: 'Short.' };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'description');
});

test('missing service throws ValidationError', () => {
  const body = { ...VALID_BODY, service: undefined };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'service');
});

test('missing businessImpact throws ValidationError', () => {
  const body = { ...VALID_BODY, businessImpact: undefined };
  assert.throws(() => validateCreatePayload(body), (e) => e instanceof ValidationError && e.field === 'businessImpact');
});

test('null body throws ValidationError', () => {
  assert.throws(() => validateCreatePayload(null), (e) => e instanceof ValidationError);
});

// ---------------------------------------------------------------------------
// validateUpdatePayload — partial updates
// ---------------------------------------------------------------------------

test('empty body returns empty patch object', () => {
  const patch = validateUpdatePayload({});
  assert.deepEqual(patch, {});
});

test('valid title update is accepted', () => {
  const patch = validateUpdatePayload({ title: 'Updated title here' });
  assert.equal(patch.title, 'Updated title here');
});

test('invalid title in update throws ValidationError', () => {
  assert.throws(() => validateUpdatePayload({ title: 'Hi' }), (e) => e instanceof ValidationError && e.field === 'title');
});

test('valid status in update is accepted', () => {
  const patch = validateUpdatePayload({ status: 'IN_PROGRESS' });
  assert.equal(patch.status, 'IN_PROGRESS');
});

test('invalid status in update throws ValidationError', () => {
  assert.throws(() => validateUpdatePayload({ status: 'FLYING' }), (e) => e instanceof ValidationError && e.field === 'status');
});

// ---------------------------------------------------------------------------
// validateEngineer
// ---------------------------------------------------------------------------

test('null assignedEngineer is accepted (unassign)', () => {
  assert.equal(validateEngineer(null), null);
});

test('valid engineer name is accepted', () => {
  assert.equal(validateEngineer('John Smith'), 'John Smith');
});

test('unknown engineer name throws ValidationError', () => {
  assert.throws(() => validateEngineer('Nobody Here'), (e) => e instanceof ValidationError && e.field === 'assignedEngineer');
});
