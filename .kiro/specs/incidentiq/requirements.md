# IncidentIQ - Requirements Specification

**Project:** IncidentIQ — AI-Assisted IT Incident Triage & SLA Management  
**Version:** 1.0  
**Type:** Hackathon MVP (one-day implementation)

---

## 1. Overview

A functional, enterprise-style IT incident management system that can be completed within one day.

### Key Constraints

- Prioritize functionality and reliability over visual polish
- Every visible button must perform a real action
- No fake/mock functionality
- Simple architecture for one-day implementation
- Avoid overengineering (no microservices, Kubernetes, queues, etc.)
- Easy to run locally (single command to start)
- Preserve Kiro's specification-driven development artifacts
- No complex authentication, real-time infrastructure, external AI APIs, email systems

---

## 2. Core User Flow

1. User opens the application
2. User reaches a login screen
3. User logs in using predefined demo authentication mechanism
4. User reaches the incident dashboard
5. User can create a new IT incident
6. The system automatically analyzes the incident
7. The system determines: category, severity, priority, SLA duration
8. The incident is persisted
9. User can view all incidents
10. User can open an individual incident
11. User can update permitted incident fields
12. User can assign an engineer
13. User can move an incident through: OPEN → IN_PROGRESS → RESOLVED
14. User can add a resolution note
15. User can delete an incident
16. Dashboard statistics update using real persisted data
17. User can search and filter incidents
18. The system displays SLA remaining time
19. The system identifies unresolved incidents whose SLA deadline has passed as SLA breached
20. User can log out

---

## 3. Authentication Requirements

### Demo Authentication (MVP)

Supported demo roles:
- Admin
- Engineer
- Support

**Requirements:**
- Login screen allows user to select or enter a predefined demo user from a fixed list
- Application maintains authenticated user's session during normal navigation using simple localStorage
- Logout functionality clears the active session and returns user to login screen
- This is intentionally demo authentication for the hackathon MVP
- No password required for demo users

---

## 4. Incident Management Requirements

### Incident Fields

When creating an incident, the user shall provide:
- title (string)
- description (string)
- service (string - e.g., "Database", "Payment Gateway", "Authentication", "Frontend", "Backend API")
- business impact (string - free text description of business impact)

**System-generated fields:**
- incidentId (unique identifier, auto-generated)
- createdBy (username of logged-in user)
- createdAt (timestamp when incident was created)
- updatedAt (timestamp when incident was last updated)
- status (initially "OPEN")
- priority (determined by triage rules)
- severity (mapped from priority: P1→Critical, P2→High, P3→Medium, P4→Low)
- slaDeadline (calculated from priority and creation timestamp)
- assignedEngineer (initially null)
- resolutionNote (initially null)
- resolvedAt (timestamp when resolved, initially null)

### CRUD Operations

The system shall support:
- **Create:** User creates a new incident with required fields
- **Read:** User retrieves complete incident list and individual incident by ID
- **Update:** User updates permitted incident fields
- **Delete:** User deletes an incident

### Update Permissions

Permitted update fields:
- title
- description
- service
- business impact
- assigned engineer
- status
- resolution note

**Rules:**
- System preserves incident ID and creation timestamp after updates
- System preserves all create, update, and delete operations

---

## 5. Triage Requirements

### Deterministic Rule-Based Triage

The system shall automatically determine category, severity, and priority when an incident is created.

**Priority Mapping Rules (applied in order):**
1. P1 (Critical): If description or title contains "production outage", "database unavailable", "all users affected", "complete failure"
2. P2 (High): If description or title contains "payment failure", "authentication failure", "multiple users", "data loss", "security breach"
3. P3 (Medium): If description or title contains "latency", "slow", "intermittent", "performance issue", "timeout"
4. P4 (Low): All other cases (default)

**Severity Mapping:**
- P1 → Critical
- P2 → High
- P3 → Medium
- P4 → Low

**Category Determination:**
- System shall categorize incidents based on the service field (e.g., "Database", "Payment", "Authentication")
- If the service field matches a known keyword, assign the corresponding category; otherwise use "General"

**Note:** Implement deterministic rule-based triage using simple string matching for MVP—do not depend on external LLM. Rules must be applied consistently across the application.

---

## 6. SLA Requirements

### Priority-to-SLA Mapping

| Priority | SLA Duration |
|----------|-------------|
| P1       | 2 hours     |
| P2       | 8 hours     |
| P3       | 24 hours    |
| P4       | 72 hours    |

### SLA Deadline Calculation

When an incident is created:
- System calculates and persists an SLA deadline based on priority
- SLA deadline = creation timestamp + SLA duration

### SLA Display

- Frontend calculates and displays remaining SLA time using persisted deadline and current time
- Display format: "2h 15m remaining" or "SLA breached: 1h 30m ago"
- If current time exceeds SLA deadline AND incident is not resolved → SLA breached
- Resolved incidents retain historical SLA information

### SLA Edge Cases

1. **SLA Already Breached**: If an incident's SLA was breached before status change to RESOLVED, it should still show as "SLA breached" in historical context
2. **Resolved After Breach**: If incident is resolved after SLA breach, display "Resolved (SLA breached)"
3. **SLA Calculation**: SLA remaining time = slaDeadline − currentTime (negative values indicate breach)
4. **Time Zone**: Use UTC for all timestamp calculations to avoid timezone issues
5. **Refresh**: SLA calculations should update on page refresh or incident list reload

**Note:** MVP shall not require a background scheduler for SLA countdown or breach detection. Calculations happen on-demand in the frontend.

---

## 7. Status Requirements

### Incident Lifecycle

The normal incident lifecycle is:
**OPEN → IN_PROGRESS → RESOLVED**

### Status Transition Rules

**Allowed transitions:**
- OPEN → IN_PROGRESS (when engineer starts work)
- IN_PROGRESS → RESOLVED (when incident is resolved with resolution note)
- IN_PROGRESS → OPEN (if work needs to be paused or reassigned)
- RESOLVED → OPEN (if resolution was incorrect or issue reoccurs)

**Invalid transitions:**
- OPEN → RESOLVED (must go through IN_PROGRESS first)
- RESOLVED → IN_PROGRESS (must go through OPEN first)

**Additional rules:**
- Only OPEN or IN_PROGRESS incidents can be assigned to engineers
- Only IN_PROGRESS incidents can be resolved
- Resolution requires a non-empty resolution note
- When an incident is resolved, resolvedAt timestamp must be set
- Status transitions must update the updatedAt timestamp
- Invalid status transitions shall be rejected with a clear error message
- An incident shall be resolvable only through the supported workflow

---

## 8. Resolution Requirements

When resolving an incident:
- User shall be able to provide a resolution note
- Resolution status and resolution note shall be persisted
- Incident status transitions to RESOLVED
- resolvedAt timestamp is set at the moment of resolution

---

## 9. Assignment Requirements

- User shall be able to assign an incident to an available engineer
- Available engineers list: ["John Smith", "Maria Garcia", "David Chen", "Sarah Johnson", "Michael Brown"]
- Only incidents with status OPEN or IN_PROGRESS can be assigned
- Assignment can be changed to another engineer or cleared (unassigned)
- Assignment shall be persisted and visible after page refresh
- Dashboard should show incident count per assigned engineer

---

## 10. Dashboard Requirements

Dashboard shall display real data for:
- total incidents
- open incidents
- in-progress incidents
- resolved incidents
- P1/Critical incidents
- SLA-breached incidents

**Note:** Dashboard statistics shall not use hard-coded values.

---

## 11. Search and Filter Requirements

### Search

User shall be able to search incidents by:
- incident ID (exact match or partial)
- title (partial match, case-insensitive)
- description (partial match, case-insensitive)
- service (partial match, case-insensitive)

**Search implementation:**
- Single search box that searches across all searchable fields
- Search applies on every keystroke or on explicit submit
- Clear search functionality to return to full list

### Filter

User shall be able to filter incidents by:
- status (OPEN, IN_PROGRESS, RESOLVED)
- priority (P1, P2, P3, P4)
- severity (Critical, High, Medium, Low)

**Filter rules:**
- Search and filters can be combined
- Filters are additive (AND logic within the same dimension)
- Clearing a filter restores the full list within the current search

---

## 12. Validation Requirements

System shall validate required fields before creating or updating incidents.

**Invalid input shall be rejected with a useful error message.**

### Required Fields Validation

**Create incident:**
- title (required, min 5 characters, max 200 characters)
- description (required, min 10 characters, max 2000 characters)
- service (required, must be non-empty string)
- business impact (required, min 5 characters, max 500 characters)

**Update incident:**
- Same validation rules as create for applicable fields
- Status updates must follow valid transition rules
- Resolution note required when changing status to RESOLVED (min 10 characters)

**Field-specific validation:**
- assignedEngineer: must be from the available engineers list or null/unassigned
- priority: must be P1, P2, P3, or P4
- status: must be OPEN, IN_PROGRESS, or RESOLVED
- slaDeadline: must be a valid ISO 8601 timestamp

---

## 13. Error Handling Requirements

The system shall handle:

- missing required fields
- invalid incident IDs
- nonexistent incidents
- invalid status transitions
- invalid incident data
- backend/API failures
- database or file-system failures

**Frontend requirements:**
- Display human-readable errors when an operation fails
- Do not silently ignore failed operations
- Show loading indicators for async operations
- Confirm destructive actions (e.g., delete incident prompt)
- Validate forms on the frontend before submission
- Provide clear success feedback after every completed operation

---

## 14. API Behavior Requirements

### REST Endpoints (to be defined precisely in design.md)

**Authentication:**
- POST /api/login — authenticate demo user, return session token or set session cookie
- POST /api/logout — clear session

**Incidents:**
- GET /api/incidents — list all incidents; accepts optional query params for search and filter
- GET /api/incidents/:id — get a single incident by ID
- POST /api/incidents — create a new incident; returns created incident with all system-generated fields
- PUT /api/incidents/:id — update permitted fields of an existing incident
- DELETE /api/incidents/:id — permanently delete an incident
- GET /api/stats — return dashboard statistics derived from persisted data

**Response conventions:**
- 200 OK — successful read or update
- 201 Created — successful create; includes Location header
- 400 Bad Request — validation error; body contains field-level error details
- 404 Not Found — incident ID does not exist
- 409 Conflict — invalid status transition
- 500 Internal Server Error — unexpected server or storage failure

### Button and Action Requirements

**All buttons must perform real actions:**
- Login button: authenticates user and redirects to dashboard
- Logout button: clears session and redirects to login screen
- Create Incident button: opens form, validates input, persists incident
- Save / Update button: validates and persists changes to incident
- Delete button: shows confirmation dialog, then deletes incident from storage
- Assign button: assigns selected engineer to incident and persists change
- Change Status button: validates transition, updates status, persists change
- Search input: filters incident list against persisted data
- Clear Search button: resets search query and restores full list
- Filter controls: apply selected filters to the incident list from persisted data

**No mock or fake buttons are permitted in the final application.**

### Potential Non-Functional Button Risks (to prevent)

1. **Search** — must query real persisted incidents, not filter a static in-memory array loaded once at startup with no update path
2. **Filter controls** — must reflect data as currently stored
3. **Create Incident** — must persist to storage before returning success
4. **Delete** — must actually remove the record from storage
5. **Dashboard statistics** — must be calculated from live persisted data, not hard-coded constants
6. **Export or Print buttons** — if included, must produce real output; do not add unless implemented

All UI actions must trigger corresponding backend operations that read from or write to real persisted data.

---

## 15. Persistence Requirements

Incident data shall remain available after:
- page refresh
- navigation between views
- logout and login

**Important:** The final application shall not depend on mock or hard-coded incident records.

### Persistence Strategy (to be decided in design.md)

**Recommended for MVP:** JSON file-based storage on the backend
- Single JSON file (e.g., `data/incidents.json`)
- Read/write on each operation
- No external database setup required
- Data survives server restarts

**Alternative:** SQLite embedded database
- Single file, no server process
- Standard SQL queries
- Slightly more setup but better concurrency than raw JSON

**Data record shape (example):**
```json
{
  "incidentId": "INC-001",
  "title": "Database connection timeout",
  "description": "Users cannot access the payment system",
  "service": "Database",
  "businessImpact": "Payment processing halted",
  "createdBy": "admin",
  "createdAt": "2026-09-22T10:30:00Z",
  "updatedAt": "2026-09-22T10:30:00Z",
  "status": "OPEN",
  "priority": "P1",
  "severity": "Critical",
  "category": "Database",
  "slaDeadline": "2026-09-22T12:30:00Z",
  "assignedEngineer": "John Smith",
  "resolutionNote": null,
  "resolvedAt": null
}
```

**Persistence rules:**
- Every create, update, and delete operation must be written to storage before a success response is returned
- No in-flight data may be lost on page refresh or server restart
- No external cloud storage required for local MVP

---

## 16. Technical Constraints

### What to Avoid

- Complex authentication (OAuth, JWT, SSO, LDAP)
- Real-time infrastructure (WebSockets, Server-Sent Events)
- Message queues (RabbitMQ, Kafka, etc.)
- Kubernetes or container orchestration
- External AI/LLM APIs (OpenAI, Anthropic, etc.)
- Email or notification systems
- AWS services (no EC2, RDS, S3, Lambda, etc. required for MVP)
- Microservices (single monolithic application only)
- Background jobs or schedulers (no cron, Celery, etc.)

### What to Focus On

- Functionality and reliability over visual polish
- Single monolithic application that is easy to run locally
- A single command to start the entire application
- Complete end-to-end user flow with no dead-ends
- Every button and UI action connected to real backend logic
- Proper error handling and user feedback
- Durable data persistence

---

## 17. Non-Functional Requirements

### Usability

- Clean, simple interface with clear visual hierarchy
- Clear feedback for every user action (success, error, loading)
- Error messages that help users understand what went wrong and how to correct it

### Maintainability

- Well-organised code with clear separation of concerns
- Documented non-obvious logic (especially triage rules and SLA calculations)

### Performance

- UI feels responsive; no noticeable lag on typical operations
- Incident list with up to 1 000 records loads within 5 seconds

### Scalability (post-MVP only)

- Clean API boundaries that could support a separate frontend later
- Simple architecture that could be extended without full rewrite

---

## 18. Success Criteria

The MVP shall be considered complete when:

1. All 20 core user flows work end-to-end without errors
2. No mock or fake data is used in the live application flow
3. Incident data persists across page refresh, navigation, and logout/login
4. All validation rules are enforced with clear error messages
5. Application starts with a single command and requires no external services
6. All CRUD operations work correctly and are reflected immediately in the UI
7. SLA calculations and breach detection work correctly for all four priority levels
8. All status transitions are validated; invalid transitions are rejected
9. Dashboard statistics are derived from real persisted data
10. Search and filter work correctly and can be combined

---

## 19. Future Enhancements (Out of Scope for MVP)

- Real-time notifications (WebSockets / SSE)
- Advanced AI-powered or LLM-assisted triage
- Email and SMS notifications
- Complex authentication (SSO, LDAP, OAuth)
- Mobile application
- Advanced reporting and analytics dashboards
- Multi-tenancy
- Full audit logging
- Integration with monitoring tools (Prometheus, Datadog, PagerDuty)
