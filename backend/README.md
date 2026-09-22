# IncidentIQ — Backend

IT incident triage and SLA management. Hackathon MVP backend.

Triage is **deterministic and rule-based** — ordered keyword matching over a
fixed list. No machine-learning model, no LLM, and no external AI service is
involved anywhere in this codebase.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Quick Start — Local Mode](#quick-start--local-mode)
4. [Environment Variables](#environment-variables)
5. [Demo Users](#demo-users)
6. [Triage Rules](#triage-rules)
7. [SLA Mappings](#sla-mappings)
8. [Status Transitions](#status-transitions)
9. [API Reference](#api-reference)
10. [Frontend Integration Contract](#frontend-integration-contract)
11. [Running Tests](#running-tests)
12. [AWS Deployment](#aws-deployment)
13. [Project Structure](#project-structure)

---

## Architecture

```
Frontend (React + Vite)
        │  HTTP  /api/*
        ▼
┌──────────────────────────────────────────┐
│  LOCAL MODE                              │
│  Express.js  (port 3001)                 │
│  └── DynamoDB Local  (port 8000)         │
│      (JSON-file fallback available via   │
│       STORAGE_MODE=local)                │
└──────────────────────────────────────────┘

        OR

┌──────────────────────────────────────────┐
│  AWS MODE                                │
│  API Gateway (HTTP API)                  │
│  └── Lambda  (Node.js 20.x)              │
│      └── DynamoDB  (single-table)        │
└──────────────────────────────────────────┘
```

Business logic (triage, SLA, state machine, validation) is shared between both
modes — the same code runs locally and on Lambda.

---

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- A Java runtime (11+) for DynamoDB Local
- No Docker and no AWS account needed for local mode

The JSON-file fallback (`STORAGE_MODE=local`) needs neither Java nor DynamoDB.

---

## Quick Start — Local Mode

Local development runs against **DynamoDB Local**, so the same storage adapter
and wire protocol are used as on AWS. See the root `README.md` for how to fetch
the DynamoDB Local runtime into `tools/dynamodb-local/`.

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Copy the environment template, then set:
#      STORAGE_MODE=dynamodb
#      DYNAMODB_ENDPOINT=http://localhost:8000
#      DYNAMODB_TABLE=incidentiq-incidents
cp .env.example .env

# 3. Start DynamoDB Local (separate terminal) and create the table once
npm run db:start
npm run db:create-table
# → [IncidentIQ] Created table 'incidentiq-incidents' at http://localhost:8000.

# 4. Start the server
npm start
# → [IncidentIQ] Backend running on http://localhost:3001
# → [IncidentIQ] Storage mode: dynamodb

# 5. Verify
curl http://localhost:3001/health
# → {"success":true,"data":{"status":"healthy"}}
```

From the repository root, `npm run dev` performs steps 3–4 for the backend and
starts the frontend too.

Incidents persist in DynamoDB Local's on-disk database (`data/*.db`) and survive
restarts of both the database and the API.

**JSON-file fallback.** Setting `STORAGE_MODE=local` switches the repository to
`data/incidents.json` instead. It needs no Java and no DynamoDB, and is useful
for quick experiments, but DynamoDB is the storage this project targets.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express listen port |
| `STORAGE_MODE` | `local` | `dynamodb` or `local` (JSON file) |
| `DYNAMODB_TABLE` | — | Table name; required when `STORAGE_MODE=dynamodb` |
| `DYNAMODB_ENDPOINT` | *(unset)* | DynamoDB Local URL, e.g. `http://localhost:8000`. **Leave unset on AWS** so the SDK resolves the real regional endpoint. |
| `AWS_REGION` | `us-east-1` | AWS region (DynamoDB mode only) |
| `DATA_FILE` | `./data/incidents.json` | JSON storage path (local mode only) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `local` | Placeholders the SDK needs in order to sign requests to DynamoDB Local. Applied **only when `DYNAMODB_ENDPOINT` is set**; on AWS the default credential chain is used untouched. |

**Never commit AWS credentials.** `.env` is git-ignored; supply real credentials
via `~/.aws/credentials` or an IAM role.

---

## Demo Users

| Username | Role | Display Name |
|----------|------|--------------|
| `alice` | Admin | Alice (Admin) |
| `bob` | Engineer | Bob (Engineer) |
| `carol` | Engineer | Carol (Engineer) |
| `dave` | Support | Dave (Support) |
| `eve` | Support | Eve (Support) |

All protected API routes require the `x-demo-user` header set to one of these usernames.

---

## Triage Rules

Rules are evaluated in priority order — the **first matching rule wins**.
Matching is case-insensitive and searches `title`, `description` **and**
`businessImpact` concatenated together.

| Priority | Severity | SLA | Trigger keywords |
|----------|----------|-----|-----------------|
| P1 | Critical | 2 h | `production outage`, `database unavailable`, `all users affected`, `complete failure`, `complete service outage`, `total outage`, `system down`, `site down` |
| P2 | High | 8 h | `payment failure`, `authentication failure`, `multiple users affected`, `multiple users`, `data loss`, `security breach`, `major functionality`, `major business`, `login failure`, `sign in failure` |
| P3 | Medium | 24 h | `latency`, `slow performance`, `slow response`, `slow`, `intermittent`, `performance issue`, `timeout`, `degraded`, `high response time`, `partial outage` |
| P4 | Low | 72 h | *(default — no keywords matched)* |

Category is derived from the `service` field, matched **in this order** (first
substring hit wins):

| Service contains | Category |
|-----------------|----------|
| `payment gateway`, `payment` | Payment |
| `authentication`, `auth` | Authentication |
| `database`, `db` | Database |
| `backend api` | Backend API |
| `backend` | Backend |
| `api` | API |
| `frontend` | Frontend |
| `network` | Network |
| `storage` | Storage |
| `email` | Email |
| `notification` | Notifications |
| `search` | Search |
| *(anything else)* | General |

Because `api` is tested before `frontend`, a service named "Frontend API" is
categorised as `API`.

---

## SLA Mappings

| Priority | Duration | `slaDeadline` |
|----------|----------|---------------|
| P1 | 2 hours | `createdAt + 2h` |
| P2 | 8 hours | `createdAt + 8h` |
| P3 | 24 hours | `createdAt + 24h` |
| P4 | 72 hours | `createdAt + 72h` |

`slaDeadline` is set at creation and never changes. The frontend calculates
remaining time from `slaDeadline − now`. An incident is SLA-breached when
`now > slaDeadline AND status ≠ RESOLVED`.

---

## Status Transitions

```
         ┌────────────────────────┐
         ▼                        │
       OPEN ──────────► IN_PROGRESS ──────────► RESOLVED
         ▲                        │                  │
         │                        └──────────────────┘
         │                                           │
         └───────────────────────────────────────────┘
```

| From | To | Rule |
|------|----|------|
| `OPEN` | `IN_PROGRESS` | ✓ allowed |
| `IN_PROGRESS` | `RESOLVED` | ✓ requires `resolutionNote` ≥ 10 chars |
| `IN_PROGRESS` | `OPEN` | ✓ allowed (pause / reassign) |
| `RESOLVED` | `OPEN` | ✓ allowed (reopen) |
| `OPEN` | `RESOLVED` | ✗ rejected — 409 |
| `RESOLVED` | `IN_PROGRESS` | ✗ rejected — 409 |
| *any* | *itself* | ✗ rejected — 409 (`"Incident is already X."`) |

---

## API Reference

### Base URL

- **Local:** `http://localhost:3001`
- **AWS:** `https://<api-id>.execute-api.<region>.amazonaws.com`

### Authentication

All routes except `/health`, `POST /api/login`, and `POST /api/logout` require:

```
x-demo-user: alice       (or any valid demo username)
Content-Type: application/json
```

---

### GET /health

Check that the backend is running.

**Auth required:** No

**Response 200:**
```json
{
  "success": true,
  "data": { "status": "healthy" }
}
```

---

### POST /api/login

Authenticate a demo user.

**Auth required:** No

**Request body:**
```json
{ "username": "alice" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "username": "alice",
    "role": "Admin",
    "displayName": "Alice (Admin)"
  },
  "message": "Welcome, Alice (Admin)!"
}
```

**Response 401** — unknown username:
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Unknown demo user: 'nobody'." }
}
```

---

### POST /api/logout

**Auth required:** No  
Stateless — session lives in the client. Returns 200.

---

### POST /api/incidents

Create a new incident. Triage and SLA deadline are calculated automatically.

**Auth required:** Yes

**Request body:**
```json
{
  "title":          "Production outage in payment service",
  "description":    "All users affected — complete failure of the gateway.",
  "service":        "Payment Gateway",
  "businessImpact": "Total revenue loss, all payments failing."
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `title` | ✓ | 5–200 chars |
| `description` | ✓ | 10–2000 chars |
| `service` | ✓ | non-empty |
| `businessImpact` | ✓ | 5–500 chars |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id":               "INC-1727001234567-A3F2",
    "title":            "Production outage in payment service",
    "description":      "...",
    "service":          "Payment Gateway",
    "businessImpact":   "...",
    "category":         "Payment",
    "severity":         "Critical",
    "priority":         "P1",
    "status":           "OPEN",
    "assignedEngineer": null,
    "resolutionNote":   null,
    "resolvedAt":       null,
    "createdBy":        "alice",
    "createdAt":        "2026-09-22T10:30:00.000Z",
    "updatedAt":        "2026-09-22T10:30:00.000Z",
    "slaDuration":      2,
    "slaDeadline":      "2026-09-22T12:30:00.000Z"
  },
  "message": "Incident created successfully."
}
```

**Response 400** — validation error:
```json
{
  "success": false,
  "error": {
    "code":    "VALIDATION_ERROR",
    "field":   "title",
    "message": "title must be at least 5 characters."
  }
}
```

---

### GET /api/incidents

Return all incidents, newest first. Supports search and filter.

**Auth required:** Yes

**Query parameters (all optional, combinable):**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `search` | string | Case-insensitive match against `id`, `title`, `description`, `service` |
| `status` | `OPEN` \| `IN_PROGRESS` \| `RESOLVED` | Filter by exact status |
| `priority` | `P1` \| `P2` \| `P3` \| `P4` | Filter by priority |
| `severity` | `Critical` \| `High` \| `Medium` \| `Low` | Filter by severity |

**Response 200:**
```json
{
  "success": true,
  "data":  [ { ...incident }, ... ],
  "count": 12
}
```

Empty dataset returns `"data": [], "count": 0`.

---

### GET /api/incidents/:id

Return a single incident.

**Auth required:** Yes

**Response 200:** `{ "success": true, "data": { ...incident } }`

**Response 404:**
```json
{
  "success": false,
  "error": { "code": "INCIDENT_NOT_FOUND", "message": "Incident 'INC-...' was not found." }
}
```

---

### PUT /api/incidents/:id

Update permitted fields. All fields are optional — only provided fields are changed.

**Auth required:** Yes

**Updatable fields:**

| Field | Rules |
|-------|-------|
| `title` | 5–200 chars |
| `description` | 10–2000 chars |
| `service` | non-empty |
| `businessImpact` | 5–500 chars |
| `assignedEngineer` | one of the five known engineers, or `null` |
| `status` | must follow allowed transition rules |
| `resolutionNote` | 10–2000 chars; required when `status` = `RESOLVED` |

**Immutable fields** (ignored if sent): `id`, `createdAt`, `createdBy`, `priority`, `severity`, `category`, `slaDeadline`, `slaDuration`.

**Example — assign engineer:**
```json
{ "assignedEngineer": "John Smith" }
```

**Example — start work:**
```json
{ "status": "IN_PROGRESS" }
```

**Example — resolve:**
```json
{
  "status":         "RESOLVED",
  "resolutionNote": "Identified and fixed misconfigured SSL certificate."
}
```

**Response 200:** `{ "success": true, "data": { ...updatedIncident } }`

**Response 409** — invalid transition:
```json
{
  "success": false,
  "error": {
    "code":    "INVALID_STATUS_TRANSITION",
    "message": "Cannot transition from OPEN to RESOLVED. Allowed: IN_PROGRESS."
  }
}
```

---

### DELETE /api/incidents/:id

Permanently delete an incident.

**Auth required:** Yes

**Response 200:**
```json
{
  "success": true,
  "data":    { "id": "INC-...", "deleted": true },
  "message": "Incident deleted successfully."
}
```

**Response 404** — incident does not exist.

---

### GET /api/stats

Return dashboard statistics computed from live persisted data.

**Auth required:** Yes

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total":       24,
    "open":        10,
    "inProgress":   8,
    "resolved":     6,
    "p1Critical":   3,
    "slaBreached":  2
  }
}
```

`slaBreached` counts incidents where `status ≠ RESOLVED` and `now > slaDeadline`.

---

## Frontend Integration Contract

### Base URL

```
# Local development (Vite proxy handles /api → localhost:3001)
VITE_API_BASE_URL=              # leave empty

# AWS deployment
VITE_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com
```

### Request headers (every protected call)

```http
Content-Type:  application/json
x-demo-user:   <username>        (read from localStorage session)
```

### Session storage (localStorage key: `session`)

```json
{ "username": "alice", "role": "Admin", "displayName": "Alice (Admin)" }
```

The frontend reads `session.username` and sends it as `x-demo-user`.  
The backend validates it against `DEMO_USERS` on every request.

### Response envelope

**Success:**
```json
{
  "success": true,
  "data":    <object | array>,
  "count":   <number — present when data is an array>,
  "message": <string — optional confirmation text>
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code":    "<machine-readable code>",
    "message": "<human-readable message>",
    "field":   "<field name — present on VALIDATION_ERROR>"
  }
}
```

### Error codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Missing or invalid field |
| `UNAUTHORIZED` | 401 | Missing or unknown `x-demo-user` header |
| `INCIDENT_NOT_FOUND` | 404 | No incident with the given ID |
| `INVALID_STATUS_TRANSITION` | 409 | Transition not allowed by state machine |
| `DATABASE_ERROR` | 500 | Storage read/write failure |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### CORS

The local Express server reflects the request `Origin` (suitable for `localhost:5173`).  
The Lambda/API Gateway deployment has CORS headers on every response:

```
Access-Control-Allow-Origin:  *
Access-Control-Allow-Headers: Content-Type, x-demo-user
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

### Available engineers (for assignment dropdown)

```javascript
["John Smith", "Maria Garcia", "David Chen", "Sarah Johnson", "Michael Brown"]
```

The frontend must only send values from this list (or `null` to unassign).

### Complete incident object shape

```typescript
{
  id:               string;   // "INC-<timestamp>-<suffix>"
  title:            string;
  description:      string;
  service:          string;
  businessImpact:   string;
  category:         string;   // derived from service
  severity:         "Critical" | "High" | "Medium" | "Low";
  priority:         "P1" | "P2" | "P3" | "P4";
  status:           "OPEN" | "IN_PROGRESS" | "RESOLVED";
  assignedEngineer: string | null;
  resolutionNote:   string | null;
  resolvedAt:       string | null;   // ISO 8601 UTC
  createdBy:        string;
  createdAt:        string;          // ISO 8601 UTC — immutable
  updatedAt:        string;          // ISO 8601 UTC
  slaDuration:      number;          // hours
  slaDeadline:      string;          // ISO 8601 UTC — immutable
}
```

---

## Running Tests

```bash
cd backend

# Full suite (unit + integration)
npm test

# Unit tests only (no server, no database needed)
node --test tests/triageRules.test.js tests/slaRules.test.js \
             tests/statusRules.test.js tests/incidentValidator.test.js \
             tests/lambdaHandler.test.js

# Integration tests only
node --test tests/api.test.js
```

**Test coverage:**

| Suite | Tests | What is covered |
|-------|-------|-----------------|
| `triageRules.test.js` | 27 | All P1–P4 keywords, case-insensitive match, first-match order, `businessImpact` scanning, all triage examples A–D, service→category |
| `slaRules.test.js` | 16 | All four SLA durations, deadline arithmetic, breach detection, remaining time |
| `statusRules.test.js` | 15 | All allowed/forbidden transitions, `applyTransition` patch, resolution note validation |
| `incidentValidator.test.js` | 19 | Required fields, length limits, engineer list, status enum, update partials |
| `api.test.js` | 42 | Full HTTP lifecycle: health, login, CRUD, triage A–D, SLA P1–P4, transitions, stats, persistence |
| `lambdaHandler.test.js` | 20 | Lambda router under both API Gateway payload formats (1.0 and 2.0), auth, CORS, 404 routing |
| **Total** | **139** | |

---

## AWS Deployment

### Prerequisites

- AWS CLI configured (`aws configure`)
- Serverless Framework: `npm install -g serverless`
- AWS account with permission to create Lambda, API Gateway, DynamoDB

### Steps

```bash
cd backend

# 1. Deploy to AWS (creates Lambda + API Gateway + DynamoDB table)
npx serverless deploy --stage prod --region us-east-1

# 2. Note the API URL from deploy output, e.g.:
#    endpoints: ANY - https://abc123.execute-api.us-east-1.amazonaws.com/{proxy+}

# 3. Verify health endpoint
curl https://abc123.execute-api.us-east-1.amazonaws.com/health

# 4. Run a smoke-test incident lifecycle
APIURL=https://abc123.execute-api.us-east-1.amazonaws.com

# Create
curl -X POST $APIURL/api/incidents \
  -H "Content-Type: application/json" \
  -H "x-demo-user: alice" \
  -d '{"title":"Production outage in DB","description":"All users affected complete failure","service":"Database","businessImpact":"Revenue loss."}'

# List
curl -H "x-demo-user: alice" $APIURL/api/incidents

# Remove stack when done
npx serverless remove --stage prod
```

### DynamoDB table

| Attribute | Type | Role |
|-----------|------|------|
| `PK` | String | Partition key — always `"INCIDENT"` |
| `SK` | String | Sort key — the incident `id` |

All other incident fields are stored as top-level DynamoDB attributes.
Billing mode is on-demand (PAY_PER_REQUEST) — no capacity planning required.

### IAM permissions required

The Lambda execution role needs:
`dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem`, `dynamodb:Query`

These are defined in `serverless.yml` and created automatically by the framework.

---

## Project Structure

```
backend/
├── src/
│   ├── handlers/
│   │   └── incidentHandler.js   ← HTTP adapter (Express + Lambda shared)
│   ├── services/
│   │   └── incidentService.js   ← Business orchestration (CRUD, stats)
│   ├── repositories/
│   │   └── incidentRepository.js← Storage factory (local JSON | DynamoDB)
│   ├── rules/
│   │   ├── triageRules.js       ← Deterministic priority/severity/category
│   │   ├── slaRules.js          ← SLA duration + deadline calculation
│   │   └── statusRules.js       ← State machine + transition enforcement
│   ├── validators/
│   │   └── incidentValidator.js ← Input validation (create + update)
│   ├── models/
│   │   └── incident.js          ← Constants: statuses, priorities, users, engineers
│   ├── utils/
│   │   ├── errors.js            ← AppError hierarchy
│   │   └── response.js          ← Express + Lambda response helpers
│   ├── local/
│   │   └── server.js            ← Express app (local development)
│   └── lambda/
│       └── handler.js           ← Lambda entry point
├── tests/
│   ├── triageRules.test.js
│   ├── slaRules.test.js
│   ├── statusRules.test.js
│   ├── incidentValidator.test.js
│   ├── lambdaHandler.test.js    ← Lambda router, both API Gateway payload formats
│   └── api.test.js              ← Integration tests (real HTTP, temp file)
├── scripts/
│   └── createTable.js           ← Idempotent DynamoDB table creation
├── data/
│   ├── shared-local-instance.db ← DynamoDB Local database (git-ignored)
│   └── incidents.json           ← JSON fallback storage (git-ignored)
├── .env.example
├── .gitignore
├── package.json
├── serverless.yml               ← AWS Lambda + API Gateway + DynamoDB IaC
└── README.md
```
