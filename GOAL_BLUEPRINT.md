# Project Management Panel Goal Blueprint

## Goal

Build a secure, responsive web-based project management panel for software product
delivery. Google users can create projects, invite employees, organize work into a
maximum seven-level hierarchy, and understand schedule and completion through an
accurate live dashboard and a detailed Gantt chart.

The application is hosted below:

```text
https://ppm.w3nsolution.com/
```

The application owns a dedicated CloudSW3/Firestore database API at:

```text
https://project-management-pannel-zp74.cloudsw3.com
```

It no longer depends on the WaveStream host or a nested section of another
database. Database authorization credentials remain server-only secrets and are not
part of this blueprint.

## Product principles

- A project is an authorization boundary. Membership in one project grants no
  access to another.
- The Node.js server is the only trusted client of the custom Firestore API.
- The server derives identity from a verified Google token/session, never from a
  request body's email or role.
- Project calculations are deterministic and share one implementation between API,
  dashboard, and Gantt responses.
- Realtime events improve freshness; database state remains the source of truth.
- Normal task/project removal is recoverable through archival or soft deletion.
- Planned features are not documented as implemented.

## Current status

| Area | Status | Current implementation |
|---|---|---|
| Product blueprint | In progress | Root planning documents |
| Firestore access | Existing foundation | Custom `FirestoreManager.js` REST wrapper and validator |
| Authenticated UI shell | Mock implemented | Responsive sidebar, project header/switcher, notifications, profile entry, tabs, and mobile navigation |
| Google authentication | Planned | No application authentication code yet |
| Node.js application/API | Planned | No server entry point or routes yet |
| Project and membership management | Planned | Data and permission model defined below |
| Task hierarchy and dependencies | Planned | Rules defined below |
| Dashboard and roll-ups | Interactive mock | Responsive KPI/status cards, canvas progress chart, CSS status chart, mock filters, and calculation contract; live data is pending |
| Gantt chart | Interactive mock | Nested task tree, scrollable timeline, grouped phases, dependencies, milestones, today marker, filters, zoom, density control, and responsive navigation; live data/editing are pending |
| Realtime collaboration | Planned | Server event model defined below |
| Deployment | Planned | Target host/path are known; runtime config is not present |
| Automated tests | Planned | Test strategy and acceptance cases defined below |

## Users, membership, and roles

### Identity

A verified identity contains at least:

```text
googleSubject
normalizedEmail
displayName
avatarUrl
```

Normalize an email using `trim().toLowerCase()`. Use Google's stable subject value
as the preferred account ID. Never authorize solely from a display name or raw
browser-supplied email.

An invitation may exist before its recipient first signs in. On sign-in, the server
matches pending memberships to the verified normalized email and links them to the
verified user ID.

### Project roles

| Capability | Admin | Manager | Employee | Viewer |
|---|:---:|:---:|:---:|:---:|
| View project/dashboard/Gantt | Yes | Yes | Yes | Yes |
| Create and edit any task | Yes | Yes | No | No |
| Update assigned task status/progress | Yes | Yes | Yes | No |
| Assign tasks | Yes | Yes | No | No |
| Manage project settings | Yes | No | No | No |
| Invite/remove members and change roles | Yes | No | No | No |
| Archive/restore project | Yes | No | No | No |
| View audit history | Yes | Yes | Limited | No by default |

An employee can edit only explicitly permitted fields on an assigned task, such as
status, progress, actual dates, and comments. The service layer owns the exact field
allowlist. A project must always retain at least one active administrator.

## System architecture

```text
Browser (HTML/CSS/vanilla JS)
        |
        | HTTPS + secure session + project events
        v
Node.js application
  |-- authentication middleware
  |-- project authorization middleware
  |-- route/controllers
  |-- project/task services and validators
  |-- summary/scheduling service
  |-- realtime project rooms
  `-- project repositories
        |
        | server-only calls
        v
sdks/Firestore/FirestoreManager.js
        |
        v
Custom Firestore REST API
        |
        v
Dedicated Project Management Panel database
```

### Browser responsibilities

- Render sign-in, project list, dashboard, task editor, member management, and Gantt
  views.
- Keep a normalized local view model and render safely with `textContent` for user
  content.
- Send mutations with expected revision/version information.
- Apply project events in revision order; refetch when a gap or reconnect occurs.
- Provide keyboard access, responsive layout, empty/loading/error states, and clear
  permission feedback.

### Server responsibilities

- Verify Google identity, establish/revoke sessions, and apply CSRF protection when
  cookie-based authentication is used.
- Authenticate and authorize every API request and realtime connection.
- Validate payload size, types, dates, hierarchy depth, dependencies, transitions,
  and role-specific field access.
- Execute project mutations, update derived summary data, append audit events, and
  publish project-scoped realtime events.
- Hide Firestore configuration and translate wrapper failures into stable API errors.
- Enforce request timeouts, rate limits, structured logging, and safe error messages.

### Repository responsibilities

- Own every database collection name and `parentPath` construction.
- Convert storage documents to domain objects without leaking `_id` implementation
  details through business logic.
- Centralize paging, projection, and optimistic revision checks.
- Never call `purgeAllCache` as part of an ordinary project operation; it affects the
  dedicated database/API cache globally and is reserved for controlled operations.

## Database blueprint

### Dedicated database and path rule

Project Management Panel owns the complete dedicated database instance. Application
collections live at database root rather than below
`/Projects/ProjectManagementPannel`. Their exact `parentPath` strings must still be
confirmed against the custom REST API in an integration test before production.

Full database ownership permits purpose-built root collections, indexes, migrations,
and backup/restore procedures. It does not permit unbounded destructive calls from
normal request handlers. Repository methods must construct known collection paths,
and maintenance commands must validate exact targets before deleting or migrating
data.

Use safe generated IDs (UUID/ULID or equivalent). The current validator rejects
spaces, `/`, and backticks. Do not use raw email addresses as document IDs. If a
legacy `Authentication` document uses an encoded email ID, preserve it only through
a compatibility repository and do not repeat the scheme in new collections.

### Proposed collection tree

```text
Database root
|-- Authentication/{userId}
|-- EmailLookup/{emailHash}
|-- Projects/{projectId}
|   |-- Members/{membershipId}
|   |-- Tasks/{taskId}
|   |-- Comments/{commentId}
|   |-- Activity/{eventId}
|   |-- Notifications/{notificationId}
|   `-- SavedViews/{viewId}
`-- UserProjects/{userId}/Items/{projectId}
```

`UserProjects` is a read index, not an authorization source. Before returning any
project, the server confirms the active membership under that project.

### `Authentication/{userId}`

| Field | Type | Notes |
|---|---|---|
| `googleSubject` | string | Stable verified Google identity |
| `email` | string | Verified normalized email |
| `authType` | string | `google` |
| `displayName` | string | User-facing name |
| `avatarUrl` | string/null | Profile image URL |
| `status` | string | `active` or `disabled` |
| `createdAt` | timestamp | Server generated |
| `lastLoginAt` | timestamp | Server generated |

The legacy screenshot fields (`email`, `authType`) fit this record; new identity and
audit fields extend it without accessing another database section.

### `Projects/{projectId}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | Required project name |
| `description` | string | Plain text |
| `ownerUserId` | string | Original creator; not the sole auth rule |
| `status` | string | `active`, `on_hold`, `completed`, `archived` |
| `timezone` | string | IANA timezone used for project dates |
| `plannedStartDate` | date/null | Project-level plan |
| `plannedEndDate` | date/null | Optional target |
| `forecastEndDate` | date/null | Derived from active task schedule |
| `summary` | object | Derived counts/progress for fast dashboard reads |
| `revision` | integer | Increments on accepted project mutation |
| `createdAt`, `updatedAt` | timestamp | Server generated |
| `archivedAt` | timestamp/null | Soft removal |

### `Members/{membershipId}`

| Field | Type | Notes |
|---|---|---|
| `email` | string | Normalized invited email |
| `userId` | string/null | Linked after verified sign-in |
| `role` | string | `admin`, `manager`, `employee`, `viewer` |
| `status` | string | `invited`, `active`, `removed` |
| `jobTitle` | string/null | Project-specific post/title |
| `invitedBy` | string | Acting user ID |
| `invitedAt`, `joinedAt`, `removedAt` | timestamp/null | Lifecycle audit |
| `revision` | integer | Optimistic update version |

Only one active/invited membership may exist per normalized email per project.

### `Tasks/{taskId}`

| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | Plain user content |
| `parentTaskId` | string/null | `null` for a top-level task |
| `depth` | integer | `0..6`; seven total levels |
| `orderKey` | string/number | Stable sibling ordering |
| `status` | string | Allowed workflow status |
| `progress` | number | Integer `0..100` |
| `priority` | string | `low`, `medium`, `high`, `critical` |
| `assigneeUserIds` | string[] | Must be active project members |
| `plannedStartDate`, `plannedEndDate` | date/null | Planned schedule |
| `forecastStartDate`, `forecastEndDate` | date/null | Derived/current schedule |
| `actualStartDate`, `actualEndDate` | date/null | Actual execution |
| `estimateMinutes` | integer/null | Positive work estimate |
| `dependencyTaskIds` | string[] | Same-project predecessor tasks |
| `labels` | string[] | Project-local labels |
| `isMilestone` | boolean | Zero-duration Gantt marker when true |
| `blockedReason` | string/null | Required when policy marks blocked |
| `revision` | integer | Optimistic update version |
| `createdBy`, `updatedBy` | string | Acting user IDs |
| `createdAt`, `updatedAt` | timestamp | Server generated |
| `archivedAt`, `archivedBy` | timestamp/string/null | Soft deletion |

Task writes must validate that parents, dependencies, and assignees belong to the
same project. The server computes `depth`; it never trusts a client-provided value.

### `Activity/{eventId}`

Store an append-only audit entry for important mutations:

```text
eventType, actorUserId, entityType, entityId,
projectRevision, changedFields, occurredAt
```

Do not store secrets or full authentication tokens. Sensitive before/after values
should be redacted or represented by field names only.

### Comments, notifications, and saved views

- A comment references one task and stores author, plain-text body, timestamps, and
  soft-deletion metadata.
- A notification targets one project member and stores a type, entity reference,
  read timestamp, and creation timestamp.
- A saved view stores its owner, filters, sort, Gantt zoom, and collapsed task IDs;
  it cannot broaden the owner's access.

## Task hierarchy contract

The hierarchy has seven total levels:

```text
Level 1 -> depth 0 -> top task
Level 2 -> depth 1 -> subtask
...
Level 7 -> depth 6 -> deepest allowed subtask
```

For create, move, and restore operations:

1. Load the proposed parent chain and reject missing/archived/cross-project parents.
2. Reject a task as its own parent and reject any descendant as its parent.
3. Calculate the moved subtree height.
4. Reject the move when `newParentDepth + 1 + subtreeHeight > 6`.
5. Update the moved task and every descendant depth consistently.
6. Increment the project revision, refresh summaries, and emit one coherent event.

Archive policy defaults to archiving the entire subtree after an explicit UI
confirmation. Restore validates depth and parent availability before restoring the
subtree. Permanent deletion is a separate privileged maintenance operation.

## Status and progress rules

Allowed task states:

| Status | Progress constraint |
|---|---|
| `not_started` | Normally `0` |
| `in_progress` | `1..99` |
| `partially_completed` | `1..99` |
| `blocked` | `0..99` |
| `completed` | Exactly `100` |

`partially_completed` is retained because it is an explicit product requirement;
the UI should distinguish it from actively progressing work. Automatic status
normalization must be documented and applied by the service, not independently by
the browser.

Parent progress is a derived weighted roll-up when active children exist. Only
active leaf tasks contribute to overall project completion:

```text
leaf weight = estimateMinutes if positive, otherwise 1
project completion % =
  sum(leaf progress * leaf weight) / sum(leaf weight)
```

With no active leaf tasks, completion is `0%` unless the project itself is explicitly
completed. Round only for display; retain full precision during calculation.

Summary counts must define their unit. The main dashboard counts all active tasks by
status; a separate leaf-work count may be shown for delivery forecasting. Never mix
the two in the same total.

## Scheduling and Gantt requirements

### Scheduling validation

- Dates use project timezone semantics and are serialized in an unambiguous format.
- A normal task end cannot precede its start.
- A milestone is rendered as a zero-duration marker.
- Dependencies reference active tasks in the same project.
- Adding or moving a dependency runs cycle detection and returns a clear conflict.
- Parent summary dates span their active descendants unless explicitly displayed as
  an independent baseline.
- Forecast logic accounts for incomplete work and dependency finish dates; its
  assumptions must be testable and visible to the user.

### Gantt experience

- A synchronized task tree and time grid.
- Expand/collapse at every hierarchy level.
- Day, week, month, and quarter zoom.
- Horizontal/vertical scrolling suitable for large plans.
- Dependency connectors, milestones, progress overlays, today marker, overdue
  styling, and critical/blocked emphasis.
- Filters for status, assignee, priority, label, milestone, and date range.
- Readable view for all roles; edit/drag controls appear only for authorized roles.
- Dragging dates or dependencies uses the same server validation as form edits and
  reverts visibly on rejection.
- Large plans use row virtualization or another measured performance strategy.

## Dashboard contract

At minimum, return and display:

```text
forecastEndDate
plannedEndDate
totalTaskCount
remainingTaskCount
completedTaskCount
partiallyCompletedTaskCount
inProgressTaskCount
blockedTaskCount
overdueTaskCount
completionPercentage
lastCalculatedAt
sourceProjectRevision
```

`remainingTaskCount` means every active task not in `completed`. A task is overdue
when it is incomplete and its applicable forecast/planned end is before the current
date in the project timezone.

Summary writes are derived/cache data. A summary worker/service must be able to
rebuild them from task records. If a mutation succeeds but summary persistence
fails, mark/retry the summary as stale and return a response that causes clients to
refetch; never silently display a knowingly mismatched revision.

## Realtime consistency model

The Firestore wrapper exposes REST operations, not a browser-safe listener. The
Node.js application therefore publishes project-scoped events after successful
mutations.

```text
project.updated
member.updated
task.created
task.updated
task.archived
summary.updated
comment.created
notification.created
```

Every event includes `projectId`, `projectRevision`, an event type, and the minimum
safe payload. A socket joins a project room only after server authorization. On
reconnect, missed revision, out-of-order event, permission change, or server
restart, the client refetches authoritative state. Never treat event delivery as the
database commit itself.

For concurrent edits, clients send `expectedRevision`. A mismatch returns a conflict
response containing enough current metadata to refetch or present a merge choice.

## HTTP API blueprint

Use a versioned API at the dedicated domain root:

```text
/api/v1
```

Suggested resources:

| Method/path | Purpose |
|---|---|
| `POST /auth/google` | Verify Google credential and establish session |
| `POST /auth/logout` | Revoke current session |
| `GET /me` | Return verified user/profile capabilities |
| `GET/POST /projects` | List accessible projects/create project |
| `GET/PATCH /projects/:projectId` | Read/update authorized project |
| `POST /projects/:projectId/archive` | Archive project |
| `GET/POST /projects/:projectId/members` | List/invite members |
| `PATCH/DELETE /projects/:projectId/members/:memberId` | Change/remove membership |
| `GET/POST /projects/:projectId/tasks` | Read task plan/create task |
| `PATCH/DELETE /projects/:projectId/tasks/:taskId` | Update/archive task |
| `POST /projects/:projectId/tasks/:taskId/move` | Validated hierarchy move |
| `GET /projects/:projectId/dashboard` | Revisioned dashboard summary |
| `GET /projects/:projectId/gantt` | Task/dependency data for Gantt |
| `GET /projects/:projectId/reports` | Aggregated report datasets for authorized members |
| `GET /projects/:projectId/activity` | Paged authorized audit activity |
| `GET/PATCH /projects/:projectId/settings` | Read/update role-protected project settings |
| `GET/PATCH /profile` | Read/update personal preferences for the current user |
| `GET/PATCH /notifications` | List and mark personal notifications |

Create operations should accept an idempotency key. Return consistent JSON errors
with a stable code, safe message, field errors where relevant, and request ID.

## Security and reliability requirements

- Keep custom Firestore configuration and authorization headers server-only.
- Verify token issuer, audience, expiry, signature, and relevant Google identity
  claims with an official server library.
- Use secure, HTTP-only, SameSite cookies for sessions and rotate/revoke sessions as
  appropriate.
- Apply CSRF protection to cookie-authenticated mutations and restrict CORS/origins.
- Validate and cap strings, arrays, request bodies, pagination, and date ranges.
- Escape output by construction; render user content as text unless sanitized by an
  explicit trusted policy.
- Rate-limit sign-in, invitations, exports, comments, and write endpoints.
- Enforce project authorization inside the service/repository transaction boundary,
  not only in navigation or UI.
- Add timeouts/retries only where safe; do not blindly retry non-idempotent writes.
- Redact tokens, cookies, emails where appropriate, and database credentials from
  logs.
- Use health/readiness endpoints, graceful shutdown, monitoring, backups, and a
  tested restore process.
- Make archived data retention and permanent-deletion policy explicit before launch.

## User interface requirements

### Shared authenticated shell

After sign-in, every primary screen uses one application shell based on the supplied
visual reference:

- a persistent desktop sidebar with logo/product name and the nine primary
  destinations;
- a compact/collapsible sidebar on narrower screens and a drawer on mobile;
- a header showing the selected project, project switcher, notifications, and the
  signed-in user's avatar;
- optional project-local tabs or shortcuts for Overview, Tasks, Gantt, Members, and
  Activity without duplicating browser history behavior;
- a date-range control on Dashboard, Reports, Activity, and other time-based views;
- breadcrumbs or equivalent context when the user enters details/editing flows;
- consistent cards, tables, filters, dialogs, confirmation patterns, toasts, and
  loading/error states;
- a visible reconnect/stale-data indicator tied to the last synchronized project
  revision.

The active sidebar item must be unambiguous. Project selection persists across
project-scoped screens, but the server revalidates access on every navigation/API
request. A removed member is redirected to Projects and shown a safe access message.

### Screen and route map

All browser routes are served from `https://ppm.w3nsolution.com/`:

| Screen | Suggested route | Scope | Default access |
|---|---|---|---|
| Dashboard | `dashboard?project=:projectId` | Selected project | All active members |
| Projects | `projects` | Current user | Signed-in user |
| Tasks | `projects/:projectId/tasks` | Selected project | All active members; writes by role |
| Gantt Chart | `projects/:projectId/gantt` | Selected project | All active members; edits by role |
| Members | `projects/:projectId/members` | Selected project | All active members; management by admin |
| Reports | `projects/:projectId/reports` | Selected project | All active members; export may be role-limited |
| Activity | `projects/:projectId/activity` | Selected project | Role-filtered project history |
| Settings | `projects/:projectId/settings` | Selected project | Read/admin edit, with restricted sections |
| Profiles | `profiles` | Current user | Signed-in user only |

Sign-in and authentication-error views remain public entry states and are not part
of the authenticated nine-item sidebar. Notifications open from the header and may
use a panel plus a dedicated responsive view; they are not a tenth sidebar item.

### 1. Dashboard

The Dashboard is the selected project's default overview. Following the reference
image, it contains:

- project name/switcher and optional Overview, Tasks, Gantt, Members, and Activity
  shortcuts;
- date-range selection with the project timezone visible;
- primary KPI cards for planned/forecast finish, weighted progress, total tasks, and
  completed tasks;
- secondary status cards for in progress, partially completed, blocked, overdue,
  not started, and remaining work;
- progress-over-time chart comparing actual with planned/baseline progress;
- task-status donut/bar chart whose total matches the status cards;
- panels for upcoming deadlines, blocked tasks, overdue tasks, and project health;
- a `lastCalculatedAt`/revision freshness indicator and useful empty states.

Every KPI and chart uses the Dashboard contract in this blueprint. Selecting a card
opens Tasks with the corresponding filter; chart legends, tooltips, and labels must
remain understandable without relying only on color.

### 2. Projects

Projects is the signed-in user's cross-project home and selection screen:

- create-project action that makes the creator an admin;
- card/table view with name, status, role, progress, forecast finish, overdue count,
  member count, and last activity;
- search and filters for active, on-hold, completed, archived, owned, and invited;
- pending invitations with accept/decline behavior when required by policy;
- recent/favorite projects and deterministic sorting;
- admin actions to rename, archive, and restore, with confirmations;
- clear state for a new user who has no projects or invitations.

Opening a project records the current selection and routes to its Dashboard. Project
cards must not expose data until active membership has been confirmed server-side.

### 3. Tasks

Tasks is the primary work-planning and execution screen:

- virtualized tree/table representing depths `0..6`, with expand/collapse and stable
  indentation;
- columns for task, assignees, status, progress, priority, dates, estimate,
  dependencies, labels, and revision/conflict state;
- create top-level task/subtask, edit, duplicate, move, archive, restore, and allowed
  bulk actions;
- drag-and-drop or move dialog that previews and validates the resulting depth;
- search plus filters for assignee, status, label, priority, milestone, overdue, and
  date range;
- task details in an accessible page/drawer/dialog with comments and activity;
- employee controls limited to permitted fields on assigned tasks;
- explicit conflict handling when another user has changed the task revision.

The UI may pre-check hierarchy and dependency rules for fast feedback, but the server
is authoritative and rejected mutations must visibly revert/refetch.

### 4. Gantt Chart

Gantt Chart presents the same task plan as a schedule:

- synchronized hierarchy tree and horizontally scrollable timeline;
- day, week, month, and quarter zoom with jump-to-today and fit-project actions;
- task bars with progress overlay, summary bars, milestone diamonds, today marker,
  weekends/non-working-day treatment, and project timezone;
- dependency connectors and clear blocked, overdue, forecast-slip, and critical-work
  styling;
- planned/baseline versus forecast/actual comparison when baseline data exists;
- filters shared with Tasks and saved per-user view preferences;
- authorized drag/resize/dependency editing through the same validated task API;
- row virtualization and measured rendering targets for large projects.

Tasks and Gantt must preserve compatible filters and selection so users can move
between the two without losing context.

### 5. Members

Members shows project membership, not global application users:

- active, invited, and removed/archived membership states;
- avatar, verified email, display name, job title/post, role, invitation/join date,
  assigned workload, and current availability indicator if later supported;
- admin invite form using normalized email and role;
- admin role change, resend/cancel invitation, remove, and restore actions;
- last-admin safeguard and confirmation for access-removing changes;
- member detail/filter links into Tasks and Reports;
- clear separation between Google identity/profile fields and project-specific role
  or job title.

Non-admins receive a read-only view limited by the authorization/privacy policy.

### 6. Reports

Reports provides derived, reproducible project analysis:

- summary and status distribution;
- actual versus planned/baseline progress over time;
- schedule variance, overdue trend, throughput/completion trend, and forecast change;
- workload and completion by member, team, label, or priority;
- blocked work and aging reports;
- filters for date range, assignee, status, priority, label, and hierarchy branch;
- a visible data revision/calculation timestamp;
- accessible charts plus equivalent tables;
- authorized CSV/JSON export with server-side filtering and audit entry.

Report totals for the same revision and filters must reconcile with Dashboard and
Tasks. Expensive reports use bounded ranges, paging/aggregation, and progress/error
feedback.

### 7. Activity

Activity is the human-readable view of append-only project audit events:

- newest-first timeline with actor, action, entity, safe changed-field summary, and
  project-timezone timestamp;
- filters for actor, event type, entity type, and date range;
- links to accessible current entities, with a tombstone label for archived items;
- pagination/infinite loading with stable cursors;
- role-aware redaction and no display of secrets, tokens, or sensitive raw values;
- realtime insertion for newly authorized events without reordering older pages.

Activity is not an undo log. Restore/undo is offered only by an explicit supported
domain action with its own permission and audit event.

### 8. Settings

Settings controls the selected project and is divided into permission-aware sections:

- General: name, description, status, project timezone, planned dates;
- Workflow: allowed/default task status, priority, labels, and scheduling defaults;
- Notifications: project event defaults without overriding mandatory security/access
  notices;
- Integrations/export policy placeholders only when implemented;
- Archive and danger zone with typed/strong confirmation and last-admin protections.

Members may read safe project configuration needed to interpret dates and workflow.
Only admins may mutate project settings. Secrets and database configuration never
appear here.

### 9. Profiles

Profiles is the signed-in user's personal account screen across all projects:

- Google-provided avatar, display name, and verified email, clearly identifying
  read-only provider-managed values;
- personal display preferences such as theme, density, locale/date format, and
  default landing project where supported;
- personal notification preferences subject to mandatory notification rules;
- list of accessible projects and the user's role in each;
- active session/security information, sign out current session, and optional sign
  out all sessions when implemented;
- account disable/delete request flow with explicit consequences for owned projects
  and required admin transfer.

Profiles cannot change project roles, membership job titles, or another user's Google
identity. Those belong to Members or Google respectively.

### Quality rules

- Responsive desktop-first layout with a usable tablet/mobile read experience.
- Keyboard-operable menus, dialogs, forms, task tree, and key Gantt controls.
- Visible focus, semantic labels, sufficient contrast, and non-color status cues.
- Loading skeletons/spinners, empty states, validation details, permission states,
  offline/reconnect indication, and retry actions.
- Confirmation for destructive/archival actions and recovery where supported.
- Dates display in the project timezone and state that timezone near schedule views.
- Sidebar labels use the correct spelling: `Dashboard`, `Projects`, `Tasks`, `Gantt
  Chart`, `Members`, `Reports`, `Activity`, `Settings`, and `Profiles`.
- Desktop layouts follow the reference's strong numeric hierarchy, navy/blue shell,
  white content surfaces, and concise status accents while remaining an original,
  responsive implementation rather than embedding sample values.

## Delivery order

### Phase 1 - Foundation

1. Create Node.js server, static client shell, environment validation, root-domain
   routing, health endpoint, and test runner.
2. Wrap the existing Firestore manager with scoped repositories.
3. Prove development and release config selection without exposing config to the
   browser.
4. Add structured errors, logging, validation, and request IDs.

### Phase 2 - Authentication and authorization

1. Google sign-in and server token verification.
2. Secure sessions and logout.
3. Authentication records and pending-email membership linking.
4. Project role middleware and permission tests.

### Phase 3 - Projects and members

1. Project create/list/read/update/archive.
2. Automatic admin membership for the creator.
3. Invite, activate, role-change, and remove flows.
4. User project index, audit events, and last-admin safeguards.

### Phase 4 - Task engine

1. Task CRUD and soft deletion.
2. Seven-level hierarchy validation and subtree moves.
3. Status/progress rules, assignment, dates, and priorities.
4. Dependencies, cycle detection, milestones, and optimistic revisions.

### Phase 5 - Dashboard and Gantt

1. Deterministic roll-ups and rebuildable project summaries.
2. Dashboard KPIs, health, overdue work, and forecast date.
3. Gantt tree/grid, zoom, filters, milestones, dependencies, and large-plan
   performance.
4. Server-validated schedule editing.

### Phase 6 - Realtime collaboration

1. Authorized project rooms and revisioned events.
2. Reconnect/gap refetch behavior.
3. Live project, task, membership, summary, and Gantt refresh.
4. Concurrency conflict UI.

### Phase 7 - Collaboration and operations

1. Comments, notifications, saved views, search, and filters.
2. Workload, baseline comparison, and CSV/JSON exports.
3. Accessibility and performance hardening.
4. Ubuntu reverse proxy, process service, monitoring, backup/restore, and production
   security review.

## Testing strategy

### Unit tests

- Email normalization and safe ID generation.
- Permission matrix and last-admin rule.
- Task status/progress normalization.
- Parent/descendant cycle detection and depth `0..6` enforcement.
- Dependency cycle detection.
- Weighted parent/project completion and empty-project behavior.
- Forecast, overdue, milestone, and timezone calculations.
- Payload validation and API error mapping.

### Repository/integration tests

- Confirm the exact application root and `parentPath` behavior with the custom API.
- CRUD, projection, bulk read, paging, and update semantics.
- Development/release config selection without logging secrets.
- Collection ownership: repositories use only the dedicated database's documented
  root collections and reject unknown/unvalidated paths.
- Project creation creates admin membership and index consistently.
- Pending invitation links only to the matching verified email.
- Revision conflicts and summary rebuild/recovery.

Use the development database configuration and uniquely prefixed test records or a
dedicated test database. Tests must never delete production collections or invoke
global cache purge.

### API tests

- Missing, expired, forged, or wrong-audience Google credentials are rejected.
- Every route rejects a nonmember and enforces its role/field allowlist.
- Cross-project IDs cannot be used for parents, dependencies, assignments, or
  comments.
- Invalid dates, depth overflow, hierarchy cycle, dependency cycle, oversized input,
  and stale revision return stable errors.
- Archive/restore and idempotency behavior are deterministic.

### End-to-end tests

1. New Google user signs in and creates a project as admin.
2. Admin invites an employee; that employee signs in and sees only authorized
   projects.
3. Admin creates a seven-level task chain; an eighth level is rejected.
4. Admin builds dependencies; a circular dependency is rejected.
5. Employee updates an assigned task but cannot manage members or unassigned work.
6. Dashboard counts, percentage, and forecast update after task changes.
7. Two connected browsers receive revisioned task/Gantt/dashboard updates.
8. A disconnected browser refetches after reconnect.
9. Removed member immediately loses API and realtime access.
10. Application assets, API routes, Google auth, and sockets work from the root of
    `https://ppm.w3nsolution.com/` without a legacy path prefix.

### Non-functional tests

- Accessibility audit and keyboard-only critical workflows.
- Security tests for XSS, CSRF, broken access control, rate limits, and secret leaks.
- Load/performance test with a documented large project size and concurrent viewers.
- Backup export and restore drill.
- Graceful restart and realtime reconnection.

## Documentation architecture

`README.md` remains the product overview, setup/deployment entry point, current
status, and database-wrapper introduction. This blueprint owns architecture,
authorization, storage, calculations, phases, and acceptance rules.

As features become implemented, add focused documents such as:

```text
docs/API.md
docs/DATABASE.md
docs/AUTHORIZATION.md
docs/GANTT_AND_SCHEDULING.md
docs/DEPLOYMENT.md
docs/OPERATIONS.md
```

Update status tables when implementation changes. Do not describe a proposed API or
script as available until it is tested in the repository.

## Definition of done

The first production release is complete only when:

1. Google sign-in is verified server-side and secure session/logout flows work.
2. A creator becomes project admin, can invite/remove members and set roles, and the
   final active admin cannot be removed.
3. Employees see only projects containing their active matching membership.
4. Every API route and realtime room enforces project-scoped permissions server-side.
5. The browser never receives custom Firestore credentials or imports the wrapper.
6. All application data uses the dedicated database's documented root collections;
   backups, migrations, and destructive maintenance are controlled and tested.
7. Task create/update/move/archive works through seven levels and rejects an eighth,
   hierarchy cycles, dependency cycles, and cross-project references.
8. Dashboard counts, weighted completion, overdue state, and forecast date match the
   documented calculations and rebuild correctly from task data.
9. The Gantt chart presents the full nested plan, dates, progress, milestones, and
   dependencies and remains usable at the agreed large-project benchmark.
10. Accepted mutations update connected authorized dashboards and Gantt views; gaps
    and reconnects recover through an authoritative refetch.
11. Concurrent edits return explicit revision conflicts instead of silently
    overwriting newer changes.
12. Critical auth, authorization, hierarchy, calculation, API, and end-to-end tests
    pass in CI or the documented release process.
13. The app is keyboard accessible, responsive, and provides complete loading,
    empty, validation, error, and reconnect states.
14. Ubuntu deployment works at `https://ppm.w3nsolution.com/`, including root-served
    static assets, APIs, Google origin configuration, and realtime connections.
15. Secrets are externalized, logs are redacted, health/monitoring are active, and a
    backup restore has been tested.
16. README, blueprint, environment example, API, database, authorization, deployment,
    and operating instructions match the shipped application.
