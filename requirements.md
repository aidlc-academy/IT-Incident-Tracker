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
1. P1 (Critical): If description contains "production outage", "database unavailable", "all users affected", "complete failure"
2. P2 (High): If description contains "payment failure", "authentication failure", "multiple users", "data loss", "security breach"
3. P3 (Medium): If description contains "latency", "slow", "intermittent", "performance issue", "timeout"
4. P4 (Low): All other cases (default)

**Severity Mapping:**
- P1 → Critical
- P2 → High  
- P3 → Medium
- P4 → Low

**Category Determination:**
- System shall categorize incidents based on service field (e.g., "Database", "Payment", "Authentication")
- If service field contains specific keywords, assign corresponding category

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
3. **SLA Calculation**: SLA remaining time = slaDeadline - currentTime (negative values indicate breach)
4. **Time Zone**: Use UTC for all timestamp calculations to avoid timezone issues
5. **Refresh**: SLA calculations should update on page refresh or incident list reload

**Note:** MVP shall not require background scheduler for SLA countdown or breach detection. Calculations happen on-demand in frontend.

---

## 7. Status Requirements

### Incident Lifecycle

The normal incident lifecycle is:
**OPEN → IN_PROGRESS → RESOLVED**

### Status Transition Rules

**Allowed transitions:**
- OPEN → IN_PROGRESS (when engineer starts work)
- IN_PROGRESS → RESOLVED (when incident is resolved with resolution note)
- IN_PROGRESS → OPEN (if work needs to be paused/reassigned)
- RESOLVED → OPEN (if resolution was incorrect or issue reoccurs)

**Invalid transitions:**
- OPEN → RESOLVED (must go through IN_PROGRESS first)
- RESOLVED → IN_PROGRESS (must go through OPEN first)

**Additional rules:**
- Only OPEN or IN_PROGRESS incidents can be assigned to engineers
- Only IN_PROGRESS incidents can be resolved
- Resolution requires a non-empty resolution note
- When an incident is resolved, resolvedAt timestamp must be set
- Status transitions should update the updatedAt timestamp
- Invalid status transitions shall be rejected with clear error message
- An incident shall be resolvable only through the supported workflow

---

## 8. Resolution Requirements

When resolving an incident:
- User shall be able to provide a resolution note
- Resolution status and resolution note shall be persisted
- Incident status transitions to RESOLVED

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
- service (exact match)

**Search implementation:**
- Single search box that searches across all searchable fields
- Real-time search results as user types (optional, but recommended for good UX)
- Clear search functionality to return to full list

### Filter

User shall be able to filter incidents by:
- status (OPEN, IN_PROGRESS, RESOLVED)
- priority (P1, P2, P3, P4)
- severity (Critical, High, Medium, Low)

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
- assignedEngineer: must be from available engineers list or null
- priority: must be P1, P2, P3, or P4
- status: must be OPEN, IN_PROGRESS, or RESOLVED
- slaDeadline: must be valid future timestamp when created

---

## 13. Error Handling Requirements

The system shall handle:

- missing required fields
- invalid incident IDs
- nonexistent incidents
- invalid status transitions
- invalid incident data
- backend/API failures
- database failures

**Frontend requirements:**
- Display human-readable errors when an operation fails
- Do not silently ignore failed operations
- Show loading indicators for async operations
- Confirm destructive actions (delete incident)
- Form validation before submission
- Clear feedback for successful operations

---

## 14. API Behavior Requirements

### REST Endpoints (Example - to be defined in design phase)

**Authentication:**
- POST /api/login - authenticate demo user
- POST /api/logout - clear session

**Incidents:**
- GET /api/incidents - list all incidents (with search/filter params)
- GET /api/incidents/:id - get single incident
- POST /api/incidents - create new incident
- PUT /api/incidents/:id - update incident
- DELETE /api/incidents/:id - delete incident
- GET /api/incidents/stats - get dashboard statistics

**Response Format:**
- Success: 200 OK with JSON data
- Created: 201 Created with location header
- Validation error: 400 Bad Request with error details
- Not found: 404 Not Found
- Server error: 500 Internal Server Error

### Button/Action Requirements

**All buttons must perform real actions:**
- Login button: authenticates user and redirects to dashboard
- Logout button: clears session and redirects to login
- Create Incident button: opens form, validates input, creates incident
- Save button (edit incident): validates and saves changes
- Delete button: confirms then deletes incident
- Assign button: assigns engineer to incident
- Change Status button: validates and updates status
- Search button: performs search with current query
- Clear Search button: resets search and shows all incidents
- Filter buttons: apply selected filters to incident list

**No mock/fake buttons allowed.**

### Potential Non-Functional Button Risks (to avoid)

1. **Search button** - Must actually search incidents, not just filter mock data
2. **Filter buttons** - Must apply real filters to persisted data
3. **Create button** - Must create real incident with persistence
4. **Delete button** - Must actually delete from storage
5. **Export/Print buttons** - If included, must generate real exports
6. **Refresh button** - Must reload from actual data source
7. **Dashboard widgets** - Must calculate statistics from real data, not hardcoded values

All UI actions must trigger corresponding backend operations that modify or query real persisted data.

**Important:** Final application shall not depend on mock or hard-coded incident records for production application flow.

## 15. Persistence Requirements

Incident data shall remain available after:
- page refresh
- navigation
- logout/login (where applicable)

### Persistence Strategy (Design Decision)

**Approach 1 (Recommended for MVP):** JSON file-based storage
- Store incidents in a single JSON file (e.g., `incidents.json`)
- File read/write on each operation
- Simple, no database setup required
- Data persists across server restarts

**Approach 2 (Alternative):** In-memory with localStorage (frontend-only)
- Store incidents in browser's localStorage
- Works without backend
- Data persists across page refreshes
- Limited to single browser instance

**Data format example:**
```json
{
  "incidents": [
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
      "slaDeadline": "2026-09-22T12:30:00Z",
      "assignedEngineer": "John Smith",
      "resolutionNote": null,
      "resolvedAt": null
    }
  ]
}
```

**Persistence requirements:**
- Data must survive page refresh (for frontend approach) or server restart (for backend approach)
- No external database required for one-day implementation
- Simple backup strategy (copy JSON file)

---

## 15. Technical Constraints

## 16. Technical Constraints

### What to Avoid

- Complex authentication (OAuth, JWT, etc.)
- Real-time infrastructure (WebSockets, Server-Sent Events)
- Message queues (RabbitMQ, Kafka, etc.)
- Kubernetes or container orchestration
- External AI/LM APIs (OpenAI, etc.)
- Email systems
- Complex infrastructure
- **AWS complexity** (no EC2, RDS, S3, Lambda, etc. required for MVP)
- **Microservices** (single monolithic application)
- **Background jobs/schedulers** (no cron jobs, Celery, etc.)

### What to Focus On

- Functionality and reliability
- Simple architecture (monolithic)
- Easy local execution (single command)
- Complete user flow
- Real working buttons and actions
- Proper error handling
- Data persistence

---

## 17. Non-Functional Requirements

### Usability

- Clean, simple interface
- Clear feedback for all user actions
- Error messages that help users correct issues

### Maintainability

- Well-organized code
- Clear separation of concerns
- Documented code where non-obvious

### Performance

- Responsive UI (no noticeable lag)
- Reasonable load times for incident lists (<5 seconds for 1000 incidents)

### Scalability

- Simple architecture that could be extended later
- Clean API boundaries

---

## 18. Success Criteria

The MVP shall be considered complete when:

1. All core user flows work end-to-end
2. No mock or fake data in the application flow
3. Data persists across page refresh and navigation
4. Error handling is robust and user-friendly
5. Application can be run locally with simple commands
6. All CRUD operations work correctly
7. SLA calculations and breach detection work correctly
8. Status transitions are validated
9. Dashboard displays accurate statistics
10. Search and filter work correctly

---

## 19. Future Enhancements (Out of Scope for MVP)

- Real-time notifications
- Advanced AI-powered triage
- Email notifications
- Complex authentication (SSO, LDAP)
- Mobile app
- Advanced reporting and analytics
- Multi-tenancy
- Audit logging
- Integration with monitoring tools (e.g., Prometheus, Datadog)
