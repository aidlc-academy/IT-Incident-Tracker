# IncidentIQ

**IT incident triage and SLA management.** A full-stack incident tracker that
classifies every reported incident against deterministic rules, assigns it an
SLA deadline, and drives it through a validated lifecycle to resolution.

Built specification-first with Kiro. The specs in
[`.kiro/specs/incidentiq/`](.kiro/specs/incidentiq/) are the source of record
for what this system does and why.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution](#solution)
3. [Key Features](#key-features)
4. [User Workflow](#user-workflow)
5. [Architecture](#architecture)
6. [Frontend Technology](#frontend-technology)
7. [Backend Technology](#backend-technology)
8. [AWS Services](#aws-services)
9. [DynamoDB Data Model](#dynamodb-data-model)
10. [API Endpoints](#api-endpoints)
11. [Triage Rules](#triage-rules)
12. [SLA Rules](#sla-rules)
13. [Incident Lifecycle](#incident-lifecycle)
14. [Authentication and Demo Users](#authentication-and-demo-users)
15. [Search and Filtering](#search-and-filtering)
16. [Engineer Assignment](#engineer-assignment)
17. [Resolution Workflow](#resolution-workflow)
18. [Project Structure](#project-structure)
19. [Local Setup](#local-setup)
20. [Environment Variables](#environment-variables)
21. [Running the Backend](#running-the-backend)
22. [Running the Frontend](#running-the-frontend)
23. [AWS Deployment](#aws-deployment)
24. [Testing](#testing)
25. [Known Limitations](#known-limitations)
26. [Future Improvements](#future-improvements)
27. [Kiro Specification-Driven Workflow](#kiro-specification-driven-workflow)

---

## Problem Statement

When an IT incident is reported, the expensive part is rarely the fix — it is
the minutes lost deciding how much the incident matters. A payment outage and a
misaligned button arrive through the same channel, in the same free-text form,
and someone has to read both and decide which one interrupts an engineer's
evening.

That triage step is usually done by hand, which makes it slow, inconsistent
between people, and invisible after the fact. Two engineers grade the same
report differently. Response-time commitments are tracked in a spreadsheet, or
not at all, so a breach is often noticed only when a customer complains. There
is no single view of what is open, how urgent it is, or how close each item sits
to its deadline.

## Solution

IncidentIQ removes the judgement call from triage. Every incident submitted
through the API is classified by the same rule set, in the same order, on the
server:

- **Priority and severity** are derived from keywords in the title,
  description and business impact (P1–P4 → Critical/High/Medium/Low).
- **Category** is derived from the affected service.
- **An SLA deadline** is computed from the priority and stored on the record at
  creation time, so the commitment is fixed and auditable.

From there the incident moves through an enforced lifecycle — OPEN →
IN_PROGRESS → RESOLVED — where invalid transitions are rejected by the backend
rather than merely hidden in the interface. A dashboard reports live counts,
including SLA breaches, computed from stored data on every request.

> **Triage is deterministic and rule-based.** It uses ordered string matching
> over a fixed keyword list. There is no machine-learning model, no LLM, and no
> external AI service anywhere in this system. The same input always produces
> the same classification, and the rules are readable in about forty lines of
> [`triageRules.js`](backend/src/rules/triageRules.js).

## Key Features

| Feature | What it does |
|---|---|
| Automatic triage | Backend assigns priority, severity and category on create |
| SLA tracking | Deadline stored at creation; remaining time and breach state shown throughout |
| Enforced lifecycle | State machine rejects invalid transitions with HTTP 409 |
| Full CRUD | Create, read, update and delete, all persisted to DynamoDB |
| Live dashboard | Six counters plus per-engineer open workload, all computed from stored data |
| Search and filter | Server-side search across ID/title/description/service, combinable with status, priority and severity filters |
| Engineer assignment | Assign, reassign or unassign from a fixed roster |
| Resolution workflow | Requires a resolution note of at least 10 characters; records `resolvedAt` |
| Two-layer validation | Immediate feedback in the form; the backend is the authority |
| Error handling | Loading, empty and error states throughout; failures are reported, never disguised as success |

## User Workflow

```
Login  →  Dashboard  →  Create incident  →  Automatic triage + SLA assigned
                                                        │
                              ┌─────────────────────────┘
                              ▼
   Incident details  →  Assign engineer  →  Start work (IN_PROGRESS)
                              │
                              ▼
   Resolve with a resolution note  →  Dashboard counters update  →  Delete
```

Search, filtering and editing are available from the incident list and detail
pages at any point in that flow.

## Architecture

The same business logic runs in both deployment modes. Only the HTTP adapter
and the storage endpoint differ.

**Local mode** — what `npm run dev` starts, and what every test in this
repository runs against:

```
React / Vite  (port 5173)
     │  fetch /api/*  → Vite dev-server proxy
     ▼
Express.js  (port 3001)
     │
     ▼
Business logic   triage · SLA · state machine · validation
     │
     ▼
DynamoDB Local  (port 8000, on-disk)
```

**AWS mode** — defined in [`backend/serverless.yml`](backend/serverless.yml):

```
React / Vite  (static build)
     │
     ▼
API Gateway  (HTTP API)
     │
     ▼
AWS Lambda  (Node.js 20.x, single router function)
     │
     ▼
Business logic   triage · SLA · state machine · validation
     │
     ▼
DynamoDB
```

The `rules/`, `services/`, `validators/` and `repositories/` modules are shared
verbatim. `src/local/server.js` adapts them to Express; `src/lambda/handler.js`
adapts them to API Gateway. Storage is selected at startup by `STORAGE_MODE`,
so neither adapter knows whether it is talking to DynamoDB or a JSON file.

## Frontend Technology

| Concern | Choice |
|---|---|
| Framework | React 18 |
| Build tool | Vite 5 |
| Routing | React Router 6 |
| HTTP | native `fetch`, wrapped in `src/api/client.js` |
| State | React Context (`AuthContext`, `ToastContext`) + local component state |
| Styling | Plain CSS, one stylesheet, no framework |
| Tests | Vitest |

No UI component library, no state-management library, no AWS SDK. Production
bundle is ~198 KB (~62 KB gzipped).

## Backend Technology

| Concern | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Local HTTP | Express 4 |
| Cloud HTTP | AWS Lambda + API Gateway HTTP API |
| Storage | DynamoDB via AWS SDK v3 (`@aws-sdk/lib-dynamodb`) |
| IaC | Serverless Framework v3 |
| Tests | Node's built-in `node:test` |

Layered, with one responsibility per layer:

```
handlers/      HTTP adapter — reads the request, calls the service, sends the response
services/      Orchestration — validation, triage, SLA, transitions, timestamps
rules/         Pure functions — triage, SLA, state machine (no I/O)
validators/    Input validation
repositories/  Storage adapter — DynamoDB or JSON file, same interface
models/        Constants: statuses, priorities, SLA hours, demo users, engineers
utils/         Error hierarchy and response envelopes
```

## AWS Services

Three services, declared in `serverless.yml`:

| Service | Role |
|---|---|
| **DynamoDB** | Stores every incident. On-demand billing (`PAY_PER_REQUEST`), `DeletionPolicy: Retain`. |
| **AWS Lambda** | One Node.js 20.x function routing all API paths. 256 MB, 10s timeout. |
| **API Gateway** | HTTP API fronting the Lambda, with CORS configured. |

CloudWatch Logs are created by Lambda with 7-day retention. IAM permissions are
scoped to `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query` and `Scan`
on the single table.

> **Deployment status:** the stack is fully defined and the Lambda router is
> unit-tested against both API Gateway payload formats, but **it has not been
> deployed to a live AWS account**. Local development uses DynamoDB Local,
> which speaks the real DynamoDB wire protocol. Treat the AWS path as
> ready-to-deploy, not as verified-in-production.

## DynamoDB Data Model

Single table, single partition. The dataset is small enough that one `Query`
returns everything and filtering happens in application code.

**Table:** `incidentiq-incidents` (local) / `incidentiq-incidents-${stage}` (AWS)

| Key | Type | Value |
|---|---|---|
| `PK` | String (HASH) | Always the literal `"INCIDENT"` |
| `SK` | String (RANGE) | The incident id, e.g. `INC-1790086231664-4B0B` |

All other fields are stored as top-level attributes. `PK`/`SK` are stripped
before an item is returned to a client.

```json
{
  "id":               "INC-1790086231664-4B0B",
  "title":            "Production outage in payment gateway",
  "description":      "Complete failure of checkout, all users affected.",
  "service":          "Payment Gateway",
  "businessImpact":   "All card revenue halted.",
  "category":         "Payment",
  "severity":         "Critical",
  "priority":         "P1",
  "status":           "OPEN",
  "assignedEngineer": null,
  "resolutionNote":   null,
  "resolvedAt":       null,
  "createdBy":        "alice",
  "createdAt":        "2026-09-22T14:10:31.664Z",
  "updatedAt":        "2026-09-22T14:10:31.664Z",
  "slaDuration":      2,
  "slaDeadline":      "2026-09-22T16:10:31.664Z"
}
```

**Access patterns**

| Operation | Call |
|---|---|
| List all | `Query(PK = "INCIDENT")`, then filter and sort in code |
| Get one | `GetItem(PK = "INCIDENT", SK = id)` |
| Create / update | `PutItem` (full-item replace) |
| Delete | `GetItem` to confirm existence, then `DeleteItem` |
| Dashboard stats | `Query(PK = "INCIDENT")`, then count in code |

**Identifiers** are `INC-<epoch-ms>-<4 hex chars>`, e.g.
`INC-1790086231664-4B0B` — sortable, readable, and collision-resistant under
concurrent creation.

**Immutable after creation:** `id`, `createdAt`, `createdBy`, `priority`,
`severity`, `category`, `slaDeadline`, `slaDuration`. The service silently
ignores attempts to change them, which is covered by tests.

## API Endpoints

Base URL: `http://localhost:3001` locally. Every incident route is prefixed
`/api`. All responses are JSON.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Liveness check |
| POST | `/api/login` | No | Validate a demo user |
| POST | `/api/logout` | No | Stateless acknowledgement |
| GET | `/api/incidents` | Yes | List, with optional search and filters |
| POST | `/api/incidents` | Yes | Create (triage + SLA applied server-side) |
| GET | `/api/incidents/{id}` | Yes | Fetch one |
| PUT | `/api/incidents/{id}` | Yes | Update permitted fields |
| DELETE | `/api/incidents/{id}` | Yes | Delete permanently |
| GET | `/api/stats` | Yes | Dashboard counters |

Authenticated routes require an `x-demo-user` header naming a known demo user.

### Response envelope

Success:

```json
{ "success": true, "data": { }, "count": 12, "message": "optional" }
```

`count` appears only when `data` is an array. `message` appears only on
mutations.

Failure:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "field": "title" } }
```

`field` appears only on validation errors.

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing/invalid field, or an unparseable JSON body |
| `UNAUTHORIZED` | 401 | Missing or unknown `x-demo-user` |
| `INCIDENT_NOT_FOUND` | 404 | No incident with that id |
| `NOT_FOUND` | 404 | No such route |
| `INVALID_STATUS_TRANSITION` | 409 | Rejected by the state machine |
| `DATABASE_ERROR` | 500 | Storage read/write failure |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected fault — generic message, no stack trace |

### GET /health

```bash
curl http://localhost:3001/health
```
```json
{ "success": true, "data": { "status": "healthy" } }
```

### POST /api/incidents

Four fields are accepted. Everything else is computed by the server.

| Field | Rules |
|---|---|
| `title` | required, 5–200 chars |
| `description` | required, 10–2000 chars |
| `service` | required, non-empty |
| `businessImpact` | required, 5–500 chars |

```bash
curl -X POST http://localhost:3001/api/incidents \
  -H "Content-Type: application/json" -H "x-demo-user: alice" \
  -d '{
    "title": "Production outage in payment gateway",
    "description": "Complete failure of checkout, all users affected.",
    "service": "Payment Gateway",
    "businessImpact": "All card revenue halted."
  }'
```

**201 Created** — returns the persisted record, including the triage result and
the SLA deadline:

```json
{
  "success": true,
  "data": {
    "id": "INC-1790086231664-4B0B",
    "category": "Payment", "severity": "Critical", "priority": "P1",
    "status": "OPEN", "slaDuration": 2,
    "slaDeadline": "2026-09-22T16:10:31.664Z",
    "createdBy": "alice", "assignedEngineer": null,
    "resolutionNote": null, "resolvedAt": null
  },
  "message": "Incident created successfully."
}
```

**400** — the first failing field is named:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "field": "title", "message": "title must be at least 5 characters." } }
```

### GET /api/incidents

Optional, combinable query parameters. All filtering happens on the server.

| Parameter | Values |
|---|---|
| `search` | free text, matched case-insensitively against `id`, `title`, `description`, `service` |
| `status` | `OPEN` \| `IN_PROGRESS` \| `RESOLVED` |
| `priority` | `P1` \| `P2` \| `P3` \| `P4` |
| `severity` | `Critical` \| `High` \| `Medium` \| `Low` |

```bash
curl -H "x-demo-user: alice" \
  "http://localhost:3001/api/incidents?search=payment&status=OPEN&priority=P1"
```
```json
{ "success": true, "data": [ { } ], "count": 1 }
```

Results are sorted newest-first. No matches returns `"data": []` with
`"count": 0` and HTTP 200 — an empty result is not an error.

### GET /api/incidents/{id}

```bash
curl -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-1790086231664-4B0B
```

**200** with the incident, or **404**:

```json
{ "success": false, "error": { "code": "INCIDENT_NOT_FOUND", "message": "Incident 'INC-…' was not found." } }
```

### PUT /api/incidents/{id}

Partial update — send only what changes.

| Field | Rules |
|---|---|
| `title` / `description` / `service` / `businessImpact` | same limits as create |
| `assignedEngineer` | a name from the roster, or `null` to unassign |
| `status` | must be a legal transition from the current status |
| `resolutionNote` | 10–2000 chars; required when moving to `RESOLVED` |

```bash
# Assign
curl -X PUT .../api/incidents/INC-… -d '{"assignedEngineer":"Maria Garcia"}'

# Start work
curl -X PUT .../api/incidents/INC-… -d '{"status":"IN_PROGRESS"}'

# Resolve
curl -X PUT .../api/incidents/INC-… \
  -d '{"status":"RESOLVED","resolutionNote":"Rolled back release 9.4.1 and verified checkout."}'
```

**200** returns the full updated incident. **409** on an illegal transition:

```json
{ "success": false, "error": { "code": "INVALID_STATUS_TRANSITION", "message": "Cannot transition from OPEN to RESOLVED. Allowed transitions from OPEN: IN_PROGRESS." } }
```

Sending the status an incident already holds is also a 409
(`"Incident is already OPEN."`), not a silent no-op. An empty request body is a
400.

### DELETE /api/incidents/{id}

```bash
curl -X DELETE -H "x-demo-user: alice" http://localhost:3001/api/incidents/INC-…
```
```json
{ "success": true, "data": { "id": "INC-…", "deleted": true }, "message": "Incident deleted successfully." }
```

Deleting an unknown id returns 404.

### GET /api/stats

Counted from stored data on every request — never cached, never hard-coded.

```json
{
  "success": true,
  "data": { "total": 24, "open": 10, "inProgress": 8, "resolved": 6, "p1Critical": 3, "slaBreached": 2 }
}
```

`slaBreached` counts incidents where `status != RESOLVED` and
`now > slaDeadline`.

## Triage Rules

Implemented in [`backend/src/rules/triageRules.js`](backend/src/rules/triageRules.js)
as pure functions. Matching is case-insensitive, is evaluated in priority order,
and **the first rule that matches wins** — so "slow checkout during a production
outage" is P1, not P3.

The text searched is `title + description + businessImpact`, concatenated and
lower-cased. (Note that requirements.md §5 specifies only title and description;
the implementation also scans business impact, so "a total outage for the
business" in that field alone will classify an incident as P1. This is
deliberate and covered by a test.)

| Priority | Severity | Trigger keywords |
|---|---|---|
| P1 | Critical | `production outage`, `database unavailable`, `all users affected`, `complete failure`, `complete service outage`, `total outage`, `system down`, `site down` |
| P2 | High | `payment failure`, `authentication failure`, `multiple users affected`, `multiple users`, `data loss`, `security breach`, `major functionality`, `major business`, `login failure`, `sign in failure` |
| P3 | Medium | `latency`, `slow performance`, `slow response`, `slow`, `intermittent`, `performance issue`, `timeout`, `degraded`, `high response time`, `partial outage` |
| P4 | Low | *default — no keyword matched* |

Category comes from the `service` field, matched against this list **in order**,
most-specific first — the first substring hit wins:

| Service contains | Category |
|---|---|
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
| *anything else* | General |

Because `api` is tested before `frontend`, a service named "Frontend API" is
categorised as `API`.

Triage runs **only on the server, only at creation**. The frontend never
computes a priority, and the values are immutable afterwards.

## SLA Rules

| Priority | SLA | Deadline |
|---|---|---|
| P1 | 2 hours | `createdAt + 2h` |
| P2 | 8 hours | `createdAt + 8h` |
| P3 | 24 hours | `createdAt + 24h` |
| P4 | 72 hours | `createdAt + 72h` |

`slaDeadline` is computed once, at creation, stored in UTC ISO 8601, and never
recalculated — so the commitment cannot drift. The frontend only ever compares
that stored value against the current clock; it never derives a deadline of its
own.

**Display states** ([`frontend/src/utils/sla.js`](frontend/src/utils/sla.js)):

| Condition | Shown |
|---|---|
| Unresolved, deadline ahead | `2h 15m remaining` |
| Unresolved, deadline passed | `SLA breached: 1h 30m ago` (red) |
| Resolved before its deadline | `Resolved within SLA` |
| Resolved after its deadline | `Resolved (SLA breached)` (red) |

A resolved incident is judged against its `resolvedAt`, not the current time, so
a historical verdict stays fixed as time passes. Exactly at the deadline counts
as not breached. There is no background scheduler: the display recomputes on
load and every 30 seconds while an incident is unresolved.

## Incident Lifecycle

```
        ┌──────────────── reopen ─────────────────┐
        │                                         │
        ▼                                         │
      OPEN ──── start work ────► IN_PROGRESS ──── resolve ────► RESOLVED
        ▲                             │
        └────────── pause ────────────┘
```

| From | To | Allowed | Notes |
|---|---|---|---|
| OPEN | IN_PROGRESS | ✅ | Engineer starts work |
| IN_PROGRESS | RESOLVED | ✅ | Requires a resolution note ≥ 10 chars |
| IN_PROGRESS | OPEN | ✅ | Paused or reassigned |
| RESOLVED | OPEN | ✅ | Reopened; clears `resolvedAt` and the note |
| OPEN | RESOLVED | ❌ | 409 — must pass through IN_PROGRESS |
| RESOLVED | IN_PROGRESS | ❌ | 409 — must be reopened first |
| *any* | *itself* | ❌ | 409 — "Incident is already X." |

Enforced in [`backend/src/rules/statusRules.js`](backend/src/rules/statusRules.js)
and applied by the service on every update. The UI renders only the transitions
that are legal from the current status, so invalid ones are never offered — but
the backend rejects them regardless of what a client sends.

## Authentication and Demo Users

> **This is demo authentication, not a security mechanism.** There are no
> passwords, no tokens, no sessions on the server and no encryption. A client
> names a user in the `x-demo-user` header and the backend checks that the name
> is on a fixed list. Anyone can send any header. It exists so the app has a
> believable notion of "who filed this" for the hackathon MVP, and it is
> **unsuitable for any real deployment**.

| Username | Role |
|---|---|
| `alice` | Admin |
| `bob` | Engineer |
| `carol` | Engineer |
| `dave` | Support |
| `eve` | Support |

Login posts the chosen username to `/api/login`; on success the returned
`{ username, role, displayName }` is stored in `localStorage` under `session`
and sent as `x-demo-user` on every subsequent request. Logout clears it and
returns to the login screen. Routes are guarded client-side by
`ProtectedRoute`, and the backend independently rejects any request whose
header is missing or unrecognised.

All three roles currently see the same views and have the same permissions —
the role is recorded and displayed, but no authorisation rules are built on it.

## Search and Filtering

Search and every filter are **query parameters sent to the backend**, which
reads from DynamoDB on each request. Nothing is filtered from a stale local
array, so results always reflect what is actually stored.

- **Search** matches `id`, `title`, `description` and `service`,
  case-insensitively, on partial strings. Typing is debounced at 300 ms, so a
  burst of keystrokes issues one request.
- **Filters** for status, priority and severity combine with search and with
  each other using AND logic.
- State lives in the URL (`/incidents?search=payment&status=OPEN`), so a
  filtered view can be linked, bookmarked and reloaded.
- **Clear** resets everything and is disabled when there is nothing to clear.
- No matches shows an explicit empty state, not a blank table.

Responses are applied only if they are still the newest in flight, so rapidly
changing a filter cannot leave stale rows on screen.

## Engineer Assignment

Fixed roster, validated server-side — an unknown name is rejected with 400:

```
John Smith · Maria Garcia · David Chen · Sarah Johnson · Michael Brown
```

Assign, reassign, or clear the assignment by sending `null`. Only OPEN and
IN_PROGRESS incidents can be assigned; the detail page hides the control for
resolved incidents and explains that the incident must be reopened first. The
Assign button is disabled when the selection matches what is already stored.

The dashboard's **open workload by engineer** panel counts unresolved incidents
per engineer, including an "Unassigned" row, computed from live data.

## Resolution Workflow

1. The incident must be IN_PROGRESS — `Resolve` is not offered otherwise.
2. `Resolve…` opens a resolution note field.
3. The note must be at least 10 characters. Shorter notes are caught in the form
   and, independently, by the backend (400 on `resolutionNote`).
4. On success the backend sets `status = RESOLVED`, stores the note, and stamps
   `resolvedAt`.
5. The note is displayed on the incident thereafter, and the SLA line switches
   to its historical verdict.

Reopening a resolved incident clears both `resolvedAt` and the note, so the
record never claims a resolution it no longer has.

## Project Structure

```
Aidlc-project-1/
├── .kiro/specs/incidentiq/     ← Kiro specification artifacts
│   ├── requirements.md             WHAT the system must do
│   ├── design.md                   HOW it is architected
│   └── tasks.md                    HOW the work was broken down (with status)
│
├── backend/
│   ├── src/
│   │   ├── handlers/incidentHandler.js    HTTP adapter
│   │   ├── services/incidentService.js    Orchestration
│   │   ├── repositories/incidentRepository.js   DynamoDB | JSON adapter
│   │   ├── rules/
│   │   │   ├── triageRules.js             Priority · severity · category
│   │   │   ├── slaRules.js                SLA duration and deadline
│   │   │   └── statusRules.js             State machine
│   │   ├── validators/incidentValidator.js
│   │   ├── models/incident.js             Constants and lookup lists
│   │   ├── utils/{errors,response}.js
│   │   ├── local/server.js                Express entry point
│   │   └── lambda/handler.js              Lambda entry point
│   ├── tests/                             139 tests (node:test)
│   ├── scripts/createTable.js             Idempotent table creation
│   ├── serverless.yml                     Lambda + API Gateway + DynamoDB
│   ├── .env.example
│   └── README.md                          Backend API reference
│
├── frontend/
│   ├── src/
│   │   ├── api/{client,incidents,auth,stats}.js
│   │   ├── context/{AuthContext,ToastContext}.jsx
│   │   ├── components/
│   │   │   ├── layout/{AppLayout,ProtectedRoute}.jsx
│   │   │   ├── incidents/{Badges,SlaTimer,IncidentForm}.jsx
│   │   │   ├── dashboard/StatCard.jsx
│   │   │   └── shared/{ErrorBanner,LoadingSpinner,EmptyState,ConfirmDialog}.jsx
│   │   ├── pages/{Login,Dashboard,IncidentList,CreateIncident,IncidentDetail}Page.jsx
│   │   ├── utils/{sla,constants,validators}.js
│   │   ├── utils/sla.test.js              13 tests (Vitest)
│   │   └── styles.css
│   └── vite.config.js
│
├── tools/dynamodb-local/          ← DynamoDB Local runtime (git-ignored)
├── requirements.md                ← original project brief (historical)
└── package.json                   ← single-command orchestration
```

The root `requirements.md` is the original brief from the first commit, kept for
history. The refined working specification is
`.kiro/specs/incidentiq/requirements.md`.

## Local Setup

**Prerequisites:** Node.js 18+, npm 9+, and a Java runtime (11+) for DynamoDB
Local. No AWS account or credentials are needed.

```bash
# 1. Install every workspace
npm run install:all

# 2. Fetch DynamoDB Local (~50 MB) into tools/dynamodb-local/
curl -L -o ddb.zip https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.zip
mkdir -p tools/dynamodb-local && unzip -q ddb.zip -d tools/dynamodb-local && rm ddb.zip

# 3. Create the backend environment file
cp backend/.env.example backend/.env
#    then set STORAGE_MODE=dynamodb and DYNAMODB_ENDPOINT=http://localhost:8000

# 4. Start everything
npm run dev
```

`npm run dev` starts DynamoDB Local, waits for port 8000, creates the table if
it is missing, starts the API, waits for port 3001, then starts the web app.
Open **http://localhost:5173** and sign in as any demo user.

The table is created empty. Every incident you see will be one you created
through the real API — there is no seed data and no fixtures.

## Environment Variables

**`backend/.env`** (git-ignored; template in `backend/.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Express listen port |
| `STORAGE_MODE` | `local` | `dynamodb` or `local` (JSON file) |
| `DYNAMODB_ENDPOINT` | *(unset)* | DynamoDB Local URL. **Leave unset for real AWS** so the SDK resolves the regional endpoint. |
| `DYNAMODB_TABLE` | — | Table name; required when `STORAGE_MODE=dynamodb` |
| `AWS_REGION` | `us-east-1` | Region |
| `DATA_FILE` | `./data/incidents.json` | JSON path, used only when `STORAGE_MODE=local` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `local` | Placeholders the SDK needs to sign requests to DynamoDB Local. **Applied only when `DYNAMODB_ENDPOINT` is set** — on AWS the default credential chain (IAM role) is used untouched. |

**`frontend/.env`**

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | *(empty)* | Empty in development: requests go to `/api` and the Vite proxy forwards them to port 3001. Set to the API Gateway URL for a deployed backend. |

> Never commit real AWS credentials. `backend/.env` is git-ignored; supply
> production credentials through an IAM role or `~/.aws/credentials`. Note that
> any `VITE_`-prefixed variable is compiled into the client bundle and is
> therefore public — never put a secret there.

## Running the Backend

```bash
# DynamoDB Local (separate terminal, or use the root `npm run dev`)
npm run db:start

# Create the table once
npm run db:create-table

# Start the API
cd backend && npm start
#  → [IncidentIQ] Backend running on http://localhost:3001
#  → [IncidentIQ] Storage mode: dynamodb

# Verify
curl http://localhost:3001/health
```

`npm run dev` inside `backend/` runs the same server under nodemon.

## Running the Frontend

```bash
cd frontend
npm run dev       # http://localhost:5173, proxies /api → :3001
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle
```

## AWS Deployment

```bash
cd backend

# Requires AWS credentials configured and the Serverless Framework available
npx serverless deploy --stage prod --region us-east-1

# Note the API URL from the output, then verify
curl https://<api-id>.execute-api.us-east-1.amazonaws.com/health

# Point the frontend at it and rebuild
echo "VITE_API_BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com" > ../frontend/.env
cd ../frontend && npm run build   # deploy dist/ to any static host

# Tear down (the table is retained by DeletionPolicy)
cd ../backend && npx serverless remove --stage prod
```

The deploy creates the Lambda, the HTTP API and the DynamoDB table, and attaches
a scoped IAM role. `STORAGE_MODE=dynamodb` is set by `serverless.yml`;
`DYNAMODB_ENDPOINT` is deliberately absent so the SDK resolves the real
endpoint and the IAM role's credentials.

As noted under [AWS Services](#aws-services), this path has been exercised only
through unit tests against both API Gateway payload formats — it has not been
run against a live AWS account.

## Testing

```bash
npm test              # backend + frontend
npm run test:backend  # 139 tests, node:test
npm run test:frontend # 13 tests, Vitest
```

| Suite | Tests | Covers |
|---|---|---|
| `triageRules.test.js` | 27 | Every P1–P4 keyword, case-insensitivity, first-match ordering, `businessImpact` scanning, service→category |
| `slaRules.test.js` | 16 | All four durations, deadline arithmetic, breach detection |
| `statusRules.test.js` | 15 | Every allowed and forbidden transition, resolution-note enforcement |
| `incidentValidator.test.js` | 19 | Required fields, length bounds, engineer roster, enums |
| `api.test.js` | 42 | Full HTTP lifecycle against a real server: CRUD, triage, SLA, transitions, stats, persistence |
| `lambdaHandler.test.js` | 20 | Lambda router under **both** API Gateway payload formats, auth, CORS, 404s |
| `sla.test.js` (frontend) | 13 | Remaining/breached/resolved labels, the exact-deadline boundary, day formatting, missing-deadline fallbacks |
| **Total** | **152** | |

Beyond the automated suites, the build was verified end to end by driving real
Chrome through the full workflow — login, create, triage, SLA, edit, assign,
status transitions, resolution, search, filters, delete, error handling and
logout — asserting after each mutation that the change came back from the
database across a browser reload, rather than trusting React state. Persistence
was also confirmed by restarting DynamoDB and the API and re-reading the data.

The manual smoke-test checklist in
[`tasks.md`](.kiro/specs/incidentiq/tasks.md) (Task 31) is fully ticked.

## Known Limitations

**Security**

- Authentication is a plain `x-demo-user` header with no password or token, and
  is trivially spoofable. It is a demo affordance, not a security control.
- The three roles are cosmetic — no authorisation is enforced on any endpoint.
- CORS reflects any request origin in local mode, and the Lambda sets
  `Access-Control-Allow-Origin: *`. Both are appropriate for a demo only.

**Data and scale**

- Every incident lives in a single DynamoDB partition (`PK = "INCIDENT"`), and
  listing fetches all of them before filtering in application code. Fine for
  hundreds of records; it would need a GSI and real pagination beyond that.
- There is no pagination anywhere — the list renders every match.
- Updates are whole-item `PutItem` writes with no optimistic locking, so two
  concurrent edits will have a last-write-wins outcome.
- No audit trail: the history of who changed what is not retained, only the
  current state plus `createdBy`/`updatedAt`.

**Functionality**

- SLA state is computed on load and every 30 seconds — not a live per-second
  countdown, and there is no background breach detection or alerting.
- No attachments, comments, linked incidents or notifications.
- The engineer roster and demo users are hard-coded constants, not manageable
  records.
- Triage keywords are fixed in source; changing them requires a code change.
- Deleting is permanent and immediate, with no soft delete or undo beyond the
  confirmation dialog.

**Operations**

- The AWS stack has never been deployed to a live account (see
  [AWS Services](#aws-services)).
- Local development needs a Java runtime and a ~50 MB DynamoDB Local download.
- React Router emits two `v7_*` future-flag warnings in the console; they are
  informational and opting in would change routing behaviour.
- No CI pipeline, linter configuration, or error-tracking integration.

## Future Improvements

None of the following is implemented; this section describes possible next
steps, not current behaviour.

- Real authentication and authorisation — proper identity, sessions, and
  role-based permissions that actually gate the API.
- Pagination and a status GSI, so the list scales past a single query.
- An audit trail recording every field change with author and timestamp.
- Conditional writes for optimistic concurrency, preventing lost updates.
- Background SLA monitoring with alerting before a deadline is breached.
- Configurable triage rules and SLA targets, editable without a deploy.
- Richer incident records: comments, attachments, and links between incidents.
- Reporting — MTTR, breach rates, and volume trends over time.
- A CI pipeline running the suites on every push, plus linting.
- A first live AWS deployment to validate the Lambda path end to end.

## Kiro Specification-Driven Workflow

This project was built specification-first. Three artifacts in
`.kiro/specs/incidentiq/` were written and agreed before implementation, and
each answers a different question:

| Artifact | Question | Contents |
|---|---|---|
| **`requirements.md`** | **WHAT** must the system do? | 19 sections of numbered requirements: the core user flow, incident fields, triage rules, SLA targets, lifecycle rules, validation limits, error handling, API behaviour, persistence guarantees, explicit technical constraints, and the success criteria the build is measured against. |
| **`design.md`** | **HOW** is it architected? | 17 sections: architecture for both deployment modes, frontend and backend structure, the Lambda router, API Gateway routes, the DynamoDB schema and access patterns, the data model, and the design of the triage engine, SLA calculator and state machine. |
| **`tasks.md`** | **HOW** is the work broken down? | 32 numbered tasks across 12 phases, each with an outcome, dependencies and a concrete verification step — plus a critical path and a time budget. |

The flow was **requirements → design → tasks → implementation → verification**.
Each task states how to prove it is done, so completion is demonstrated rather
than asserted.

`tasks.md` has been audited against the finished build. Every task carries a
**Status** line: 31 of 32 are complete, and Task 27 (a seed script) is recorded
as deliberately not implemented, because pre-fabricated incident data would
violate the project's rule that no mock data may exist in the live application
flow. Where the implementation diverged from the plan — a layered backend
instead of the sketched `src/shared/` layout, DynamoDB instead of JSON file
storage, a create-confirmation screen instead of an immediate redirect — the
Status line records the divergence rather than editing the original plan away.
The specs stay readable as a history of the decisions, not just their outcome.
