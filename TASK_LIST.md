# Project Management Panel — Production Delivery Task List

> Accuracy baseline: 2026-08-10  
> Product contract: [`GOAL_BLUEPRINT.md`](GOAL_BLUEPRINT.md)  
> Product overview: [`README.md`](README.md)

## Purpose

This is the execution backlog for turning the current UI prototype into the secure,
database-backed application described in the goal blueprint. It records only work
that is supported by repository evidence or explicitly required by the blueprint.

`screen-build-tasks.csv` remains a legacy UI-estimation snapshot. It contains 50
rows totaling **287 hours**, not 279 hours, and it marks every row `Not Started`.
Those statuses are no longer accurate because the shared shell, Dashboard, and
Gantt prototypes now exist. The CSV also excludes authentication, server APIs,
authorization, persistence integration, realtime delivery, testing, security, and
production operations, so it must not be used as the production release plan.

## Status and priority

| Value | Meaning |
|---|---|
| `Done` | Implemented and verified for its stated scope |
| `Prototype` | Interactive mock exists, but production data, permissions, or tests are missing |
| `Ready` | Defined well enough to begin |
| `Blocked` | Cannot start until a listed dependency is resolved |
| `P0` | Security or release blocker |
| `P1` | Core first-release capability |
| `P2` | Valuable after the core workflow is stable |

Effort uses relative sizes because exact hour estimates would be false precision
before the server and database contracts are proven: `S` (small), `M` (medium),
`L` (large), and `XL` (must be split during sprint planning).

## Verified current state

| Area | Status | Evidence and limitation |
|---|---|---|
| Product documentation | `Done` | README and goal blueprint define scope, roles, storage, calculations, tests, and deployment target |
| Static development server | `Done` | `scripts/dev-server.mjs` serves `public/`; it is not the production API server |
| Build validation | `Done` | `npm run build` checks required mock files; it is not compilation, linting, or automated testing |
| Firestore wrapper | `Done` foundation | `sdks/Firestore/FirestoreManager.js` exists; project repositories and integration tests do not |
| Shared authenticated-style shell | `Prototype` | Responsive sidebar, project selector, tabs, and profile controls exist without authentication or real routing |
| Dashboard | `Prototype` | Interactive KPI and chart mock exists at `/`; all values are mock data |
| Gantt Chart | `Prototype` | Task tree, status bars, baselines, milestones, dynamic FS connectors, zoom, filters, and tooltips exist at `/gantt.html`; data and editing are mocked |
| Projects, Tasks, Members, Reports, Activity, Settings, Profiles | `Ready` | Navigation placeholders only; screens are not implemented |
| Google authentication and secure sessions | `Ready` | No application authentication code exists |
| Node application/API and authorization | `Ready` | No API entry point, routes, services, or project authorization middleware exists |
| Realtime collaboration | `Ready` | No WebSocket/Socket.IO server or client synchronization exists |
| Automated tests and CI | `Ready` | No unit, integration, API, or end-to-end suite exists |
| Production deployment | `Ready` | Target is `https://ppm.w3nsolution.com/`; runtime/reverse-proxy/service configuration is absent |

## Release gates

The release cannot be considered production-ready until all five gates pass:

1. **Identity gate:** Google identity is verified server-side and secure
   session/logout/CSRF behavior is tested.
2. **Authorization gate:** every HTTP route and realtime room enforces active,
   project-scoped membership and role permissions.
3. **Data-integrity gate:** task depth, hierarchy cycles, dependency cycles,
   revisions, summaries, forecasts, and archive behavior are deterministic.
4. **Quality gate:** critical unit, repository, API, end-to-end, accessibility,
   and security tests pass.
5. **Operations gate:** secrets are externalized, HTTPS deployment works on the
   root subdomain, monitoring is active, and backup restoration is proven.

---

## Phase 0 — Immediate security and repository hygiene

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `SEC-01` | Rotate exposed CloudSW3 authorization credentials | P0 | Ready | S | — | Old token is revoked; replacement exists only in the deployment secret store/local ignored environment; application still connects |
| `SEC-02` | Externalize Firestore configuration | P0 | Ready | M | `SEC-01` | No committed or browser-served file contains an authorization token; startup fails safely when required values are absent |
| `SEC-03` | Audit repository and history for secrets | P0 | Ready | S | `SEC-01` | Current tree and relevant history are scanned; exposed credentials are revoked; remediation is documented without copying secret values |
| `SEC-04` | Harden static serving boundaries | P0 | Ready | S | — | Server cannot expose `.env`, `sdks`, configuration, source maps containing secrets, logs, or repository metadata |

## Phase 1 — Server and data-access foundation

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `FND-01` | Create the Node application entry point | P0 | Ready | M | `SEC-02` | Serves static assets and `/api/health`; supports graceful shutdown; production and development startup are distinct |
| `FND-02` | Validate runtime environment | P0 | Ready | S | `FND-01` | Required variables, URL formats, port, mode, session settings, and database configuration are validated before listening |
| `FND-03` | Standardize API errors and request validation | P0 | Ready | M | `FND-01` | Stable error envelope, payload limits, schema validation, safe client messages, and no internal stack/secret leakage |
| `FND-04` | Add request IDs, structured logging, timeouts, and rate limits | P0 | Ready | M | `FND-01` | Requests are traceable; sensitive fields are redacted; upstream calls time out; abuse receives deterministic limits |
| `DB-01` | Prove the custom Firestore wrapper contract | P0 | Ready | M | `SEC-02` | Development integration tests confirm root paths, CRUD, paging, projection, update semantics, errors, and dev/release selection |
| `DB-02` | Add project-specific repositories | P0 | Blocked | L | `DB-01` | Routes never build database paths or call the wrapper directly; repositories allow only documented root collections and safe IDs |
| `DB-03` | Add safe ID, normalization, and serialization utilities | P0 | Ready | M | `DB-01` | Safe IDs reject invalid wrapper characters; email normalization and storage/domain mapping have unit tests |
| `TEST-01` | Establish test runner and test data isolation | P0 | Ready | M | `FND-01`, `DB-01` | Unit and integration commands exist; test records use unique prefixes/dedicated database; production collection deletion and global purge are forbidden |

## Phase 2 — Google authentication and project authorization

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `AUTH-01` | Implement Google sign-in UI and server token verification | P0 | Blocked | L | `FND-03`, `DB-02` | Server verifies signature, issuer, audience, expiry, subject, and verified email; browser-supplied email is never trusted |
| `AUTH-02` | Implement secure sessions, logout, and CSRF protection | P0 | Blocked | L | `AUTH-01` | HTTPS cookies are HttpOnly/Secure/SameSite; session rotation, expiry, current/all logout, and CSRF behavior are tested |
| `AUTH-03` | Upsert account identity and link pending invitations | P0 | Blocked | M | `AUTH-01`, `DB-02` | Account uses Google `sub`; normalized email links only matching pending memberships; replay is idempotent |
| `AUTH-04` | Add authentication and project-membership middleware | P0 | Blocked | L | `AUTH-02`, `AUTH-03` | Missing/expired sessions return 401; inactive/nonmember/cross-project access is rejected consistently |
| `AUTH-05` | Implement the role and employee-field permission matrix | P0 | Blocked | L | `AUTH-04` | Admin/manager/employee/viewer rules match the blueprint; employees edit only allowed fields on assigned tasks |
| `AUTH-06` | Add authorization regression tests | P0 | Blocked | L | `AUTH-05`, `TEST-01` | Every route is tested as admin, manager, employee, viewer, nonmember, removed member, and cross-project attacker |

## Phase 3 — Projects and membership

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `PROJ-01` | Project create/list/read/update APIs | P0 | Blocked | L | `AUTH-05`, `DB-02` | Creator becomes active admin; user-project index is consistent; list returns only authorized projects |
| `PROJ-02` | Project archive and restore | P1 | Blocked | M | `PROJ-01` | Admin-only soft archive/restore is idempotent, audited, and hidden by default without deleting child data |
| `PROJ-03` | Projects screen | P1 | Blocked | L | `PROJ-01` | Searchable/paged list with role, status, progress, create flow, pending invitations, archive/restore, loading/empty/error states |
| `MEM-01` | Invite and activate membership | P0 | Blocked | L | `PROJ-01`, `AUTH-03` | Admin invites normalized email; duplicate active/invited membership is rejected; matching verified user activates safely |
| `MEM-02` | Change role, remove, restore, resend, and cancel | P0 | Blocked | L | `MEM-01`, `AUTH-05` | Admin-only actions are audited; last active admin cannot be demoted/removed; removed access is revoked immediately |
| `MEM-03` | Members screen and workload summary | P1 | Blocked | L | `MEM-02`, `TASK-05` | Active/invited/removed states, role/job title, workload, permissions, confirmations, and responsive states are present |
| `AUDIT-01` | Append project/member audit events | P0 | Blocked | M | `PROJ-01`, `MEM-01` | Accepted mutations append actor, action, entity, project revision, and timestamp without storing secrets |

## Phase 4 — Task and scheduling engine

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `TASK-01` | Task CRUD, assignment, and soft archive APIs | P0 | Blocked | XL | `AUTH-05`, `DB-02`, `AUDIT-01` | Validated create/read/update/archive/restore; all references are same-project; employee field allowlist is enforced |
| `TASK-02` | Enforce seven hierarchy levels and cycle-safe moves | P0 | Blocked | L | `TASK-01` | Depth `0..6` succeeds; level 8, self/descendant parent, and invalid subtree moves fail without partial writes |
| `TASK-03` | Normalize status, progress, dates, and actuals | P0 | Blocked | M | `TASK-01` | Status/progress transitions are documented and validated; dates/timezone rules are deterministic; overdue remains a derived flag |
| `TASK-04` | Dependencies, milestones, and cycle detection | P0 | Blocked | L | `TASK-01` | Same-project FS dependency CRUD works; self/circular dependencies fail; milestones are zero-duration schedule markers |
| `TASK-05` | Task query, paging, search, filters, and saved views | P1 | Blocked | L | `TASK-01` | Assignee/status/priority/label/milestone/overdue/date filters are authorized, paged, deterministic, and shareable with Gantt |
| `TASK-06` | Optimistic revisions and conflict responses | P0 | Blocked | M | `TASK-01` | Mutations require expected revision; stale writes return explicit conflict metadata and never silently overwrite |
| `TASK-07` | Tasks screen and seven-level tree | P1 | Blocked | XL | `TASK-02`, `TASK-05`, `TASK-06` | Keyboard-accessible tree/table, create/edit/move/archive, detail panel, filters, permissions, conflicts, and agreed large-plan performance |
| `TASK-08` | Task comments and lightweight link attachments | P2 | Blocked | M | `TASK-01` | Authorized comments/links are validated, escaped, auditable, and recoverable through task history |

## Phase 5 — Deterministic summaries, Dashboard, and Gantt

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `SUM-01` | Implement weighted task/project roll-ups | P0 | Blocked | L | `TASK-03` | Only active leaves count; estimate minutes or weight 1 is used; parent/project percentages and empty cases match the blueprint tests |
| `SUM-02` | Implement forecast, overdue, health, and baseline calculations | P0 | Blocked | L | `TASK-04`, `SUM-01` | Planned and forecast dates remain distinct; dependency/progress/timezone calculations are deterministic and rebuildable |
| `SUM-03` | Maintain and rebuild project summaries | P0 | Blocked | L | `SUM-01`, `SUM-02` | Mutations update summary revision consistently; an authorized rebuild recovers derived data without changing source tasks |
| `DASH-01` | Dashboard visual prototype | P1 | Prototype | — | — | Existing responsive mock remains the approved visual baseline; mock values are clearly isolated from production state |
| `DASH-02` | Connect Dashboard to summary APIs | P0 | Blocked | L | `SUM-03`, `AUTH-05` | KPI cards, status totals, progress history, health, overdue, date/project filters, and timestamps use authorized live data and reconcile exactly |
| `GANTT-01` | Gantt visual and interaction prototype | P1 | Prototype | — | — | Existing nested tree/timeline, status treatment, planned baselines, milestones, today marker, dynamic FS connectors, zoom, filters, and tooltips remain usable |
| `GANTT-02` | Connect Gantt to the task/schedule APIs | P0 | Blocked | XL | `TASK-04`, `TASK-05`, `SUM-02` | Bars, dates, progress, statuses, baselines, hierarchy, milestone positions, and dependency arrows are derived from authorized task data |
| `GANTT-03` | Add server-validated Gantt editing | P1 | Blocked | XL | `GANTT-02`, `TASK-06` | Authorized drag/resize/dependency edits use revisions; invalid changes visibly revert with a precise error |
| `GANTT-04` | Large-plan scrolling and virtualization | P1 | Blocked | L | `GANTT-02` | Left tree and timeline stay synchronized and meet a documented benchmark on the agreed task count/device |

## Phase 6 — Remaining screens and global experience

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `UI-01` | Production routing and authenticated shell | P0 | Prototype | L | `AUTH-04`, `PROJ-01` | Nine routes, active state, project selection, route guards, mobile drawer, and browser history work without placeholder toasts |
| `UI-02` | Global loading, empty, validation, error, confirm, and reconnect states | P1 | Ready | L | `UI-01` | Consistent accessible patterns cover every async screen and destructive action; dialogs trap/restore focus |
| `REP-01` | Reports screen | P2 | Blocked | L | `SUM-03`, `TASK-05` | Authorized progress, variance, workload, overdue/blocked views reconcile with Dashboard for the same revision and filters |
| `REP-02` | CSV/JSON export | P2 | Blocked | M | `REP-01` | Server-side authorized export is bounded, rate-limited, audited, and formula-injection safe for CSV |
| `ACT-01` | Activity screen | P1 | Blocked | L | `AUDIT-01`, `AUTH-05` | Paged newest-first feed, actor/entity/type/date filters, role-aware redaction, stable ordering, and entity links |
| `SET-01` | Project Settings screen | P1 | Blocked | L | `PROJ-02`, `AUTH-05` | Admin edits validated general/workflow/notification settings; members see safe read-only values; danger zone is protected |
| `PROF-01` | Profile and personal preferences screen | P1 | Blocked | L | `AUTH-02`, `PROJ-01` | Provider-managed identity, accessible projects, display/date preferences, session list, and logout actions are accurate |
| `NOTIF-01` | In-app notification foundation | P2 | Blocked | L | `AUTH-03`, `TASK-01`, `MEM-01` | Invitations, assignments, mentions, due/overdue events are deduplicated, authorized, markable as read, and preference-aware |

## Phase 7 — Realtime collaboration and concurrency

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `RT-01` | Authorized project realtime rooms | P0 | Blocked | L | `AUTH-05`, `FND-04` | Session and active membership are checked on connect and join; removed users are disconnected immediately |
| `RT-02` | Revisioned project events | P0 | Blocked | L | `RT-01`, `TASK-06`, `SUM-03` | Task/member/project/summary events contain project revision and no secrets; ordering is deterministic |
| `RT-03` | Browser reconnect and gap recovery | P0 | Blocked | L | `RT-02` | Clients apply ordered events, detect gaps/out-of-order delivery, refetch authoritative state, and show reconnect status |
| `RT-04` | Live Dashboard, Tasks, Gantt, Members, and Activity refresh | P1 | Blocked | L | `RT-03`, corresponding screens | Connected authorized browsers update without reload; removed access and conflicting edits are handled visibly |

## Phase 8 — Verification, deployment, and operations

| ID | Task | Pri. | Status | Effort | Depends on | Acceptance criteria |
|---|---|:---:|---|:---:|---|---|
| `QA-01` | Calculation and domain unit tests | P0 | Blocked | L | `TEST-01`, `TASK-04`, `SUM-02` | Normalization, permissions, depth/cycles, progress, forecast, overdue, milestone, timezone, and errors are covered |
| `QA-02` | Repository and API integration tests | P0 | Blocked | L | `DB-02`, `AUTH-06`, `TASK-06` | CRUD/paging/config, atomic workflows, invitations, authorization, validation, idempotency, and conflicts are covered |
| `QA-03` | Critical end-to-end workflows | P0 | Blocked | XL | Core P0 screens/APIs | All ten workflows in the goal blueprint pass, including two-browser realtime and root-domain production-path behavior |
| `QA-04` | Accessibility and responsive audit | P0 | Blocked | L | Core screens | Keyboard-only flows, focus, labels, contrast, non-color status cues, screen-reader output, and supported viewport sizes pass |
| `QA-05` | Security review | P0 | Blocked | L | Core APIs, `SEC-01..04` | XSS, CSRF, broken access control, rate limits, secret leakage, session behavior, dependency risks, and logs are reviewed and fixed |
| `QA-06` | Performance/load benchmark | P1 | Blocked | M | `GANTT-04`, `RT-04` | Agreed large project and concurrent viewer benchmark is documented and met without authorization/data loss |
| `OPS-01` | Ubuntu service and reverse-proxy deployment | P0 | Blocked | L | P0 APIs, `QA-03`, `QA-05` | HTTPS root domain serves assets/API/realtime; systemd or equivalent restarts safely; no legacy path prefix is required |
| `OPS-02` | Health, monitoring, logging, and alerting | P0 | Blocked | M | `OPS-01`, `FND-04` | Health/readiness, process/upstream failures, redacted logs, retention, and actionable alerts are operational |
| `OPS-03` | Backup/export and restore drill | P0 | Blocked | L | `DB-02`, `OPS-01` | Backup policy is documented; a restore into a safe target is executed and verified without destructive production commands |
| `DOC-01` | Ship accurate API/database/auth/deployment/operations docs | P0 | Ready | L | Implemented behavior | Documentation describes only tested behavior, configuration placeholders contain no secrets, and release/runbook steps are reproducible |

## Optimized delivery sequence

Work should be pulled in this dependency order:

1. `SEC-*` → `FND-*` → `DB-*` → `TEST-01`
2. `AUTH-*` → authorization gate
3. `PROJ-*`, `MEM-*`, `AUDIT-01`
4. `TASK-*` → `SUM-*`
5. Connect the existing Dashboard and Gantt prototypes to live APIs
6. `UI-01`, Tasks, Projects, Members, Settings, Profile, and Activity
7. `RT-*` and concurrency recovery
8. Reports, notifications, comments, exports, and other P2 work
9. `QA-*` continuously, then `OPS-*` and the production gates

The next implementation slice should be `SEC-01` through `DB-01`. Building more
screens before identity, authorization, and storage contracts exist would create
rework and would not advance the production definition of done.

## Task completion rule

A task may move to `Done` only when:

- its acceptance criteria are met in the repository;
- relevant automated tests pass, or the task explicitly establishes the test
  foundation;
- authorization and project isolation are tested for server-side work;
- loading, empty, validation, error, and permission states exist for UI work;
- no secret or private configuration reaches browser code, logs, fixtures, or docs;
- documentation and current-status tables are updated when behavior changes.

