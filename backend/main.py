"""
main.py — FastAPI application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings, TEAMS, SQL_TEMPLATES
from models import AppConfigResponse, TeamInfo, SqlTemplate
from routers.auth_router import router as auth_router
from routers.files_router import router as files_router
from routers.deploy_router import router as deploy_router
from routers.status_router import router as status_router
import git_service


# ── Startup / Shutdown ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.app_name}...")
    print(f"  auth_mode:    {settings.auth_mode}")
    print(f"  git_mode:     {settings.git_mode}")
    print(f"  airflow_mode: {settings.airflow_mode}")
    print(f"  teams loaded: {[t['id'] for t in TEAMS]}")
    git_service.init_repo()
    yield
    print("Shutting down.")


# ── App ────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Self-service SQL deployment portal — backend API",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,   # hide swagger in prod
    redoc_url="/redoc" if settings.debug else None,
)

# ── CORS ───────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(files_router)
app.include_router(deploy_router)
app.include_router(status_router)


# ── Public endpoints ───────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.app_version}


@app.get("/config", response_model=AppConfigResponse)
async def get_app_config():
    """
    Returns app-level config that the frontend needs on load:
    team list (no members), SQL templates, app name.
    Does NOT require authentication.
    """
    return AppConfigResponse(
        app_name=settings.app_name,
        teams=[
            TeamInfo(
                id=t["id"],
                name=t["name"],
                folder=t["folder"],
                snowflake_schema=t.get("snowflake_schema", ""),
                snowflake_database=t.get("snowflake_database", ""),
            )
            for t in TEAMS
        ],
        sql_templates=[
            SqlTemplate(
                name=tmpl["name"],
                description=tmpl["description"],
                content=tmpl["content"],
            )
            for tmpl in SQL_TEMPLATES
        ],
    )
