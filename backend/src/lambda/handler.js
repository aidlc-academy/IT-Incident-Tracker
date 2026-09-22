'use strict';

/**
 * AWS Lambda entry point.
 *
 * A thin router that maps API Gateway HTTP method + path to the same
 * service functions used by the Express local server.
 * Business logic is not duplicated here.
 */

const service   = require('../services/incidentService');
const { createRepository }  = require('../repositories/incidentRepository');
const { lambdaSuccess, lambdaError, corsHeaders } = require('../utils/response');
const { DEMO_USERS }        = require('../models/incident');
const { UnauthorizedError, ValidationError, NotFoundError } = require('../utils/errors');

// ───────────────────────────────────────────────────────────────────────────
// Repository (created once per Lambda cold start)
// ───────────────────────────────────────────────────────────────────────────

let _repo;
function getRepo() {
  if (!_repo) {
    _repo = createRepository('dynamodb', {
      tableName: process.env.DYNAMODB_TABLE,
      region:    process.env.AWS_REGION || 'us-east-1',
    });
  }
  return _repo;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function extractId(path) {
  // path: /incidents/{id}  or  /api/incidents/{id}
  const parts = path.replace(/^\//, '').split('/');
  return parts[parts.length - 1];
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    throw new ValidationError('Request body is not valid JSON.');
  }
}

function getUser(headers) {
  const h = headers || {};
  return h['x-demo-user'] || h['X-Demo-User'] || null;
}

function requireAuth(headers) {
  const username = getUser(headers);
  if (!username) throw new UnauthorizedError('x-demo-user header is required.');
  const user = DEMO_USERS.find((u) => u.username === username);
  if (!user) throw new UnauthorizedError(`Unknown demo user: '${username}'.`);
  return user.username;
}

// ───────────────────────────────────────────────────────────────────────────
// Lambda handler
// ───────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  const { httpMethod, path, queryStringParameters, headers } = event;
  const qs = queryStringParameters || {};

  try {
    // ── Health ──────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && (path === '/health' || path === '/api/health')) {
      return lambdaSuccess({ status: 'healthy' });
    }

    // ── Login (no auth required) ────────────────────────────────────────
    if (httpMethod === 'POST' && (path === '/api/login' || path === '/login')) {
      const body = parseBody(event);
      const { username } = body;
      if (!username) throw new ValidationError('username is required.', 'username');
      const user = DEMO_USERS.find((u) => u.username === username);
      if (!user) throw new UnauthorizedError(`Unknown demo user: '${username}'.`);
      return lambdaSuccess(user, `Welcome, ${user.displayName}!`);
    }

    // ── Logout (no auth required) ───────────────────────────────────────
    if (httpMethod === 'POST' && (path === '/api/logout' || path === '/logout')) {
      return lambdaSuccess(null, 'Logged out successfully.');
    }

    // All routes below require authentication
    const currentUser = requireAuth(headers);
    const repo        = getRepo();

    // ── GET /api/incidents ───────────────────────────────────────────────
    if (httpMethod === 'GET' && (path === '/api/incidents' || path === '/incidents')) {
      const filters = {
        search:   qs.search   || undefined,
        status:   qs.status   || undefined,
        priority: qs.priority || undefined,
        severity: qs.severity || undefined,
      };
      const incidents = await service.listIncidents(filters, repo);
      return lambdaSuccess(incidents);
    }

    // ── POST /api/incidents ──────────────────────────────────────────────
    if (httpMethod === 'POST' && (path === '/api/incidents' || path === '/incidents')) {
      const body     = parseBody(event);
      const incident = await service.createIncident(body, currentUser, repo);
      return lambdaSuccess(incident, 'Incident created successfully.', 201);
    }

    // ── GET /api/incidents/:id ───────────────────────────────────────────
    if (httpMethod === 'GET' && /\/incidents\/[^/]+$/.test(path)) {
      const id       = extractId(path);
      const incident = await service.getIncident(id, repo);
      return lambdaSuccess(incident);
    }

    // ── PUT /api/incidents/:id ───────────────────────────────────────────
    if (httpMethod === 'PUT' && /\/incidents\/[^/]+$/.test(path)) {
      const id       = extractId(path);
      const body     = parseBody(event);
      const incident = await service.updateIncident(id, body, repo);
      return lambdaSuccess(incident, 'Incident updated successfully.');
    }

    // ── DELETE /api/incidents/:id ────────────────────────────────────────
    if (httpMethod === 'DELETE' && /\/incidents\/[^/]+$/.test(path)) {
      const id    = extractId(path);
      const result = await service.deleteIncident(id, repo);
      return lambdaSuccess(result, 'Incident deleted successfully.');
    }

    // ── GET /api/stats ───────────────────────────────────────────────────
    if (httpMethod === 'GET' && (path === '/api/stats' || path === '/stats')) {
      const stats = await service.getDashboardStats(repo);
      return lambdaSuccess(stats);
    }

    // ── 404 ──────────────────────────────────────────────────────────────
    return {
      statusCode: 404,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${httpMethod} ${path} not found.` },
      }),
    };

  } catch (err) {
    return lambdaError(err);
  }
};
