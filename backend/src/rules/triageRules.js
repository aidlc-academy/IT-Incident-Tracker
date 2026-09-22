'use strict';

const { PRIORITIES, SEVERITIES, PRIORITY_TO_SEVERITY } = require('../models/incident');

/**
 * Triage Rules Engine
 *
 * Determines priority, severity, and category from incident fields using
 * deterministic keyword matching. No external AI calls.
 *
 * Rules are evaluated in priority order — the first matching rule wins.
 * If no rule matches, the incident defaults to P4 / Low.
 */

// ---------------------------------------------------------------------------
// Priority keyword rules — evaluated top to bottom; first match wins
// ---------------------------------------------------------------------------
const PRIORITY_RULES = [
  {
    priority: PRIORITIES.P1,
    keywords: [
      'production outage',
      'database unavailable',
      'all users affected',
      'complete failure',
      'complete service outage',
      'total outage',
      'system down',
      'site down',
    ],
  },
  {
    priority: PRIORITIES.P2,
    keywords: [
      'payment failure',
      'authentication failure',
      'multiple users affected',
      'multiple users',
      'data loss',
      'security breach',
      'major functionality',
      'major business',
      'login failure',
      'sign in failure',
    ],
  },
  {
    priority: PRIORITIES.P3,
    keywords: [
      'latency',
      'slow performance',
      'slow response',
      'slow',
      'intermittent',
      'performance issue',
      'timeout',
      'degraded',
      'high response time',
      'partial outage',
    ],
  },
  // P4 is the default — no keywords needed
];

// ---------------------------------------------------------------------------
// Service → Category mapping — longest/most-specific first
// ---------------------------------------------------------------------------
const SERVICE_CATEGORY_MAP = [
  { keyword: 'payment gateway', category: 'Payment' },
  { keyword: 'payment',         category: 'Payment' },
  { keyword: 'authentication',  category: 'Authentication' },
  { keyword: 'auth',            category: 'Authentication' },
  { keyword: 'database',        category: 'Database' },
  { keyword: 'db',              category: 'Database' },
  { keyword: 'backend api',     category: 'Backend API' },
  { keyword: 'backend',         category: 'Backend' },
  { keyword: 'api',             category: 'API' },
  { keyword: 'frontend',        category: 'Frontend' },
  { keyword: 'network',         category: 'Network' },
  { keyword: 'storage',         category: 'Storage' },
  { keyword: 'email',           category: 'Email' },
  { keyword: 'notification',    category: 'Notifications' },
  { keyword: 'search',          category: 'Search' },
];

// ---------------------------------------------------------------------------
// Core triage logic
// ---------------------------------------------------------------------------

/**
 * Determine priority by scanning title + description for keywords.
 * Evaluation order is P1 → P2 → P3; default is P4.
 *
 * @param {string} title
 * @param {string} description
 * @param {string} [businessImpact]
 * @returns {'P1'|'P2'|'P3'|'P4'}
 */
function determinePriority(title, description, businessImpact = '') {
  const searchText = `${title} ${description} ${businessImpact}`.toLowerCase();

  for (const rule of PRIORITY_RULES) {
    if (rule.keywords.some((kw) => searchText.includes(kw))) {
      return rule.priority;
    }
  }

  return PRIORITIES.P4; // safe default
}

/**
 * Derive the human-readable severity label from a priority code.
 *
 * @param {'P1'|'P2'|'P3'|'P4'} priority
 * @returns {'Critical'|'High'|'Medium'|'Low'}
 */
function determineSeverity(priority) {
  return PRIORITY_TO_SEVERITY[priority] || SEVERITIES.LOW;
}

/**
 * Derive the incident category from the service field.
 * Falls back to 'General' when no keyword matches.
 *
 * @param {string} service
 * @returns {string}
 */
function determineCategory(service) {
  const lower = (service || '').toLowerCase();
  for (const entry of SERVICE_CATEGORY_MAP) {
    if (lower.includes(entry.keyword)) {
      return entry.category;
    }
  }
  return 'General';
}

/**
 * Run the full triage pipeline.
 *
 * @param {string} title
 * @param {string} description
 * @param {string} service
 * @param {string} [businessImpact]
 * @returns {{ priority: string, severity: string, category: string }}
 */
function triage(title, description, service, businessImpact = '') {
  const priority = determinePriority(title, description, businessImpact);
  const severity = determineSeverity(priority);
  const category = determineCategory(service);
  return { priority, severity, category };
}

module.exports = { triage, determinePriority, determineSeverity, determineCategory };
