"""
airflow_client.py — Airflow REST API integration

Supports two modes (set AIRFLOW_MODE in .env):
  mock — simulates DAG runs with progressive status (no Airflow needed)
  live — calls the real Airflow REST API v1

The Airflow DAG is expected to accept a conf payload like:
{
  "team_id":    "team_a",
  "team_folder": "team-a",
  "files":      ["create_orders.sql", "alter_customers.sql"],
  "environment": "dev",
  "snowflake_schema": "TEAM_A_SCHEMA",
  "notes":      "Optional deployment notes"
}
"""
import uuid
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from config import settings
from models import DeployResponse, DeployStatusResponse, DagTask, TaskStatus


# ── In-memory store for mock runs ─────────────────────────────────────
_mock_runs: dict[str, dict] = {}


# ── Trigger a DAG run ──────────────────────────────────────────────────
async def trigger_dag(
    team_id: str,
    team_folder: str,
    files: list[str],
    environment: str,
    snowflake_schema: str,
    dag_id: str,
    notes: Optional[str] = None,
) -> DeployResponse:

    # run_id format: portal__{dag_id}__{timestamp} — uniquely identifies this execution
    run_id = f"portal__{dag_id}__{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
    triggered_at = datetime.now(timezone.utc)

    if settings.airflow_mode == "mock":
        # Store a mock run that progresses over time
        _mock_runs[run_id] = {
            "run_id": run_id,
            "dag_id": dag_id,
            "team_id": team_id,
            "files": files,
            "triggered_at": triggered_at,
            "environment": environment,
        }
        return DeployResponse(
            run_id=run_id,
            dag_id=dag_id,
            team_id=team_id,
            status="queued",
            triggered_at=triggered_at,
            files=files,
            airflow_run_url=None,
        )

    # Live mode — call Airflow REST API
    conf = {
        "team_id": team_id,
        "team_folder": team_folder,
        "files": files,
        "environment": environment,
        "snowflake_schema": snowflake_schema,
        "notes": notes or "",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.airflow_base_url}/api/v1/dags/{dag_id}/dagRuns",
            json={"dag_run_id": run_id, "conf": conf},
            auth=(settings.airflow_username, settings.airflow_password),
            timeout=15,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Airflow trigger failed: {response.status_code} {response.text}")

    return DeployResponse(
        run_id=run_id,
        dag_id=dag_id,
        team_id=team_id,
        status="queued",
        triggered_at=triggered_at,
        files=files,
        airflow_run_url=f"{settings.airflow_base_url}/dags/{dag_id}/grid",
    )


# ── Get DAG run status ─────────────────────────────────────────────────
async def get_run_status(run_id: str, dag_id: str) -> DeployStatusResponse:

    if settings.airflow_mode == "mock":
        return _mock_status(run_id, dag_id)

    # Live mode
    async with httpx.AsyncClient() as client:
        run_resp = await client.get(
            f"{settings.airflow_base_url}/api/v1/dags/{dag_id}/dagRuns/{run_id}",
            auth=(settings.airflow_username, settings.airflow_password),
            timeout=10,
        )
        task_resp = await client.get(
            f"{settings.airflow_base_url}/api/v1/dags/{dag_id}/dagRuns/{run_id}/taskInstances",
            auth=(settings.airflow_username, settings.airflow_password),
            timeout=10,
        )

    run_data = run_resp.json()
    tasks_data = task_resp.json().get("task_instances", [])

    status_map = {
        "queued": TaskStatus.queued,
        "running": TaskStatus.running,
        "success": TaskStatus.success,
        "failed": TaskStatus.failed,
        "skipped": TaskStatus.skipped,
    }

    overall = status_map.get(run_data.get("state", "queued"), TaskStatus.queued)

    tasks = [
        DagTask(
            task_id=t["task_id"],
            status=status_map.get(t.get("state", "queued"), TaskStatus.queued),
            start_time=t.get("start_date"),
            end_time=t.get("end_date"),
        )
        for t in tasks_data
    ]

    meta = _mock_runs.get(run_id, {})

    return DeployStatusResponse(
        run_id=run_id,
        dag_id=dag_id,
        team_id=run_data.get("conf", {}).get("team_id", ""),
        overall_status=overall,
        triggered_at=run_data.get("execution_date", datetime.now(timezone.utc)),
        started_at=run_data.get("start_date"),
        finished_at=run_data.get("end_date"),
        tasks=tasks,
        files=run_data.get("conf", {}).get("files", []),
    )


# ── Mock status progression ────────────────────────────────────────────
def _mock_status(run_id: str, dag_id: str) -> DeployStatusResponse:
    run = _mock_runs.get(run_id)
    if not run:
        raise KeyError(f"Run {run_id} not found")

    files = run["files"]
    triggered_at: datetime = run["triggered_at"]
    now = datetime.now(timezone.utc)
    elapsed = (now - triggered_at).total_seconds()

    # Simulate progression: queued → running → success over ~30 seconds
    tasks = []
    overall = TaskStatus.queued
    started_at = None
    finished_at = None

    if elapsed > 2:
        overall = TaskStatus.running
        started_at = triggered_at + timedelta(seconds=2)

        # Each file gets its own task, 8s apart
        for i, fname in enumerate(files):
            task_start = elapsed - 2 - (i * 8)
            if task_start < 0:
                tasks.append(DagTask(task_id=f"run_sql_{i+1}_{fname}", status=TaskStatus.queued))
            elif task_start < 8:
                tasks.append(DagTask(
                    task_id=f"run_sql_{i+1}_{fname}",
                    status=TaskStatus.running,
                    start_time=triggered_at + timedelta(seconds=2 + i * 8),
                    log=f"Connecting to Snowflake...\nExecuting {fname}...",
                ))
            else:
                tasks.append(DagTask(
                    task_id=f"run_sql_{i+1}_{fname}",
                    status=TaskStatus.success,
                    start_time=triggered_at + timedelta(seconds=2 + i * 8),
                    end_time=triggered_at + timedelta(seconds=2 + i * 8 + 6),
                    log=f"Executing {fname}...\nStatement executed successfully.\n✓ Done",
                ))

        if all(t.status == TaskStatus.success for t in tasks):
            overall = TaskStatus.success
            finished_at = tasks[-1].end_time
    else:
        tasks = [DagTask(task_id=f"run_sql_{i+1}_{f}", status=TaskStatus.queued) for i, f in enumerate(files)]

    return DeployStatusResponse(
        run_id=run_id,
        dag_id=dag_id,
        team_id=run["team_id"],
        overall_status=overall,
        triggered_at=triggered_at,
        started_at=started_at,
        finished_at=finished_at,
        tasks=tasks,
        files=files,
    )


# ── List recent runs for a team ────────────────────────────────────────
async def list_runs(team_id: str, dag_id: str, limit: int = 10) -> list[DeployStatusResponse]:
    if settings.airflow_mode == "mock":
        runs = [
            _mock_status(rid, dag_id)
            for rid, run in _mock_runs.items()
            if run["team_id"] == team_id
        ]
        return sorted(runs, key=lambda r: r.triggered_at, reverse=True)[:limit]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.airflow_base_url}/api/v1/dags/{dag_id}/dagRuns",
            params={"limit": limit, "order_by": "-execution_date"},
            auth=(settings.airflow_username, settings.airflow_password),
            timeout=10,
        )
    runs_data = resp.json().get("dag_runs", [])
    results = []
    for r in runs_data:
        if r.get("conf", {}).get("team_id") == team_id:
            results.append(await get_run_status(r["dag_run_id"], dag_id))
    return results
