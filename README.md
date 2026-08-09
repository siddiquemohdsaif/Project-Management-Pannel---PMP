# Project Management Panel

Project Management Panel is a web application for planning and tracking software
product development. A user signs in with a Google account, creates a project, and
becomes that project's administrator. The administrator can invite employees by
email, assign project roles, build a nested task plan, and monitor delivery through
a live dashboard and detailed Gantt chart.

The planned production URL is:

```text
https://ppm.w3nsolution.com/
```

The application is now independent from WaveStream and is served from the root of
its own `ppm.w3nsolution.com` subdomain. User-facing text should use the correct
spelling, "Project Management Panel."

This repository is currently in the UI-foundation stage. It includes the custom
Firestore REST wrapper under `sdks/Firestore` plus responsive, interactive Dashboard
and Gantt Chart mocks under `public/`. Authentication, live API data, the remaining
screens, automated tests, and production deployment configuration are still to be
implemented.
See [GOAL_BLUEPRINT.md](GOAL_BLUEPRINT.md) for the complete architecture, data
model, delivery phases, and definition of done.

## Core workflow

1. A visitor signs in with Google.
2. On first sign-in, the server creates the user's account record inside this
   application's database section.
3. A user creates a project and automatically becomes its project administrator.
4. The administrator adds employees by Google-account email and assigns a project
   role.
5. Invited employees see the project after signing in with the matching email.
6. Authorized members create, update, assign, and complete tasks according to their
   role.
7. Every accepted task change refreshes project totals, forecast completion date,
   completion percentage, and the Gantt view for connected members.

Inviting an email does not create a general user account or grant access to any
other project. Membership and authorization are always project-scoped.

## Planned capabilities

### Project administration

- Create, rename, archive, and restore projects.
- Invite, remove, and change the role of project members by email.
- Separate project roles: `admin`, `manager`, `employee`, and `viewer`.
- Prevent removal of the last administrator.
- Record an audit event for membership, project, and task mutations.

### Task planning

- Add, edit, move, archive, restore, and assign tasks.
- Support seven hierarchy levels in total: one top-level task plus no more than six
  nested subtask levels.
- Track `not_started`, `in_progress`, `partially_completed`, `blocked`, and
  `completed` status.
- Store planned start/end dates, actual dates, priority, assignees, estimates,
  progress, dependencies, labels, and milestone state.
- Reject circular parent relationships and circular task dependencies.
- Use soft deletion for normal task removal so accidental deletion is recoverable.

### Dashboard and Gantt chart

- Show planned/forecast project finish date.
- Show total, remaining, completed, partially completed, in-progress, and blocked
  task counts.
- Show weighted project completion percentage and overdue work.
- Display a large, zoomable Gantt chart with nested rows, dependency connectors,
  milestones, a today marker, filters, and collapse/expand controls.
- Recalculate affected summaries and broadcast updates after a project, member, or
  task mutation.

### Useful project-management additions

- Task comments, activity history, and lightweight link attachments.
- Saved filters and search by assignee, status, label, priority, and date.
- Notifications for invitations, assignments, mentions, approaching due dates, and
  overdue tasks.
- Project health indicators for blocked work, overdue work, and forecast slippage.
- Workload view by employee and date range.
- CSV/JSON export and project activity/audit export.
- Optional baseline dates for comparing the original schedule with the current plan.

The first release should prioritize authentication, authorization, task hierarchy,
dashboard accuracy, and the Gantt chart. Collaboration and reporting enhancements
can follow without changing the core data model.

## Application screens

The authenticated application uses a shared shell inspired by the supplied dashboard
reference: a dark left sidebar, a selected-project header, notification and profile
controls, a date-range filter where relevant, and a responsive main content area.
The sidebar contains these nine primary screens:

| Screen | Purpose | Main content |
|---|---|---|
| Dashboard | Summarize the selected project's current health | Planned/forecast finish, completion, task totals, status cards, progress-over-time chart, status chart, overdue and blocked work |
| Projects | Find and manage all projects available to the signed-in user | Searchable project cards/table, status and role filters, create project, archive/restore, recent projects |
| Tasks | Build and operate the selected project's work plan | Seven-level task tree/table, search, filters, bulk actions, task detail/editor, assignment, status and progress |
| Gantt Chart | Inspect and edit the selected project's schedule | Synchronized task tree and timeline, dependencies, milestones, zoom, today marker, baselines, critical/blocked work |
| Members | Manage the selected project's people and invitations | Member list, pending invitations, job title/post, project role, workload summary, invite/remove/change-role actions |
| Reports | Analyze and export project delivery information | Progress, schedule variance, workload, overdue/blocked, completion trends, date/assignee filters, CSV/JSON export |
| Activity | Review the selected project's audit and collaboration history | Chronological event feed, actor/entity/action filters, task/member/project changes, pagination |
| Settings | Configure the selected project | General details, timezone, workflow defaults, labels, notification policy, archive controls, role-restricted danger zone |
| Profiles | Manage the signed-in user's personal account experience | Google identity details, display preferences, notification preferences, accessible projects, active sessions, sign out |

`Dashboard`, `Tasks`, `Gantt Chart`, `Members`, `Reports`, `Activity`, and `Settings`
operate on the currently selected project. `Projects` changes that selection, while
`Profiles` belongs to the signed-in user. If no project is selected, project-scoped
screens redirect to `Projects` or show a clear project-selection state.

Suggested browser routes on the production domain are:

```text
/dashboard
/projects
/projects/:projectId/tasks
/projects/:projectId/gantt
/projects/:projectId/members
/projects/:projectId/reports
/projects/:projectId/activity
/projects/:projectId/settings
/profiles
```

The dashboard visual language should follow the reference image without copying its
sample data: navy navigation, blue active state, white content cards, concise status
colors, readable charts, and strong numeric hierarchy. Status must never be conveyed
by color alone.

## Technology

| Layer | Planned technology |
|---|---|
| Browser | Semantic HTML, normal CSS, and modular vanilla JavaScript |
| Server | Node.js HTTP application/API |
| Authentication | Google sign-in in the browser; Google ID-token verification on the server |
| Database | Dedicated CloudSW3/Firestore database through `sdks/Firestore/FirestoreManager.js` |
| Live updates | Server-originated project events over WebSocket/Socket.IO, with reconnect refetch |
| Hosting | Independent Ubuntu-hosted web application at `ppm.w3nsolution.com` |

The browser communicates only with this application's Node.js API. It must not
receive Firestore service URLs, database authorization tokens, or direct access to
`FirestoreManager`.

## Suggested repository layout

```text
Project Management Pannel/
|-- README.md
|-- GOAL_BLUEPRINT.md
|-- package.json
|-- .env.example
|-- server/
|   |-- app.js
|   |-- config/
|   |-- middleware/
|   |-- routes/
|   |-- services/
|   |-- repositories/
|   `-- realtime/
|-- public/
|   |-- index.html
|   |-- css/
|   |-- js/
|   `-- assets/
|-- sdks/
|   `-- Firestore/
`-- test/
    |-- unit/
    |-- integration/
    `-- e2e/
```

Keep database path construction in repositories, business rules in services, HTTP
concerns in routes/middleware, and DOM/state handling in browser modules.

## Existing Firestore wrapper

`sdks/Firestore/FirestoreManager.js` is a CommonJS singleton backed by Axios. It
selects `config-cloudsw3.json` when `PRODUCTION_TYPE=release`; otherwise it selects
`config-cloudsw3_dev.json`.

The production database API host is the project's dedicated CloudSW3 application:

```text
https://project-management-pannel-zp74.cloudsw3.com
```

Its authorization token is a secret and must never be copied into README files,
browser code, logs, commits, or API responses. Keep it in server-only configuration
or, preferably, an environment/secret store and rotate it if it has been exposed.

Available operations include:

| Operation | Wrapper method |
|---|---|
| Create a document | `createDocument` |
| Read a document | `readDocument` |
| Read selected fields | `readDocumentWithProjection` |
| List document IDs | `readCollectionDocumentIds` |
| Bulk read | `bulkReadDocuments`, `bulkReadDocumentsInMap` |
| Page/list a collection | `readCollectionDocumentsWithPaging`, `readCollectionDocuments` |
| Update a document | `updateDocument` |
| Delete a document/field/collection | `deleteDocument`, `deleteField`, `deleteCollection` |
| Purge wrapper/API cache | `purgeAllCache` |

Collection and document names cannot be empty and cannot contain a backtick, slash,
or space. Application IDs must therefore use safe generated identifiers; raw email
addresses must not be used as new document IDs. Store normalized email as a field
and derive any lookup key with a documented encoding or hash.

Create a thin project-specific repository layer over this wrapper. Route handlers
must not construct database paths or call the wrapper directly.

## Dedicated database scope

Project Management Panel now owns the full dedicated database instance. Its primary
collections may therefore live at database root, for example:

```text
/Authentication
/EmailLookup
/Projects
/UserProjects
```

The new screenshot demonstrates an authentication document directly below the
root-level `Authentication` collection. The application is no longer restricted to
`/Projects/ProjectManagementPannel` and does not depend on a WaveStream database
section. Full-database ownership does not make destructive operations routine:
collection deletion, migrations, and global cache purge still require controlled
administrative tooling, backups, and explicit target validation. The complete
collection model is defined in [GOAL_BLUEPRINT.md](GOAL_BLUEPRINT.md#database-blueprint).

## Authentication and authorization rules

- Verify every Google ID token on the Node.js server; never trust browser-supplied
  email, role, project ID, or user ID.
- Normalize emails with `trim().toLowerCase()` for matching.
- Use the verified Google subject (`sub`) as the stable identity when available.
- A user may read a project only when an active membership exists for that project.
- Every mutation checks the server-side membership role.
- Only an admin may manage membership or project-wide settings.
- A removed or disabled membership loses access immediately.
- HTTP responses and logs must not expose tokens, database credentials, or private
  configuration.

## Dashboard calculation rules

Use one documented calculation everywhere:

```text
task progress = 0..100
leaf weight   = estimateMinutes when present, otherwise 1
project %     = sum(leaf progress * leaf weight) / sum(leaf weight)
```

Only active leaf tasks contribute to project percentage, preventing parent and child
work from being counted twice. A parent displays the weighted roll-up of its active
children. If a parent has no children, it behaves as a leaf task. Archived tasks do
not contribute.

The forecast finish date is the latest forecast end date among active incomplete
leaf tasks after dependency and progress calculations. The UI must label planned
and forecast dates separately rather than presenting an uncertain forecast as a
guarantee.

## Local dashboard preview

The current dashboard mock has no third-party runtime dependencies:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Expected environment variables should include:

```text
NODE_ENV=development
PRODUCTION_TYPE=dev
PORT=3000
GOOGLE_CLIENT_ID=replace-with-client-id
SESSION_SECRET=replace-with-long-random-value
CLOUDSW3_APP_URL=https://project-management-pannel-zp74.cloudsw3.com
CLOUDSW3_AUTHORIZATION_TOKEN=replace-with-rotated-server-only-token
```

Do not commit `.env`, Google secrets, session secrets, or database authorization
tokens. Existing Firestore config files must be reviewed before publication, kept
server-only, and migrated to environment/secret-store values when the wrapper is
hardened.

## Planned scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Serve the current dashboard mock at `http://127.0.0.1:3000` |
| `npm start` | Serve the current dashboard mock |
| `npm run build` | Validate required dashboard files and references |
| `npm test` | Planned unit and integration test command |
| `npm run test:e2e` | Planned browser workflow test command |
| `npm run lint` | Planned server and browser JavaScript check |

Commands identified as planned are targets, not claims about the repository's
current state.

## Production deployment

The Node.js service should listen on a private/local port. The Ubuntu web server
terminates HTTPS and reverse-proxies the dedicated application domain:

```text
https://ppm.w3nsolution.com/
```

HTML, CSS, JavaScript, API routes, Google origin configuration, and WebSocket traffic
are served from this independent host without a `/ProjectManagementPannel/` prefix.
Production requirements:

- `PRODUCTION_TYPE=release` and production secrets supplied outside source control;
- a process supervisor such as systemd;
- HTTPS-only secure, HTTP-only, SameSite session cookies;
- reverse-proxy support for WebSocket upgrade headers;
- structured logs, health checks, graceful shutdown, and database timeouts;
- backups/export policy and a tested restore procedure;
- no public static access to `sdks`, `.env`, config files, logs, or server source.

## Documentation convention

The root `README.md` is the product and integration overview. The root
`GOAL_BLUEPRINT.md` is the implementation contract: architecture, permissions, data
model, phases, tests, and acceptance criteria. When implementation begins, detailed
API or operational material should live under `docs/` and be linked from here.
