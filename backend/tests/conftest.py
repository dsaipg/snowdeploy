"""
conftest.py — Shared fixtures for the SQL Deployment Portal test suite.

Provides:
  - client: FastAPI TestClient with the full app
  - alice_token / bob_token / rita_token: valid JWTs for each test user
  - alice_headers / bob_headers / rita_headers: Authorization header dicts
  - alice_user / bob_user / rita_user: UserInfo objects
  - tmp_repo: a temporary git repository (used by git_service tests)
"""
import os
import sys
import tempfile
import pytest

# Ensure backend directory is on the import path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from models import UserInfo
from auth import create_access_token


# ── User fixtures ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def alice_user() -> UserInfo:
    """UserInfo for alice (team_a member)."""
    return UserInfo(
        username="alice",
        email="alice@mock.local",
        display_name="Alice Chen",
        team_id="team_a",
        team_name="Team Alpha",
        team_folder="team-a",
        role="analyst",
    )


@pytest.fixture(scope="session")
def bob_user() -> UserInfo:
    """UserInfo for bob (team_a member)."""
    return UserInfo(
        username="bob",
        email="bob@mock.local",
        display_name="Bob Smith",
        team_id="team_a",
        team_name="Team Alpha",
        team_folder="team-a",
        role="analyst",
    )


@pytest.fixture(scope="session")
def rita_user() -> UserInfo:
    """UserInfo for rita (team_b member)."""
    return UserInfo(
        username="rita",
        email="rita@mock.local",
        display_name="Rita Patel",
        team_id="team_b",
        team_name="Team Beta",
        team_folder="team-b",
        role="analyst",
    )


# ── Token fixtures ────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def alice_token(alice_user) -> str:
    """Valid JWT for alice."""
    return create_access_token(alice_user)


@pytest.fixture(scope="session")
def bob_token(bob_user) -> str:
    """Valid JWT for bob."""
    return create_access_token(bob_user)


@pytest.fixture(scope="session")
def rita_token(rita_user) -> str:
    """Valid JWT for rita."""
    return create_access_token(rita_user)


@pytest.fixture(scope="session")
def alice_headers(alice_token) -> dict:
    """Authorization headers for alice."""
    return {"Authorization": f"Bearer {alice_token}"}


@pytest.fixture(scope="session")
def bob_headers(bob_token) -> dict:
    """Authorization headers for bob."""
    return {"Authorization": f"Bearer {bob_token}"}


@pytest.fixture(scope="session")
def rita_headers(rita_token) -> dict:
    """Authorization headers for rita."""
    return {"Authorization": f"Bearer {rita_token}"}


# ── TestClient fixture ────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client(tmp_path_factory):
    """
    FastAPI TestClient wired to a temporary git repo.
    Patches settings.git_repo_path to avoid touching the real repo.
    Also sets promotion_mode=mock and debug=True.
    """
    import git
    from config import settings

    # Create a temporary repo for the session
    tmp_dir = tmp_path_factory.mktemp("api_repo")
    repo = git.Repo.init(str(tmp_dir))
    readme = tmp_dir / "README.md"
    readme.write_text("# Test Repo\n")
    repo.index.add(["README.md"])
    repo.index.commit(
        "Initial commit",
        author=git.Actor("bot", "bot@test.local"),
        committer=git.Actor("bot", "bot@test.local"),
    )

    # Patch settings before importing the app
    original_repo_path = settings.git_repo_path
    original_promotion_mode = settings.promotion_mode
    original_debug = settings.debug

    settings.git_repo_path = str(tmp_dir)
    settings.promotion_mode = "mock"
    settings.debug = True

    # Reset promotion store
    import promotion_service
    promotion_service._store = {}

    from main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    # Restore settings
    settings.git_repo_path = original_repo_path
    settings.promotion_mode = original_promotion_mode
    settings.debug = original_debug


# ── Temporary git repo fixture ────────────────────────────────────────────

@pytest.fixture()
def tmp_repo(tmp_path, monkeypatch):
    """
    Creates a fresh temporary git repo and patches settings.git_repo_path
    to point to it. Used for git_service unit tests.
    """
    import git
    from config import settings

    repo = git.Repo.init(str(tmp_path))
    readme = tmp_path / "README.md"
    readme.write_text("# Test Repo\n")
    repo.index.add(["README.md"])
    repo.index.commit(
        "Initial commit",
        author=git.Actor("bot", "bot@test.local"),
        committer=git.Actor("bot", "bot@test.local"),
    )

    monkeypatch.setattr(settings, "git_repo_path", str(tmp_path))
    monkeypatch.setattr(settings, "git_mode", "local")

    return tmp_path
