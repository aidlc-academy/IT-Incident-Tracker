'use strict';

/**
 * Incident Handler
 *
 * Thin HTTP adapter layer. Each exported function:
 *   1. Extracts inputs from the Express request (or Lambda event — see lambda/handler.js).
 *   2. Calls the service layer.
 *   3. Sends a structured response.
 *
 * No business logic lives here.
 */

const service      = require('../services/incidentService');
const { sendSuccess, sendError } = require('../utils/response');
const { validateIncidentId }     = require('../validators/incidentValidator');
const { ValidationError }        = require('../utils/errors');

// ───────────────────────────────────────────────────────────────────────────
// GET /health
// ───────────────────────────────────────────────────────────────────────────

async function health(req, res) {
  try {
    return sendSuccess(res, { status: 'healthy' });
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/incidents
// ───────────────────────────────────────────────────────────────────────────

async function createIncident(req, res) {
  try {
    const repo     = req.app.locals.repo;
    const user     = req.currentUser || 'unknown';
    const incident = await service.createIncident(req.body, user, repo);
    return sendSuccess(res, incident, 'Incident created successfully.', 201);
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/incidents
// ───────────────────────────────────────────────────────────────────────────

async function listIncidents(req, res) {
  try {
    const repo     = req.app.locals.repo;
    const filters  = {
      search:   req.query.search   || undefined,
      status:   req.query.status   || undefined,
      priority: req.query.priority || undefined,
      severity: req.query.severity || undefined,
    };
    const incidents = await service.listIncidents(filters, repo);
    return sendSuccess(res, incidents);
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/incidents/:id
// ───────────────────────────────────────────────────────────────────────────

async function getIncident(req, res) {
  try {
    const { id } = req.params;
    try { validateIncidentId(id); } catch (_) { /* let service return 404 for unknown format */ }
    const repo     = req.app.locals.repo;
    const incident = await service.getIncident(id, repo);
    return sendSuccess(res, incident);
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/incidents/:id
// ───────────────────────────────────────────────────────────────────────────

async function updateIncident(req, res) {
  try {
    const { id } = req.params;
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new ValidationError('Request body must not be empty.');
    }
    const repo     = req.app.locals.repo;
    const incident = await service.updateIncident(id, req.body, repo);
    return sendSuccess(res, incident, 'Incident updated successfully.');
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/incidents/:id
// ───────────────────────────────────────────────────────────────────────────

async function deleteIncident(req, res) {
  try {
    const { id } = req.params;
    const repo   = req.app.locals.repo;
    const result = await service.deleteIncident(id, repo);
    return sendSuccess(res, result, 'Incident deleted successfully.');
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/stats
// ───────────────────────────────────────────────────────────────────────────

async function getDashboardStats(req, res) {
  try {
    const repo  = req.app.locals.repo;
    const stats = await service.getDashboardStats(repo);
    return sendSuccess(res, stats);
  } catch (err) {
    return sendError(res, err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Auth handlers (demo only — session is client-side)
// ───────────────────────────────────────────────────────────────────────────

const { DEMO_USERS } = require('../models/incident');
const { UnauthorizedError } = require('../utils/errors');

async function login(req, res) {
  try {
    const { username } = req.body || {};
    if (!username) {
      throw new ValidationError('username is required.', 'username');
    }
    const user = DEMO_USERS.find((u) => u.username === username);
    if (!user) {
      throw new UnauthorizedError(`Unknown demo user: '${username}'.`);
    }
    return sendSuccess(res, user, `Welcome, ${user.displayName}!`);
  } catch (err) {
    return sendError(res, err);
  }
}

async function logout(req, res) {
  // Stateless backend — session lives in the client; nothing to clear server-side.
  return sendSuccess(res, null, 'Logged out successfully.');
}

module.exports = {
  health,
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  deleteIncident,
  getDashboardStats,
  login,
  logout,
};
