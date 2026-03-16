# SQL Deployment Portal — Feature Tracker

## Vision
Self-service portal where analysts write SQL, submit for review, and promote through
Dev → QA → Prod without thinking about Git or branches. Airflow handles execution
against Snowflake. Git is the audit trail — invisible to analysts.

---

## Built

### Core
- [x] FastAPI backend + React/Vite frontend in Docker Compose
- [x] JWT session management (8hr expiry, localStorage)
- [x] Team isolation — each team has its own folder in the git repo
- [x] File browser with folder tree (schema_table_ddls/bronze/silver/gold, views, procedures, alter_ddls, sql_scripts)
- [x] Monaco SQL editor with subfolder selector and file templates
- [x] SQL linter in alter_ddls/ folder (flags non-idempotent ALTERs, DROP TABLE, TRUNCATE)
- [x] Git-backed file save/delete (commit per save, author tracked)
- [x] Mock Airflow client (simulates DAG runs with task-level progress)
- [x] Deployment history panel

### Named Users + Login
- [x] Users defined in teams.yaml with username/password/display_name (no role field)
- [x] Team auto-resolved from username on login — no team dropdown
- [x] Returning user one-click sign-in (JWT stored in localStorage)
- [x] "Not you?" link clears session and shows full login form
- [x] Fallback: if no users configured, old behaviour applies (any username accepted)

### File Locking
- [x] Lock acquired when analyst opens a file in the editor
- [x] Lock released when file is saved/closed or tab navigates away
- [x] Heartbeat every 5 minutes keeps lock alive while actively editing
- [x] Locks auto-expire after 30 minutes (handles browser crashes)
- [x] File browser shows 🔒 badge with editor's name on locked files
- [x] Warning modal if another analyst tries to open a locked file
- [x] Locks are in-memory only — cleared on backend restart

### Promotion Flow
- [x] Dev → QA → Prod pipeline with approval gates
- [x] Analyst selects files + target env + optional notes → submits for review
- [x] Mock mode: auto-approves after 30s, or manual Approve button in UI
- [x] GitHub mode: creates real PRs on submit, polls for merge (PROMOTION_MODE=github)
- [x] CODEOWNERS auto-assigns team members as PR reviewers (GitHub email notification)
- [x] Once PR merged: Deploy button appears automatically
- [x] Deploy triggers Airflow DAG for target environment with full Snowflake context
- [x] Promotion state persisted to `.portal/promotions.json`, committed to git on every change
- [x] Raw Deploy tab removed — Promote is the only deployment path

### Approval Model (flat)
- [x] Anyone on the team can approve a promotion — no lead/analyst roles
- [x] Submitter cannot approve their own submission (enforced at API level)
- [x] UI shows "Waiting for a teammate to approve" to the submitter
- [x] UI shows Approve button to all other team members

### Scheduling (procedures and sql_scripts)
- [x] Schedule toggle shown when a procedure or sql_script is selected for promotion
- [x] Options: hourly, daily (pick time), weekly (pick day + time), custom cron expression
- [x] Schedule pill shown on active review cards
- [x] Schedule passed to Airflow in DAG payload (cron expression in `conf.schedule`)

### Meaningful DAG / Run IDs
- [x] DAG run IDs constructed as: `portal__{team}__{folder}__{filename}__{env}__{timestamp}`
- [x] Easy to find specific deployments in the Airflow UI
- [x] Full Snowflake context (database, schema, warehouse, role) sent per environment

### Per-Environment Snowflake Config
- [x] Each team has separate database/schema/warehouse/role per env in teams.yaml
- [x] Dev saves use TEAM_A_DEV_ROLE + TEAM_A_DEV schema
- [x] QA deploys use TEAM_A_QA_ROLE + TEAM_A_QA schema
- [x] Prod deploys use TEAM_A_PROD_ROLE + TEAM_A_PROD schema

### GitHub Integration
- [x] Real GitHub PR creation on promotion submit (develop → qa, qa → main)
- [x] PR reviewers auto-requested (teammates get email notifications)
- [x] Portal polls GitHub PR status — detects merge and auto-approves
- [x] Branch protection on qa and main (require PR + 1 review + CODEOWNERS)
- [x] CODEOWNERS file maps team folders to GitHub usernames
- [x] Existing open PR reused if one already exists for the same branch pair

### Medallion Architecture Folder Naming
- [x] schema_table_ddls/bronze — raw/landing layer CREATE TABLE statements
- [x] schema_table_ddls/silver — cleaned/conformed layer CREATE TABLE statements
- [x] schema_table_ddls/gold — business/reporting layer CREATE TABLE statements
- [x] alter_ddls — numbered ALTER statements (replaces "migrations")
- [x] sql_scripts — one-off and scheduled scripts

---

## Planned (Priority Order)

### 1. Security Hardening
- [ ] Rate limiting on `/auth/login` — prevent brute force attacks
- [ ] Warn on startup if `JWT_SECRET` is still the default dev value
- [ ] Move passwords out of teams.yaml into env vars or secrets manager
- **Effort:** small

### 2. SSO / OAuth Login
- [ ] Wire backend auth_mode=oauth to a real IdP (Okta / Azure AD / Google)
- [ ] Analysts log in with existing company accounts — no new passwords
- [ ] Backend scaffold already exists in `auth.py`
- **Needs:** IdP details (provider, client ID, tenant ID)

### 3. Audit Log UI
- [x] promotions.json committed to git on every state change (submit/approve/deploy)
- [ ] UI panel showing git log for the team's folder (who saved what, when)
- **Note:** Git is the audit trail — no separate database needed

### 4. Deploy Status in Promote Tab
- [ ] After clicking Deploy, show Airflow run status inline (no need to switch to History tab)
- [ ] Green checkmark on success, red X with error message on failure
- [ ] Poll existing `/status/{run_id}` endpoint from PromotionPanel
- **Effort:** small

### 5. Slack Notifications
- [ ] "Alice submitted users.sql for QA review" → pings team channel
- [ ] "QA deploy succeeded" → notify analyst
- [ ] Needs: Slack webhook URL per team (add to teams.yaml)
- **Effort:** small

### 6. Environment Diff View
- [ ] "These 3 files are in QA but not yet in Prod" — show pending changes per stage
- [ ] Helps reviewers know exactly what's waiting for sign-off
- **Effort:** medium

### 7. Rollback
- [ ] One-click revert of last deploy per environment
- [ ] Reverts the git commit and re-runs the previous version via Airflow
- **Effort:** medium

### 8. Schema Browser (optional, later)
- [ ] Read-only Snowflake connection to browse existing tables/columns
- [ ] Autocomplete in SQL editor (table names, column names)
- [ ] Decision: NOT adding until analysts ask for it
  - Adds credential management + Snowflake cost (warehouse spin-up per query)

---

## Architecture Summary

| Layer | Tech | Current Mode |
|---|---|---|
| Frontend | React 18 + Vite + Monaco Editor | http://localhost:5173 |
| Backend | FastAPI (Python) | http://localhost:8000 |
| Auth | mock / jwt / oauth (AUTH_MODE) | mock |
| Git | local / remote (GIT_MODE) | remote (develop branch) |
| Airflow | mock / live (AIRFLOW_MODE) | mock |
| Promotion | mock / github (PROMOTION_MODE) | github |

## Folder Convention
```
{team-folder}/
  schema_table_ddls/bronze/ — raw/landing layer CREATE TABLE statements
  schema_table_ddls/silver/ — cleaned/conformed layer CREATE TABLE statements
  schema_table_ddls/gold/   — business/reporting layer CREATE TABLE statements
  views/                    — CREATE OR REPLACE VIEW (idempotent)
  procedures/               — CREATE OR REPLACE PROCEDURE (schedulable)
  alter_ddls/               — numbered ALTERs (001_, 002_...) — linter enforced
  sql_scripts/              — one-off/dev scripts (schedulable)
```

## Branch Structure
```
develop  ← all portal saves land here
   ↓  PR (portal creates on promotion submit)
qa       ← peer-reviewed, approved for QA
   ↓  PR (portal creates on promotion submit)
main     ← production
```
