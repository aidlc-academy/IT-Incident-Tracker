'use strict';

/**
 * Incident field definitions and allowed-value lists.
 * These are the single source of truth used by validators, rules, and the repository.
 */

const STATUSES = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
});

const PRIORITIES = Object.freeze({
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
});

const SEVERITIES = Object.freeze({
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
});

/** Maps priority → severity label */
const PRIORITY_TO_SEVERITY = Object.freeze({
  P1: SEVERITIES.CRITICAL,
  P2: SEVERITIES.HIGH,
  P3: SEVERITIES.MEDIUM,
  P4: SEVERITIES.LOW,
});

/** SLA durations in hours per priority */
const SLA_HOURS = Object.freeze({
  P1: 2,
  P2: 8,
  P3: 24,
  P4: 72,
});

/** Demo users available on the login screen */
const DEMO_USERS = Object.freeze([
  { username: 'alice', role: 'Admin',    displayName: 'Alice (Admin)' },
  { username: 'bob',   role: 'Engineer', displayName: 'Bob (Engineer)' },
  { username: 'carol', role: 'Engineer', displayName: 'Carol (Engineer)' },
  { username: 'dave',  role: 'Support',  displayName: 'Dave (Support)' },
  { username: 'eve',   role: 'Support',  displayName: 'Eve (Support)' },
]);

/** Engineers available for incident assignment */
const ENGINEERS = Object.freeze([
  'John Smith',
  'Maria Garcia',
  'David Chen',
  'Sarah Johnson',
  'Michael Brown',
]);

module.exports = {
  STATUSES,
  PRIORITIES,
  SEVERITIES,
  PRIORITY_TO_SEVERITY,
  SLA_HOURS,
  DEMO_USERS,
  ENGINEERS,
};
