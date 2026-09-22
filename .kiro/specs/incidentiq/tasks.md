# IncidentIQ — Implementation Task Plan

**Project:** IncidentIQ — AI-Assisted IT Incident Triage & SLA Management  
**Version:** 1.0  
**Type:** Hackathon MVP (one-day implementation)

---

## How to Read This File

Each task has:
- A numeric ID used for dependency references
- A clear **outcome** — the concrete, testable result when the task is done
- A **depends on** list of task IDs that must be complete first
- A **verify** step that confirms the task is done without ambiguity

Tasks are ordered so they can be worked top-to-bottom. The critical path is:
`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 12 → 13 → 14 → 18 → 19 → 20 → 21 → 22 → 23 → 24`

---

## Phase 1 — Project Setup

### Task 1 — Initialise project directory structure

**Depends on:** nothing  
**Outcome:** The monorepo skeleton exists with correct directories and root scripts.

Steps:
1. Create the root directory `incidentiq/` inside the workspace.
2. Create `incidentiq/frontend/` and `incidentiq/backend/` subdirectories.
3. Create `incidentiq/backend/src/shared/`, `src/handlers/`, `src/local/`, `src/lambda/`, `data/`, `scripts/`, `test/`.
4. Create `incidentiq/backend/data/incidents.json` with content `{ "incidents": [] }`.
5. Create root `package.json` with a `dev` script that runs frontend and backend concurrently using `concurrently`.
6. Create root `.gitignore` that excludes `node_modules/`, `backend/data/incidents.json`, `.env`, `dist/`.

**Verify:**
```
incidentiq/
  package.json          ← has "dev" script
  .gitignore
  backend/
    src/shared/
    src/handlers/
    src/local/
    src/lambda/
    data/incidents.json ← contains { "incidents": [] }
    scripts/
    test/
  frontend/             ← empty for now
```

---

### Task 2 — Initialise backend package

**Depends on:** Task 1  
**Outcome:** `backend/package.json` is configured, dependencies installed, and `npm start` launches without error.

Steps:
1. Create `backend/package.json` with:
   - `"main": "src/local/server.js"`
   - `"scripts": { "start": "node src/local/server.js", "test": "node --test" }`
   - Dependencies: `express`, `cors`, `dotenv`
   - Dev dependencies: `nodemon`
2. Run `npm install` inside `backend/`.
3. Create `backend/.env` with `PORT=3001` and `DATA_FILE=./data/incidents.json`.
4. Create a minimal `backend/src/local/server.js` that starts Express on port 3001 and responds to `GET /health` with `{ "status": "ok" }`.

**Verify:**
```bash
cd backend && npm start
curl http://localhost:3001/health
# → {"status":"ok"}
```

---

### Task 3 — Initialise frontend package

**Depends on:** Task 1  
**Outcome:** `frontend/` is a working Vite + React project. `npm run dev` opens a page in the browser.

Steps:
1. Scaffold with `npm create vite@latest frontend -- --template react` from the `incidentiq/` root (or equivalent manual setup).
2. Install dependencies: `react-router-dom`.
3. Configure `vite.config.js` with the API proxy:
   ```js
   server: { proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } }
   ```
4. Create `frontend/.env` with `VITE_API_BASE_URL=` (empty — uses proxy in dev).
5. Replace the scaffold `App.jsx` with a placeholder `<h1>IncidentIQ</h1>`.

**Verify:**
```bash
cd frontend && npm run dev
# Browser shows "IncidentIQ" at http://localhost:5173
# Network tab: /api requests proxy to port 3001
```

---

## Phase 2 — Backend Core

### Task 4 — Shared constants module

**Depends on:** Task 2  
**Outcome:** `backend/src/shared/constants.js` exports all fixed lookup values used by every other module.

Steps:
1. Create `backend/src/shared/constants.js` that exports:
   ```js
   DEMO_USERS        // array of { username, role, displayName }
   ENGINEERS         // ['John Smith', 'Maria Garcia', 'David Chen', 'Sarah Johnson', 'Michael Brown']
   VALID_STATUSES    // ['OPEN', 'IN_PROGRESS', 'RESOLVED']
   VALID_PRIORITIES  // ['P1', 'P2', 'P3', 'P4']
   VALID_SEVERITIES  // ['Critical', 'High', 'Medium', 'Low']
   SLA_HOURS         // { P1: 2, P2: 8, P3: 24, P4: 72 }
   ALLOWED_TRANSITIONS // { OPEN: ['IN_PROGRESS'], IN_PROGRESS: ['RESOLVED', 'OPEN'], RESOLVED: ['OPEN'] }
   ```

**Verify:**
```bash
node -e "const c = require('./src/shared/constants'); console.log(c.SLA_HOURS)"
# → { P1: 2, P2: 8, P3: 24, P4: 72 }
```

---

### Task 5 — JSON file storage adapter

**Depends on:** Task 2, Task 4  
**Outcome:** `backend/src/local/storage.js` can read and write `incidents.json`. All operations survive a process restart.

Steps:
1. Create `backend/src/local/storage.js` that exports:
   - `readAll()` → returns the incidents array from the JSON file
   - `readOne(incidentId)` → returns a single incident or `null`
   - `write(incident)` → appends or updates an incident in the JSON file (upsert by `incidentId`)
   - `remove(incidentId)` → deletes an incident from the JSON file; returns `true` if found
2. All operations must:
   - Read the file fresh on each call (no stale in-memory cache)
   - Write atomically (write to `.tmp` then rename, or equivalent)
   - Create the file with `{ "incidents": [] }` if it does not exist

**Verify:**
```bash
node -e "
  const s = require('./src/local/storage');
  s.write({ incidentId: 'TEST-1', title: 'Test' });
  console.log(s.readOne('TEST-1'));
  s.remove('TEST-1');
  console.log(s.readOne('TEST-1')); // null
"
```

---

### Task 6 — Auth handler and middleware

**Depends on:** Task 2, Task 4  
**Outcome:** `POST /api/login` validates a demo username and sets the session. Every other route rejects requests missing the `x-demo-user` header.

Steps:
1. Create `backend/src/handlers/auth.js` that exports:
   - `login(username)` → returns `{ username, role, displayName }` if found in `DEMO_USERS`; throws `{ code: 'UNAUTHORIZED' }` otherwise
   - `logout()` → returns `{ message: 'Logged out' }` (session is client-side; backend is stateless)
2. Create `backend/src/local/authMiddleware.js`:
   - Reads `req.headers['x-demo-user']`
   - If missing or unknown, responds `401 { error: 'Unauthorized', code: 'UNAUTHORIZED' }`
   - If valid, sets `req.currentUser` and calls `next()`
3. Wire into `server.js`:
   - `POST /api/login` — no middleware
   - `POST /api/logout` — no middleware (stateless)
   - All `/api/*` routes except login/logout — apply `authMiddleware`

**Verify:**
```bash
# No header → 401
curl -X GET http://localhost:3001/api/incidents
# → 401

# Valid user → passes middleware
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents
# → 200 (empty list)

# Login endpoint
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice"}'
# → { data: { username: "alice", role: "Admin", displayName: "Alice (Admin)" } }

# Bad username → 401
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nobody"}'
# → 401
```

---

## Phase 3 — DynamoDB Integration

### Task 7 — DynamoDB storage adapter

**Depends on:** Task 2, Task 4  
**Outcome:** `backend/src/lambda/dynamodb.js` provides the same read/write interface as the JSON storage adapter. Swapping it in requires no changes to handler code.

Steps:
1. Install `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` in `backend/`.
2. Create `backend/src/lambda/dynamodb.js` that exports the same four functions as `storage.js`:
   - `readAll()` → `DynamoDB.Query(PK = "INCIDENT")`, returns unmarshalled array
   - `readOne(incidentId)` → `DynamoDB.GetItem(PK = "INCIDENT", SK = "INC-<id>")`, returns item or `null`
   - `write(incident)` → `DynamoDB.PutItem` with `PK = "INCIDENT"`, `SK = incident.incidentId`
   - `remove(incidentId)` → `DynamoDB.DeleteItem`, returns `true` if item existed
3. Read `DYNAMODB_TABLE` and `AWS_REGION` from environment variables.
4. The adapter must not throw on `ResourceNotFoundException` from `readOne` — return `null` instead.

**Verify (requires AWS credentials + table):**
```bash
DYNAMODB_TABLE=incidentiq-incidents AWS_REGION=eu-west-1 \
  node -e "
    const db = require('./src/lambda/dynamodb');
    db.write({ incidentId: 'INC-TEST', title: 'DDB test' })
      .then(() => db.readOne('INC-TEST'))
      .then(console.log)
      .then(() => db.remove('INC-TEST'));
  "
```
Local mode does not depend on this task — it uses the JSON adapter. This task can be deferred to the AWS deployment phase if time is short.

---

## Phase 4 — Business Logic Modules

### Task 8 — Triage engine

**Depends on:** Task 4  
**Outcome:** `backend/src/shared/triageEngine.js` correctly determines priority, severity, and category from incident text. Fully covered by unit tests.

Steps:
1. Create `backend/src/shared/triageEngine.js` that exports `triage(title, description, service)` returning `{ priority, severity, category }`.
2. Implement keyword matching rules in priority order (P1 first, P4 is default):
   - P1 keywords: `production outage`, `database unavailable`, `all users affected`, `complete failure`
   - P2 keywords: `payment failure`, `authentication failure`, `multiple users`, `data loss`, `security breach`
   - P3 keywords: `latency`, `slow`, `intermittent`, `performance issue`, `timeout`
   - P4: all other cases
3. Matching must be case-insensitive and check both title and description.
4. Derive severity from priority via `SEVERITY_MAP`.
5. Derive category from the service field via `SERVICE_CATEGORY_MAP`; default to `"General"`.
6. Create `backend/test/triageEngine.test.js` with tests for:
   - P1 keyword in title → P1/Critical
   - P1 keyword in description → P1/Critical
   - P2 keyword → P2/High
   - P3 keyword → P3/Medium
   - No keywords → P4/Low (default)
   - Mixed keywords, P1 wins over P3 (first-match order)
   - Case-insensitive match ("Production Outage" → P1)
   - Service "Payment Gateway" → category "Payment"
   - Unknown service → category "General"

**Verify:**
```bash
cd backend && npm test
# All triageEngine tests pass
```

---

### Task 9 — SLA calculator

**Depends on:** Task 4  
**Outcome:** `backend/src/shared/slaCalculator.js` computes correct SLA deadlines for all four priority levels. Covered by unit tests.

Steps:
1. Create `backend/src/shared/slaCalculator.js` that exports `calculateSlaDeadline(priority, createdAt)`.
2. Implementation: `deadline = new Date(createdAt).getTime() + SLA_HOURS[priority] * 3600000`, returned as UTC ISO 8601 string.
3. Create `backend/test/slaCalculator.test.js` with tests for:
   - P1: deadline = createdAt + 2 hours
   - P2: deadline = createdAt + 8 hours
   - P3: deadline = createdAt + 24 hours
   - P4: deadline = createdAt + 72 hours
   - Output is a valid ISO 8601 UTC string
   - Unknown priority defaults to P4 (72 hours)

**Verify:**
```bash
cd backend && npm test
# All slaCalculator tests pass
```

---

### Task 10 — State machine

**Depends on:** Task 4  
**Outcome:** `backend/src/shared/stateMachine.js` enforces all valid and invalid status transitions. Covered by unit tests.

Steps:
1. Create `backend/src/shared/stateMachine.js` that exports:
   - `validateTransition(from, to)` — throws `{ code: 'INVALID_TRANSITION', message }` on invalid
   - `applyTransition(incident, newStatus, resolutionNote)` — validates, checks resolution note when needed, returns patch object `{ status, updatedAt, resolvedAt, resolutionNote }`
2. Allowed transitions per design:
   - `OPEN → IN_PROGRESS` ✓
   - `IN_PROGRESS → RESOLVED` ✓ (requires non-empty resolutionNote ≥ 10 chars)
   - `IN_PROGRESS → OPEN` ✓
   - `RESOLVED → OPEN` ✓
   - `OPEN → RESOLVED` ✗ → `INVALID_TRANSITION`
   - `RESOLVED → IN_PROGRESS` ✗ → `INVALID_TRANSITION`
   - Same status → same status ✗ → `INVALID_TRANSITION`
3. When `newStatus === 'RESOLVED'`, `resolvedAt` in the returned patch must be the current UTC timestamp.
4. Create `backend/test/stateMachine.test.js` covering all six transition scenarios plus the resolution note validation.

**Verify:**
```bash
cd backend && npm test
# All stateMachine tests pass
```

---

### Task 11 — Input validators

**Depends on:** Task 4  
**Outcome:** `backend/src/shared/validators.js` validates all create and update payloads. Invalid input throws structured errors that map directly to HTTP 400 responses.

Steps:
1. Create `backend/src/shared/validators.js` that exports:
   - `validateCreatePayload(data)` — checks title, description, service, businessImpact
   - `validateUpdatePayload(data)` — checks only the fields present in the update body
   - `validateAssignedEngineer(engineer)` — must be in `ENGINEERS` list or `null`
2. Validation rules per requirements:
   - `title`: required, 5–200 chars
   - `description`: required, 10–2000 chars
   - `service`: required, non-empty
   - `businessImpact`: required, 5–500 chars
   - `resolutionNote` (on resolve): required, ≥ 10 chars
3. Throw `{ code: 'VALIDATION_ERROR', field, message }` on first failure.
4. Create `backend/test/validators.test.js` covering: missing title, too-short title, too-long description, missing service, invalid engineer name, valid full payload.

**Verify:**
```bash
cd backend && npm test
# All validators tests pass
```

---

## Phase 5 — Incident Handlers and Routes

### Task 12 — POST /api/incidents

**Depends on:** Tasks 5, 6, 8, 9, 11  
**Outcome:** Creating an incident persists it with correct triage results, SLA deadline, ID, and timestamps. Returns `201` with the full incident object.

Steps:
1. In `backend/src/handlers/incidents.js`, implement `createIncident(body, createdBy, storage)`:
   - Call `validateCreatePayload(body)` — throws 400 on invalid
   - Call `triage(body.title, body.description, body.service)` — get priority, severity, category
   - Generate `incidentId` using pattern `INC-${Date.now()}-${randomSuffix}`
   - Set `createdAt` and `updatedAt` to `new Date().toISOString()`
   - Call `calculateSlaDeadline(priority, createdAt)`
   - Set `status = 'OPEN'`, `assignedEngineer = null`, `resolutionNote = null`, `resolvedAt = null`
   - Call `storage.write(incident)`
   - Return the complete incident object
2. Wire `POST /api/incidents` in `server.js` → `createIncident`.
3. Respond `201` with `{ data: incident }` and `Location: /api/incidents/<id>` header.

**Verify:**
```bash
curl -X POST http://localhost:3001/api/incidents \
  -H "Content-Type: application/json" \
  -H "x-demo-user: alice" \
  -d '{"title":"production outage in DB","description":"All users affected complete failure","service":"Database","businessImpact":"Total revenue loss"}'
# → 201
# Response body contains: priority=P1, severity=Critical, slaDeadline (2h from now), status=OPEN, incidentId starts with INC-
```

---

### Task 13 — GET /api/incidents

**Depends on:** Tasks 5, 6, 12  
**Outcome:** Returns all persisted incidents. Accepts `search`, `status`, `priority`, `severity` query parameters. Filtering and searching work correctly and can be combined.

Steps:
1. In `backend/src/handlers/incidents.js`, implement `listIncidents(query, storage)`:
   - Call `storage.readAll()`
   - If `query.search`: filter incidents where `incidentId`, `title`, `description`, or `service` contains the search string (case-insensitive)
   - If `query.status`: filter by exact status match
   - If `query.priority`: filter by exact priority match
   - If `query.severity`: filter by exact severity match
   - Apply all filters cumulatively (AND logic)
   - Return filtered array
2. Wire `GET /api/incidents` → `listIncidents`.
3. Respond `200` with `{ data: incidents[] }`.

**Verify:**
```bash
# Returns all incidents
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents

# Returns only OPEN incidents
curl -H "x-demo-user: alice" "http://localhost:3001/api/incidents?status=OPEN"

# Search by title keyword
curl -H "x-demo-user: alice" "http://localhost:3001/api/incidents?search=database"

# Combined filter + search
curl -H "x-demo-user: alice" "http://localhost:3001/api/incidents?status=OPEN&priority=P1"

# Empty dataset returns []
curl -H "x-demo-user: alice" "http://localhost:3001/api/incidents?status=RESOLVED"
# → { "data": [] }
```

---

### Task 14 — GET /api/incidents/:id

**Depends on:** Tasks 5, 6  
**Outcome:** Returns a single incident by ID. Returns `404` if not found.

Steps:
1. In `backend/src/handlers/incidents.js`, implement `getIncident(id, storage)`:
   - Call `storage.readOne(id)`
   - If `null`, throw `{ code: 'NOT_FOUND', message: 'Incident not found' }`
   - Return incident
2. Wire `GET /api/incidents/:id` → `getIncident`.
3. Respond `200` with `{ data: incident }`.

**Verify:**
```bash
# Existing ID
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-<id>
# → 200 with incident object

# Non-existent ID
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-FAKE
# → 404 { "error": "Incident not found", "code": "NOT_FOUND" }
```

---

### Task 15 — PUT /api/incidents/:id

**Depends on:** Tasks 5, 6, 10, 11  
**Outcome:** Updates permitted fields on an existing incident. Validates transitions. Preserves `incidentId` and `createdAt`. Returns the full updated incident.

Steps:
1. In `backend/src/handlers/incidents.js`, implement `updateIncident(id, body, storage)`:
   - Call `storage.readOne(id)` → 404 if not found
   - If `body.status` is present and differs from current status, call `applyTransition(incident, body.status, body.resolutionNote)` — throws 409 on invalid transition
   - If `body.assignedEngineer` is present, call `validateAssignedEngineer(body.assignedEngineer)`
   - Call `validateUpdatePayload(body)` for other fields
   - Build the updated incident: merge permitted fields, set `updatedAt = now`
   - Preserve `incidentId`, `createdAt`, `createdBy`, `priority`, `severity`, `category`, `slaDeadline`
   - Call `storage.write(updated)`
   - Return updated incident
2. Wire `PUT /api/incidents/:id` → `updateIncident`.
3. Respond `200` with `{ data: updatedIncident }`.

**Verify:**
```bash
# Update title
curl -X PUT http://localhost:3001/api/incidents/INC-<id> \
  -H "Content-Type: application/json" -H "x-demo-user: alice" \
  -d '{"title":"Updated title longer than 5 chars"}'
# → 200, title changed, createdAt unchanged

# Assign engineer
curl -X PUT http://localhost:3001/api/incidents/INC-<id> \
  -H "Content-Type: application/json" -H "x-demo-user: alice" \
  -d '{"assignedEngineer":"John Smith"}'
# → 200, assignedEngineer set

# Invalid status transition OPEN → RESOLVED
curl -X PUT http://localhost:3001/api/incidents/INC-<id> \
  -H "Content-Type: application/json" -H "x-demo-user: alice" \
  -d '{"status":"RESOLVED"}'
# → 409
```

---

### Task 16 — DELETE /api/incidents/:id

**Depends on:** Tasks 5, 6  
**Outcome:** Permanently removes an incident. Returns `404` if it does not exist.

Steps:
1. In `backend/src/handlers/incidents.js`, implement `deleteIncident(id, storage)`:
   - Call `storage.readOne(id)` → 404 if not found
   - Call `storage.remove(id)`
   - Return `{ message: 'Incident deleted' }`
2. Wire `DELETE /api/incidents/:id` → `deleteIncident`.
3. Respond `200` with `{ message: 'Incident deleted' }`.

**Verify:**
```bash
# Delete existing incident
curl -X DELETE -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-<id>
# → 200 { "message": "Incident deleted" }

# Verify it is gone
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-<id>
# → 404

# Delete non-existent
curl -X DELETE -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-FAKE
# → 404
```

---

### Task 17 — GET /api/stats

**Depends on:** Tasks 5, 6  
**Outcome:** Returns dashboard statistics computed from real persisted data. No hard-coded values.

Steps:
1. Create `backend/src/handlers/stats.js` that exports `getDashboardStats(storage)`:
   - Call `storage.readAll()`
   - Compute:
     - `total`: `incidents.length`
     - `open`: count where `status === 'OPEN'`
     - `inProgress`: count where `status === 'IN_PROGRESS'`
     - `resolved`: count where `status === 'RESOLVED'`
     - `p1Critical`: count where `priority === 'P1'`
     - `slaBreached`: count where `status !== 'RESOLVED'` AND `new Date(slaDeadline) < new Date()`
   - Return stats object
2. Wire `GET /api/stats` → `getDashboardStats`.
3. Respond `200` with `{ data: { total, open, inProgress, resolved, p1Critical, slaBreached } }`.

**Verify:**
```bash
curl -H "x-demo-user: alice" http://localhost:3001/api/stats
# → { "data": { "total": N, "open": N, "inProgress": N, "resolved": N, "p1Critical": N, "slaBreached": N } }
# Create a new incident and call /api/stats again → total increases by 1
```

---

## Phase 6 — Backend Error Handling and Validation Wiring

### Task 18 — Central error handler

**Depends on:** Tasks 6, 12–17  
**Outcome:** All handler errors are serialised consistently. Every error response follows the envelope `{ error, code, field? }`. No stack traces leak to the client.

Steps:
1. Create `backend/src/local/errorHandler.js` — an Express error middleware `(err, req, res, next)` that:
   - Maps `err.code === 'VALIDATION_ERROR'` → `400`
   - Maps `err.code === 'NOT_FOUND'` → `404`
   - Maps `err.code === 'INVALID_TRANSITION'` → `409`
   - Maps `err.code === 'UNAUTHORIZED'` → `401`
   - All other errors → `500 { error: 'An unexpected error occurred', code: 'SERVER_ERROR' }`
   - Logs the full error to `console.error` before responding
2. Wrap all route handlers with `try/catch` that calls `next(err)` on failure, or use a higher-order `asyncHandler(fn)` wrapper.
3. Register the error middleware last in `server.js`.

**Verify:**
```bash
# 400 for invalid input
curl -X POST http://localhost:3001/api/incidents \
  -H "Content-Type: application/json" -H "x-demo-user: alice" \
  -d '{"title":"x"}'
# → 400 { "error": "Title must be at least 5 characters", "code": "VALIDATION_ERROR", "field": "title" }

# 404 for missing incident
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-NOTEXIST
# → 404 { "error": "Incident not found", "code": "NOT_FOUND" }

# 409 for invalid transition
# (Create incident, then try OPEN → RESOLVED)
# → 409 { "error": "Cannot transition from OPEN to RESOLVED...", "code": "INVALID_TRANSITION" }
```

---

## Phase 7 — Frontend Core

### Task 19 — API client and constants

**Depends on:** Task 3  
**Outcome:** `frontend/src/api/client.js` sends requests with the `x-demo-user` header automatically. `frontend/src/utils/constants.js` exports the same lookup values as the backend.

Steps:
1. Create `frontend/src/api/client.js` with:
   - `apiRequest(method, path, body)` — reads session from `localStorage`, adds `x-demo-user` header, throws structured error on non-OK responses
   - Exported shorthand: `api.get`, `api.post`, `api.put`, `api.delete`
2. Create `frontend/src/api/incidents.js` with:
   - `fetchIncidents(params)` → `GET /api/incidents?<params>`
   - `fetchIncident(id)` → `GET /api/incidents/:id`
   - `createIncident(data)` → `POST /api/incidents`
   - `updateIncident(id, data)` → `PUT /api/incidents/:id`
   - `deleteIncident(id)` → `DELETE /api/incidents/:id`
3. Create `frontend/src/api/auth.js` with `login(username)` and `logout()`.
4. Create `frontend/src/api/stats.js` with `fetchStats()` → `GET /api/stats`.
5. Create `frontend/src/utils/constants.js` mirroring backend constants (ENGINEERS, STATUSES, etc.).

**Verify:**
```bash
# With backend running:
# In browser console at http://localhost:5173:
localStorage.setItem('session', JSON.stringify({ username: 'alice', role: 'Admin' }));
# Then confirm api.get('/api/incidents') resolves without 401
```

---

### Task 20 — Auth context and login page

**Depends on:** Task 19  
**Outcome:** User can select a demo user from a dropdown and log in. Session persists in `localStorage`. Protected routes redirect to `/login` if no session exists.

Steps:
1. Create `frontend/src/context/AuthContext.jsx`:
   - Reads session from `localStorage` on mount
   - Exposes `currentUser`, `login(username)`, `logout()`
   - `login()` calls `api/auth.js → POST /api/login`, stores response in `localStorage`, updates context
   - `logout()` calls `POST /api/logout`, clears `localStorage`, redirects to `/login`
2. Create `frontend/src/pages/LoginPage.jsx`:
   - Dropdown listing all five demo users by display name
   - "Log in" button — calls `login()`, navigates to `/dashboard` on success
   - Shows error if login fails
3. Create `frontend/src/components/shared/ProtectedRoute.jsx`:
   - If `currentUser` is null, redirect to `/login`
   - Otherwise render `<Outlet />`
4. Wire routes in `App.jsx`:
   - `/login` → `LoginPage`
   - `/` → redirect to `/dashboard`
   - All other routes wrapped in `ProtectedRoute`

**Verify:**
- Navigate to `/dashboard` without a session → redirected to `/login`
- Select "Alice (Admin)" from dropdown, click Log in → redirected to `/dashboard`
- Refresh `/dashboard` → still logged in (session in localStorage)
- Click Logout → redirected to `/login`, `localStorage` cleared

---

### Task 21 — App layout and navigation

**Depends on:** Task 20  
**Outcome:** A persistent nav bar appears on all authenticated pages showing the app name, current user, navigation links, and a working Logout button.

Steps:
1. Create `frontend/src/components/layout/AppLayout.jsx`:
   - Top nav bar with: "IncidentIQ" brand, links to Dashboard and Incidents, current username and role, "Logout" button
   - `<Outlet />` below the nav bar
2. Create shared UI components:
   - `frontend/src/components/shared/LoadingSpinner.jsx` — simple spinner
   - `frontend/src/components/shared/ErrorBanner.jsx` — dismissible error message
   - `frontend/src/components/shared/ConfirmDialog.jsx` — modal with Cancel / Confirm buttons
3. Create badge components:
   - `frontend/src/components/incidents/StatusBadge.jsx` — coloured chip for OPEN/IN_PROGRESS/RESOLVED
   - `frontend/src/components/incidents/PriorityBadge.jsx` — coloured chip for P1–P4
4. Wrap all protected routes in `AppLayout`.

**Verify:**
- All authenticated pages show the nav bar
- Nav links navigate correctly
- Logout button calls `AuthContext.logout()` and redirects to `/login`
- `StatusBadge` and `PriorityBadge` render correct colours for all values

---

## Phase 8 — Frontend Pages

### Task 22 — Dashboard page

**Depends on:** Task 21, Task 17  
**Outcome:** Dashboard displays six live stat cards populated from `GET /api/stats`. Stats change when incidents are created, updated, or deleted.

Steps:
1. Create `frontend/src/components/dashboard/StatCard.jsx` — accepts `{ label, value, highlight? }`.
2. Create `frontend/src/components/dashboard/DashboardStats.jsx` — renders six `StatCard` components from a stats object.
3. Create `frontend/src/pages/DashboardPage.jsx`:
   - On mount: `fetchStats()` → populate stat cards
   - Show `LoadingSpinner` while fetching
   - Show `ErrorBanner` if fetch fails
   - Stats cards: Total, Open, In Progress, Resolved, P1/Critical, SLA Breached
   - "SLA Breached" card highlighted in red when value > 0
   - "New Incident" button navigates to `/incidents/new`

**Verify:**
- Dashboard loads and shows correct counts (cross-check with `incidents.json`)
- Create a new P1 incident → navigate back to Dashboard → P1 count + 1, Total + 1
- Resolve an incident → Resolved + 1, Open or InProgress − 1

---

### Task 23 — Incident list page

**Depends on:** Task 21, Tasks 13, 19  
**Outcome:** All persisted incidents are displayed in a table. Search and filter controls work and can be combined.

Steps:
1. Create `frontend/src/components/incidents/SlaTimer.jsx`:
   - Accepts `{ slaDeadline, status, resolvedAt }`
   - Calls `getSlaStatus()` from `utils/sla.js` (to be created in Task 24)
   - Renders "Xh Ym remaining", "SLA breached: Xh Ym ago", or resolved SLA label
   - Red text when breached
2. Create `frontend/src/pages/IncidentListPage.jsx`:
   - On mount: `fetchIncidents()` and display in a table
   - Columns: ID, Title, Service, Priority, Severity, Status, Assigned, SLA, Created
   - Each row is clickable → navigate to `/incidents/:id`
   - Search box: on change → `fetchIncidents({ search })` and update table
   - "Clear" button resets search
   - Status filter dropdown (All / OPEN / IN_PROGRESS / RESOLVED)
   - Priority filter dropdown (All / P1 / P2 / P3 / P4)
   - Severity filter dropdown (All / Critical / High / Medium / Low)
   - All filters combine with AND logic
   - Empty result shows "No incidents found" message (not blank)
   - "New Incident" button → `/incidents/new`
3. Create `frontend/src/utils/sla.js` — exports `getSlaStatus(slaDeadline, status, resolvedAt)` matching the design spec.

**Verify:**
- List loads all incidents from the backend
- Search for a title word → only matching incidents shown
- Search for a non-existent term → "No incidents found"
- Filter status=OPEN → only OPEN incidents
- Filter priority=P1 → only P1 incidents
- Combined search + filter → both applied
- SLA column shows "Xh Ym remaining" for future deadlines and "SLA breached" for past ones
- Clicking a row navigates to `/incidents/:id`

---

### Task 24 — Create incident form

**Depends on:** Task 21, Task 12  
**Outcome:** The create form validates inputs, submits to the backend, and immediately shows the new incident. Triage results are displayed in the response.

Steps:
1. Create `frontend/src/components/incidents/IncidentForm.jsx`:
   - Fields: Title (text), Description (textarea), Service (text), Business Impact (textarea)
   - Client-side validation before submit (use `validateCreateIncident` from `frontend/src/utils/validators.js`)
   - Shows per-field inline error messages
   - Submit button disabled while request is in flight
   - On success: navigate to `/incidents/:newId`
   - On error: show `ErrorBanner` with server error message
2. Create `frontend/src/pages/CreateIncidentPage.jsx` — renders `<IncidentForm>` with a "Create Incident" heading.
3. Create `frontend/src/utils/validators.js` — client-side validation matching backend rules.

**Verify:**
- Submit with empty title → inline validation error, no API call
- Submit with title < 5 chars → validation error
- Submit valid form → `POST /api/incidents` called, redirected to detail page showing the new incident
- New incident has correct priority/severity derived from keywords in title/description
- Create a P1 incident (include "production outage" in description) → severity shows "Critical"

---

### Task 25 — Incident detail page

**Depends on:** Task 21, Tasks 14, 15, 16  
**Outcome:** The detail page shows all incident fields, supports inline editing, status transitions, engineer assignment, resolution notes, and deletion.

Steps:
1. Create `frontend/src/pages/IncidentDetailPage.jsx` that:
   - On mount: `fetchIncident(id)` and display all fields
   - Shows `StatusBadge`, `PriorityBadge`, `SlaTimer` prominently
   - Editable fields: Title, Description, Service, Business Impact — with Save button
   - **Assign Engineer** dropdown: shows `ENGINEERS` list plus "Unassigned"; updates via `PUT /api/incidents/:id`
   - **Change Status** controls:
     - If OPEN → "Start Work" button (transitions to IN_PROGRESS)
     - If IN_PROGRESS → "Resolve" button (opens resolution note input) and "Re-open" button
     - If RESOLVED → "Re-open" button
   - **Resolution Note** section: shown as a text area when resolving (required, ≥ 10 chars); persisted with status change
   - **Delete** button: shows `<ConfirmDialog>`, on confirm calls `DELETE /api/incidents/:id`, navigates to `/incidents`
   - All field updates show success feedback ("Saved") or `ErrorBanner` on failure
   - Page refreshes data after each mutation

**Verify:**
- Open an incident detail page — all fields displayed
- Edit title, click Save → title updated in backend, confirmed on refresh
- Assign engineer → assignment visible after page refresh
- Click "Start Work" → status changes to IN_PROGRESS
- Try to resolve without a note → inline error "Resolution note required"
- Resolve with a note → status = RESOLVED, resolvedAt set, note persisted
- Click Delete → confirmation dialog appears; confirm → incident deleted, redirected to list
- Click Delete → cancel → incident not deleted

---

## Phase 9 — Integration and Polish

### Task 26 — Full integration verification

**Depends on:** Tasks 22–25  
**Outcome:** The complete 20-step user flow from requirements works end-to-end without errors.

Steps:
1. Start both backend (`npm start`) and frontend (`npm run dev`).
2. Walk through each of the 20 core user flows from the requirements:
   1. Open application → login page
   2. Log in as Alice (Admin) → dashboard
   3. Create incident (P1 keywords) → triage runs automatically
   4. Verify priority=P1, severity=Critical, slaDeadline = 2h from now
   5. View incident list → new incident appears
   6. Open incident detail
   7. Edit title → save → verify
   8. Assign engineer → verify on refresh
   9. Move OPEN → IN_PROGRESS
   10. Add resolution note, move to RESOLVED
   11. Delete a different incident → confirm removal
   12. Dashboard stats updated
   13. Search by title → results filtered
   14. Filter by status=RESOLVED → resolved incidents only
   15. Verify SLA timer display
   16. Create a P1 incident and manually backdate `slaDeadline` in `incidents.json` → SLA Breached label appears
   17. Log out → login page
   18. Log in as Bob (Engineer) → same incidents visible
   19. Try OPEN → RESOLVED directly → 409 shown in UI
   20. Verify data persistence: restart backend, refresh frontend → all incidents still present
3. Fix any issues discovered during this walk-through.

**Verify:** All 20 flows pass without errors. No "undefined" values in the UI. No silent failures.

---

### Task 27 — Seed script

**Depends on:** Task 12  
**Outcome:** Running `node backend/scripts/seed.js` populates `incidents.json` with 8 representative demo incidents covering all priorities and statuses.

Steps:
1. Create `backend/scripts/seed.js` that:
   - Clears existing `incidents.json`
   - Creates 8 incidents via the storage adapter (not via HTTP):
     - 2 × P1 (one breached SLA, one not)
     - 2 × P2 (one IN_PROGRESS, one OPEN)
     - 2 × P3 (one RESOLVED with note, one OPEN)
     - 2 × P4 (one OPEN assigned, one OPEN unassigned)
   - Each incident uses real triage, real timestamps, and realistic field values
   - Prints "Seeded 8 incidents" on completion

**Verify:**
```bash
node backend/scripts/seed.js
# → Seeded 8 incidents
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.data.length)"
# → 8
```

---

## Phase 10 — Automated Tests

### Task 28 — Unit test suite

**Depends on:** Tasks 8, 9, 10, 11  
**Outcome:** Unit tests for all four pure-logic modules pass with `npm test` in the backend directory.

Steps:
1. Ensure test files exist (created alongside each module in Tasks 8–11):
   - `backend/test/triageEngine.test.js`
   - `backend/test/slaCalculator.test.js`
   - `backend/test/stateMachine.test.js`
   - `backend/test/validators.test.js`
2. Configure `backend/package.json` test script: `"test": "node --test"` (Node.js built-in test runner, no extra install).
3. Each test file uses `node:test` and `node:assert`. Example:
   ```js
   const { test } = require('node:test');
   const assert = require('node:assert/strict');
   const { triage } = require('../src/shared/triageEngine');

   test('P1 keyword in title → P1/Critical', () => {
     const result = triage('production outage', '', 'Database');
     assert.equal(result.priority, 'P1');
     assert.equal(result.severity, 'Critical');
   });
   ```
4. All tests must pass before task is marked complete.

**Verify:**
```bash
cd backend && npm test
# All tests: pass
# 0 failures
```

Minimum test counts:
- `triageEngine.test.js`: ≥ 9 tests
- `slaCalculator.test.js`: ≥ 6 tests
- `stateMachine.test.js`: ≥ 8 tests
- `validators.test.js`: ≥ 6 tests

---

### Task 29 — API integration test suite

**Depends on:** Tasks 12–17, Task 18, Task 28  
**Outcome:** Integration tests cover the happy path and key error paths for every endpoint. Tests run against the real Express server with a separate test data file.

Steps:
1. Install `supertest` as a dev dependency in `backend/`.
2. Create `backend/test/api.test.js` that:
   - Before all tests: sets `DATA_FILE` env var to a temp file and clears it
   - After all tests: deletes the temp file
   - Tests for each endpoint:

| Test case | Expected result |
|-----------|----------------|
| POST /api/login valid user | 200, returns user object |
| POST /api/login unknown user | 401 |
| GET /api/incidents no auth header | 401 |
| POST /api/incidents valid payload | 201, priority derived correctly |
| POST /api/incidents missing title | 400, field=title |
| POST /api/incidents title < 5 chars | 400 |
| GET /api/incidents | 200, array |
| GET /api/incidents?status=OPEN | only OPEN incidents |
| GET /api/incidents?search=<keyword> | matching incidents |
| GET /api/incidents/:id existing | 200, incident |
| GET /api/incidents/:id non-existent | 404 |
| PUT /api/incidents/:id update title | 200, title updated |
| PUT /api/incidents/:id OPEN→IN_PROGRESS | 200, status updated |
| PUT /api/incidents/:id OPEN→RESOLVED | 409 |
| PUT /api/incidents/:id resolve with note | 200, resolvedAt set |
| PUT /api/incidents/:id resolve without note | 400 |
| DELETE /api/incidents/:id | 200 |
| DELETE /api/incidents/:id non-existent | 404 |
| GET /api/stats | 200, correct counts |

3. Run with `npm test`.

**Verify:**
```bash
cd backend && npm test
# All unit tests + integration tests pass
# 0 failures
```

---

### Task 30 — Frontend SLA utility tests

**Depends on:** Task 23  
**Outcome:** The `getSlaStatus()` utility function is unit-tested in the frontend.

Steps:
1. Install `vitest` as a dev dependency in `frontend/`.
2. Add `"test": "vitest run"` to `frontend/package.json` scripts.
3. Create `frontend/src/utils/sla.test.js` with tests for:
   - Future deadline, OPEN → "Xh Ym remaining", `breached: false`
   - Past deadline, OPEN → "SLA breached: ...", `breached: true`
   - RESOLVED before deadline → "Resolved within SLA", `breached: false`
   - RESOLVED after deadline → "Resolved (SLA breached)", `breached: true`
   - Exactly at deadline (0 ms) → not breached (boundary)

**Verify:**
```bash
cd frontend && npm test
# All SLA utility tests pass
```

---

## Phase 11 — End-to-End Testing

### Task 31 — Manual end-to-end smoke test checklist

**Depends on:** Task 26  
**Outcome:** Every item in the manual smoke test checklist passes. This is the final gate before the hackathon demo.

Checklist — all items must be ticked:

**Authentication:**
- [ ] Login as Alice (Admin) → dashboard shown
- [ ] Login as Bob (Engineer) → dashboard shown
- [ ] Login as Dave (Support) → dashboard shown
- [ ] Visit `/dashboard` without session → redirected to `/login`
- [ ] Logout → session cleared, redirected to `/login`
- [ ] Login with unknown username → error shown

**Incident lifecycle:**
- [ ] Create incident with "production outage" in description → P1/Critical/2h SLA
- [ ] Create incident with no keywords → P4/Low/72h SLA
- [ ] Create incident — all fields visible in list and detail
- [ ] Edit title of OPEN incident → change persists after page refresh
- [ ] Assign "John Smith" to incident → visible after page refresh
- [ ] OPEN → IN_PROGRESS via "Start Work" → status updates
- [ ] Attempt OPEN → RESOLVED directly → error shown ("Cannot transition...")
- [ ] IN_PROGRESS → RESOLVED with resolution note → resolvedAt set, note persisted
- [ ] Attempt resolve without note → inline error shown
- [ ] Re-open RESOLVED incident → status returns to OPEN
- [ ] Delete incident → confirmation dialog appears; confirm → incident removed from list
- [ ] Delete incident → cancel → incident still present

**Dashboard:**
- [ ] Create incident → Total + 1
- [ ] Resolve incident → Resolved + 1, Open or InProgress − 1
- [ ] Stats never show hard-coded values (verify by deleting all incidents → all stats = 0)

**Search and filter:**
- [ ] Search by partial title → filtered results
- [ ] Search by incident ID → matching incident
- [ ] Search by service name → filtered results
- [ ] Clear search → full list restored
- [ ] Filter by status=OPEN → only OPEN
- [ ] Filter by priority=P1 → only P1
- [ ] Combine search + filter → both applied simultaneously
- [ ] No results → "No incidents found" message (not blank)

**SLA:**
- [ ] SLA timer shows "Xh Ym remaining" for a fresh P1 incident
- [ ] Manually backdate `slaDeadline` in `incidents.json` for an OPEN incident → "SLA breached" label and red highlight
- [ ] Dashboard "SLA Breached" count reflects the breached incident
- [ ] Resolved incident retains historical SLA information

**Persistence:**
- [ ] Restart backend process → all incidents still present
- [ ] Refresh browser → all incidents still present
- [ ] Logout and login as different user → incidents still present

---

## Phase 12 — Documentation

### Task 32 — README

**Depends on:** Task 26  
**Outcome:** `README.md` at the project root contains everything a new person needs to run the application in under 5 minutes.

Steps:
1. Create `incidentiq/README.md` with the following sections:
   - **Project overview** — what IncidentIQ does (3–4 sentences)
   - **Architecture** — brief diagram (local mode only)
   - **Prerequisites** — Node.js 18+, npm; nothing else
   - **Quick start** — step-by-step commands to run locally:
     ```bash
     git clone ...
     npm install
     npm run dev
     # Open http://localhost:5173
     ```
   - **Demo users** — table of username → role → display name
   - **Seeding demo data** (optional) — `node backend/scripts/seed.js`
   - **Running tests** — `cd backend && npm test` and `cd frontend && npm test`
   - **Triage rules** — table of keywords → priority → severity → SLA
   - **API reference** — table of endpoints, methods, auth, description
   - **AWS deployment** — brief reference to the steps in `design.md §16`
   - **Kiro specification artifacts** — note that `.kiro/specs/incidentiq/` contains `requirements.md`, `design.md`, `tasks.md`

**Verify:**
- A developer who has never seen the project can follow the README and reach a working login page without asking any questions.
- `npm run dev` from the root directory works as described.

---

## Task Summary and Dependencies

```
Phase 1 — Setup
  Task 1   Project directory structure
  Task 2   Backend package (depends: 1)
  Task 3   Frontend package (depends: 1)

Phase 2 — Backend Core
  Task 4   Shared constants (depends: 2)
  Task 5   JSON storage adapter (depends: 2, 4)
  Task 6   Auth handler + middleware (depends: 2, 4)

Phase 3 — DynamoDB (optional, deferrable)
  Task 7   DynamoDB adapter (depends: 2, 4)

Phase 4 — Business Logic
  Task 8   Triage engine (depends: 4)
  Task 9   SLA calculator (depends: 4)
  Task 10  State machine (depends: 4)
  Task 11  Input validators (depends: 4)

Phase 5 — Incident Handlers and Routes
  Task 12  POST /api/incidents (depends: 5, 6, 8, 9, 11)
  Task 13  GET  /api/incidents (depends: 5, 6, 12)
  Task 14  GET  /api/incidents/:id (depends: 5, 6)
  Task 15  PUT  /api/incidents/:id (depends: 5, 6, 10, 11)
  Task 16  DELETE /api/incidents/:id (depends: 5, 6)
  Task 17  GET  /api/stats (depends: 5, 6)

Phase 6 — Error Handling
  Task 18  Central error handler (depends: 6, 12–17)

Phase 7 — Frontend Core
  Task 19  API client + constants (depends: 3)
  Task 20  Auth context + login page (depends: 19)
  Task 21  App layout + nav (depends: 20)

Phase 8 — Frontend Pages
  Task 22  Dashboard page (depends: 21, 17)
  Task 23  Incident list page (depends: 21, 13, 19)
  Task 24  Create incident form (depends: 21, 12)
  Task 25  Incident detail page (depends: 21, 14, 15, 16)

Phase 9 — Integration
  Task 26  Full integration verification (depends: 22–25)
  Task 27  Seed script (depends: 12)

Phase 10 — Automated Tests
  Task 28  Unit test suite (depends: 8, 9, 10, 11)
  Task 29  API integration tests (depends: 12–17, 18, 28)
  Task 30  Frontend SLA utility tests (depends: 23)

Phase 11 — End-to-End
  Task 31  Manual smoke test checklist (depends: 26)

Phase 12 — Documentation
  Task 32  README (depends: 26)
```

---

## One-Day Time Budget (guidance)

| Block | Tasks | Target time |
|-------|-------|-------------|
| Project setup | 1–3 | 30 min |
| Backend constants + storage + auth | 4–6 | 45 min |
| Business logic modules | 8–11 | 60 min |
| Incident CRUD routes + stats | 12–18 | 60 min |
| Frontend core (client, auth, layout) | 19–21 | 45 min |
| Frontend pages (dashboard, list, create, detail) | 22–25 | 120 min |
| Integration + seed + fixes | 26–27 | 45 min |
| Tests | 28–30 | 45 min |
| End-to-end smoke test | 31 | 30 min |
| README + DynamoDB adapter (optional) | 32, 7 | 30 min |
| **Total** | | **~8.5 hours** |

**Critical path** (minimum to have a working demo): Tasks 1–6, 8–18, 19–26 (~7 hours).  
**Task 7** (DynamoDB) and **Tasks 28–32** can be deferred if time is short.
