'use strict';

const { STATUSES, PRIORITIES, SEVERITIES, ENGINEERS } = require('../models/incident');
const { ValidationError } = require('../utils/errors');

// ---------------------------------------------------------------------------
// Field length constraints
// ---------------------------------------------------------------------------
const LIMITS = {
  title:          { min: 5,  max: 200  },
  description:    { min: 10, max: 2000 },
  service:        { min: 1,  max: 200  },
  businessImpact: { min: 5,  max: 500  },
  resolutionNote: { min: 10, max: 2000 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(value, field, min, max) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${field} is required.`, field);
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(
      `${field} must be at least ${min} character${min !== 1 ? 's' : ''}.`,
      field
    );
  }
  if (trimmed.length > max) {
    throw new ValidationError(
      `${field} must not exceed ${max} characters.`,
      field
    );
  }
  return trimmed;
}

function optionalString(value, field, min, max) {
  if (value === undefined || value === null) return null;
  return requireString(value, field, min, max);
}

// ---------------------------------------------------------------------------
// Public validators
// ---------------------------------------------------------------------------

/**
 * Validate the body of a POST /incidents request.
 * Returns a sanitised copy of the data on success.
 * Throws ValidationError on the first invalid field.
 *
 * @param {object} data
 * @returns {{ title, description, service, businessImpact }}
 */
function validateCreatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const title         = requireString(data.title,         'title',         LIMITS.title.min,         LIMITS.title.max);
  const description   = requireString(data.description,   'description',   LIMITS.description.min,   LIMITS.description.max);
  const service       = requireString(data.service,       'service',       LIMITS.service.min,        LIMITS.service.max);
  const businessImpact = requireString(data.businessImpact, 'businessImpact', LIMITS.businessImpact.min, LIMITS.businessImpact.max);

  return { title, description, service, businessImpact };
}

/**
 * Validate the body of a PUT /incidents/:id request.
 * Only validates fields that are actually present in the body.
 * Returns a sanitised patch object.
 *
 * @param {object} data
 * @returns {object} sanitised patch
 */
function validateUpdatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const patch = {};

  if (data.title !== undefined) {
    patch.title = requireString(data.title, 'title', LIMITS.title.min, LIMITS.title.max);
  }
  if (data.description !== undefined) {
    patch.description = requireString(data.description, 'description', LIMITS.description.min, LIMITS.description.max);
  }
  if (data.service !== undefined) {
    patch.service = requireString(data.service, 'service', LIMITS.service.min, LIMITS.service.max);
  }
  if (data.businessImpact !== undefined) {
    patch.businessImpact = requireString(data.businessImpact, 'businessImpact', LIMITS.businessImpact.min, LIMITS.businessImpact.max);
  }
  if (data.resolutionNote !== undefined && data.resolutionNote !== null) {
    patch.resolutionNote = requireString(data.resolutionNote, 'resolutionNote', LIMITS.resolutionNote.min, LIMITS.resolutionNote.max);
  }
  if (data.assignedEngineer !== undefined) {
    patch.assignedEngineer = validateEngineer(data.assignedEngineer);
  }
  if (data.status !== undefined) {
    patch.status = validateStatus(data.status);
  }

  return patch;
}

/**
 * Validate an assignedEngineer value.
 * Must be null/undefined (unassigned) or one of the known engineers.
 *
 * @param {string|null} value
 * @returns {string|null}
 */
function validateEngineer(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!ENGINEERS.includes(value)) {
    throw new ValidationError(
      `assignedEngineer must be one of: ${ENGINEERS.join(', ')} — or null to unassign.`,
      'assignedEngineer'
    );
  }
  return value;
}

/**
 * Validate a status value against the allowed set.
 *
 * @param {string} value
 * @returns {string}
 */
function validateStatus(value) {
  const allowed = Object.values(STATUSES);
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `status must be one of: ${allowed.join(', ')}.`,
      'status'
    );
  }
  return value;
}

/**
 * Validate that an incident ID is a non-empty string.
 * Format: INC-<digits>-<alphanum>
 *
 * @param {string} id
 */
function validateIncidentId(id) {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationError('Incident ID is required and must be a non-empty string.', 'id');
  }
  if (!/^INC-\d+-[A-Z0-9]+$/.test(id)) {
    throw new ValidationError(`Invalid incident ID format: ${id}`, 'id');
  }
}

module.exports = {
  validateCreatePayload,
  validateUpdatePayload,
  validateEngineer,
  validateStatus,
  validateIncidentId,
};
