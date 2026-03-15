# SQL Deployment Portal — Feature Tracker

## Vision
Self-service portal where analysts write SQL, submit for review, and promote through
Dev → QA → Prod without thinking about Git or branches. Airflow handles execution
against Snowflake. Git is the audit trail — invisible to analysts.

---

## Built

### Core (Initial)
- [x] FastAPI backend + React/Vite frontend in Docker Compose
- [x] Mock auth (any username/password, team chosen at login)
- [x] JWT session management (8hr expiry, localStorage)
- [x] Team isolation — each team has its own folder in the git repo
- [x] File browser with folder tree (schema_table_ddls/bronze, schema_table_ddls/silver, schema_table_ddls/gold, views, procedures, alter_ddls, sql_scripts)
- [x] Monaco SQL editor with subfolder selector and file templates
- [x] SQL linter in alter_ddls/ folder (flags non-idempotent ALTERs, DROP TABLE, TRUNCATE)
- [x] Git-backed file save/delete (commit per save, author tracked)
- [x] Mock Airflow client (simulates DAG runs with task-level progress)
- [x] Deployment history panel

### Promotion Flow (Mar 2026)
- [x] Dev → QA → Prod pipeline with approval gates
- [x] Analyst selects files + target env + notes → submits for review
- [x] Mock mode: auto-approves after 30s, or manual Approve button
- [x] GitHub mode: creates real PRs, polls for merge (set PROMOTION_MODE=github)
- [x] Once approved: Deploy button triggers Airflow for target environment
- [x] Promotion state persisted to `.portal/promotions.json` in repo dir
- [x] promotions.json committed to git on every state change (full audit trail)
- [x] Removed raw Deploy tab — Promote is the only deployment path

### Named Users + Improved Login (Mar 2026)
- [x] Users defined in teams.yaml with username/password/display_name (no role field)
- [x] Team auto-resolved from username on login — no team dropdown
- [x] Returning user one-click sign-in (JWT stored in localStorage)
- [x] "Not you?" link clears session and shows full login form
- [x] Fallback: if no users configured, old behaviour applies (any username accepted)

### File Locking (Mar 2026)
- [x] Lock acquired when analyst opens a file in the editor
- [x] Lock released when file is saved/closed or tab navigates away
- [x] Heartbeat every 5 minutes keeps lock alive while actively editing
- [x] Locks auto-expire after 30 minutes (handles browser crashes)
- [x] File browser shows 🔒 badge with editor's name on locked files
- [x] Warning modal if another analyst tries to open a locked file
- [x] Locks are in-memory only — cleared on backend restart

---

## Planned (Priority Order)

### 1a. Approval Enforcement — Flat Model (Mar 2026) ✅
- [x] Anyone on the team can approve a promotion — no lead/analyst distinction
- [x] The submitter cannot approve their own submission (enforced at API level)
- [x] UI shows "Waiting for a teammate to approve" to the submitter
- [x] UI shows Approve button to all other team members
- [x] role: field removed from teams.yaml — no role concept in the system

### 1b. Security Hardening
- [ ] Rate limiting on `/auth/login` — prevent brute force attacks
- [ ] Warn if `JWT_SECRET` is still the default dev value on startup
- [ ] Move passwords out of teams.yaml into env vars or secrets manager (before prod)
- **Effort:** small

### 2. SSO / OAuth Login
- [ ] Wire backend auth_mode=oauth to a real IdP (Okta / Azure AD / Google)
- [ ] Analysts log in with existing company accounts — no new passwords
- [ ] Role from SSO groups: analyst vs lead (lead can approve, analyst cannot)
- [ ] Backend scaffold already exists in `auth.py`
- **Needs:** IdP details (which provider? client ID, tenant ID)

### 3. Audit Log
- [x] promotions.json committed to git on every state change (submit/approve/deploy)
- [ ] UI panel showing git log for the team's folder (who saved what, when)
- **Note:** Git is the audit trail — no separate database needed

### 4. Deploy Status in Promote Tab
- [ ] After clicking Deploy, show Airflow run status inline (no need to switch to History)
- [ ] Green checkmark on success, red failure with error message
- [ ] Poll existing `/status/{run_id}` endpoint from PromotionPanel
- **Effort:** small

### 5. Slack Notifications
- [ ] "Alice submitted users.sql for QA review" → pings team lead channel
- [ ] "QA deploy succeeded for team-alpha" → notify analyst
- [ ] Needs: Slack webhook URL per team (add to teams.yaml)
- **Effort:** small

### 6. Environment Diff View
- [ ] "These 3 files are in QA but not yet in Prod" — show pending changes per stage
- [ ] Helps leads know exactly what's waiting for sign-off
- **Effort:** medium

### 7. Rollback
- [ ] One-click revert of last deploy per environment
- [ ] Reverts the git commit and re-runs the previous version via Airflow
- **Effort:** medium

### 8. Scheduled Jobs (Airflow stub → real)
- [ ] "Schedule" toggle on promotion — set cron expression (daily, weekly, hourly, custom)
- [ ] Save schedule metadata to `snowdeploy.yaml` alongside the SQL
- [ ] When Airflow is wired up: reads yaml and creates/updates DAG automatically
- [ ] Show scheduled jobs list with next-run time
- **Effort:** medium (stub is small; real Airflow wiring is larger)

### 9. Schema Browser (optional, later)
- [ ] Read-only Snowflake connection to browse existing tables/columns
- [ ] Autocomplete in SQL editor (table names, column names)
- [ ] Decision: NOT adding this until analysts ask for it
  - Adds credential management + Snowflake cost (warehouse spin-up per query)

---

## Architecture Notes

| Layer | Tech | Mode |
|---|---|---|
| Frontend | React 18 + Vite + Monaco Editor | http://localhost:5173 |
| Backend | FastAPI (Python) | http://localhost:8000 |
| Auth | mock / jwt / oauth (set AUTH_MODE) | currently: mock |
| Git | local / remote (set GIT_MODE) | currently: local |
| Airflow | mock / live (set AIRFLOW_MODE) | currently: mock |
| Promotion | mock / github (set PROMOTION_MODE) | currently: mock |
| Storage | git repo volume + .portal/promotions.json | |

## Key Files
```
backend/
  config.py              — all settings (env vars)
  models.py              — Pydantic models
  auth.py                — JWT + mock/jwt/oauth login
  git_service.py         — git read/write ops
  airflow_client.py      — Airflow mock + live
  promotion_service.py   — promotion state machine
  lock_service.py        — in-memory file locking
  routers/
    auth_router.py
    files_router.py
    deploy_router.py
    promotion_router.py
    lock_router.py
    status_router.py

frontend/src/
  App.jsx                — tab routing
  components/
    Layout.jsx           — top bar + nav tabs
    Login.jsx            — login + returning user
    FileBrowser.jsx      — folder tree + file list + lock badges
    SqlEditor.jsx        — Monaco editor + linter + locking
    PromotionPanel.jsx   — Dev→QA→Prod pipeline UI
    HistoryPanel.jsx     — deployment history
  api/client.js          — Axios API client

config/
  teams.yaml             — team definitions, users, SQL templates
```

## Folder Convention (in git repo)
```
{team-folder}/
  schema_table_ddls/bronze/ — raw/landing layer CREATE TABLE statements
  schema_table_ddls/silver/ — cleaned/conformed layer CREATE TABLE statements
  schema_table_ddls/gold/   — business/reporting layer CREATE TABLE statements
  views/             — CREATE OR REPLACE VIEW
  procedures/        — CREATE OR REPLACE PROCEDURE
  alter_ddls/        — numbered ALTERs (001_, 002_...) — linter enforced
  sql_scripts/           — one-off/dev sql_scripts, never auto-deployed
```
