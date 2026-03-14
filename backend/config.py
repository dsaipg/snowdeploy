"""
config.py — All application settings loaded from environment variables.
Override anything by setting the corresponding env var or editing .env
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import yaml, os


class Settings(BaseSettings):
    # ── App ─────────────────────────────────────────────────────────────
    app_name: str = Field("SQL Deployment Portal", description="Displayed in the UI header")
    app_version: str = "1.0.0"
    debug: bool = Field(False, description="Enable FastAPI debug mode + verbose logging")
    frontend_url: str = Field("http://localhost:5173", description="React dev server URL (for CORS)")

    # ── Auth ─────────────────────────────────────────────────────────────
    # auth_mode:
    #   "mock"  — no real SSO; any username/password accepted; team chosen from config
    #   "jwt"   — validate a Bearer JWT issued externally (e.g. by Okta/Azure AD)
    #   "oauth" — full OAuth 2.0 PKCE flow handled by backend
    auth_mode: str = Field("mock", description="mock | jwt | oauth")

    jwt_secret: str = Field("change-me-in-production-use-strong-secret")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(480, description="Token lifetime in minutes (default 8 hrs)")

    # OAuth settings (only needed when auth_mode=oauth)
    oauth_client_id: Optional[str] = None
    oauth_client_secret: Optional[str] = None
    oauth_authorization_url: Optional[str] = None   # e.g. Okta /authorize endpoint
    oauth_token_url: Optional[str] = None            # e.g. Okta /token endpoint
    oauth_userinfo_url: Optional[str] = None         # e.g. Okta /userinfo endpoint
    oauth_scopes: str = Field("openid profile email groups")

    # Snowflake SSO — if using Snowflake as the IdP
    snowflake_account_identifier: Optional[str] = None  # e.g. "myorg-myaccount"

    # ── Git ──────────────────────────────────────────────────────────────
    # git_mode:
    #   "local"  — use a local directory as the repo (great for dev/testing)
    #   "remote" — clone/pull a real remote Git repo
    git_mode: str = Field("local", description="local | remote")
    git_repo_path: str = Field("./repo", description="Local path to (clone of) the git repo")
    git_repo_url: Optional[str] = Field(None, description="Remote git URL (SSH or HTTPS)")
    git_branch: str = Field("main", description="Branch to commit to")
    git_service_account_user: str = Field("sql-portal-bot", description="Git commit author name")
    git_service_account_email: str = Field("sql-portal@company.com", description="Git commit author email")

    # ── Airflow ──────────────────────────────────────────────────────────
    # airflow_mode:
    #   "mock"  — simulates DAG runs with fake progress (no Airflow needed)
    #   "live"  — calls real Airflow REST API
    airflow_mode: str = Field("mock", description="mock | live")
    airflow_base_url: str = Field("http://localhost:8080", description="Airflow webserver base URL")
    airflow_username: str = Field("admin")
    airflow_password: str = Field("admin")
    airflow_default_dag_id: str = Field("sql_deploy_dag")

    # ── Teams config ─────────────────────────────────────────────────────
    teams_config_path: str = Field("../config/teams.yaml", description="Path to teams.yaml")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Singleton — import this everywhere
settings = Settings()


# ── Load teams config ──────────────────────────────────────────────────
def load_teams_config() -> dict:
    path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), settings.teams_config_path)
    )
    if not os.path.exists(path):
        raise FileNotFoundError(f"teams.yaml not found at: {path}")
    with open(path, "r") as f:
        return yaml.safe_load(f)


teams_config = load_teams_config()
TEAMS: list[dict] = teams_config.get("teams", [])
SQL_TEMPLATES: list[dict] = teams_config.get("sql_templates", [])
