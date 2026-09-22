'use strict';

const { SLA_HOURS, PRIORITIES } = require('../models/incident');

/**
 * SLA Rules Engine
 *
 * Computes SLA duration and deadline from an incident's priority.
 * All timestamps use UTC ISO 8601.
 * No background scheduler needed — the frontend can compute remaining time
 * using the persisted slaDeadline against the current clock.
 */

/**
 * Return SLA duration in hours for a given priority.
 * Defaults to 72 hours (P4) if an unknown priority is supplied.
 *
 * @param {'P1'|'P2'|'P3'|'P4'} priority
 * @returns {number} hours
 */
function getSlaDurationHours(priority) {
  return SLA_HOURS[priority] ?? SLA_HOURS[PRIORITIES.P4];
}

/**
 * Calculate the SLA deadline ISO string.
 * slaDeadline = createdAt + slaDuration
 *
 * @param {'P1'|'P2'|'P3'|'P4'} priority
 * @param {string} createdAt  ISO 8601 UTC timestamp
 * @returns {string}          ISO 8601 UTC deadline
 */
function calculateSlaDeadline(priority, createdAt) {
  const hours = getSlaDurationHours(priority);
  const created = new Date(createdAt);
  const deadline = new Date(created.getTime() + hours * 60 * 60 * 1000);
  return deadline.toISOString();
}

/**
 * Determine whether an incident's SLA is currently breached.
 * An incident is breached when:
 *   - status is not RESOLVED, AND
 *   - current UTC time > slaDeadline
 *
 * @param {string} slaDeadline  ISO 8601 UTC
 * @param {string} status
 * @returns {boolean}
 */
function isSlaBreached(slaDeadline, status) {
  if (status === 'RESOLVED') return false;
  return new Date() > new Date(slaDeadline);
}

/**
 * Return the remaining SLA time in milliseconds (negative = breached).
 *
 * @param {string} slaDeadline  ISO 8601 UTC
 * @returns {number}
 */
function getSlaRemainingMs(slaDeadline) {
  return new Date(slaDeadline).getTime() - Date.now();
}

module.exports = {
  getSlaDurationHours,
  calculateSlaDeadline,
  isSlaBreached,
  getSlaRemainingMs,
};
