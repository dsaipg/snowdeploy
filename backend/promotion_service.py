"""
promotion_service.py — Environment promotion flow

Tracks promotion requests (dev→qa, qa→prod) with an approval gate.

Mock mode:  PR state is simulated in-memory. Auto-approves after
            MOCK_APPROVAL_DELAY_S seconds. Analysts can also click
            "Approve" in the UI immediately.

GitHub mode: Creates real GitHub PRs via the GitHub REST API.
             Polls for merge status each time requests are fetched.
             When the PR is merged, the promotion is auto-approved.

State is persisted to .portal/promotions.json inside the git repo
directory so it survives container restarts.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from config import settings
from models import PromotionRequest, PromotionStatus, PromotionSummary


# ── Persistence ────────────────────────────────────────────────────────
_store: dict[str, list[dict]] = {}   # team_id → list of raw dicts


def _persist_path() -> Path:
    repo_path = os.path.abspath(settings.git_repo_path)
    return Path(repo_path) / ".portal" / "promotions.json"


def init_promotion_service():
    global _store
    p = _persist_path()
    if p.exists():
        try:
            _store = json.loads(p.read_text())
        except Exception:
            _store = {}


def _save():
    p = _persist_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(_store, default=str, indent=2))
    _commit_promotions(p)


def _commit_promotions(p: Path):
    """Commit promotions.json to git so every state change is in the audit trail."""
    try:
        import git
        repo_path = os.path.abspath(settings.git_repo_path)
        repo = git.Repo(repo_path)
        relative = str(p.relative_to(Path(repo_path)))
        repo.index.add([relative])
        if repo.is_dirty(index=True):
            repo.index.commit(
                "audit: update promotions.json",
                author=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
                committer=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
            )
            if settings.git_mode == "remote":
                repo.remotes.origin.push()
    except Exception:
        pass  # non-fatal — file is still saved to disk


def _team_requests(team_id: str) -> list[dict]:
    return _store.setdefault(team_id, [])


# ── GitHub helpers ─────────────────────────────────────────────────────
def _github_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _check_github_pr_merged(pr_number: int) -> Optional[bool]:
    """Returns True if merged, False if closed without merge, None if still open."""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                f"https://api.github.com/repos/{settings.github_repo}/pulls/{pr_number}",
                headers=_github_headers(),
            )
            if resp.status_code == 404:
                return None
            data = resp.json()
            if data.get("merged"):
                return True
            if data.get("state") == "closed":
                return False
            return None  # still open
    except Exception:
        return None


def _create_github_pr(team_id: str, from_env: str, to_env: str,
                      files: list[str], submitted_by: str, notes: Optional[str]) -> dict:
    branch_map = {"dev": "develop", "qa": "qa", "prod": "main"}
    head = branch_map.get(from_env, from_env)
    base = branch_map.get(to_env, to_env)
    file_list = "\n".join(f"- `{f}`" for f in files)
    body = f"""## SQL Deployment: {from_env.upper()} → {to_env.upper()}

**Team:** {team_id}
**Submitted by:** {submitted_by}

### Files
{file_list}

{f'**Notes:** {notes}' if notes else ''}

---
*Created by SQL Deployment Portal*"""

    title = (
        f"[{team_id}] Deploy to {to_env.upper()} — "
        + ", ".join(files[:3])
        + ("..." if len(files) > 3 else "")
    )

    with httpx.Client(timeout=15) as client:
        resp = client.post(
            f"https://api.github.com/repos/{settings.github_repo}/pulls",
            headers=_github_headers(),
            json={"title": title, "head": head, "base": base, "body": body},
        )
        resp.raise_for_status()
        return resp.json()


# ── Core operations ────────────────────────────────────────────────────
def get_requests(team_id: str) -> list[PromotionRequest]:
    raw = _team_requests(team_id)
    changed = False

    for req in raw:
        if req["status"] != "open":
            continue

        if settings.promotion_mode == "mock":
            submitted_at = datetime.fromisoformat(req["submitted_at"])
            if submitted_at.tzinfo is None:
                submitted_at = submitted_at.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - submitted_at).total_seconds()
            if elapsed > settings.mock_approval_delay_s:
                req["status"] = PromotionStatus.approved
                req["reviewed_by"] = "auto-approver (mock)"
                req["reviewed_at"] = datetime.now(timezone.utc).isoformat()
                changed = True

        elif settings.promotion_mode == "github" and req.get("pr_number"):
            merged = _check_github_pr_merged(req["pr_number"])
            if merged is True:
                req["status"] = PromotionStatus.approved
                req["reviewed_by"] = "GitHub PR merge"
                req["reviewed_at"] = datetime.now(timezone.utc).isoformat()
                changed = True
            elif merged is False:
                req["status"] = PromotionStatus.rejected
                changed = True

    if changed:
        _save()

    return [PromotionRequest(**r) for r in raw]


def submit_promotion(
    team_id: str,
    from_env: str,
    to_env: str,
    files: list[str],
    submitted_by: str,
    notes: Optional[str] = None,
) -> PromotionRequest:
    req: dict = {
        "id": str(uuid.uuid4()),
        "team_id": team_id,
        "from_env": from_env,
        "to_env": to_env,
        "files": files,
        "status": PromotionStatus.open,
        "submitted_by": submitted_by,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": None,
        "reviewed_at": None,
        "deployed_at": None,
        "notes": notes,
        "pr_url": None,
        "pr_number": None,
    }

    if settings.promotion_mode == "github" and settings.github_token and settings.github_repo:
        try:
            pr = _create_github_pr(team_id, from_env, to_env, files, submitted_by, notes)
            req["pr_url"] = pr.get("html_url")
            req["pr_number"] = pr.get("number")
        except Exception as e:
            req["notes"] = (notes or "") + f" [GitHub PR failed: {e}]"

    _team_requests(team_id).append(req)
    _save()
    return PromotionRequest(**req)


def approve_promotion(team_id: str, request_id: str, reviewed_by: str) -> Optional[PromotionRequest]:
    for req in _team_requests(team_id):
        if req["id"] == request_id and req["status"] == PromotionStatus.open:
            req["status"] = PromotionStatus.approved
            req["reviewed_by"] = reviewed_by
            req["reviewed_at"] = datetime.now(timezone.utc).isoformat()
            _save()
            return PromotionRequest(**req)
    return None


def mark_deployed(team_id: str, request_id: str) -> Optional[PromotionRequest]:
    for req in _team_requests(team_id):
        if req["id"] == request_id and req["status"] == PromotionStatus.approved:
            req["status"] = PromotionStatus.deployed
            req["deployed_at"] = datetime.now(timezone.utc).isoformat()
            _save()
            return PromotionRequest(**req)
    return None


def get_summary(team_id: str) -> PromotionSummary:
    requests = get_requests(team_id)
    qa_deployed = set()
    prod_deployed = set()
    pending_qa = []
    pending_prod = []

    for req in requests:
        if req.to_env == "qa" and req.status == PromotionStatus.deployed:
            qa_deployed.update(req.files)
        elif req.to_env == "prod" and req.status == PromotionStatus.deployed:
            prod_deployed.update(req.files)
        elif req.to_env == "qa" and req.status in (PromotionStatus.open, PromotionStatus.approved):
            pending_qa.append(req)
        elif req.to_env == "prod" and req.status in (PromotionStatus.open, PromotionStatus.approved):
            pending_prod.append(req)

    return PromotionSummary(
        pending_qa=pending_qa,
        pending_prod=pending_prod,
        qa_deployed_count=len(qa_deployed),
        prod_deployed_count=len(prod_deployed),
    )
