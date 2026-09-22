'use strict';

const { STATUSES } = require('../models/incident');
const { InvalidTransitionError, ValidationError } = require('../utils/errors');

/**
 * Status Transition Rules
 *
 * Defines and enforces the incident lifecycle state machine.
 *
 * Allowed transitions:
 *   OPEN        → IN_PROGRESS   (engineer starts work)
 *   IN_PROGRESS → RESOLVED      (requires resolution note ≥ 10 chars)
 *   IN_PROGRESS → OPEN          (paused / reassigned)
 *   RESOLVED    → OPEN          (reopened — resolution was incorrect)
 *
 * Forbidden transitions (rejected with 409):
 *   OPEN        → RESOLVED
 *   RESOLVED    → IN_PROGRESS
 *   any status  → same status
 */

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATUSES.OPEN]:        [STATUSES.IN_PROGRESS],
  [STATUSES.IN_PROGRESS]: [STATUSES.RESOLVED, STATUSES.OPEN],
  [STATUSES.RESOLVED]:    [STATUSES.OPEN],
});

/**
 * Check whether a transition is permitted.
 *
 * @param {string} from  current status
 * @param {string} to    requested status
 * @returns {boolean}
 */
function isValidTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * Validate a requested status transition and throw if invalid.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @throws {InvalidTransitionError}
 */
function validateTransition(currentStatus, newStatus) {
  if (currentStatus === newStatus) {
    throw new InvalidTransitionError(
      `Incident is already ${currentStatus}.`
    );
  }
  if (!isValidTransition(currentStatus, newStatus)) {
    const allowed = (ALLOWED_TRANSITIONS[currentStatus] || []).join(', ') || 'none';
    throw new InvalidTransitionError(
      `Cannot transition from ${currentStatus} to ${newStatus}. ` +
      `Allowed transitions from ${currentStatus}: ${allowed}.`
    );
  }
}

/**
 * Validate and apply a status transition.
 * Returns a partial update object to merge into the incident.
 *
 * @param {object} incident       existing incident record
 * @param {string} newStatus      requested new status
 * @param {string} [resolutionNote]
 * @returns {{ status, updatedAt, resolvedAt?, resolutionNote? }}
 * @throws {InvalidTransitionError|ValidationError}
 */
function applyTransition(incident, newStatus, resolutionNote) {
  validateTransition(incident.status, newStatus);

  const now = new Date().toISOString();
  const patch = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === STATUSES.RESOLVED) {
    if (!resolutionNote || resolutionNote.trim().length < 10) {
      throw new ValidationError(
        'A resolution note of at least 10 characters is required when resolving an incident.',
        'resolutionNote'
      );
    }
    patch.resolutionNote = resolutionNote.trim();
    patch.resolvedAt = now;
  }

  // Reopening clears the resolvedAt/resolutionNote so history stays accurate
  if (newStatus === STATUSES.OPEN && incident.status === STATUSES.RESOLVED) {
    patch.resolvedAt = null;
    patch.resolutionNote = null;
  }

  return patch;
}

module.exports = {
  ALLOWED_TRANSITIONS,
  isValidTransition,
  validateTransition,
  applyTransition,
};
