# Copilot / AI Agent Instructions — SQL Deployment Portal

This file gives actionable, repository-specific guidance for AI coding agents working on this project.

1) Big-picture architecture
- Backend: FastAPI app at `backend/main.py`. Core services:
  - `backend/config.py` loads env settings and `config/teams.yaml`.
  - `backend/git_service.py` enforces team isolation and handles `local` vs `remote` git modes.
  - `backend/airflow_client.py` triggers DAGs and lists run status (supports `mock` and `live`).
  - `backend/auth.py` implements `mock`, `jwt`, and `oauth` modes — use `get_current_user` dependency for auth.
- Frontend: React app in `frontend/` (Vite). API client in `frontend/src/api/client.js` and UI in `frontend/src/components/`.
- Config: `config/teams.yaml` defines teams, folders, SQL templates and is authoritative for access control.

2) Developer workflows & useful commands
- Local quickstart using Docker: `docker-compose up --build` (root README).
- Backend local dev:
  - `cd backend`
  - `python -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - copy `.env.example` → `.env` and set `GIT_MODE`, `AUTH_MODE`, `AIRFLOW_MODE` as needed
  - Run: `uvicorn main:app --reload --port 8000`
- Frontend local dev:
  - `cd frontend && npm install && cp .env.example .env && npm run dev` (default Vite port 5173)

3) Project-specific conventions and patterns
- Team isolation: All file reads/writes go through `backend/git_service.py`. Always validate `team_folder` and filenames with `_validate_filename`.
- Modes feature flags: Many behaviors depend on env flags in `backend/.env` (`AUTH_MODE`, `GIT_MODE`, `AIRFLOW_MODE`). Tests/patches should consider both `mock` and `live` flows.
- Error handling: Routers convert service exceptions into FastAPI `HTTPException` with appropriate status codes (see `routers/*`). Follow existing patterns when adding endpoints.
- Mock implementations: `airflow_client` and `git_service` provide mock flows for local development — prefer using these when writing examples/tests.

4) Integration points to watch
- Git: `gitpython` is optional — `backend/git_service.py` gracefully degrades when not installed (returns `no-git-sha`). For remote mode ensure `gitpython` is present and `GIT_REPO_URL` set.
- Airflow: `airflow_client` expects DAGs to accept a `conf` payload (see README snippet). Live mode uses Airflow REST API v1 endpoints.
- Auth: `jwt` mode currently decodes external JWTs without JWKS verification (TODO: replace with JWKS in prod). Unit tests should mock `decode_token` or use `mock` auth mode.

5) Where to look for examples
- Triggering a deployment: `backend/routers/deploy_router.py` → calls `airflow_client.trigger_dag`.
- File CRUD patterns: `backend/routers/files_router.py` demonstrates reading, saving, and deleting SQL files via `git_service` and mapping errors to HTTP codes.
- App startup lifecycle: `backend/main.py` calls `git_service.init_repo()` in lifespan for repo initialization.

6) Best actionable tips for PRs
- Preserve team isolation: avoid touching file paths outside `team_folder` and use `_validate_filename` logic.
- Config-first: when adding teams or templates, update `config/teams.yaml` (not hard-coded lists).
- Respect modes: add tests or feature flags where behavior differs between `mock` and `live`.

If any section is unclear or you want more examples (HTTP request/response snippets, common test harnesses, or commit-message conventions), tell me which part to expand.
