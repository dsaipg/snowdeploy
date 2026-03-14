"""
routers/deploy_router.py — Deployment trigger endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from models import DeployRequest, DeployResponse, DeployHistoryResponse, UserInfo
from auth import get_current_user
from config import TEAMS
import airflow_client

router = APIRouter(prefix="/deploy", tags=["deploy"])


def _get_team_config(team_id: str) -> dict:
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        raise HTTPException(status_code=404, detail=f"Team config not found for: {team_id}")
    return team


@router.post("", response_model=DeployResponse)
async def trigger_deployment(body: DeployRequest, user: UserInfo = Depends(get_current_user)):
    """
    Trigger an Airflow DAG run for the given files.
    Files must belong to the authenticated user's team folder.
    """
    if not body.files:
        raise HTTPException(status_code=400, detail="At least one file must be specified.")

    team_cfg = _get_team_config(user.team_id)
    dag_id = team_cfg.get("airflow_dag_id", "sql_deploy_dag")

    try:
        result = await airflow_client.trigger_dag(
            team_id=user.team_id,
            team_folder=user.team_folder,
            files=body.files,
            environment=body.environment,
            snowflake_schema=team_cfg.get("snowflake_schema", ""),
            dag_id=dag_id,
            notes=body.notes,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to trigger deployment: {e}")

    return result


@router.get("/history", response_model=DeployHistoryResponse)
async def deployment_history(limit: int = 10, user: UserInfo = Depends(get_current_user)):
    """Get recent deployment runs for the user's team."""
    team_cfg = _get_team_config(user.team_id)
    dag_id = team_cfg.get("airflow_dag_id", "sql_deploy_dag")

    runs = await airflow_client.list_runs(user.team_id, dag_id, limit=limit)
    return DeployHistoryResponse(runs=runs, total=len(runs))
