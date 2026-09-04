# Website Deployment Runbook

Read this file to configure deployment or deploy when the owner requests it.
Each website has its own runtime and deployment method. Never assume a
`dev-server.mjs` file, Node.js backend, or build command exists.

## First Setup: Ask The Owner

Inspect package scripts, framework configuration, deployment scripts, and
service/Docker configuration first. Then ask only for missing information,
grouped into one short message:

1. What is the project name and local project folder?
2. What is the production IP/hostname, SSH username, and SSH port?
3. What is the full production website folder and live URL?
4. Do you use an SSH key, SSH agent, or password? For a key, what is its local path? Enter passwords through an authentication prompt.
5. How is the app started/restarted: static hosting, PM2, systemd, Docker Compose, hosting platform, or a custom command? What is the existing app/service name or command?
6. Does it require a build, where does that run, and which output folder is uploaded? You may answer "detect from project."
7. Which server folders/files contain uploads, environment settings, databases, or other data that must be preserved?
8. Which pages or health endpoint should be checked?
9. What was last deployed (commit or file manifest), or which files should this deployment include?

Update the configuration using the owner's answers and verified settings.
Use `ASK_OWNER` for unresolved required values and `NONE` for inapplicable
settings. Do not guess a production target or launch command. Do not ask again
for known values unless they conflict with the actual project/server.

For another website, replace all project-specific values below before deploying.

## Owner Configuration

| Setting | Current Value |
| --- | --- |
| Project name | Project Management Panel |
| Local project path | `C:\Users\siddi\OneDrive\Desktop\Project-Management-Pannel` |
| Production IP/hostname | `46.101.160.214` |
| SSH username | `root` |
| SSH port | `22` |
| Authentication method | Password prompt; use SSH key/agent if configured |
| SSH private key path | `NONE` |
| Password source | Interactive authentication prompt; never store passwords here |
| Production website path | `/var/www/pmp.w3nsolution.com` |
| Production URL | `https://pmp.w3nsolution.com` |
| Project type | Static frontend served by a Node.js backend |
| Validation/build command | `npm run build` (this project's script validates files) |
| Build location | Local project folder |
| Build output folder | `NONE`; current project serves source files |
| Upload mode | Changed application source files with their relative paths |
| Dependency install command | `NONE` currently; inspect manifests/lockfiles when dependencies change |
| Runtime working directory | `/var/www/pmp.w3nsolution.com` |
| Restart method | Direct Node process; verify existing launch environment on server |
| Managed app/service name | `NONE` |
| App start command | `npm start`; current package.json resolves to `node scripts/dev-server.mjs` |
| Restart command | Establish from existing server launch configuration; ask owner if unresolved |
| Backend entry point | `scripts/dev-server.mjs` for this project only |
| App log file | `/var/www/pmp.w3nsolution.com/pmp-server.log` |
| Runtime port/environment source | Inspect existing process/service without printing secrets |
| Health check paths | `/`, `/attendance`, `/tasks` on the production URL |
| Last successful deployment baseline | Unknown; compare candidate files with production |
| Backup location | Unique deployment folder outside the served directory; resolve before upload |
| Additional preserved server paths | Identify runtime data/uploads from app configuration before deployment |

Default upload exclusions: `.git/`, `node_modules/`, `.env`, `.env.*`,
private keys, logs, caches, deployment archives, and this runbook.
Preserve remote uploads, databases, and runtime-generated data.

## Selecting Start And Restart Commands

Read the actual project configuration. A backend might use `server.js`,
`app.js`, compiled output, Python, PHP, or another runtime. A static website
may need no backend. The start command is needed only for direct process
launches; managed services use their existing launch configuration.

| Existing Setup | Deployment Restart Behavior |
| --- | --- |
| Static content served by Nginx/Apache | Usually no restart for content changes |
| PM2 | `pm2 restart <verified-app-name>` as the owning user |
| systemd | `sudo systemctl restart <verified-service-name>` |
| Docker Compose | Follow the existing compose service and image/build workflow |
| Direct Node/Python/other process | Preserve environment, port, runtime, user and working directory; stop only the verified app PID and start with its configured command |
| Managed hosting | Use the project's existing platform deployment workflow |

These are examples, not commands to execute unchanged. Do not use broad
process kills or reboot the droplet for an app deployment. Use an existing
process manager instead of starting a duplicate process.

## When The Owner Says "Deploy Updated Files"

1. Read configuration and resolve required unknowns. The deployment request authorizes the configured target; avoid another generic confirmation.
2. Identify application changes relative to the last successful deployment, including committed, staged, unstaged and untracked files.
3. Give a short update naming the target and intended files. Preserve unrelated local changes.
4. Run relevant configured validation/build. For compiled frontends, deploy the required generated assets and entry files, not source edits alone. Stop on validation failure.
5. Verify the remote destination and existing process/service. Back up files being replaced outside the served directory and record newly added files for rollback.
6. Batch-upload required application files or artifacts while preserving relative paths. Stage transfers before replacement. Use the existing atomic release-switch workflow if available; in-place multi-file replacement is not atomic.
7. Install dependencies only when required by changed manifests/lockfiles and the deployment method. Use a known procedure and database backup for migrations; ask if that procedure is missing.
8. Restart/reload only the affected app when required. Static-only updates usually need no restart.
9. Verify remote file content/hashes, live HTTP responses, expected changed content, and application health. An upload alone is not proof of success.
10. Record the successful deployment baseline and report uploaded files/artifacts, restart status, and verification results. On failure, report the failed step and restore affected application files/start configuration from backup when feasible.

## Finding Changed Files

Start with:

```powershell
git status --short
git diff --name-status
git diff --cached --name-status
git ls-files --others --exclude-standard
```

When a verified deployed commit exists, also compare it with HEAD:

```powershell
git diff --name-status <last-deployed-commit> HEAD
```

A clean working tree does not prove production is current. With an unknown
baseline, compare candidate application hashes with production or ask for
scope. If the owner explicitly requests only uncommitted changes, use that scope.

Review deletions and renames separately. Remove remote files only when their
deletion is part of the intended deployment and they are application-owned
files inside the verified target. Never mirror-delete runtime data.

Record date, target, uploaded paths/hashes, backup location, restart method,
and verification results after success. Record a commit only when it accurately
represents the deployment; partial/uncommitted deploys need a file/hash manifest.

## Transfer Examples

Substitute verified configuration values and quote paths for the shell in use:

```powershell
scp -P PORT -i "KEY_PATH" "LOCAL_FILE" USER@HOST:/VERIFIED/REMOTE/FILE
ssh -p PORT -i "KEY_PATH" USER@HOST
Invoke-WebRequest -Uri "https://example.com/changed-page" -UseBasicParsing
```

Omit `-i` for agent/password authentication. Never place passwords in command
arguments, tracked files, logs, or responses. Batch several files through one
SFTP connection or a manifest-based archive. Keep SSH host-key checking enabled.

## Owner Commands

- "Read DEPLOYMENT_RUNBOOK.md and set up deployment for this website." Inspect the project, ask for missing owner data, and update this file. Setup alone does not deploy.
- "Read DEPLOYMENT_RUNBOOK.md and deploy updated files." Execute the configured procedure and verify production.
- "Update the production server/path/start command in DEPLOYMENT_RUNBOOK.md." Update the settings; deploy only when requested.

## Last Deployment Record

- Date: 2026-09-04, approximately 12:21 UTC.
- Target: `46.101.160.214:/var/www/pmp.w3nsolution.com`.
- Scope: partial deployment of `public/js/reports-attendance.js` only, showing other members' attendance status and login details.
- Deployed SHA256: `6c9925e26de54c893ef4f8b1be1fccd2b1c52fb7933a66abb923cf12ced7c925`.
- Previous file backup: `/var/backups/pmp-attendance-20260904-1220/reports-attendance.js`.
- Restart: unnecessary; static JavaScript is read from disk for requests.
- Verification: public JavaScript URL returned HTTP 200 and matched the deployed SHA256; `/`, `/attendance`, and `/tasks` returned HTTP 200.
- Baseline applies only to this file; other files were not deployed or assigned a new baseline.
