"""
routers/status_router.py — Deployment status polling
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from models import DeployStatusResponse, UserInfo
from auth import get_current_user
from config import TEAMS
import airflow_client

router = APIRouter(prefix="/status", tags=["status"])


@router.get("/{run_id}", response_model=DeployStatusResponse)
async def get_status(run_id: str, dag_id: str = Query(None), user: UserInfo = Depends(get_current_user)):
    """
    Poll the status of a specific DAG run.
    dag_id defaults to the team's configured dag.
    """
    team_cfg = next((t for t in TEAMS if t["id"] == user.team_id), {})
    resolved_dag_id = dag_id or team_cfg.get("airflow_dag_id", "sql_deploy_dag")

    try:
        result = await airflow_client.get_run_status(run_id, resolved_dag_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to get status: {e}")

    return result
