# IncidentIQ — Technical Design

**Project:** IncidentIQ — AI-Assisted IT Incident Triage & SLA Management  
**Version:** 1.0  
**Type:** Hackathon MVP (one-day implementation)  
**Status:** Approved for implementation

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [AWS Lambda Structure](#4-aws-lambda-structure)
5. [API Gateway Routes](#5-api-gateway-routes)
6. [DynamoDB Schema](#6-dynamodb-schema)
7. [Incident Data Model](#7-incident-data-model)
8. [Triage Engine Design](#8-triage-engine-design)
9. [SLA Calculation Design](#9-sla-calculation-design)
10. [Incident State Transition Design](#10-incident-state-transition-design)
11. [Dashboard Data Flow](#11-dashboard-data-flow)
12. [Error Handling](#12-error-handling)
13. [Input Validation](#13-input-validation)
14. [Frontend–Backend Communication](#14-frontendbackend-communication)
15. [Local Development Strategy](#15-local-development-strategy)
16. [AWS Deployment Strategy](#16-aws-deployment-strategy)
17. [Testing Strategy](#17-testing-strategy)

---

## 1. Overall Architecture

### Deployment Modes

The application supports two deployment modes that share identical business logic. Local mode is used during development and for the hackathon demo. AWS mode is the optional cloud deployment path.

```
┌──────────────────────────────────────────────────────────┐
│                LOCAL DEVELOPMENT MODE                     │
│                                                          │
│   Browser                                                │
│   React + Vite (port 5173)                               │
│        │  fetch /api/*  (Vite proxy)                     │
│        ▼                                                 │
│   Express.js server (port 3001)                          │
│   ├── Route handlers  ─── shared handler functions       │
│   ├── Triage Engine                                      │
│   ├── SLA Calculator                                     │
│   ├── State Machine                                      │
│   └── JSON file storage  (data/incidents.json)           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  AWS DEPLOYMENT MODE                      │
│                                                          │
│   Browser                                                │
│   React + Vite (S3 + CloudFront, or served locally)      │
│        │  fetch /api/*                                   │
│        ▼                                                 │
│   Amazon API Gateway (HTTP API)                          │
│        │                                                 │
│        ▼                                                 │
│   AWS Lambda (Node.js 20.x)                              │
│   ├── shared handler functions  (same as local)          │
│   ├── Triage Engine                                      │
│   ├── SLA Calculator                                     │
│   ├── State Machine                                      │
│   └── DynamoDB  (single-table design)                    │
└──────────────────────────────────────────────────────────┘
```

### Design Principle: Shared Business Logic

All business logic (triage, SLA, state machine, validation) lives in framework-agnostic modules that are imported by both the local Express server and the Lambda handler. This means the behaviour is identical in both modes and the logic only needs to be written and tested once.

```
src/
  shared/
    triageEngine.js      ← pure functions, no framework dependency
    slaCalculator.js     ← pure functions
    stateMachine.js      ← pure functions
    validators.js        ← pure functions
  handlers/
    incidents.js         ← handler functions called by Express AND Lambda
    auth.js
    stats.js
  local/
    server.js            ← Express adapter (local only)
    storage.js           ← JSON file adapter (local only)
  lambda/
    handler.js           ← Lambda adapter (AWS only)
    dynamodb.js          ← DynamoDB adapter (AWS only)
```

---

## 2. Frontend Architecture

### Technology Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| Framework | React 18 | Familiar, fast to develop |
| Build tool | Vite | Instant HMR, simple config |
| Routing | React Router v6 | Declarative, lightweight |
| HTTP client | Native `fetch` | No extra dependency |
| State management | React Context + `useState` | No Redux needed for MVP |
| Styling | Plain CSS modules or Tailwind CSS | Fast to write, no design system overhead |

### Directory Structure

```
frontend/
  src/
    components/
      layout/
        AppLayout.jsx        ← nav bar, logout, breadcrumbs
      incidents/
        IncidentList.jsx     ← table with search/filter
        IncidentCard.jsx     ← summary row
        IncidentForm.jsx     ← create / edit form
        IncidentDetail.jsx   ← full incident view
        StatusBadge.jsx      ← coloured status chip
        PriorityBadge.jsx    ← coloured priority chip
        SlaTimer.jsx         ← remaining / breached display
      dashboard/
        DashboardStats.jsx   ← stat cards
        StatCard.jsx         ← single metric card
      auth/
        LoginPage.jsx
      shared/
        ConfirmDialog.jsx    ← reusable delete confirmation
        ErrorBanner.jsx      ← inline error display
        LoadingSpinner.jsx
    context/
      AuthContext.jsx        ← session state, login/logout helpers
      IncidentContext.jsx    ← incident list state, CRUD helpers
    hooks/
      useIncidents.js        ← data fetching + mutation
      useSla.js              ← SLA calculation (pure, runs in browser)
    pages/
      LoginPage.jsx
      DashboardPage.jsx
      IncidentListPage.jsx
      IncidentDetailPage.jsx
      CreateIncidentPage.jsx
    api/
      client.js              ← fetch wrapper with base URL, error handling
      incidents.js           ← incident API calls
      auth.js                ← login/logout API calls
      stats.js               ← dashboard stats API call
    utils/
      sla.js                 ← formatSlaRemaining(), isSlaBreached()
      constants.js           ← ENGINEERS, STATUSES, PRIORITIES, etc.
    App.jsx
    main.jsx
  index.html
  vite.config.js
```

### Page and Route Map

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Redirect to `/login` or `/dashboard` | Auth guard |
| `/login` | `LoginPage` | Select demo user |
| `/dashboard` | `DashboardPage` | Stats cards + recent incidents |
| `/incidents` | `IncidentListPage` | Full list with search/filter |
| `/incidents/new` | `CreateIncidentPage` | Create form |
| `/incidents/:id` | `IncidentDetailPage` | View + edit + status change |

### Auth Guard

A `<ProtectedRoute>` wrapper reads `AuthContext`. If no session exists it redirects to `/login`. Session is stored in `localStorage` as a simple JSON object `{ username, role, loginTime }`.

### State Management

```
AuthContext
  ├── currentUser: { username, role }
  ├── login(username)       → sets localStorage + context
  └── logout()             → clears localStorage + context

IncidentContext
  ├── incidents: Incident[]
  ├── loading: boolean
  ├── error: string | null
  ├── fetchIncidents(filters?)
  ├── createIncident(data)
  ├── updateIncident(id, data)
  └── deleteIncident(id)
```

---

## 3. Backend Architecture

### Local: Express.js Server

```
backend/
  src/
    shared/
      triageEngine.js
      slaCalculator.js
      stateMachine.js
      validators.js
      constants.js
    handlers/
      incidents.js     ← createIncident, getIncident, listIncidents,
                          updateIncident, deleteIncident
      auth.js          ← login, logout
      stats.js         ← getDashboardStats
    local/
      server.js        ← Express app, route wiring
      storage.js       ← read/write incidents.json
    lambda/
      handler.js       ← Lambda entry point, routes to same handlers
      dynamodb.js      ← DynamoDB get/put/delete wrappers
  data/
    incidents.json     ← persistent storage (local mode)
  package.json
```

### Request Lifecycle (local mode)

```
HTTP Request
    │
    ▼
Express router
    │
    ▼
Handler function (shared/handlers/incidents.js)
    │
    ├── validators.js   → validate input, throw 400 on failure
    ├── stateMachine.js → validate status transition, throw 409 on failure
    ├── triageEngine.js → compute priority/severity/category (create only)
    ├── slaCalculator.js→ compute slaDeadline (create only)
    │
    ▼
storage.js (local) OR dynamodb.js (Lambda)
    │
    ▼
HTTP Response (JSON)
```

### Demo Session Middleware (local mode)

A lightweight Express middleware reads an `x-demo-user` header (set by the frontend on every request). If the header is missing the request is rejected with 401. This replaces real authentication for the hackathon.

---

## 4. AWS Lambda Structure

### Single Lambda, Router Pattern

A single Lambda function handles all API routes. A thin router inside the handler dispatches to the same handler functions used locally. This avoids managing many Lambda functions.

```
lambda/handler.js

exports.handler = async (event) => {
  const { httpMethod, path, body, queryStringParameters, headers } = event;

  // Auth check: x-demo-user header
  const user = headers['x-demo-user'];
  if (!user && path !== '/api/login') {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Route dispatch
  if (path === '/api/incidents' && httpMethod === 'GET')
    return handleListIncidents(queryStringParameters, dynamoStorage);

  if (path === '/api/incidents' && httpMethod === 'POST')
    return handleCreateIncident(JSON.parse(body), user, dynamoStorage);

  if (path.match(/^\/api\/incidents\/[^/]+$/) && httpMethod === 'GET')
    return handleGetIncident(extractId(path), dynamoStorage);

  if (path.match(/^\/api\/incidents\/[^/]+$/) && httpMethod === 'PUT')
    return handleUpdateIncident(extractId(path), JSON.parse(body), user, dynamoStorage);

  if (path.match(/^\/api\/incidents\/[^/]+$/) && httpMethod === 'DELETE')
    return handleDeleteIncident(extractId(path), dynamoStorage);

  if (path === '/api/stats' && httpMethod === 'GET')
    return handleGetStats(dynamoStorage);

  if (path === '/api/login' && httpMethod === 'POST')
    return handleLogin(JSON.parse(body));

  return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};
```

### Lambda Configuration

| Setting | Value |
|---------|-------|
| Runtime | Node.js 20.x |
| Memory | 256 MB |
| Timeout | 10 seconds |
| Concurrency | Unreserved (default) |
| Environment variables | `DYNAMODB_TABLE`, `AWS_REGION` |

### Lambda Deployment Package

```
lambda-package/
  handler.js
  shared/          ← copied from backend/src/shared/
  handlers/        ← copied from backend/src/handlers/
  lambda/
    dynamodb.js
  node_modules/    ← only @aws-sdk/client-dynamodb (pre-installed in Lambda)
```

The AWS SDK v3 `@aws-sdk/client-dynamodb` is used because it is pre-bundled in the Lambda Node.js 20.x runtime — no bundling step required.

---

## 5. API Gateway Routes

### HTTP API (not REST API — simpler, lower cost)

| Method | Path | Handler | Auth Required |
|--------|------|---------|---------------|
| POST | `/api/login` | `auth.login` | No |
| POST | `/api/logout` | `auth.logout` | Yes |
| GET | `/api/incidents` | `incidents.list` | Yes |
| POST | `/api/incidents` | `incidents.create` | Yes |
| GET | `/api/incidents/{id}` | `incidents.get` | Yes |
| PUT | `/api/incidents/{id}` | `incidents.update` | Yes |
| DELETE | `/api/incidents/{id}` | `incidents.delete` | Yes |
| GET | `/api/stats` | `stats.get` | Yes |

### Auth Mechanism (API Gateway)

All routes except `/api/login` require the `x-demo-user` header. API Gateway passes it through to Lambda. The Lambda handler validates it against the known demo user list. No Lambda Authorizer or Cognito is required.

### CORS Configuration

API Gateway HTTP API is configured with:
- `Access-Control-Allow-Origin: *` (demo only)
- `Access-Control-Allow-Headers: Content-Type, x-demo-user`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`

### Query Parameters (`GET /api/incidents`)

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Free-text search across id, title, description, service |
| `status` | string | Filter by OPEN \| IN_PROGRESS \| RESOLVED |
| `priority` | string | Filter by P1 \| P2 \| P3 \| P4 |
| `severity` | string | Filter by Critical \| High \| Medium \| Low |

All parameters are optional and combinable.

### Standard Response Envelope

**Success:**
```json
{
  "data": { ... } | [ ... ],
  "message": "optional human-readable confirmation"
}
```

**Error:**
```json
{
  "error": "Human-readable message",
  "field": "fieldName (optional, for validation errors)",
  "code": "VALIDATION_ERROR | NOT_FOUND | INVALID_TRANSITION | SERVER_ERROR"
}
```

---

## 6. DynamoDB Schema

### Single-Table Design

One DynamoDB table stores all data.

**Table name:** `incidentiq-incidents`

| Attribute | Type | Role |
|-----------|------|------|
| `PK` | String | Partition key — always `"INCIDENT"` |
| `SK` | String | Sort key — `"INC-<id>"` (e.g., `"INC-001"`) |
| `incidentId` | String | Duplicate of SK suffix, for easy access |
| `title` | String | Incident title |
| `description` | String | Incident description |
| `service` | String | Affected service |
| `businessImpact` | String | Business impact description |
| `createdBy` | String | Demo username |
| `createdAt` | String | ISO 8601 UTC timestamp |
| `updatedAt` | String | ISO 8601 UTC timestamp |
| `status` | String | OPEN \| IN_PROGRESS \| RESOLVED |
| `priority` | String | P1 \| P2 \| P3 \| P4 |
| `severity` | String | Critical \| High \| Medium \| Low |
| `category` | String | Derived from service field |
| `slaDeadline` | String | ISO 8601 UTC timestamp |
| `assignedEngineer` | String | null \| engineer name |
| `resolutionNote` | String | null \| resolution text |
| `resolvedAt` | String | null \| ISO 8601 UTC timestamp |

### Access Patterns

| Operation | DynamoDB call |
|-----------|--------------|
| List all incidents | `Query(PK = "INCIDENT")` |
| Get single incident | `GetItem(PK = "INCIDENT", SK = "INC-<id>")` |
| Create incident | `PutItem` |
| Update incident | `UpdateItem` with specific attribute updates |
| Delete incident | `DeleteItem(PK = "INCIDENT", SK = "INC-<id>")` |
| Dashboard stats | `Query(PK = "INCIDENT")` then compute in Lambda |

Search and filter are performed in Lambda after fetching all items (the dataset is small for MVP; full-table scan is acceptable).

### GSI (Optional, for future use)

A GSI on `status` (GSI PK = `status`) would allow querying by status without a full scan. Not required for MVP but easy to add.

### ID Generation

Incident IDs are generated as `INC-<timestamp><random>`:
```
INC-<Date.now()>-<Math.random().toString(36).slice(2,6).toUpperCase()>
```
Example: `INC-1727001234567-A3F2`

This avoids sequential IDs that could collide under concurrent creation while remaining human-readable.

---

## 7. Incident Data Model

### TypeScript-style Interface (reference for implementation)

```typescript
interface Incident {
  // Identity
  incidentId: string;           // "INC-1727001234567-A3F2"

  // User-provided on create
  title: string;                // 5–200 chars
  description: string;          // 10–2000 chars
  service: string;              // non-empty
  businessImpact: string;       // 5–500 chars

  // System-generated on create, immutable after
  createdBy: string;            // demo username
  createdAt: string;            // ISO 8601 UTC

  // System-generated on create, updated on change
  updatedAt: string;            // ISO 8601 UTC

  // Triage (system-generated on create, immutable after)
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  category: string;             // derived from service

  // SLA (system-generated on create, immutable after)
  slaDeadline: string;          // ISO 8601 UTC

  // Mutable
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assignedEngineer: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;    // set when status → RESOLVED
}
```

### Demo Users

```typescript
interface DemoUser {
  username: string;
  role: 'Admin' | 'Engineer' | 'Support';
  displayName: string;
}

const DEMO_USERS: DemoUser[] = [
  { username: 'alice',   role: 'Admin',    displayName: 'Alice (Admin)' },
  { username: 'bob',     role: 'Engineer', displayName: 'Bob (Engineer)' },
  { username: 'carol',   role: 'Engineer', displayName: 'Carol (Engineer)' },
  { username: 'dave',    role: 'Support',  displayName: 'Dave (Support)' },
  { username: 'eve',     role: 'Support',  displayName: 'Eve (Support)' },
];
```

### Available Engineers (for assignment dropdown)

```javascript
const ENGINEERS = [
  'John Smith',
  'Maria Garcia',
  'David Chen',
  'Sarah Johnson',
  'Michael Brown',
];
```

---

## 8. Triage Engine Design

### Module: `shared/triageEngine.js`

The triage engine is a pure function. It takes title, description, and service as inputs and returns `{ priority, severity, category }`. No side effects, no I/O.

```javascript
// shared/triageEngine.js

const PRIORITY_RULES = [
  {
    priority: 'P1',
    keywords: [
      'production outage', 'database unavailable',
      'all users affected', 'complete failure',
    ],
  },
  {
    priority: 'P2',
    keywords: [
      'payment failure', 'authentication failure',
      'multiple users', 'data loss', 'security breach',
    ],
  },
  {
    priority: 'P3',
    keywords: [
      'latency', 'slow', 'intermittent',
      'performance issue', 'timeout',
    ],
  },
  // P4 is the default — no keywords needed
];

const SEVERITY_MAP = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

const SERVICE_CATEGORY_MAP = {
  database:        'Database',
  payment:         'Payment',
  authentication:  'Authentication',
  auth:            'Authentication',
  frontend:        'Frontend',
  backend:         'Backend',
  api:             'API',
  network:         'Network',
  storage:         'Storage',
};

function determineCategory(service) {
  const lower = (service || '').toLowerCase();
  for (const [keyword, category] of Object.entries(SERVICE_CATEGORY_MAP)) {
    if (lower.includes(keyword)) return category;
  }
  return 'General';
}

function determinePriority(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  for (const rule of PRIORITY_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return rule.priority;
    }
  }
  return 'P4'; // default
}

function triage(title, description, service) {
  const priority = determinePriority(title, description);
  return {
    priority,
    severity: SEVERITY_MAP[priority],
    category: determineCategory(service),
  };
}

module.exports = { triage, determinePriority, determineCategory };
```

### Rules Evaluation Order

Rules are evaluated in priority order (P1 first). The first matching rule wins. This prevents a description containing both "slow" (P3) and "production outage" (P1) from being down-classified.

---

## 9. SLA Calculation Design

### Module: `shared/slaCalculator.js` (backend — deadline generation)

```javascript
// shared/slaCalculator.js

const SLA_HOURS = {
  P1: 2,
  P2: 8,
  P3: 24,
  P4: 72,
};

function calculateSlaDeadline(priority, createdAt) {
  const created = new Date(createdAt);
  const hours = SLA_HOURS[priority] ?? 72;
  const deadline = new Date(created.getTime() + hours * 60 * 60 * 1000);
  return deadline.toISOString(); // UTC ISO 8601
}

module.exports = { calculateSlaDeadline, SLA_HOURS };
```

### Frontend SLA Utilities: `frontend/src/utils/sla.js`

```javascript
// Calculates human-readable SLA status from persisted deadline

export function getSlaStatus(slaDeadline, status, resolvedAt) {
  const now = Date.now();
  const deadline = new Date(slaDeadline).getTime();
  const diffMs = deadline - now;

  const wasBreached = resolvedAt
    ? new Date(resolvedAt).getTime() > deadline
    : diffMs < 0;

  if (status === 'RESOLVED') {
    return {
      label: wasBreached ? 'Resolved (SLA breached)' : 'Resolved within SLA',
      breached: wasBreached,
      resolved: true,
    };
  }

  if (diffMs < 0) {
    return {
      label: `SLA breached: ${formatDuration(-diffMs)} ago`,
      breached: true,
      resolved: false,
    };
  }

  return {
    label: `${formatDuration(diffMs)} remaining`,
    breached: false,
    resolved: false,
  };
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
```

### SLA is never recalculated on update — the deadline stored at creation time is authoritative.

---

## 10. Incident State Transition Design

### Module: `shared/stateMachine.js`

```javascript
// shared/stateMachine.js

const ALLOWED_TRANSITIONS = {
  OPEN:        ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED:    ['OPEN'],
};

function isValidTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

function validateTransition(currentStatus, newStatus) {
  if (currentStatus === newStatus) {
    throw { code: 'INVALID_TRANSITION', message: `Incident is already ${newStatus}` };
  }
  if (!isValidTransition(currentStatus, newStatus)) {
    throw {
      code: 'INVALID_TRANSITION',
      message: `Cannot transition from ${currentStatus} to ${newStatus}. ` +
               `Allowed: ${(ALLOWED_TRANSITIONS[currentStatus] || []).join(', ')}`,
    };
  }
}

function applyTransition(incident, newStatus, resolutionNote) {
  validateTransition(incident.status, newStatus);

  if (newStatus === 'RESOLVED') {
    if (!resolutionNote || resolutionNote.trim().length < 10) {
      throw {
        code: 'VALIDATION_ERROR',
        field: 'resolutionNote',
        message: 'Resolution note is required and must be at least 10 characters',
      };
    }
  }

  const now = new Date().toISOString();
  return {
    status: newStatus,
    updatedAt: now,
    resolvedAt: newStatus === 'RESOLVED' ? now : incident.resolvedAt,
    resolutionNote: newStatus === 'RESOLVED' ? resolutionNote : incident.resolutionNote,
  };
}

module.exports = { validateTransition, applyTransition, ALLOWED_TRANSITIONS };
```

### State Transition Diagram

```
         ┌─────────────────────┐
         │                     │
         ▼                     │
       OPEN ──────────► IN_PROGRESS ──────────► RESOLVED
         ▲                     │                    │
         │                     │                    │
         └─────────────────────┘                    │
         ▲                                          │
         └──────────────────────────────────────────┘

Allowed:
  OPEN        → IN_PROGRESS   (start work)
  IN_PROGRESS → RESOLVED      (resolve, requires note)
  IN_PROGRESS → OPEN          (pause/reassign)
  RESOLVED    → OPEN          (reopen)

Forbidden:
  OPEN        → RESOLVED      (409 Conflict)
  RESOLVED    → IN_PROGRESS   (409 Conflict)
```

---

## 11. Dashboard Data Flow

### Stats Endpoint Design

The `/api/stats` endpoint queries all incidents and computes statistics in memory. No separate counters table or aggregation job is needed at MVP scale.

```
GET /api/stats
    │
    ▼
Fetch all incidents from storage
    │
    ▼
Compute in-process:
  total          = incidents.length
  open           = incidents.filter(i => i.status === 'OPEN').length
  inProgress     = incidents.filter(i => i.status === 'IN_PROGRESS').length
  resolved       = incidents.filter(i => i.status === 'RESOLVED').length
  p1Critical     = incidents.filter(i => i.priority === 'P1').length
  slaBreached    = incidents.filter(i =>
                     i.status !== 'RESOLVED' &&
                     new Date(i.slaDeadline) < new Date()
                   ).length
    │
    ▼
Return JSON stats object
```

### Stats Response Shape

```json
{
  "data": {
    "total": 24,
    "open": 10,
    "inProgress": 8,
    "resolved": 6,
    "p1Critical": 3,
    "slaBreached": 2
  }
}
```

### Dashboard Frontend Flow

```
DashboardPage mounts
    │
    ├── useEffect → fetch /api/stats
    │                    │
    │               StatsResponse
    │                    │
    │              DashboardStats
    │              ├── StatCard: Total
    │              ├── StatCard: Open
    │              ├── StatCard: In Progress
    │              ├── StatCard: Resolved
    │              ├── StatCard: P1/Critical
    │              └── StatCard: SLA Breached (red if > 0)
    │
    └── useEffect → fetch /api/incidents?status=OPEN&limit=5
                         │
                    Recent open incidents list
```

Dashboard data is fetched fresh on every mount. No polling or WebSockets needed.

---

## 12. Error Handling

### Backend Error Classification

| Error Type | HTTP Status | Code |
|-----------|-------------|------|
| Missing required field | 400 | `VALIDATION_ERROR` |
| Field too short / too long | 400 | `VALIDATION_ERROR` |
| Invalid field value | 400 | `VALIDATION_ERROR` |
| Incident not found | 404 | `NOT_FOUND` |
| Invalid status transition | 409 | `INVALID_TRANSITION` |
| Auth header missing | 401 | `UNAUTHORIZED` |
| Unknown demo user | 401 | `UNAUTHORIZED` |
| Storage failure | 500 | `SERVER_ERROR` |
| Unexpected exception | 500 | `SERVER_ERROR` |

### Backend Error Wrapper Pattern

```javascript
// All handlers are wrapped in a try/catch that serialises errors consistently

async function safeHandler(fn, res) {
  try {
    await fn();
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message, field: err.field, code: err.code });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_TRANSITION') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ error: err.message, code: err.code });
    }
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred', code: 'SERVER_ERROR' });
  }
}
```

### Frontend Error Handling

```
API call fails
    │
    ├── Network error     → "Could not reach the server. Please check your connection."
    ├── 400 error         → Show field-level validation message inline on form
    ├── 401 error         → Redirect to /login
    ├── 404 error         → "Incident not found. It may have been deleted."
    ├── 409 error         → "Invalid status change: <server message>"
    └── 500 error         → "A server error occurred. Please try again."
```

All errors are displayed in an `<ErrorBanner>` component at the top of the affected view. Forms additionally show inline per-field errors. Errors are dismissed when the user retries or navigates away.

### Delete Confirmation

```
User clicks Delete
    │
    ▼
<ConfirmDialog>
  "Are you sure you want to delete incident INC-XXX?
   This action cannot be undone."
  [Cancel]  [Delete]
    │
    ▼ (on confirm)
DELETE /api/incidents/:id
    │
    ├── 200 → Remove from local state, show success, redirect to /incidents
    └── Error → Show error banner, dialog closes
```

---

## 13. Input Validation

### Two-Layer Validation Strategy

Validation runs in both layers. Frontend validation provides immediate feedback; backend validation is the authoritative gate.

#### Layer 1 — Frontend (form-level, before submission)

```javascript
// frontend/src/utils/validators.js

export function validateCreateIncident(data) {
  const errors = {};

  if (!data.title || data.title.trim().length < 5)
    errors.title = 'Title must be at least 5 characters';
  if (data.title && data.title.length > 200)
    errors.title = 'Title must be at most 200 characters';

  if (!data.description || data.description.trim().length < 10)
    errors.description = 'Description must be at least 10 characters';
  if (data.description && data.description.length > 2000)
    errors.description = 'Description must be at most 2000 characters';

  if (!data.service || data.service.trim().length === 0)
    errors.service = 'Service is required';

  if (!data.businessImpact || data.businessImpact.trim().length < 5)
    errors.businessImpact = 'Business impact must be at least 5 characters';
  if (data.businessImpact && data.businessImpact.length > 500)
    errors.businessImpact = 'Business impact must be at most 500 characters';

  return errors; // empty object = valid
}
```

#### Layer 2 — Backend (authoritative, always runs)

```javascript
// shared/validators.js

const VALID_STATUSES   = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
const VALID_PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const ENGINEERS        = ['John Smith', 'Maria Garcia', 'David Chen',
                          'Sarah Johnson', 'Michael Brown'];

function validateCreatePayload(data) {
  const errors = [];

  if (!data.title || data.title.trim().length < 5)
    errors.push({ field: 'title', message: 'Title must be at least 5 characters' });
  if (data.title && data.title.length > 200)
    errors.push({ field: 'title', message: 'Title exceeds 200 characters' });

  if (!data.description || data.description.trim().length < 10)
    errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
  if (data.description && data.description.length > 2000)
    errors.push({ field: 'description', message: 'Description exceeds 2000 characters' });

  if (!data.service || data.service.trim().length === 0)
    errors.push({ field: 'service', message: 'Service is required' });

  if (!data.businessImpact || data.businessImpact.trim().length < 5)
    errors.push({ field: 'businessImpact', message: 'Business impact must be at least 5 characters' });
  if (data.businessImpact && data.businessImpact.length > 500)
    errors.push({ field: 'businessImpact', message: 'Business impact exceeds 500 characters' });

  if (errors.length > 0) {
    throw { code: 'VALIDATION_ERROR', message: errors[0].message, field: errors[0].field, errors };
  }
}

function validateAssignedEngineer(engineer) {
  if (engineer !== null && !ENGINEERS.includes(engineer)) {
    throw { code: 'VALIDATION_ERROR', field: 'assignedEngineer',
            message: `Unknown engineer. Must be one of: ${ENGINEERS.join(', ')}` };
  }
}

module.exports = { validateCreatePayload, validateAssignedEngineer, ENGINEERS };
```

---

## 14. Frontend–Backend Communication

### API Client

```javascript
// frontend/src/api/client.js

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function getUser() {
  const session = JSON.parse(localStorage.getItem('session') || 'null');
  return session?.username || null;
}

export async function apiRequest(method, path, body) {
  const username = getUser();
  const headers = { 'Content-Type': 'application/json' };
  if (username) headers['x-demo-user'] = username;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw { status: res.status, ...err };
  }

  return res.json();
}

export const api = {
  get:    (path)        => apiRequest('GET', path),
  post:   (path, body)  => apiRequest('POST', path, body),
  put:    (path, body)  => apiRequest('PUT', path, body),
  delete: (path)        => apiRequest('DELETE', path),
};
```

### Vite Proxy (local development — avoids CORS)

```javascript
// vite.config.js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
};
```

### AWS Mode Base URL

For the AWS deployment, `VITE_API_BASE_URL` is set to the API Gateway base URL at build time:
```
VITE_API_BASE_URL=https://abc123.execute-api.eu-west-1.amazonaws.com/prod
```

The frontend code is identical; only the `.env.production` file changes.

---

## 15. Local Development Strategy

### Prerequisites

- Node.js 18+ and npm
- No Docker, no database installation, no cloud account

### Project Layout

```
incidentiq/
  frontend/          ← React + Vite
  backend/           ← Express + shared logic
  .kiro/
    specs/
      incidentiq/
        requirements.md
        design.md
        tasks.md       ← (to be created)
```

### Starting the Application

Two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
npm install
npm start           # starts Express on port 3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev         # starts Vite on port 5173 with proxy to 3001
```

Open `http://localhost:5173`.

### Single-Command Option (optional)

```json
// root package.json
{
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix backend\" \"npm run dev --prefix frontend\""
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

```bash
npm install && npm run dev
```

### Local Storage

`backend/data/incidents.json` is created automatically on first write if it does not exist. Its format:

```json
{
  "incidents": []
}
```

This file is excluded from version control (`.gitignore`) so each developer starts with a clean dataset.

### Seeding Demo Data (optional)

```bash
node backend/scripts/seed.js
```

Inserts 5–10 sample incidents to pre-populate the UI for the hackathon demo.

### Environment Variables

```
# backend/.env
PORT=3001
DATA_FILE=./data/incidents.json

# frontend/.env
VITE_API_BASE_URL=          ← empty = relative URLs via Vite proxy
```

---

## 16. AWS Deployment Strategy

### Target Architecture

```
S3 bucket (static website)
  → CloudFront distribution
      → React SPA (built with VITE_API_BASE_URL set to API GW URL)

API Gateway (HTTP API)
  → Lambda function (Node.js 20.x)
      → DynamoDB table (on-demand billing)
```

### Deployment Steps (manual for hackathon)

1. **Create DynamoDB table**
   - Name: `incidentiq-incidents`
   - Partition key: `PK` (String)
   - Sort key: `SK` (String)
   - Billing: On-demand (no capacity planning)

2. **Package and deploy Lambda**
   ```bash
   cd backend
   npm install --omit=dev
   zip -r ../lambda.zip . -x "data/*" -x "local/*"
   aws lambda create-function \
     --function-name incidentiq \
     --runtime nodejs20.x \
     --handler lambda/handler.handler \
     --zip-file fileb://../lambda.zip \
     --role arn:aws:iam::<account>:role/lambda-basic-role \
     --environment "Variables={DYNAMODB_TABLE=incidentiq-incidents,AWS_REGION=eu-west-1}"
   ```

3. **Create API Gateway HTTP API**
   - Create HTTP API → Lambda integration → auto-deploy to `$default` stage
   - Add routes matching §5
   - Note the invoke URL

4. **Build and deploy frontend**
   ```bash
   cd frontend
   VITE_API_BASE_URL=https://<api-id>.execute-api.eu-west-1.amazonaws.com \
     npm run build
   aws s3 sync dist/ s3://<bucket-name>/ --delete
   ```

5. **Create CloudFront distribution** pointing to the S3 bucket with HTTPS.

### IAM Role Requirements

The Lambda execution role needs:
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:Query`
- `dynamodb:Scan` (for stats computation)

Plus the standard `AWSLambdaBasicExecutionRole` for CloudWatch logs.

### Cost Estimate (hackathon scale)

| Service | Free tier | Likely usage |
|---------|-----------|-------------|
| Lambda | 1M requests/month | ~1 000 → $0 |
| API Gateway | 1M requests/month | ~1 000 → $0 |
| DynamoDB | 25 GB + 200M requests | ~100 items → $0 |
| S3 | 5 GB + 20K requests | ~10 MB → $0 |
| CloudFront | 1 TB transfer | Negligible → $0 |

**Total expected cost for hackathon: $0**

---

## 17. Testing Strategy

### Philosophy

For a one-day hackathon, testing focuses on:
1. Unit tests for pure logic modules (triage, SLA, state machine, validators)
2. Integration tests for the API endpoints against the local server
3. Manual smoke tests for the full UI flow

No test doubles, mocks, or external test infrastructure needed.

### Unit Tests — Pure Logic (`backend/src/shared/`)

**Framework:** Node.js built-in `node:test` or Jest (whichever is already installed).

| Module | What to test |
|--------|-------------|
| `triageEngine` | All P1/P2/P3/P4 keyword matches; default fallback to P4; case-insensitive matching; first-match-wins order |
| `slaCalculator` | P1 deadline = created + 2h; P2 = +8h; P3 = +24h; P4 = +72h; ISO string format |
| `stateMachine` | Each allowed transition succeeds; each forbidden transition throws 409; resolving without note throws 400 |
| `validators` | Missing title rejects; title too short rejects; valid payload passes; invalid engineer rejects |

```bash
cd backend
npm test          # runs all unit tests
```

### Integration Tests — API (`backend/`)

Spin up the Express server against an isolated test data file, then run HTTP assertions.

```javascript
// backend/test/incidents.test.js  (using supertest)

const request = require('supertest');
const app = require('../src/local/server');

describe('POST /api/incidents', () => {
  it('creates an incident with correct triage', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-demo-user', 'alice')
      .send({
        title: 'production outage in payment service',
        description: 'All users affected by complete failure of payment gateway',
        service: 'Payment Gateway',
        businessImpact: 'Revenue loss',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.priority).toBe('P1');
    expect(res.body.data.severity).toBe('Critical');
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.slaDeadline).toBeDefined();
  });
});
```

### Frontend Unit Tests (optional, time permitting)

```javascript
// frontend/src/utils/sla.test.js

import { getSlaStatus } from './sla';

test('breached SLA shows correct label', () => {
  const pastDeadline = new Date(Date.now() - 3600000).toISOString();
  const result = getSlaStatus(pastDeadline, 'OPEN', null);
  expect(result.breached).toBe(true);
  expect(result.label).toMatch(/SLA breached/);
});
```

### Manual Smoke Test Checklist

The following scenarios must pass before demo:

- [ ] Login as each of the three roles (Admin, Engineer, Support)
- [ ] Create incident with P1 keywords → verify P1/Critical/2h SLA
- [ ] Create incident with no keywords → verify P4/Low/72h SLA
- [ ] Move incident OPEN → IN_PROGRESS → RESOLVED (with note)
- [ ] Try OPEN → RESOLVED → verify 409 rejection
- [ ] Delete incident → verify confirmation dialog and removal from list
- [ ] Search by title partial string → verify filtered results
- [ ] Filter by status=OPEN → verify only open incidents shown
- [ ] Combine search + filter → verify both apply
- [ ] Dashboard stats update after create/resolve
- [ ] SLA breach: create a P1 incident, manually set slaDeadline to past date in data file, refresh → verify "SLA breached" label
- [ ] Logout → verify redirect to login; navigate back → verify redirect to login

---

## Appendix A: File Tree Summary

```
incidentiq/
  package.json              ← root (optional, concurrently script)
  .gitignore

  frontend/
    package.json
    vite.config.js
    index.html
    src/
      main.jsx
      App.jsx
      api/          client.js, incidents.js, auth.js, stats.js
      components/   layout/, incidents/, dashboard/, auth/, shared/
      context/      AuthContext.jsx, IncidentContext.jsx
      hooks/        useIncidents.js, useSla.js
      pages/        LoginPage, DashboardPage, IncidentListPage,
                    IncidentDetailPage, CreateIncidentPage
      utils/        sla.js, validators.js, constants.js

  backend/
    package.json
    src/
      shared/       triageEngine.js, slaCalculator.js,
                    stateMachine.js, validators.js, constants.js
      handlers/     incidents.js, auth.js, stats.js
      local/        server.js, storage.js
      lambda/       handler.js, dynamodb.js
    data/
      incidents.json         ← gitignored
    scripts/
      seed.js                ← optional demo data
    test/
      triageEngine.test.js
      slaCalculator.test.js
      stateMachine.test.js
      validators.test.js
      incidents.test.js

  .kiro/
    specs/
      incidentiq/
        requirements.md
        design.md
        tasks.md             ← to be created
```

---

## Appendix B: Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend framework (local) | Express.js | Minimal setup, zero config, familiar |
| Persistence (local) | JSON file | No database to install, trivially portable |
| Persistence (AWS) | DynamoDB | Serverless, no VPC, pairs with Lambda |
| Single Lambda function | Yes | Simpler than per-route functions for MVP |
| Auth mechanism | `x-demo-user` header | Zero infrastructure, demo-appropriate |
| SLA computation | Frontend, on-demand | No scheduler needed |
| Search/filter | In-memory after fetch | Acceptable at MVP scale, simple to implement |
| Business logic location | Shared modules | Run identically local and on Lambda |
| Test framework | Jest or node:test | Already in Node ecosystem, no install friction |
