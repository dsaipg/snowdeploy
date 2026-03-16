"""
dag_yaml_service.py — dag-factory YAML generation for scheduled SQL jobs

When a promotion with a cron schedule is deployed, this service:
  1. Reads the team's existing schedules/dag_factory.yaml from git (or starts fresh)
  2. Adds / updates a DAG entry for the scheduled job
  3. Writes the file back and commits it to git

The generated YAML follows the dag-factory spec:
  https://github.com/ajbosco/dag-factory

A single loader.py living in your MWAA DAGs folder reads this YAML
and registers the DAGs automatically via dag-factory.

Snowflake connection IDs follow the convention:
  snowflake__{team_id}__{env}
e.g. snowflake__team_a__qa, snowflake__team_a__prod

Override per team by setting snowflake.conn_id in teams.yaml.
"""
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

from config import settings


# ── Helpers ────────────────────────────────────────────────────────────

def _repo_path() -> Path:
    return Path(os.path.abspath(settings.git_repo_path))


def _dag_yaml_path(team_folder: str) -> Path:
    """Path inside git repo: <team_folder>/schedules/dag_factory.yaml"""
    return _repo_path() / team_folder / "schedules" / "dag_factory.yaml"


def _dag_id(team_id: str, files: list[str], env: str) -> str:
    """
    Stable, deterministic dag_id derived from team + files + env.
    Airflow dag_id max = 250 chars; we keep it shorter.
    """
    slug = re.sub(r"[^a-zA-Z0-9_]", "_", files[0].replace(".sql", ""))
    if len(files) > 1:
        slug += f"_plus{len(files) - 1}"
    dag_id = f"{team_id}__{slug}__{env}"
    return dag_id[:200]


def _snowflake_conn_id(team_id: str, env: str, team_cfg: Optional[dict] = None) -> str:
    """
    Returns the Airflow Snowflake connection ID.
    Can be overridden in teams.yaml under snowflake.<env>.conn_id.
    Default: snowflake__{team_id}__{env}
    """
    if team_cfg:
        conn = team_cfg.get("snowflake", {}).get(env, {}).get("conn_id")
        if conn:
            return conn
    return f"snowflake__{team_id}__{env}"


def _build_dag_entry(
    dag_id: str,
    team_id: str,
    files: list[str],
    env: str,
    schedule: str,
    team_folder: str,
    snowflake_conn_id: str,
    notes: Optional[str] = None,
) -> dict:
    """
    Build the dag-factory dict for one DAG.

    Each SQL file becomes its own SnowflakeOperator task, chained in sequence.
    The sql path is relative to the MWAA DAGs root — convention is that your
    team SQL files live in a mounted/synced folder at the same relative path
    they occupy in this git repo.
    """
    tasks: dict = {}
    prev_task: Optional[str] = None

    for i, file_path in enumerate(files):
        task_id = f"run_sql_{i + 1}_{re.sub(r'[^a-zA-Z0-9_]', '_', file_path)}"
        task: dict = {
            "operator": "airflow.providers.snowflake.operators.snowflake.SnowflakeOperator",
            "snowflake_conn_id": snowflake_conn_id,
            "sql": f"{team_folder}/{file_path}",
            "autocommit": True,
        }
        if prev_task:
            task["dependencies"] = [prev_task]
        tasks[task_id] = task
        prev_task = task_id

    entry: dict = {
        "description": (
            f"Scheduled deployment of {len(files)} SQL file(s) "
            f"to {env.upper()} for team {team_id}"
            + (f". Notes: {notes}" if notes else "")
        ),
        "schedule_interval": schedule,
        "default_args": {
            "owner": team_id,
            "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "retries": 1,
            "retry_delay_sec": 300,
            "email_on_failure": False,
        },
        "tags": [team_id, env, "sql-portal"],
        "tasks": tasks,
    }
    return entry


# ── Public API ─────────────────────────────────────────────────────────

def upsert_scheduled_dag(
    team_id: str,
    team_folder: str,
    files: list[str],
    env: str,
    schedule: str,
    notes: Optional[str] = None,
    team_cfg: Optional[dict] = None,
) -> str:
    """
    Add or replace a DAG entry in <team_folder>/schedules/dag_factory.yaml
    and commit the result to git.

    Returns the dag_id that was written.
    """
    yaml_path = _dag_yaml_path(team_folder)
    yaml_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing file or start fresh
    existing: dict = {}
    if yaml_path.exists():
        try:
            loaded = yaml.safe_load(yaml_path.read_text()) or {}
            if isinstance(loaded, dict):
                existing = loaded
        except Exception:
            existing = {}

    dag = _dag_id(team_id, files, env)
    conn_id = _snowflake_conn_id(team_id, env, team_cfg)

    existing[dag] = _build_dag_entry(
        dag_id=dag,
        team_id=team_id,
        files=files,
        env=env,
        schedule=schedule,
        team_folder=team_folder,
        snowflake_conn_id=conn_id,
        notes=notes,
    )

    # Dump with a header comment so the file is self-documenting
    header = (
        "# dag_factory.yaml — auto-generated by SQL Deployment Portal\n"
        "# Do not edit manually. Re-deploy from the portal to update.\n"
        "# Loaded by loader.py in the MWAA DAGs folder.\n\n"
    )
    yaml_path.write_text(header + yaml.dump(existing, default_flow_style=False, sort_keys=True))

    _commit_yaml(yaml_path, team_folder, dag)
    return dag


def remove_scheduled_dag(
    team_id: str,
    team_folder: str,
    files: list[str],
    env: str,
) -> Optional[str]:
    """
    Remove a DAG entry from dag_factory.yaml and commit.
    Returns dag_id removed, or None if it wasn't present.
    """
    yaml_path = _dag_yaml_path(team_folder)
    if not yaml_path.exists():
        return None

    existing: dict = {}
    try:
        loaded = yaml.safe_load(yaml_path.read_text()) or {}
        if isinstance(loaded, dict):
            existing = loaded
    except Exception:
        return None

    dag = _dag_id(team_id, files, env)
    if dag not in existing:
        return None

    del existing[dag]

    header = (
        "# dag_factory.yaml — auto-generated by SQL Deployment Portal\n"
        "# Do not edit manually. Re-deploy from the portal to update.\n"
        "# Loaded by loader.py in the MWAA DAGs folder.\n\n"
    )
    yaml_path.write_text(header + yaml.dump(existing, default_flow_style=False, sort_keys=True))
    _commit_yaml(yaml_path, team_folder, dag, action="remove")
    return dag


# ── Git commit ─────────────────────────────────────────────────────────

def _commit_yaml(yaml_path: Path, team_folder: str, dag_id: str, action: str = "upsert") -> None:
    """Commit the updated dag_factory.yaml to the git repo."""
    try:
        import git
        repo_path = os.path.abspath(settings.git_repo_path)
        repo = git.Repo(repo_path)
        relative = str(yaml_path.relative_to(Path(repo_path)))
        repo.index.add([relative])
        if repo.is_dirty(index=True):
            verb = "add/update" if action == "upsert" else "remove"
            repo.index.commit(
                f"schedule: {verb} DAG '{dag_id}' in dag_factory.yaml",
                author=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
                committer=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
            )
            if settings.git_mode == "remote":
                repo.remotes.origin.push()
    except Exception:
        pass  # non-fatal — YAML file is still written to disk
