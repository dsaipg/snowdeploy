# SQL Deployment Portal — Architecture & Technical Reference

## Table of Contents
1. [Overview](#overview)
2. [How to Run](#how-to-run)
3. [Technology Stack](#technology-stack)
4. [Authentication — How It Works](#authentication)
5. [Teams — How They Work](#teams)
6. [Git — How Files Are Stored](#git)
7. [File Locking](#file-locking)
8. [Promotion Flow (Dev → QA → Prod)](#promotion-flow)
9. [Airflow Integration](#airflow-integration)
10. [Configuration Reference](#configuration-reference)
11. [How To — Common Tasks](#how-to)

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
(SQL files)        (runs SQL on Snowflake)
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

# View backend logs
docker-compose logs -f backend
```

**Test users:**
| Username | Password | Team |
|---|---|---|
| alice | password | Team Alpha |
| rita | password | Team Beta |

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
- JWT stored in localStorage survives browser refresh
- On return visit: JWT still valid → one-click "Sign in as Alice"
- JWT expired → full login form shown again
- "Not you?" clears localStorage, shows full form

### Named Users (Mock Mode)
Users are defined directly in `config/teams.yaml`. On login, the backend looks
up the username across all teams and auto-resolves which team they belong to —
no team dropdown on the login screen.

```yaml
users:
  - username: alice
    display_name: "Alice Chen"
    password: "password"    # plaintext OK for dev — use SSO in prod
    role: analyst
```

If no users are configured for a team, the old behaviour applies (any
username/password accepted, team chosen from dropdown). This ensures
backwards compatibility.

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
  - id: team_a                        # internal ID, used in JWT + API
    name: "Team Alpha"                # display name in UI
    folder: "team-a"                  # subfolder in git repo
    snowflake_schema: "TEAM_A_SCHEMA" # Snowflake schema for this team
    snowflake_database: "ANALYTICS_DB"
    snowflake_role: "TEAM_A_ROLE"
    airflow_dag_id: "sql_deploy_dag"
    users:
      - username: alice
        display_name: "Alice Chen"
        password: "password"          # plaintext in dev — use SSO in prod
        role: analyst                 # analyst | lead
      - username: bob
        display_name: "Bob Smith"
        password: "password"
        role: lead
```

### Team Isolation
Each team has its own subfolder in the git repo:
```
repo/
  team-a/          ← Alice and Bob see only this
    tables/core/
    views/
    migrations/
  team-b/          ← Rita sees only this
    tables/core/
```

Isolation is enforced at two levels:
1. **JWT token** — login bakes `team_folder: "team-a"` into the token
2. **Backend** — every file operation is scoped to `user.team_folder` from
   the JWT; the backend never reads outside this folder

### How to Add a New Team
1. Add a block to `config/teams.yaml`
2. Run `docker-compose restart backend`
3. The team's git subfolder is created automatically on first file save

### How to Add a New User
1. Add a user entry under the team's `users:` list in `teams.yaml`
2. Run `docker-compose restart backend`
3. User can log in immediately

### Roles (planned — not yet enforced in UI)
| Role | Permissions |
|---|---|
| `analyst` | Can save files, submit for promotion |
| `lead` | Can approve promotions, deploy to QA and Prod |

---

## Git

### How Files Are Stored
All SQL files are committed to a git repository. Every save is a git commit
with the analyst's name as the author.

```
repo/
  team-a/
    tables/core/users.sql
    tables/staging/stg_events.sql
    views/v_active_users.sql
    procedures/sp_refresh.sql
    migrations/001_add_segment.sql
    scripts/seed_dev.sql
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

### To Connect to a Real GitHub Repo
In `docker-compose.yml`:
```yaml
GIT_MODE: "remote"
GIT_REPO_URL: "https://github.com/your-org/your-sql-repo.git"
GIT_BRANCH: "develop"
```

### Folder Convention
| Folder | Purpose | Deploy behaviour |
|---|---|---|
| `tables/core` | `CREATE TABLE` — production tables | Manual only |
| `tables/staging` | `CREATE TABLE` — staging/landing tables | Manual only |
| `views/` | `CREATE OR REPLACE VIEW` — idempotent | Safe to always run |
| `procedures/` | `CREATE OR REPLACE PROCEDURE` | Safe to always run |
| `migrations/` | Numbered `ALTER` scripts | Run once, in order |
| `scripts/` | One-off dev scripts | Never auto-deploy |

### SQL Linter (migrations/ only)
The editor automatically lints SQL in the `migrations/` folder:
| Rule | Severity | Reason |
|---|---|---|
| `ADD COLUMN` without `IF NOT EXISTS` | Error | Will crash on re-run |
| `DROP TABLE` | Error | Destructive |
| `TRUNCATE` | Error | Wipes all data |
| `DROP COLUMN` | Warning | Irreversible |
| `RENAME COLUMN` | Warning | Breaks downstream views |
| `CREATE TABLE` without `IF NOT EXISTS` | Warning | Belongs in `tables/` |

---

## File Locking

Prevents two analysts editing the same file at the same time.

### How It Works
```
1. Alice opens users.sql in the editor
2. Editor immediately calls POST /locks/tables/core/users.sql
3. Lock created: { file: "...", locked_by: "Alice Chen", expires: "+30 min" }
4. Rita opens Files tab — sees 🔒 Alice Chen next to users.sql
5. Rita clicks Open → warning modal: "Alice Chen is editing this"
6. Rita can open anyway (with conflict warning) or wait
7. Alice saves and closes → editor calls DELETE /locks/...
8. Lock released — file shows as available again
```

### Lock Expiry
- Locks auto-expire after **30 minutes** of inactivity
- The editor sends a **heartbeat every 5 minutes** to keep the lock alive
  while actively editing
- If Alice's browser crashes, the lock expires automatically — Rita can
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
| `open` | Submitted, waiting for approval |
| `approved` | Approved — Deploy button appears |
| `deployed` | Airflow triggered, files running on target environment |
| `rejected` | Rejected by reviewer |

### Mock Mode (default for dev)
- Submissions auto-approve after **30 seconds**
- Analyst can also click "Approve" immediately in the UI
- No GitHub needed

### GitHub Mode (for production)
Set in `docker-compose.yml`:
```yaml
PROMOTION_MODE: "github"
GITHUB_TOKEN: "ghp_your_token_here"
GITHUB_REPO: "your-org/your-repo"
```
- Submitting creates a real GitHub Pull Request
- When the PR is merged on GitHub, the portal detects it and auto-approves
- Deploy button then appears for the analyst

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

### DAG Payload
When a deployment is triggered, the portal sends:
```json
{
  "team_id": "team_a",
  "team_folder": "team-a",
  "files": ["tables/core/users.sql", "views/v_revenue.sql"],
  "environment": "qa",
  "snowflake_schema": "TEAM_A_SCHEMA",
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
| `GIT_REPO_URL` | — | GitHub repo URL (remote mode) |
| `GIT_BRANCH` | main | Branch to commit to |
| `AIRFLOW_MODE` | mock | `mock` / `live` |
| `AIRFLOW_BASE_URL` | http://airflow:8080 | Airflow webserver URL |
| `PROMOTION_MODE` | mock | `mock` / `github` |
| `GITHUB_TOKEN` | — | GitHub PAT (github promotion mode) |
| `GITHUB_REPO` | — | e.g. `org/repo` (github promotion mode) |
| `MOCK_APPROVAL_DELAY_S` | 30 | Seconds until mock auto-approves |
| `TEAMS_CONFIG_PATH` | ../config/teams.yaml | Path to teams config |

---

## How To

### Add a new team
1. Edit `config/teams.yaml` — add a new team block
2. `docker-compose restart backend`

### Add a new user
1. Edit `config/teams.yaml` — add under the team's `users:` list
2. `docker-compose restart backend`

### Change a user's password
1. Edit `config/teams.yaml` — update the `password:` field
2. `docker-compose restart backend`

### Connect to a real GitHub repo
1. Set `GIT_MODE: "remote"` and `GIT_REPO_URL` in `docker-compose.yml`
2. `docker-compose up --build`

### Enable real GitHub PR approvals
1. Create a GitHub Personal Access Token with `repo` scope
2. Set `PROMOTION_MODE: "github"`, `GITHUB_TOKEN`, `GITHUB_REPO`
3. `docker-compose restart backend`

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
    files_router.py      — CRUD /files
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
    FileBrowser.jsx      — folder tree + file list + lock badges
    SqlEditor.jsx        — Monaco editor + linter + lock acquire/release
    PromotionPanel.jsx   — Dev→QA→Prod pipeline UI
    HistoryPanel.jsx     — deployment history
  api/client.js          — Axios client (authApi, filesApi, deployApi,
                           statusApi, promotionApi, lockApi)

config/
  teams.yaml             — team definitions, users, SQL templates

docker-compose.yml       — all environment configuration
FEATURES.md              — product roadmap (what's built, what's planned)
ARCHITECTURE.md          — this file
```
