'use strict';

/**
 * API integration tests.
 *
 * Uses the real Express app wired to an isolated in-memory-backed storage
 * by pointing DATA_FILE at a temp file that is cleaned up after each suite.
 *
 * No AWS credentials, no DynamoDB needed.
 *
 * Run:  node --test tests/api.test.js
 *       (or:  npm test)
 */

const { test, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const http    = require('node:http');
const fs      = require('node:fs');
const path    = require('node:path');
const os      = require('node:os');

// ── temporary data file ──────────────────────────────────────────────────
const TMP_FILE = path.join(os.tmpdir(), `incidentiq-test-${Date.now()}.json`);

process.env.STORAGE_MODE = 'local';
process.env.DATA_FILE    = TMP_FILE;
process.env.PORT         = '0'; // OS assigns an available port

// Reset the data file before each test to ensure isolation
function resetDataFile() {
  fs.writeFileSync(TMP_FILE, JSON.stringify({ incidents: [] }), 'utf8');
}

// ── HTTP helper ──────────────────────────────────────────────────────────
function req(server, method, urlPath, body, user = 'alice') {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const addr    = server.address();
    const options = {
      hostname: '127.0.0.1',
      port:     addr.port,
      path:     urlPath,
      method,
      headers: {
        'Content-Type':  'application/json',
        'x-demo-user':   user,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const request = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

// ── App + server ─────────────────────────────────────────────────────────
// Require AFTER setting env vars so server.js picks them up
let app, server;

before(async () => {
  resetDataFile();
  app    = require('../src/local/server');
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
});

after(async () => {
  server.close();
  try { fs.unlinkSync(TMP_FILE); } catch { /* already gone */ }
});

beforeEach(() => resetDataFile());

// ── Convenience ──────────────────────────────────────────────────────────
const VALID_INCIDENT = {
  title:          'Production outage affecting all users',
  description:    'Complete failure — all users are unable to access the platform.',
  service:        'Backend API',
  businessImpact: 'Revenue loss — all transactions failing.',
};

async function createTestIncident(overrides = {}) {
  const r = await req(server, 'POST', '/api/incidents', { ...VALID_INCIDENT, ...overrides });
  assert.equal(r.status, 201, `Create failed: ${JSON.stringify(r.body)}`);
  return r.body.data;
}

// ─────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────

test('GET /health → 200 healthy', async () => {
  const r = await req(server, 'GET', '/health', null, undefined);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'healthy');
});

// ─────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────

test('POST /api/login — valid demo user → 200', async () => {
  const r = await req(server, 'POST', '/api/login', { username: 'alice' }, undefined);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.username, 'alice');
  assert.equal(r.body.data.role, 'Admin');
});

test('POST /api/login — unknown user → 401', async () => {
  const r = await req(server, 'POST', '/api/login', { username: 'nobody' }, undefined);
  assert.equal(r.status, 401);
  assert.equal(r.body.success, false);
});

test('GET /api/incidents — missing auth header → 401', async () => {
  const r = await req(server, 'GET', '/api/incidents', null, '');
  assert.equal(r.status, 401);
});

// ─────────────────────────────────────────────────────────────────────────
// CREATE INCIDENT
// ─────────────────────────────────────────────────────────────────────────

test('POST /api/incidents — valid payload → 201', async () => {
  const r = await req(server, 'POST', '/api/incidents', VALID_INCIDENT);
  assert.equal(r.status, 201);
  assert.equal(r.body.success, true);
  assert.ok(r.body.data.id);
  assert.ok(r.body.data.id.startsWith('INC-'));
  assert.equal(r.body.data.status, 'OPEN');
});

test('POST /api/incidents — missing title → 400', async () => {
  const body = { ...VALID_INCIDENT, title: undefined };
  const r    = await req(server, 'POST', '/api/incidents', body);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  assert.equal(r.body.error.field, 'title');
});

test('POST /api/incidents — title too short → 400', async () => {
  const r = await req(server, 'POST', '/api/incidents', { ...VALID_INCIDENT, title: 'Oops' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'title');
});

test('POST /api/incidents — missing description → 400', async () => {
  const r = await req(server, 'POST', '/api/incidents', { ...VALID_INCIDENT, description: undefined });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'description');
});

test('POST /api/incidents — missing service → 400', async () => {
  const r = await req(server, 'POST', '/api/incidents', { ...VALID_INCIDENT, service: undefined });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'service');
});

test('POST /api/incidents — missing businessImpact → 400', async () => {
  const r = await req(server, 'POST', '/api/incidents', { ...VALID_INCIDENT, businessImpact: undefined });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'businessImpact');
});

// ─────────────────────────────────────────────────────────────────────────
// TRIAGE — automatic category, severity, priority
// ─────────────────────────────────────────────────────────────────────────

test('Triage A: production outage + all users affected → P1/Critical', async () => {
  const incident = await createTestIncident({
    title:       'Production outage',
    description: 'All users affected — complete failure of the platform.',
  });
  assert.equal(incident.priority, 'P1');
  assert.equal(incident.severity, 'Critical');
});

test('Triage B: payment failure → P2/High', async () => {
  const incident = await createTestIncident({
    title:       'Checkout broken',
    description: 'payment failure occurring for all customers at checkout.',
  });
  assert.equal(incident.priority, 'P2');
  assert.equal(incident.severity, 'High');
});

test('Triage C: latency/slow service → P3/Medium', async () => {
  const incident = await createTestIncident({
    title:       'API latency spike',
    description: 'Users are experiencing slow response times and latency above 5 seconds.',
  });
  assert.equal(incident.priority, 'P3');
  assert.equal(incident.severity, 'Medium');
});

test('Triage D: minor UI issue → P4/Low', async () => {
  const incident = await createTestIncident({
    title:       'Button misaligned on profile page',
    description: 'Minor cosmetic issue — the save button appears slightly misaligned.',
    service:     'Frontend',
    businessImpact: 'Cosmetic only, no functional impact.',
  });
  assert.equal(incident.priority, 'P4');
  assert.equal(incident.severity, 'Low');
});

test('Automatic category from service field', async () => {
  const incident = await createTestIncident({ service: 'Payment Gateway' });
  assert.equal(incident.category, 'Payment');
});

// ─────────────────────────────────────────────────────────────────────────
// SLA calculation
// ─────────────────────────────────────────────────────────────────────────

test('P1 incident has slaDeadline 2 hours after createdAt', async () => {
  const incident = await createTestIncident({
    title:       'Production outage',
    description: 'All users affected complete failure',
  });
  assert.equal(incident.priority, 'P1');
  const created  = new Date(incident.createdAt).getTime();
  const deadline = new Date(incident.slaDeadline).getTime();
  const diffHours = (deadline - created) / 3600000;
  assert.ok(Math.abs(diffHours - 2) < 0.01, `Expected 2h diff, got ${diffHours}`);
});

test('P2 incident has slaDeadline 8 hours after createdAt', async () => {
  const incident = await createTestIncident({
    title: 'payment failure', description: 'Payment failure for multiple users on checkout',
  });
  assert.equal(incident.priority, 'P2');
  const diffHours = (new Date(incident.slaDeadline) - new Date(incident.createdAt)) / 3600000;
  assert.ok(Math.abs(diffHours - 8) < 0.01);
});

test('P3 incident has slaDeadline 24 hours after createdAt', async () => {
  const incident = await createTestIncident({
    title: 'slow API', description: 'Users are experiencing latency and timeout issues on the dashboard.',
  });
  assert.equal(incident.priority, 'P3');
  const diffHours = (new Date(incident.slaDeadline) - new Date(incident.createdAt)) / 3600000;
  assert.ok(Math.abs(diffHours - 24) < 0.01);
});

test('P4 incident has slaDeadline 72 hours after createdAt', async () => {
  const incident = await createTestIncident({
    title: 'Minor UI cosmetic', description: 'A cosmetic glitch on the profile screen, no functional impact.',
    service: 'Frontend', businessImpact: 'No business impact whatsoever.',
  });
  assert.equal(incident.priority, 'P4');
  const diffHours = (new Date(incident.slaDeadline) - new Date(incident.createdAt)) / 3600000;
  assert.ok(Math.abs(diffHours - 72) < 0.01);
});

test('slaDuration field is persisted', async () => {
  const incident = await createTestIncident();
  assert.ok(incident.slaDuration !== undefined);
});

// ─────────────────────────────────────────────────────────────────────────
// GET INCIDENTS
// ─────────────────────────────────────────────────────────────────────────

test('GET /api/incidents — empty table → []', async () => {
  const r = await req(server, 'GET', '/api/incidents');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, []);
  assert.equal(r.body.count, 0);
});

test('GET /api/incidents — returns persisted incidents', async () => {
  await createTestIncident();
  await createTestIncident({ title: 'Second incident here' });
  const r = await req(server, 'GET', '/api/incidents');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 2);
});

test('GET /api/incidents?status=OPEN — filters by status', async () => {
  await createTestIncident();
  const r = await req(server, 'GET', '/api/incidents?status=OPEN');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.every((i) => i.status === 'OPEN'));
});

test('GET /api/incidents?status=RESOLVED — empty when none resolved', async () => {
  await createTestIncident();
  const r = await req(server, 'GET', '/api/incidents?status=RESOLVED');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, []);
});

test('GET /api/incidents?search=<keyword> — filters by title', async () => {
  await createTestIncident({ title: 'UniqueSearchableTitle incident here' });
  await createTestIncident({ title: 'Completely different title here' });
  const r = await req(server, 'GET', '/api/incidents?search=UniqueSearchable');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  assert.ok(r.body.data[0].title.includes('UniqueSearchable'));
});

// ─────────────────────────────────────────────────────────────────────────
// GET INCIDENT BY ID
// ─────────────────────────────────────────────────────────────────────────

test('GET /api/incidents/:id — returns correct incident', async () => {
  const incident = await createTestIncident();
  const r        = await req(server, 'GET', `/api/incidents/${incident.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, incident.id);
});

test('GET /api/incidents/:id — nonexistent id → 404', async () => {
  const r = await req(server, 'GET', '/api/incidents/INC-NOTEXIST-0000');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'INCIDENT_NOT_FOUND');
});

// ─────────────────────────────────────────────────────────────────────────
// UPDATE INCIDENT
// ─────────────────────────────────────────────────────────────────────────

test('PUT /api/incidents/:id — update title', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    title: 'Updated title that is long enough',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.title, 'Updated title that is long enough');
  assert.equal(r.body.data.id, incident.id);
  assert.equal(r.body.data.createdAt, incident.createdAt); // immutable
});

test('PUT /api/incidents/:id — preserves immutable fields', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    title: 'Another updated title longer',
  });
  assert.equal(r.body.data.priority,    incident.priority);
  assert.equal(r.body.data.slaDeadline, incident.slaDeadline);
  assert.equal(r.body.data.createdAt,   incident.createdAt);
});

test('PUT /api/incidents/:id — engineer assignment', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    assignedEngineer: 'John Smith',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.assignedEngineer, 'John Smith');
});

test('PUT /api/incidents/:id — invalid engineer name → 400', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    assignedEngineer: 'Nobody Known',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'assignedEngineer');
});

// ─────────────────────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────

test('Valid transition: OPEN → IN_PROGRESS', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'IN_PROGRESS' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'IN_PROGRESS');
});

test('Invalid transition: OPEN → RESOLVED → 409', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'RESOLVED' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('Valid transition: IN_PROGRESS → RESOLVED with note', async () => {
  const incident = await createTestIncident();
  // First: OPEN → IN_PROGRESS
  await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'IN_PROGRESS' });
  // Then: IN_PROGRESS → RESOLVED
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    status:         'RESOLVED',
    resolutionNote: 'Fixed the database connection pool configuration.',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'RESOLVED');
  assert.ok(r.body.data.resolvedAt);
  assert.equal(r.body.data.resolutionNote, 'Fixed the database connection pool configuration.');
});

test('Resolve without resolution note → 400', async () => {
  const incident = await createTestIncident();
  await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'IN_PROGRESS' });
  const r = await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'RESOLVED' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.field, 'resolutionNote');
});

test('Resolved incident retains SLA information', async () => {
  const incident = await createTestIncident();
  await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'IN_PROGRESS' });
  await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    status: 'RESOLVED',
    resolutionNote: 'Root cause identified and fixed permanently.',
  });
  const r = await req(server, 'GET', `/api/incidents/${incident.id}`);
  assert.ok(r.body.data.slaDeadline);
  assert.equal(r.body.data.slaDeadline, incident.slaDeadline);
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE INCIDENT
// ─────────────────────────────────────────────────────────────────────────

test('DELETE /api/incidents/:id — deletes existing incident → 200', async () => {
  const incident = await createTestIncident();
  const r = await req(server, 'DELETE', `/api/incidents/${incident.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.deleted, true);
});

test('DELETE /api/incidents/:id — verify gone after delete → 404', async () => {
  const incident = await createTestIncident();
  await req(server, 'DELETE', `/api/incidents/${incident.id}`);
  const r = await req(server, 'GET', `/api/incidents/${incident.id}`);
  assert.equal(r.status, 404);
});

test('DELETE /api/incidents/:id — nonexistent → 404', async () => {
  const r = await req(server, 'DELETE', `/api/incidents/INC-NOTEXIST-0000`);
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'INCIDENT_NOT_FOUND');
});

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────

test('GET /api/stats — returns real counts', async () => {
  await createTestIncident();
  await createTestIncident({ title: 'Second test incident here' });
  const r = await req(server, 'GET', '/api/stats');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 2);
  assert.equal(r.body.data.open,  2);
  assert.equal(r.body.data.resolved, 0);
});

test('GET /api/stats — updates after resolve', async () => {
  const incident = await createTestIncident();
  await req(server, 'PUT', `/api/incidents/${incident.id}`, { status: 'IN_PROGRESS' });
  await req(server, 'PUT', `/api/incidents/${incident.id}`, {
    status: 'RESOLVED',
    resolutionNote: 'All systems restored after emergency maintenance.',
  });
  const r = await req(server, 'GET', '/api/stats');
  assert.equal(r.body.data.resolved,   1);
  assert.equal(r.body.data.inProgress, 0);
  assert.equal(r.body.data.open,       0);
});

// ─────────────────────────────────────────────────────────────────────────
// PERSISTENCE — data survives without process restart (file on disk)
// ─────────────────────────────────────────────────────────────────────────

test('Data persists — incident survives a re-read of the data file', async () => {
  const incident = await createTestIncident({ title: 'Persistence check incident here' });
  // Read file directly to confirm it was actually written
  const raw  = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
  const found = raw.incidents.find((i) => i.id === incident.id);
  assert.ok(found, 'Incident not found in data file after creation');
  assert.equal(found.title, 'Persistence check incident here');
});
