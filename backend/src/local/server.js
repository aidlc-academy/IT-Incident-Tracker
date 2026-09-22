'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const handler    = require('../handlers/incidentHandler');
const { createRepository } = require('../repositories/incidentRepository');
const { sendError }        = require('../utils/response');
const { DEMO_USERS }       = require('../models/incident');
const { UnauthorizedError } = require('../utils/errors');

// ───────────────────────────────────────────────────────────────────────────
// App setup
// ───────────────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: true,               // reflect the request origin (suitable for local dev)
  allowedHeaders: ['Content-Type', 'x-demo-user'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use(express.json());

// ───────────────────────────────────────────────────────────────────────────
// Repository — choose storage mode from env
// ───────────────────────────────────────────────────────────────────────────

const storageMode = (process.env.STORAGE_MODE || 'local').toLowerCase();

app.locals.repo = createRepository(storageMode, {
  dataFile:  process.env.DATA_FILE  || './data/incidents.json',
  tableName: process.env.DYNAMODB_TABLE,
  region:    process.env.AWS_REGION || 'us-east-1',
});

// ───────────────────────────────────────────────────────────────────────────
// Auth middleware
// ───────────────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const username = req.headers['x-demo-user'];
  if (!username) {
    return sendError(res, new UnauthorizedError('x-demo-user header is required.'));
  }
  const user = DEMO_USERS.find((u) => u.username === username);
  if (!user) {
    return sendError(res, new UnauthorizedError(`Unknown demo user: '${username}'.`));
  }
  req.currentUser = user.username;
  req.currentRole = user.role;
  next();
}

// ───────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────

// Public
app.get('/health',       handler.health);
app.post('/api/login',   handler.login);
app.post('/api/logout',  handler.logout);

// Protected
app.get   ('/api/incidents',     requireAuth, handler.listIncidents);
app.post  ('/api/incidents',     requireAuth, handler.createIncident);
app.get   ('/api/incidents/:id', requireAuth, handler.getIncident);
app.put   ('/api/incidents/:id', requireAuth, handler.updateIncident);
app.delete('/api/incidents/:id', requireAuth, handler.deleteIncident);
app.get   ('/api/stats',         requireAuth, handler.getDashboardStats);

// ───────────────────────────────────────────────────────────────────────────
// 404 catch-all
// ───────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.` },
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Global error handler (safety net)
// ───────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const { sendError } = require('../utils/response');
  return sendError(res, err);
});

// ───────────────────────────────────────────────────────────────────────────
// Start
// ───────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[IncidentIQ] Backend running on http://localhost:${PORT}`);
    console.log(`[IncidentIQ] Storage mode: ${storageMode}`);
  });
}

module.exports = app; // export for supertest
