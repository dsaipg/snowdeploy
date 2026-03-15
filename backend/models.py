"""
models.py — Pydantic request/response models
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str
    team_id: Optional[str] = None  # Only used in mock mode


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserInfo"


class UserInfo(BaseModel):
    username: str
    email: str
    display_name: str
    team_id: str
    team_name: str
    team_folder: str
    role: str = "analyst"   # analyst | lead


# ── Files ─────────────────────────────────────────────────────────────
class SqlFile(BaseModel):
    name: str                       # filename only e.g. "users.sql"
    path: str                       # path relative to team folder e.g. "tables/core/users.sql"
    subfolder: Optional[str] = None # subfolder within team folder e.g. "tables/core"
    size_bytes: int
    last_modified: Optional[datetime] = None
    last_commit_message: Optional[str] = None
    last_commit_author: Optional[str] = None


class FileListResponse(BaseModel):
    team_id: str
    team_folder: str
    files: List[SqlFile]


class FileContentResponse(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"


class SaveFileRequest(BaseModel):
    filename: str = Field(..., description="Filename only, no path. e.g. create_orders.sql")
    subfolder: Optional[str] = Field(None, description="Subfolder within team folder e.g. tables/core")
    content: str = Field(..., description="SQL content")
    commit_message: Optional[str] = None


class SaveFileResponse(BaseModel):
    path: str
    commit_sha: str
    message: str


class DeleteFileRequest(BaseModel):
    filename: str
    commit_message: Optional[str] = None


# ── Deploy ────────────────────────────────────────────────────────────
class DeployRequest(BaseModel):
    files: List[str] = Field(..., description="List of filenames to deploy (from team folder)")
    environment: str = Field("dev", description="Target environment: dev | staging | prod")
    notes: Optional[str] = Field(None, description="Optional deployment notes")


class DeployResponse(BaseModel):
    run_id: str
    dag_id: str
    team_id: str
    status: str
    triggered_at: datetime
    files: List[str]
    airflow_run_url: Optional[str] = None


# ── Status ────────────────────────────────────────────────────────────
class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    success = "success"
    failed = "failed"
    skipped = "skipped"


class DagTask(BaseModel):
    task_id: str
    status: TaskStatus
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    log: Optional[str] = None


class DeployStatusResponse(BaseModel):
    run_id: str
    dag_id: str
    team_id: str
    overall_status: TaskStatus
    triggered_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    tasks: List[DagTask]
    files: List[str]
    error_message: Optional[str] = None


class DeployHistoryResponse(BaseModel):
    runs: List[DeployStatusResponse]
    total: int


# ── Promotion ─────────────────────────────────────────────────────────
class PromotionStatus(str, Enum):
    open = "open"
    approved = "approved"
    deployed = "deployed"
    rejected = "rejected"


class PromotionRequest(BaseModel):
    id: str
    team_id: str
    from_env: str
    to_env: str
    files: List[str]
    status: PromotionStatus
    submitted_by: str
    submitted_at: datetime
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    deployed_at: Optional[datetime] = None
    notes: Optional[str] = None
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None


class SubmitPromotionRequest(BaseModel):
    files: List[str]
    from_env: str = Field("dev", description="Source environment: dev | qa")
    to_env: str = Field("qa", description="Target environment: qa | prod")
    notes: Optional[str] = None


class PromotionSummary(BaseModel):
    pending_qa: List[PromotionRequest]
    pending_prod: List[PromotionRequest]
    qa_deployed_count: int
    prod_deployed_count: int


# ── Teams / Config ────────────────────────────────────────────────────
class TeamInfo(BaseModel):
    id: str
    name: str
    folder: str
    snowflake_schema: str
    snowflake_database: str


class SqlTemplate(BaseModel):
    name: str
    description: str
    content: str


class AppConfigResponse(BaseModel):
    app_name: str
    teams: List[TeamInfo]
    sql_templates: List[SqlTemplate]
