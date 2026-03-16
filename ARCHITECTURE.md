# SQL Deployment Portal — Architecture & Technical Reference

## Table of Contents
1. [Overview](#overview)
2. [How to Run](#how-to-run)
3. [Technology Stack](#technology-stack)
4. [Portal Sections — What Each Does](#portal-sections)
5. [Save Mechanism — How a File Save Works](#save-mechanism)
6. [Authentication — How It Works](#authentication)
7. [Teams — How They Work](#teams)
8. [Git — How Files Are Stored](#git)
9. [File Locking](#file-locking)
10. [Promotion Flow (Dev → QA → Prod)](#promotion-flow)
11. [Airflow Integration](#airflow-integration)
12. [Configuration Reference](#configuration-reference)
13. [How To — Common Tasks](#how-to)

---

## Overview

A self-service SQL deployment portal for data analysts. Analysts write SQL in
a browser-based editor, save it to Git, and promote it through Dev → QA → Prod
with approval gates. Airflow handles execution against Snowflake. Git is the
audit trail. Analysts never need to know Git exists.

```
Browser (React)
    ↕ REST API (JWT auth)
FastAPI Backend
    ↕                    ↕
Git Repo            Airflow DAG
(develop branch)   (runs SQL on Snowflake)
    ↕
GitHub PRs
(develop → qa → main)
```

---

## How to Run

```bash
# Start everything
docker-compose up --build

# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# API docs (debug mode only): http://localhost:8000/docs

# Restart backend after config changes
docker-compose restart backend

# Recreate backend to pick up docker-compose.yml env var changes
docker-compose up -d backend

# View backend logs
docker-compose logs -f backend
```

**Test users:**
| Username | Password | Team | GitHub |
|---|---|---|---|
| alice | password | Team Alpha | dsaipg |
| bob | password | Team Alpha | cldpd-code |
| rita | password | Team Beta | — |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Monaco Editor (VS Code editor in browser) |
| Backend | FastAPI (Python), Pydantic, GitPython |
| Auth | JWT tokens (JSON Web Tokens), signed with HS256 |
| Git | Local volume (dev) or remote GitHub repo (prod) |
| Airflow | Mock simulation (dev) or real Airflow REST API (prod) |
| Promotion | Mock auto-approval (dev) or real GitHub PRs (prod) |
| Container | Docker Compose |

---

## Portal Sections

### Files Tab
Where analysts browse and open SQL files.

**What it shows:**
- Left pane: folder tree of all subfolders (schema_table_ddls, views, procedures, etc.)
- Right pane: files in the selected folder, sorted by name
- Each file shows: name, size, last commit message, last commit author
- Lock badge (🔒 Name) if another analyst is currently editing the file

**How it works:**
- Calls `GET /files` on load and whenever switching folders
- Backend calls `git pull` first (in remote mode) so the list is always fresh from GitHub
- Clicking a file navigates to the Editor tab with that file loaded

**Team isolation:** Alice only sees `team-a/` files. Rita only sees `team-b/` files.
This is enforced by the JWT — the backend reads `team_folder` from the token and
never looks outside that folder.

---

### Editor Tab
Where analysts write and save SQL.

**What it shows:**
- Monaco Editor (same engine as VS Code) with SQL syntax highlighting
- Subfolder dropdown — where in the folder structure to save
- Filename field
- Save button
- SQL linter warnings/errors (inline, for `alter_ddls/` files only)
- SQL template picker (Create Table, Add Column, Create View, etc.)

**How it works:**
- Opening a file: loads content via `GET /files/{path}` and acquires a file lock
- Editing: fully client-side, no API calls until Save
- Save: see [Save Mechanism](#save-mechanism) below
- Closing: releases the file lock via `DELETE /locks/{path}`

---

### Promote Tab
Where analysts submit files for deployment review and track approvals.

**What it shows:**
- **Dev pipeline**: files available to promote to QA (all files in the team's repo)
- **QA pipeline**: files available to promote to Prod (files previously deployed to QA)
- **Active Reviews**: open promotion requests with their current status
- Each request shows: files, submitter, submission time, PR link (GitHub mode), schedule (if set)
- Approve/Deploy buttons depending on status and who's logged in

**How it works:**
- Submit promotion → `POST /promotion/submit` → creates GitHub PR (in github mode)
- Poll for status → `GET /promotion/requests` → backend polls GitHub PR merge status
- Approve → `POST /promotion/approve` → any teammate except the submitter can approve
- Deploy → `POST /promotion/deploy` → triggers Airflow DAG run

**Scheduling (procedures and sql_scripts only):**
- Before submitting, analyst can attach a cron schedule
- Options: hourly, daily (pick time), weekly (pick day + time), or custom cron expression
- Schedule is passed to Airflow in the DAG payload so Airflow can set up recurring runs

---

### History Tab
Shows past deployment runs and their Airflow status.

**What it shows:**
- Each deployment: team, environment, files, triggered by, trigger time, Airflow status
- Status is polled live every few seconds while a run is in progress

**How it works:**
- Calls `GET /deploy/history` on load
- For in-progress runs, polls `GET /status/{run_id}` until terminal state (success/failed)

---

## Save Mechanism

This is the full journey of a file save from the analyst's browser to GitHub.

### Step-by-Step

```
1. Analyst edits SQL in Monaco Editor (browser)

2. Clicks "Save"

3. Browser sends:
   POST /files
   Authorization: Bearer <jwt>
   {
     "filename": "v_active_users.sql",
     "subfolder": "views",
     "content": "CREATE OR REPLACE VIEW..."
   }

4. Backend (FastAPI):
   a. Validates JWT — reads team_folder ("team-a") and display_name ("Alice Chen")
   b. Validates filename (safe characters, must end in .sql)
   c. Resolves full path: /app/repo/team-a/views/v_active_users.sql
   d. Checks no path traversal (e.g. ../../etc/passwd rejected)
   e. Writes file content to disk

5. Backend (GitPython):
   a. git add team-a/views/v_active_users.sql
   b. git commit -m "update: team-a/views/v_active_users.sql by Alice Chen"
      author = Alice Chen (from JWT)
      committer = sql-portal-bot (service account)
   c. git push origin develop   ← pushes to GitHub

6. Backend returns:
   {
     "path": "team-a/views/v_active_users.sql",
     "commit_sha": "b2f913ab...",
     "message": "File 'views/v_active_users.sql' saved successfully."
   }

7. Browser shows success toast with the commit SHA
```

### What the Branch Structure Means

```
develop  ← all analyst saves land here (working branch)
    ↓  GitHub PR (portal creates this when promotion to QA is submitted)
qa       ← code that has been peer-reviewed and approved for QA
    ↓  GitHub PR (portal creates this when promotion to Prod is submitted)
main     ← production-grade code
```

Every save goes to `develop`. It never goes to `qa` or `main` directly.
Promotion (via PR merge) is the only way code moves up the chain.

### Git Commit Details

| Field | Value | Source |
|---|---|---|
| Author name | Alice Chen | JWT `display_name` |
| Author email | alice@company.com | JWT or fallback |
| Committer name | sql-portal-bot | `GIT_SERVICE_ACCOUNT_USER` env var |
| Committer email | sql-portal@company.com | `GIT_SERVICE_ACCOUNT_EMAIL` env var |
| Branch | develop | `GIT_BRANCH` env var |
| Remote | origin | GitHub repo set in `GIT_REPO_URL` |

The separation of **author** (the analyst) and **committer** (the bot) means
`git log --author="Alice Chen"` always shows Alice's work, even though the
bot is doing the actual push.

### Why develop → qa → main (not direct to main)

| Branch | Who puts code there | How |
|---|---|---|
| `develop` | Portal (on every save) | git commit + push |
| `qa` | GitHub PR merge | PR from develop → qa, merged by a reviewer |
| `main` | GitHub PR merge | PR from qa → main, merged by a reviewer |

This means:
- **QA** always has code that at least one other teammate approved
- **Production (main)** always has code that passed through QA approval first
- The PR review on GitHub is the audit gate — approver is recorded in Git history forever

### Branch Protection (set up on GitHub)

Both `qa` and `main` branches have:
- **Require pull request before merging** — no direct pushes allowed
- **Require 1 approving review** — CODEOWNERS are auto-assigned as reviewers
- **Dismiss stale reviews** — approval is invalidated if new commits are pushed

CODEOWNERS (`/CODEOWNERS` in repo root):
```
team-a/**    @dsaipg @cldpd-code    ← alice or bob must review team-a files
team-b/**    @dsaipg                ← alice reviews team-b (until rita gets GitHub)
```

### What Happens if the Save Fails

| Failure point | What happens |
|---|---|
| Network error | Browser shows error toast, no commit made |
| Filename invalid | Backend returns 400 before touching disk |
| Path traversal attempt | Backend returns 400 |
| Git commit fails | Exception raised, backend returns 500, file written to disk but not committed |
| Git push fails | Exception raised, file committed locally but not on GitHub |

---

## Authentication

### What is a JWT?
A JWT (JSON Web Token) is a signed string that proves who you are. Think of it
like a wristband at a concert — you get it once at login and it lets you in
everywhere without showing ID again.

### Login Flow
```
1. Alice enters username + password on the login screen
2. Backend checks config/teams.yaml — finds alice, verifies password
3. Backend creates a JWT containing:
     { username: "alice", display_name: "Alice Chen",
       team_id: "team_a", team_folder: "team-a",
       expires: "8 hours from now" }
4. JWT is signed with JWT_SECRET (set in docker-compose.yml)
5. JWT sent to browser, stored in localStorage
6. Every API call attaches it: Authorization: Bearer eyJhbGci...
7. Backend reads JWT, trusts it — no database lookup needed
```

### Why It's Secure
- JWT is **cryptographically signed** — if anyone tampers with it
  (e.g. tries to change `team_a` to `team_b`), the signature breaks
  and the backend rejects it with 401
- Expires after 8 hours — user must log in again
- The user never sees or handles the JWT — it's automatic

### Returning User Experience
1. Alice logs in for the first time — enters username + password
2. JWT stored in browser localStorage
3. Next visit — portal shows: **"Welcome back, Alice Chen / Team Alpha"**
   with a one-click **Sign in** button — no credentials re-entered
4. **"Not you?"** link clears localStorage and shows the full login form
5. If JWT has expired (after 8 hours) — full login form shown automatically

### Auth Modes (set AUTH_MODE in docker-compose.yml)
| Mode | Description |
|---|---|
| `mock` | Username/password checked against teams.yaml users list |
| `jwt` | Validates a Bearer JWT from an external IdP (Okta, Azure AD) |
| `oauth` | Full OAuth 2.0 PKCE flow (scaffold in place, needs IdP wiring) |

---

## Teams

### How Teams Are Configured
Everything is in `config/teams.yaml`. No code changes needed to add a team.

```yaml
teams:
  - id: team_a
    name: "Team Alpha"
    folder: "team-a"
    airflow_dag_id: "sql_deploy_dag"
    snowflake:
      dev:
        database: "ANALYTICS_DB"
        schema: "TEAM_A_DEV"
        warehouse: "TEAM_A_WH"
        role: "TEAM_A_DEV_ROLE"
      qa:
        database: "ANALYTICS_DB"
        schema: "TEAM_A_QA"
        warehouse: "TEAM_A_WH"
        role: "TEAM_A_QA_ROLE"
      prod:
        database: "ANALYTICS_DB"
        schema: "TEAM_A_PROD"
        warehouse: "TEAM_A_WH"
        role: "TEAM_A_PROD_ROLE"
    users:
      - username: alice
        display_name: "Alice Chen"
        password: "password"
        github_username: "dsaipg"
```

### Per-Environment Snowflake Config
Each team has separate Snowflake database, schema, warehouse, and role for each
environment. When a deployment is triggered, the portal reads the correct config
for the target environment and passes it to Airflow. This means:
- Dev deployments run under `TEAM_A_DEV_ROLE` against `TEAM_A_DEV` schema
- QA deployments run under `TEAM_A_QA_ROLE` against `TEAM_A_QA` schema
- Prod deployments run under `TEAM_A_PROD_ROLE` against `TEAM_A_PROD` schema

### Team Isolation
Each team has its own subfolder in the git repo:
```
repo/
  team-a/          ← Alice and Bob see only this
    schema_table_ddls/bronze/
    schema_table_ddls/silver/
    schema_table_ddls/gold/
    views/
    alter_ddls/
    procedures/
    sql_scripts/
  team-b/          ← Rita sees only this
    schema_table_ddls/bronze/
```

Isolation is enforced at two levels:
1. **JWT token** — login bakes `team_folder: "team-a"` into the token
2. **Backend** — every file operation is scoped to `user.team_folder` from
   the JWT; the backend never reads outside this folder

### Approval Model (flat)
There are no roles. Any team member can approve a promotion request,
**except the person who submitted it**. This is enforced at the API level
(`/promotion/approve` checks `submitted_by != current user`).

---

## Git

### How Files Are Stored
All SQL files are committed to a git repository. Every save is a git commit
with the analyst's name as the author.

```
repo/
  team-a/
    schema_table_ddls/bronze/raw_events.sql
    schema_table_ddls/silver/events.sql
    schema_table_ddls/gold/revenue_summary.sql
    views/v_active_users.sql
    procedures/sp_refresh.sql
    alter_ddls/001_add_segment.sql
    sql_scripts/seed_dev.sql
  team-b/
    ...
  .portal/
    promotions.json    ← promotion state, also committed to git
```

### Git Modes (set GIT_MODE in docker-compose.yml)
| Mode | Description |
|---|---|
| `local` | Uses a Docker volume (`git-repo`). Files persist across restarts. Good for dev. |
| `remote` | Clones a real GitHub repo on startup. Pulls before reads, pushes after writes. |

### Branch Initialisation (remote mode)
On backend startup, `init_repo()` runs:
1. If `.git` does not exist → `git clone` the repo at `GIT_BRANCH`
2. If `.git` exists → `git fetch` + `git checkout -B <branch> origin/<branch>`
   This ensures the local repo is always on the correct branch with upstream
   tracking set — even if a previous container run left it on a different branch.

### Folder Convention
| Folder | Purpose | Deploy behaviour |
|---|---|---|
| `schema_table_ddls/bronze` | Raw/landing layer `CREATE TABLE` statements | Manual only |
| `schema_table_ddls/silver` | Cleaned/conformed layer `CREATE TABLE` statements | Manual only |
| `schema_table_ddls/gold` | Business/reporting layer `CREATE TABLE` statements | Manual only |
| `views/` | `CREATE OR REPLACE VIEW` — idempotent | Safe to always run |
| `procedures/` | `CREATE OR REPLACE PROCEDURE` — supports scheduling | Safe to always run |
| `alter_ddls/` | Numbered `ALTER` statements — run once in order | Run once |
| `sql_scripts/` | One-off scripts — supports scheduling | Manual / scheduled |

### SQL Linter (alter_ddls/ only)
The editor automatically lints SQL in the `alter_ddls/` folder:
| Rule | Severity | Reason |
|---|---|---|
| `ADD COLUMN` without `IF NOT EXISTS` | Error | Will crash on re-run |
| `DROP TABLE` | Error | Destructive |
| `TRUNCATE` | Error | Wipes all data |
| `DROP COLUMN` | Warning | Irreversible |
| `RENAME COLUMN` | Warning | Breaks downstream views |
| `CREATE TABLE` without `IF NOT EXISTS` | Warning | Belongs in `schema_table_ddls/` |

---

## File Locking

Prevents two analysts editing the same file at the same time.

### How It Works
```
1. Alice opens v_active_users.sql in the editor
2. Editor immediately calls POST /locks/views/v_active_users.sql
3. Lock created: { file: "...", locked_by: "Alice Chen", expires: "+30 min" }
4. Bob opens Files tab — sees 🔒 Alice Chen next to v_active_users.sql
5. Bob clicks Open → warning modal: "Alice Chen is editing this"
6. Bob can open anyway (with conflict warning) or wait
7. Alice saves and closes → editor calls DELETE /locks/...
8. Lock released — file shows as available again
```

### Lock Expiry
- Locks auto-expire after **30 minutes** of inactivity
- The editor sends a **heartbeat every 5 minutes** to keep the lock alive
  while actively editing
- If Alice's browser crashes, the lock expires automatically — Bob can
  open the file after 30 minutes without anyone needing to do anything

### Lock Storage
Locks are **in-memory only** — they don't persist across backend restarts.
This is intentional: a restart clears all locks, which is the safest default.

---

## Promotion Flow

Analysts submit SQL files for approval before they're deployed to QA or Prod.
The flow is Dev → QA → Prod with an approval gate at each stage.

### States
```
open → approved → deployed
          ↓
       rejected
```

| State | Meaning |
|---|---|
| `open` | Submitted, waiting for PR review / approval |
| `approved` | PR merged on GitHub — Deploy button appears |
| `deployed` | Airflow DAG triggered, SQL running on target environment |
| `rejected` | PR closed without merge |

### Full End-to-End Flow (GitHub mode)

```
1. Alice edits v_active_users.sql → saves → commit pushed to develop

2. Alice goes to Promote tab → selects file → clicks Submit (Dev → QA)
   Portal creates GitHub PR: develop → qa
   Portal requests Bob as reviewer (GitHub sends Bob an email)

3. Bob reviews the PR on GitHub → clicks Approve + Merge

4. Portal polls GitHub every ~3 seconds
   Detects PR merged → marks promotion as "approved"

5. Alice sees Deploy button appear → clicks Deploy
   Portal calls Airflow: "run sql_deploy_dag for team_a, QA env"
   Airflow fetches the file from git, runs it against TEAM_A_QA schema

6. Alice repeats for QA → Prod:
   Portal creates PR: qa → main
   Same review + merge flow
   Airflow runs against TEAM_A_PROD schema
```

### Mock Mode (default for dev)
- Submissions auto-approve after **30 seconds**
- Analyst can also click "Approve" immediately in the UI
- No GitHub needed

### GitHub Mode
Set in `docker-compose.yml`:
```yaml
PROMOTION_MODE: "github"
GITHUB_TOKEN: "ghp_your_token_here"
GITHUB_REPO: "your-org/your-repo"
```
- Submitting creates a real GitHub Pull Request
- Teammates listed in CODEOWNERS are auto-assigned as reviewers
- When the PR is merged on GitHub, portal detects it and auto-approves
- If PR is closed without merging, portal marks the request as rejected

### Audit Trail
Every state change (submit, approve, deploy) is committed to git as a change
to `.portal/promotions.json`. Git history = full audit log of who did what when.

---

## Airflow Integration

The portal triggers Airflow DAG runs to actually execute SQL on Snowflake.

### Airflow Modes (set AIRFLOW_MODE in docker-compose.yml)
| Mode | Description |
|---|---|
| `mock` | Simulates DAG runs with fake progress. No Airflow needed. |
| `live` | Calls real Airflow REST API v1. |

### How Airflow Executes SQL (ideal flow)
```
1. Analyst saves file → committed to develop (commit SHA recorded)
2. Promotion submitted → promotions.json records file + commit_sha
3. Teammate approves (PR merged)
4. Deploy clicked → portal calls Airflow REST API with file path + commit SHA
5. Airflow DAG:
   a. git checkout <sha> -- team-a/views/v_active_users.sql
   b. Read file content
   c. Connect to Snowflake using target env credentials (from DAG conf)
   d. Execute SQL against TEAM_A_QA schema
   e. Report success/failure → portal polls /status/{run_id}
```

The commit SHA ensures **exactly the approved version** runs — even if the
file was edited on develop between QA approval and Prod deploy.

### DAG Naming Convention
Run IDs are constructed to make them easy to find in Airflow:
```
portal__team_a__views__v_active_users__qa__2024-01-15T10:30:00
         ↑       ↑          ↑             ↑
       team   folder     filename       environment
```

### DAG Payload
When a deployment is triggered, the portal sends:
```json
{
  "team_id": "team_a",
  "team_folder": "team-a",
  "files": ["views/v_active_users.sql"],
  "commit_sha": "b2f913ab...",
  "environment": "qa",
  "snowflake_database": "ANALYTICS_DB",
  "snowflake_schema": "TEAM_A_QA",
  "snowflake_warehouse": "TEAM_A_WH",
  "snowflake_role": "TEAM_A_QA_ROLE",
  "schedule": "0 9 * * 1",
  "notes": "optional notes"
}
```

### To Connect to Real Airflow
```yaml
AIRFLOW_MODE: "live"
AIRFLOW_BASE_URL: "http://your-airflow:8080"
AIRFLOW_USERNAME: "admin"
AIRFLOW_PASSWORD: "your-password"
AIRFLOW_DEFAULT_DAG_ID: "sql_deploy_dag"
```

---

## Configuration Reference

All settings live in `docker-compose.yml` environment variables.

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | SQL Deployment Portal | Displayed in UI header |
| `DEBUG` | false | Enables `/docs` Swagger UI |
| `AUTH_MODE` | mock | `mock` / `jwt` / `oauth` |
| `JWT_SECRET` | dev-secret | **Change in production** |
| `JWT_EXPIRE_MINUTES` | 480 | Session length (8 hours) |
| `GIT_MODE` | local | `local` / `remote` |
| `GIT_REPO_URL` | — | GitHub repo URL with PAT embedded |
| `GIT_BRANCH` | develop | Working branch — all saves land here |
| `GIT_SERVICE_ACCOUNT_USER` | sql-portal-bot | Git committer name |
| `GIT_SERVICE_ACCOUNT_EMAIL` | sql-portal@company.com | Git committer email |
| `AIRFLOW_MODE` | mock | `mock` / `live` |
| `AIRFLOW_BASE_URL` | http://airflow:8080 | Airflow webserver URL |
| `PROMOTION_MODE` | mock | `mock` / `github` |
| `GITHUB_TOKEN` | — | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | — | e.g. `org/repo` |
| `MOCK_APPROVAL_DELAY_S` | 30 | Seconds until mock auto-approves |
| `TEAMS_CONFIG_PATH` | ../config/teams.yaml | Path to teams config |

---

## How To

### Add a new team
1. Edit `config/teams.yaml` — add a new team block with snowflake env config
2. `docker-compose up -d backend`

### Add a new user
1. Edit `config/teams.yaml` — add under the team's `users:` list
2. `docker-compose restart backend`

### Change a user's password
1. Edit `config/teams.yaml` — update the `password:` field
2. `docker-compose restart backend`

### Connect to a real GitHub repo
1. Create a GitHub PAT with `repo` scope
2. Set `GIT_MODE: "remote"`, `GIT_REPO_URL` (with PAT embedded), `GIT_BRANCH: "develop"`
3. `docker-compose up -d backend` (must recreate, not just restart, to pick up env changes)

### Enable real GitHub PR approvals
1. Create a GitHub PAT with `repo` scope
2. Set `PROMOTION_MODE: "github"`, `GITHUB_TOKEN`, `GITHUB_REPO`
3. Add team members as collaborators on the GitHub repo
4. Set up branch protection on `qa` and `main` (require PR + 1 review)
5. Add a `CODEOWNERS` file at the repo root
6. `docker-compose restart backend`

### Sync develop with main after PR merges
After PRs from develop→qa and qa→main are merged, develop falls behind main.
Run inside the backend container:
```bash
docker exec sql-portal-backend sh -c \
  "cd /app/repo && git fetch origin && git merge origin/main --no-edit && git push origin develop"
```

### Connect to real Airflow
1. Set `AIRFLOW_MODE: "live"` and Airflow credentials in `docker-compose.yml`
2. `docker-compose restart backend`

### View the audit log
```bash
# All promotion history
git log --oneline -- .portal/promotions.json

# All file changes by a specific author
git log --oneline --author="Alice Chen"

# What changed in a specific commit
git show <commit-sha>

# What's on develop but not yet in QA
git log --oneline origin/qa..origin/develop
```

### Force-clear a stuck file lock
Restart the backend — all locks are cleared on restart:
```bash
docker-compose restart backend
```

### Change session length
Set `JWT_EXPIRE_MINUTES` in `docker-compose.yml`. Default is 480 (8 hours).

---

## Key Files

```
backend/
  config.py              — all settings loaded from env vars
  models.py              — Pydantic request/response models
  auth.py                — JWT creation, validation, mock/jwt/oauth login
  git_service.py         — git read/write ops (local + remote modes)
  airflow_client.py      — Airflow mock + live DAG trigger/status
  promotion_service.py   — promotion state machine, GitHub PR integration
  lock_service.py        — in-memory file lock store
  routers/
    auth_router.py       — POST /auth/login, GET /auth/teams
    files_router.py      — GET|POST /files, GET|DELETE /files/{path}
    deploy_router.py     — POST /deploy, GET /deploy/history
    status_router.py     — GET /status/{run_id}
    promotion_router.py  — GET|POST /promotion/*
    lock_router.py       — GET|POST|DELETE|PUT /locks/*

frontend/src/
  App.jsx                — tab routing, session restore
  config.js              — VITE_ env vars
  components/
    Layout.jsx           — top bar + nav tabs
    Login.jsx            — login form + returning user one-click
    FileBrowser.jsx      — folder tree (left) + file list (right) + lock badges
    SqlEditor.jsx        — Monaco editor + SQL linter + subfolder selector
    PromotionPanel.jsx   — Dev→QA→Prod pipeline UI + scheduling toggle
    HistoryPanel.jsx     — deployment history + live Airflow status polling
  api/client.js          — Axios client (authApi, filesApi, deployApi,
                           statusApi, promotionApi, lockApi)

config/
  teams.yaml             — team definitions, users, Snowflake env config, SQL templates

docker-compose.yml       — all environment configuration
FEATURES.md              — product roadmap (what's built, what's planned)
ARCHITECTURE.md          — this file
```
