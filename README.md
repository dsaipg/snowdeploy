# SQL Deployment Portal

A self-service portal for teams to create, manage, and deploy SQL files to Snowflake via Airflow — with full team isolation, Git-backed storage, and SSO auth.

---

## Quick Start (Docker)

```bash
# 1. Clone / download this folder
cd sql-portal

# 2. Start everything
docker-compose up --build

# 3. Open http://localhost:5173
# Login: any username + password (mock mode)
# Select your team from the dropdown
```

---

## Quick Start (Local Dev)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit as needed
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # edit as needed
npm run dev                  # http://localhost:5173
```

---

## Configuration

### Teams (`config/teams.yaml`)

Add or remove teams without touching any code:

```yaml
teams:
  - id: team_a
    name: "Team Alpha"
    folder: "team-a"
    snowflake_schema: "TEAM_A_SCHEMA"
    snowflake_database: "ANALYTICS_DB"
    snowflake_role: "TEAM_A_ROLE"
    airflow_dag_id: "sql_deploy_dag"
    members:
      - "team-a-developers"    # SSO group name
      - "alice@company.com"   # or individual email
```

Add SQL templates in the same file under `sql_templates:`.

---

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `AUTH_MODE` | `mock` | `mock` \| `jwt` \| `oauth` |
| `GIT_MODE` | `local` | `local` \| `remote` |
| `AIRFLOW_MODE` | `mock` | `mock` \| `live` |
| `GIT_REPO_URL` | — | Remote git URL (SSH/HTTPS) |
| `AIRFLOW_BASE_URL` | `http://localhost:8080` | Airflow webserver URL |
| `JWT_SECRET` | ⚠️ change this | JWT signing secret |
| `TEAMS_CONFIG_PATH` | `../config/teams.yaml` | Path to teams config |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend URL |
| `VITE_AUTH_MODE` | `mock` | `mock` \| `oauth` |
| `VITE_STATUS_POLL_MS` | `3000` | Status poll interval (ms) |

---

## Switching to Real Git

1. Set `GIT_MODE=remote` in `backend/.env`
2. Set `GIT_REPO_URL=https://github.com/your-org/sql-repo.git`
3. Ensure the service account has push access to the repo
4. Create team subfolders in the repo: `team-a/`, `team-b/`, etc.

---

## Switching to Real Airflow

1. Set `AIRFLOW_MODE=live` in `backend/.env`
2. Set `AIRFLOW_BASE_URL`, `AIRFLOW_USERNAME`, `AIRFLOW_PASSWORD`
3. Deploy the `sql_deploy_dag` (Airflow DAG — coming soon)
4. Ensure the DAG accepts a `conf` payload:
   ```json
   {
     "team_id": "team_a",
     "team_folder": "team-a",
     "files": ["create_orders.sql"],
     "environment": "dev",
     "snowflake_schema": "TEAM_A_SCHEMA"
   }
   ```

---

## Switching to SSO Auth

### JWT mode (your IdP issues the token externally)

1. Set `AUTH_MODE=jwt`
2. On the frontend login screen, users paste their IdP-issued JWT as the "password"
3. The backend decodes it, reads `email` and `groups` claims, resolves the team

### OAuth mode (full PKCE flow)

1. Set `AUTH_MODE=oauth` and `VITE_AUTH_MODE=oauth`
2. Fill in `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_TOKEN_URL`, `OAUTH_USERINFO_URL`
3. Register `VITE_OAUTH_REDIRECT_URI` with your IdP

---

## Project Structure

```
sql-portal/
├── backend/
│   ├── main.py              FastAPI app entry point
│   ├── config.py            All settings (reads from .env)
│   ├── models.py            Pydantic request/response models
│   ├── auth.py              JWT / SSO / mock auth
│   ├── git_service.py       Git read/write (GitPython)
│   ├── airflow_client.py    Airflow REST client + mock
│   ├── routers/
│   │   ├── auth_router.py   POST /auth/login, GET /auth/teams
│   │   ├── files_router.py  GET/POST/DELETE /files
│   │   ├── deploy_router.py POST /deploy, GET /deploy/history
│   │   └── status_router.py GET /status/{run_id}
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx          Root component + tab routing
│   │   ├── config.js        Frontend config (VITE_ vars)
│   │   ├── api/client.js    Axios API client
│   │   └── components/
│   │       ├── Login.jsx        Login screen
│   │       ├── Layout.jsx       Top bar + nav
│   │       ├── FileBrowser.jsx  Team file list
│   │       ├── SqlEditor.jsx    Monaco SQL editor
│   │       ├── DeployPanel.jsx  Deploy + live status
│   │       └── HistoryPanel.jsx Deployment history
│   ├── package.json
│   └── .env.example
├── config/
│   └── teams.yaml           Team definitions + SQL templates
└── docker-compose.yml
```
