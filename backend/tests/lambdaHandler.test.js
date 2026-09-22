'use strict';

/**
 * Lambda adapter — API Gateway payload format handling.
 *
 * serverless.yml wires the function to `httpApi` events, which deliver payload
 * format 2.0 (`requestContext.http.method` + `rawPath`). Payload format 1.0
 * (`httpMethod` + `path`) arrives from REST API / `http` events. The router
 * must understand both; reading only 1.0 fields made every 2.0 request fall
 * through to the 404 branch.
 *
 * These cases exercise only the public and unauthenticated routes, which never
 * construct the DynamoDB repository (it is created lazily after auth), so the
 * suite runs without a live database.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// The router builds its repository once it has authenticated a caller. Naming a
// table and a local endpoint lets that construction succeed; the AWS SDK opens
// no connection until a command is actually sent, so no database is contacted
// by the routes exercised here.
process.env.DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'incidentiq-incidents-test';
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const { handler } = require('../src/lambda/handler');

/** API Gateway HTTP API (httpApi) — payload format 2.0. */
function v2(method, path, { headers = {}, body, query } = {}) {
  return {
    version: '2.0',
    rawPath: path,
    rawQueryString: query ? new URLSearchParams(query).toString() : '',
    queryStringParameters: query || null,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    requestContext: { http: { method, path } },
  };
}

/** API Gateway REST API — payload format 1.0. */
function v1(method, path, { headers = {}, body, query } = {}) {
  return {
    httpMethod: method,
    path,
    headers,
    queryStringParameters: query || null,
    body: body ? JSON.stringify(body) : undefined,
  };
}

const parse = (res) => JSON.parse(res.body);

for (const [label, build] of [['payload 2.0', v2], ['payload 1.0', v1]]) {
  test(`${label}: GET /health returns 200 without auth`, async () => {
    const res = await handler(build('GET', '/health'));
    assert.equal(res.statusCode, 200);
    assert.equal(parse(res).data.status, 'healthy');
  });

  test(`${label}: OPTIONS preflight returns 200 with CORS headers`, async () => {
    const res = await handler(build('OPTIONS', '/api/incidents'));
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
    assert.match(res.headers['Access-Control-Allow-Headers'], /x-demo-user/);
  });

  test(`${label}: POST /api/login accepts a known demo user`, async () => {
    const res = await handler(build('POST', '/api/login', { body: { username: 'alice' } }));
    assert.equal(res.statusCode, 200);
    assert.equal(parse(res).data.role, 'Admin');
  });

  test(`${label}: POST /api/login rejects an unknown user with 401`, async () => {
    const res = await handler(build('POST', '/api/login', { body: { username: 'mallory' } }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).error.code, 'UNAUTHORIZED');
  });

  test(`${label}: POST /api/login without a username returns 400`, async () => {
    const res = await handler(build('POST', '/api/login', { body: {} }));
    assert.equal(res.statusCode, 400);
    assert.equal(parse(res).error.code, 'VALIDATION_ERROR');
  });

  test(`${label}: POST /api/logout returns 200`, async () => {
    assert.equal((await handler(build('POST', '/api/logout'))).statusCode, 200);
  });

  test(`${label}: protected route without x-demo-user returns 401, not 404`, async () => {
    const res = await handler(build('GET', '/api/incidents'));
    assert.equal(res.statusCode, 401, 'an unrouted request would wrongly yield 404');
    assert.equal(parse(res).error.code, 'UNAUTHORIZED');
  });

  test(`${label}: protected route with an unknown user returns 401`, async () => {
    const res = await handler(build('GET', '/api/incidents', { headers: { 'x-demo-user': 'nobody' } }));
    assert.equal(res.statusCode, 401);
  });

  test(`${label}: unknown route returns a structured 404 once authenticated`, async () => {
    // The Lambda authenticates before dispatching, so an unknown route without
    // credentials answers 401 rather than revealing that the route is absent.
    const anon = await handler(build('GET', '/api/nonsense'));
    assert.equal(anon.statusCode, 401);

    const res = await handler(build('GET', '/api/nonsense', { headers: { 'x-demo-user': 'alice' } }));
    assert.equal(res.statusCode, 404);
    assert.equal(parse(res).error.code, 'NOT_FOUND');
  });
}

test('payload 2.0: header casing from API Gateway is accepted', async () => {
  // Format 2.0 lower-cases header names; format 1.0 preserves client casing.
  const lower = await handler(v2('GET', '/api/incidents', { headers: { 'x-demo-user': 'nobody' } }));
  const upper = await handler(v1('GET', '/api/incidents', { headers: { 'X-Demo-User': 'nobody' } }));
  assert.equal(lower.statusCode, 401);
  assert.equal(upper.statusCode, 401);
  // Both reached auth rather than falling through to the 404 branch.
  assert.equal(JSON.parse(lower.body).error.code, 'UNAUTHORIZED');
  assert.equal(JSON.parse(upper.body).error.code, 'UNAUTHORIZED');
});

test('every response carries CORS headers', async () => {
  for (const ev of [v2('GET', '/health'), v2('GET', '/api/nonsense'), v2('GET', '/api/incidents')]) {
    const res = await handler(ev);
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  }
});
