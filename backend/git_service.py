"""
git_service.py — Git operations for the SQL portal

Supports two modes (set GIT_MODE in .env):
  local  — reads/writes to a local directory (no remote). Great for dev.
  remote — clones a real remote repo on startup, pulls before each read,
            commits & pushes on each write.

Team isolation is enforced here: all paths are validated against
the team's configured folder before any read or write.
"""
import os
import re
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from config import settings
from models import SqlFile

# Only import git if available (graceful fallback for environments without gitpython)
try:
    import git
    GIT_AVAILABLE = True
except ImportError:
    GIT_AVAILABLE = False


# ── Helpers ────────────────────────────────────────────────────────────
SAFE_FILENAME_RE = re.compile(r'^[\w\-. ]+\.sql$', re.IGNORECASE)


def _validate_filename(filename: str) -> str:
    """Ensure filename is safe and ends with .sql"""
    name = Path(filename).name  # strip any path traversal
    if not SAFE_FILENAME_RE.match(name):
        raise ValueError(
            f"Invalid filename '{name}'. "
            "Must contain only alphanumeric, dash, underscore, dot, space and end with .sql"
        )
    return name


def _team_dir(repo_root: str, team_folder: str) -> Path:
    """Return the absolute path to the team's folder inside the repo."""
    path = Path(repo_root) / team_folder
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_team_file(repo_root: str, team_folder: str, rel_path: str) -> Path:
    """
    Resolve a path relative to the team folder, e.g. 'tables/core/users.sql'.
    Prevents directory traversal and validates the filename.
    """
    p = Path(rel_path)
    if '..' in p.parts or p.is_absolute():
        raise ValueError(f"Invalid path: '{rel_path}'")
    _validate_filename(p.name)
    team_root = (Path(repo_root) / team_folder).resolve()
    target = (team_root / p).resolve()
    try:
        target.relative_to(team_root)
    except ValueError:
        raise ValueError(f"Path escape attempt: '{rel_path}'")
    return target


# ── Repo initialisation ────────────────────────────────────────────────
def init_repo():
    """
    Called once at startup.
    - local mode: ensure the repo path exists and is a git repo.
    - remote mode: clone the repo if not already present, else pull.
    """
    repo_path = os.path.abspath(settings.git_repo_path)

    if settings.git_mode == "local":
        os.makedirs(repo_path, exist_ok=True)
        if GIT_AVAILABLE and not os.path.exists(os.path.join(repo_path, ".git")):
            repo = git.Repo.init(repo_path)
            # Create an initial commit so the repo is usable
            readme = Path(repo_path) / "README.md"
            readme.write_text("# SQL Portal Repository\n\nManaged by SQL Deployment Portal.\n")
            repo.index.add(["README.md"])
            repo.index.commit(
                "Initial commit",
                author=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
                committer=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
            )
        return

    if settings.git_mode == "remote":
        if not GIT_AVAILABLE:
            raise RuntimeError("gitpython is required for remote git mode. pip install gitpython")
        git_dir = os.path.join(repo_path, ".git")
        if not os.path.exists(git_dir):
            git.Repo.clone_from(settings.git_repo_url, repo_path, branch=settings.git_branch)
        else:
            repo = git.Repo(repo_path)
            # If no origin remote (e.g. was previously local), add it and pull
            if "origin" not in [r.name for r in repo.remotes]:
                repo.create_remote("origin", settings.git_repo_url)
            repo.remotes.origin.fetch()
            repo.git.reset("--hard", f"origin/{settings.git_branch}")


def _get_repo() -> Optional["git.Repo"]:
    if not GIT_AVAILABLE:
        return None
    repo_path = os.path.abspath(settings.git_repo_path)
    try:
        return git.Repo(repo_path)
    except Exception:
        return None


def _pull_latest():
    if settings.git_mode == "remote" and GIT_AVAILABLE:
        repo = _get_repo()
        if repo and "origin" in [r.name for r in repo.remotes]:
            repo.remotes.origin.fetch()
            repo.git.reset("--hard", f"origin/{settings.git_branch}")


# ── Read operations ────────────────────────────────────────────────────
def list_files(team_folder: str) -> list[SqlFile]:
    """List all .sql files in the team's folder, recursing into subfolders."""
    _pull_latest()
    repo_root = os.path.abspath(settings.git_repo_path)
    team_path = _team_dir(repo_root, team_folder)
    repo = _get_repo()

    files = []
    for f in sorted(team_path.rglob("*.sql")):
        stat = f.stat()
        rel_to_team = f.relative_to(team_path)
        subfolder = str(rel_to_team.parent) if str(rel_to_team.parent) != '.' else None

        last_commit_msg = None
        last_commit_author = None
        if repo:
            try:
                commits = list(repo.iter_commits(paths=str(f.relative_to(Path(repo_root))), max_count=1))
                if commits:
                    last_commit_msg = commits[0].message.strip()
                    last_commit_author = commits[0].author.name
            except Exception:
                pass

        files.append(SqlFile(
            name=f.name,
            path=str(rel_to_team),   # e.g. "tables/core/users.sql"
            subfolder=subfolder,      # e.g. "tables/core"
            size_bytes=stat.st_size,
            last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            last_commit_message=last_commit_msg,
            last_commit_author=last_commit_author,
        ))
    return files


def read_file(team_folder: str, rel_path: str) -> str:
    """Read the content of a SQL file. rel_path is relative to the team folder."""
    _pull_latest()
    repo_root = os.path.abspath(settings.git_repo_path)
    path = _resolve_team_file(repo_root, team_folder, rel_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {rel_path}")
    return path.read_text(encoding="utf-8")


# ── Write operations ───────────────────────────────────────────────────
def save_file(
    team_folder: str,
    filename: str,
    content: str,
    author_name: str,
    author_email: str,
    commit_message: Optional[str] = None,
    subfolder: Optional[str] = None,
) -> str:
    """
    Write a SQL file to the team folder (optionally in a subfolder) and commit it.
    Returns the commit SHA.
    """
    repo_root = os.path.abspath(settings.git_repo_path)
    rel_path = f"{subfolder}/{filename}" if subfolder else filename
    path = _resolve_team_file(repo_root, team_folder, rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

    if not GIT_AVAILABLE:
        return "no-git-sha"

    repo = _get_repo()
    if not repo:
        return "no-git-sha"

    relative_path = str(path.relative_to(repo_root))
    repo.index.add([relative_path])

    action = "update" if repo.is_dirty(index=True) else "add"
    msg = commit_message or f"{action}: {team_folder}/{rel_path} by {author_name}"

    commit = repo.index.commit(
        msg,
        author=git.Actor(author_name, author_email),
        committer=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
    )

    if settings.git_mode == "remote":
        repo.remotes.origin.push()

    return commit.hexsha


def delete_file(
    team_folder: str,
    rel_path: str,
    author_name: str,
    author_email: str,
    commit_message: Optional[str] = None,
) -> str:
    """Delete a SQL file and commit the removal. rel_path is relative to the team folder."""
    repo_root = os.path.abspath(settings.git_repo_path)
    path = _resolve_team_file(repo_root, team_folder, rel_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {rel_path}")

    if GIT_AVAILABLE:
        repo = _get_repo()
        if repo:
            relative_path = str(path.relative_to(repo_root))
            repo.index.remove([relative_path])
            msg = commit_message or f"delete: {team_folder}/{rel_path} by {author_name}"
            commit = repo.index.commit(
                msg,
                author=git.Actor(author_name, author_email),
                committer=git.Actor(settings.git_service_account_user, settings.git_service_account_email),
            )
            if settings.git_mode == "remote":
                repo.remotes.origin.push()
            return commit.hexsha

    path.unlink()
    return "no-git-sha"
