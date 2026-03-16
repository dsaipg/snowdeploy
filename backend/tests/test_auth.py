"""
test_auth.py — Unit tests for authentication and JWT helpers.

Covers:
  - mock_login: success cases (alice, bob, rita)
  - mock_login: wrong password → 401
  - mock_login: unknown user → 401
  - create_access_token / decode_token round-trip
  - Team isolation: user belongs to expected team
  - Token fields are correct
"""
import pytest
from fastapi import HTTPException

from auth import mock_login, create_access_token, decode_token, get_team_by_id
from models import UserInfo
from config import TEAMS


# ── mock_login ────────────────────────────────────────────────────────────

class TestMockLogin:
    @pytest.mark.parametrize("username,password,expected_team", [
        ("alice", "password", "team_a"),
        ("bob",   "password", "team_a"),
        ("rita",  "password", "team_b"),
    ])
    def test_valid_login_returns_user_info(self, username, password, expected_team):
        """Valid credentials should return a UserInfo with the correct team assignment."""
        user = mock_login(username, password, team_id=None)
        assert isinstance(user, UserInfo)
        assert user.username == username
        assert user.team_id == expected_team
        assert user.email == f"{username}@mock.local"

    @pytest.mark.parametrize("username,password", [
        ("alice", "wrongpass"),
        ("bob",   "badpassword"),
        ("rita",  "incorrect"),
    ])
    def test_wrong_password_raises_401(self, username, password):
        """An incorrect password should raise HTTPException with status 401."""
        with pytest.raises(HTTPException) as exc_info:
            mock_login(username, password, team_id=None)
        assert exc_info.value.status_code == 401
        assert "Incorrect password" in exc_info.value.detail

    def test_unknown_user_raises_401(self):
        """A username not in teams.yaml should raise HTTPException 401."""
        with pytest.raises(HTTPException) as exc_info:
            mock_login("unknown_user_xyz", "anypass", team_id=None)
        assert exc_info.value.status_code == 401
        assert "not found" in exc_info.value.detail.lower()

    def test_login_is_case_insensitive_for_username(self):
        """Username matching should be case-insensitive."""
        user = mock_login("ALICE", "password", team_id=None)
        assert user.team_id == "team_a"

    def test_alice_team_folder(self):
        """Alice (team_a) should have team_folder='team-a'."""
        user = mock_login("alice", "password", team_id=None)
        assert user.team_folder == "team-a"

    def test_rita_team_folder(self):
        """Rita (team_b) should have team_folder='team-b'."""
        user = mock_login("rita", "password", team_id=None)
        assert user.team_folder == "team-b"

    def test_user_display_name(self):
        """Display name should match the one configured in teams.yaml."""
        user = mock_login("alice", "password", team_id=None)
        assert user.display_name == "Alice Chen"


# ── create_access_token / decode_token ────────────────────────────────────

class TestTokenHelpers:
    @pytest.fixture
    def sample_user(self) -> UserInfo:
        return UserInfo(
            username="alice",
            email="alice@mock.local",
            display_name="Alice Chen",
            team_id="team_a",
            team_name="Team Alpha",
            team_folder="team-a",
            role="analyst",
        )

    def test_create_token_returns_string(self, sample_user):
        """create_access_token should return a non-empty string."""
        token = create_access_token(sample_user)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_token_round_trip(self, sample_user):
        """Encoding then decoding should preserve all user fields."""
        token = create_access_token(sample_user)
        payload = decode_token(token)
        assert payload["sub"] == "alice"
        assert payload["email"] == "alice@mock.local"
        assert payload["team_id"] == "team_a"
        assert payload["team_folder"] == "team-a"
        assert payload["role"] == "analyst"

    def test_invalid_token_raises_401(self):
        """A garbage token string should raise HTTPException 401."""
        with pytest.raises(HTTPException) as exc_info:
            decode_token("this.is.not.a.valid.jwt")
        assert exc_info.value.status_code == 401

    def test_tampered_token_raises_401(self, sample_user):
        """A token with a modified payload should fail signature verification."""
        token = create_access_token(sample_user)
        # Flip one character in the signature portion
        parts = token.split(".")
        parts[2] = parts[2][:-1] + ("A" if parts[2][-1] != "A" else "B")
        tampered = ".".join(parts)
        with pytest.raises(HTTPException) as exc_info:
            decode_token(tampered)
        assert exc_info.value.status_code == 401

    @pytest.mark.parametrize("username,team_id", [
        ("alice", "team_a"),
        ("bob",   "team_a"),
        ("rita",  "team_b"),
    ])
    def test_token_contains_correct_team(self, username, team_id):
        """Token payload should encode the user's correct team."""
        user = mock_login(username, "password", team_id=None)
        token = create_access_token(user)
        payload = decode_token(token)
        assert payload["team_id"] == team_id


# ── Team isolation ─────────────────────────────────────────────────────────

class TestTeamIsolation:
    def test_alice_and_bob_same_team(self):
        """Alice and Bob both belong to team_a."""
        alice = mock_login("alice", "password", None)
        bob = mock_login("bob", "password", None)
        assert alice.team_id == bob.team_id == "team_a"
        assert alice.team_folder == bob.team_folder == "team-a"

    def test_rita_different_team(self):
        """Rita belongs to team_b, which is different from alice/bob."""
        alice = mock_login("alice", "password", None)
        rita = mock_login("rita", "password", None)
        assert alice.team_id != rita.team_id
        assert alice.team_folder != rita.team_folder

    def test_get_team_by_id_valid(self):
        """get_team_by_id should return a dict for a valid team_id."""
        team = get_team_by_id("team_a")
        assert team is not None
        assert team["id"] == "team_a"

    def test_get_team_by_id_invalid(self):
        """get_team_by_id should return None for an unknown team_id."""
        team = get_team_by_id("nonexistent_team")
        assert team is None

    def test_teams_loaded(self):
        """At least two teams should be loaded from teams.yaml."""
        assert len(TEAMS) >= 2
        team_ids = [t["id"] for t in TEAMS]
        assert "team_a" in team_ids
        assert "team_b" in team_ids
