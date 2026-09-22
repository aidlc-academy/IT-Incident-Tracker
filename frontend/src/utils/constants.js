/**
 * These lists mirror backend/src/models/incident.js. The backend validates
 * every value it receives; these exist so the UI can only offer valid choices.
 */

export const DEMO_USERS = [
  { username: 'alice', role: 'Admin', displayName: 'Alice (Admin)' },
  { username: 'bob', role: 'Engineer', displayName: 'Bob (Engineer)' },
  { username: 'carol', role: 'Engineer', displayName: 'Carol (Engineer)' },
  { username: 'dave', role: 'Support', displayName: 'Dave (Support)' },
  { username: 'eve', role: 'Support', displayName: 'Eve (Support)' },
];

export const ENGINEERS = [
  'John Smith',
  'Maria Garcia',
  'David Chen',
  'Sarah Johnson',
  'Michael Brown',
];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

export const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

/**
 * Mirrors backend/src/rules/statusRules.js. Used to render only the status
 * changes the backend will actually accept — invalid transitions are never
 * offered in the UI, and the backend rejects them regardless.
 */
export const ALLOWED_TRANSITIONS = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED: ['OPEN'],
};

/** Services offered in the create form; the field accepts free text too. */
export const SERVICES = [
  'Database',
  'Payment Gateway',
  'Authentication',
  'Frontend',
  'Backend API',
  'Network',
  'Storage',
];
