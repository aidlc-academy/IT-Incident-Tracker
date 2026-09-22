'use strict';

/**
 * Incident Service
 *
 * Orchestrates business logic for all incident operations.
 * Depends on the repository interface — does NOT know whether the
 * underlying store is DynamoDB or a JSON file.
 *
 * Responsibilities:
 *   - Input validation (delegates to incidentValidator)
 *   - Triage (delegates to triageRules)
 *   - SLA calculation (delegates to slaRules)
 *   - Status transition enforcement (delegates to statusRules)
 *   - ID generation
 *   - Timestamp management
 *   - CRUD coordination
 */

const { v4: uuidv4 } = require('uuid');

const { validateCreatePayload, validateUpdatePayload } = require('../validators/incidentValidator');
const { triage }               = require('../rules/triageRules');
const { calculateSlaDeadline, getSlaDurationHours } = require('../rules/slaRules');
const { applyTransition }      = require('../rules/statusRules');
const { NotFoundError }        = require('../utils/errors');
const { STATUSES }             = require('../models/incident');

// ───────────────────────────────────────────────────────────────────────────
// ID generation
// ───────────────────────────────────────────────────────────────────────────

function generateId() {
  // Format: INC-<13-digit timestamp>-<4 random hex chars upper-cased>
  const ts     = Date.now();
  const suffix = uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `INC-${ts}-${suffix}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Service methods
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create a new incident.
 *
 * @param {object} body       raw request body
 * @param {string} createdBy  username from auth header
 * @param {object} repo       repository instance
 * @returns {object}          persisted incident
 */
async function createIncident(body, createdBy, repo) {
  const { title, description, service, businessImpact } = validateCreatePayload(body);

  const { priority, severity, category } = triage(title, description, service, businessImpact);

  const now         = new Date().toISOString();
  const id          = generateId();
  const slaDuration = getSlaDurationHours(priority);
  const slaDeadline = calculateSlaDeadline(priority, now);

  const incident = {
    id,
    title,
    description,
    service,
    businessImpact,
    category,
    severity,
    priority,
    status:           STATUSES.OPEN,
    assignedEngineer: null,
    resolutionNote:   null,
    resolvedAt:       null,
    createdBy:        createdBy || 'unknown',
    createdAt:        now,
    updatedAt:        now,
    slaDuration,         // hours, for reference
    slaDeadline,
  };

  return repo.save(incident);
}

/**
 * Return all incidents, optionally filtered.
 *
 * @param {object} filters  { search?, status?, priority?, severity? }
 * @param {object} repo
 * @returns {object[]}
 */
async function listIncidents(filters, repo) {
  return repo.readAll(filters);
}

/**
 * Return a single incident by ID.
 * Throws NotFoundError if not found.
 *
 * @param {string} id
 * @param {object} repo
 * @returns {object}
 */
async function getIncident(id, repo) {
  const incident = await repo.readOne(id);
  if (!incident) {
    throw new NotFoundError(`Incident '${id}' was not found.`);
  }
  return incident;
}

/**
 * Update permitted fields on an existing incident.
 *
 * Rules:
 *  - id, createdAt, createdBy, priority, severity, category, slaDeadline, slaDuration
 *    are immutable after creation.
 *  - Status changes are routed through the state machine.
 *  - updatedAt is always refreshed on a successful update.
 *
 * @param {string} id
 * @param {object} body
 * @param {object} repo
 * @returns {object} updated incident
 */
async function updateIncident(id, body, repo) {
  const existing = await repo.readOne(id);
  if (!existing) {
    throw new NotFoundError(`Incident '${id}' was not found.`);
  }

  // Validate and sanitise the incoming patch.
  // validateUpdatePayload also extracts and validates `status` if present.
  const patch = validateUpdatePayload(body);

  let updated = { ...existing };

  // Apply status transition through the state machine (handles resolvedAt, resolutionNote).
  // Every supplied status goes through the machine, including one equal to the
  // current status — that is an invalid transition ("Incident is already X"),
  // not a silent no-op.
  if (patch.status) {
    const transitionPatch = applyTransition(existing, patch.status, patch.resolutionNote || body.resolutionNote);
    updated = { ...updated, ...transitionPatch };
    // Remove status and resolutionNote from plain patch so they aren't overwritten again below
    delete patch.status;
    delete patch.resolutionNote;
  }

  // Apply remaining permitted field patches.
  const mutableFields = ['title', 'description', 'service', 'businessImpact', 'assignedEngineer', 'resolutionNote'];
  for (const field of mutableFields) {
    if (patch[field] !== undefined) {
      updated[field] = patch[field];
    }
  }

  updated.updatedAt = new Date().toISOString();

  return repo.save(updated);
}

/**
 * Delete an incident.
 * Throws NotFoundError if it does not exist.
 *
 * @param {string} id
 * @param {object} repo
 * @returns {{ id: string, deleted: true }}
 */
async function deleteIncident(id, repo) {
  const existed = await repo.remove(id);
  if (!existed) {
    throw new NotFoundError(`Incident '${id}' was not found.`);
  }
  return { id, deleted: true };
}

/**
 * Compute dashboard statistics from live persisted data.
 *
 * @param {object} repo
 * @returns {object} stats
 */
async function getDashboardStats(repo) {
  const incidents = await repo.readAll();
  const now = new Date();

  const stats = {
    total:      incidents.length,
    open:       0,
    inProgress: 0,
    resolved:   0,
    p1Critical: 0,
    slaBreached: 0,
  };

  for (const inc of incidents) {
    if (inc.status === STATUSES.OPEN)        stats.open++;
    if (inc.status === STATUSES.IN_PROGRESS) stats.inProgress++;
    if (inc.status === STATUSES.RESOLVED)    stats.resolved++;
    if (inc.priority === 'P1')               stats.p1Critical++;
    if (inc.status !== STATUSES.RESOLVED && new Date(inc.slaDeadline) < now) {
      stats.slaBreached++;
    }
  }

  return stats;
}

module.exports = {
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  deleteIncident,
  getDashboardStats,
};
