"""
routers/promotion_router.py — Environment promotion flow endpoints

Endpoints:
  GET  /promotion/summary          — counts per environment stage
  GET  /promotion/requests         — all promotion requests for this team
  POST /promotion/submit           — submit files for promotion (dev→qa or qa→prod)
  POST /promotion/approve/{id}     — manually approve (mock mode; GitHub uses PR merge)
  POST /promotion/deploy/{id}      — trigger Airflow deploy for an approved promotion
"""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from config import settings, TEAMS
from models import (
    UserInfo,
    SubmitPromotionRequest,
    PromotionRequest,
    PromotionSummary,
    DeployResponse,
)
import promotion_service
import airflow_client

router = APIRouter(prefix="/promotion", tags=["promotion"])


def _get_team_config(team_id: str) -> dict:
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        raise HTTPException(404, f"Team config not found: {team_id}")
    return team


@router.get("/summary", response_model=PromotionSummary)
async def get_summary(user: UserInfo = Depends(get_current_user)):
    return promotion_service.get_summary(user.team_id)


@router.get("/requests", response_model=list[PromotionRequest])
async def list_requests(user: UserInfo = Depends(get_current_user)):
    return promotion_service.get_requests(user.team_id)


@router.post("/submit", response_model=PromotionRequest)
async def submit(body: SubmitPromotionRequest, user: UserInfo = Depends(get_current_user)):
    if body.from_env not in ("dev", "qa"):
        raise HTTPException(400, "from_env must be 'dev' or 'qa'")
    if body.to_env not in ("qa", "prod"):
        raise HTTPException(400, "to_env must be 'qa' or 'prod'")
    if not body.files:
        raise HTTPException(400, "files list cannot be empty")

    return promotion_service.submit_promotion(
        team_id=user.team_id,
        from_env=body.from_env,
        to_env=body.to_env,
        files=body.files,
        submitted_by=user.display_name,
        notes=body.notes,
        schedule=body.schedule,
    )


@router.post("/approve/{request_id}", response_model=PromotionRequest)
async def approve(request_id: str, user: UserInfo = Depends(get_current_user)):
    """Anyone on the team can approve, except the person who submitted it."""
    if settings.promotion_mode == "github":
        raise HTTPException(400, "Approvals happen via GitHub PR in github mode")
    requests = promotion_service.get_requests(user.team_id)
    target = next((r for r in requests if r.id == request_id), None)
    if not target:
        raise HTTPException(404, "Promotion request not found")
    if target.submitted_by == user.display_name:
        raise HTTPException(403, "You cannot approve your own submission")
    req = promotion_service.approve_promotion(user.team_id, request_id, user.display_name)
    if not req:
        raise HTTPException(404, "Promotion request not found or not in 'open' status")
    return req


@router.post("/deploy/{request_id}")
async def deploy_promotion(request_id: str, user: UserInfo = Depends(get_current_user)):
    """Anyone on the team can deploy an approved promotion."""
    requests = promotion_service.get_requests(user.team_id)
    req = next((r for r in requests if r.id == request_id), None)
    if not req:
        raise HTTPException(404, "Promotion request not found")
    if req.status != "approved":
        raise HTTPException(400, f"Cannot deploy: status is '{req.status}' (must be 'approved')")

    team_cfg = _get_team_config(user.team_id)
    snowflake_schema = team_cfg.get("snowflake_schema", "")

    # Build a meaningful dag_id: {team_id}__{folder}__{filename}__{env}
    # For multi-file promotions use the first file; truncate to keep it readable
    first_file = req.files[0].replace("/", "_").replace(".sql", "") if req.files else "batch"
    if len(req.files) > 1:
        first_file += f"_plus{len(req.files) - 1}"
    dag_id = f"{user.team_id}__{first_file}__{req.to_env}"
    # Airflow dag_id max length is 250 chars; trim if needed
    dag_id = dag_id[:250]

    try:
        deploy_resp = await airflow_client.trigger_dag(
            team_id=user.team_id,
            team_folder=user.team_folder,
            files=req.files,
            environment=req.to_env,
            snowflake_schema=snowflake_schema,
            dag_id=dag_id,
            notes=req.notes,
            schedule=req.schedule,
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to trigger deployment: {e}")

    promotion_service.mark_deployed(user.team_id, request_id)

    return {"run_id": deploy_resp.run_id, "dag_id": deploy_resp.dag_id, "promotion_id": request_id}
