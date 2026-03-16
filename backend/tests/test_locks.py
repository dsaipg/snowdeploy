"""
test_locks.py — Unit tests for lock_service (in-memory locks, no mocking needed).

Covers:
  - acquire_lock: returns (True, lock) when file is free
  - acquire_lock: same user can re-acquire (refreshes expiry)
  - acquire_lock: different user cannot acquire a held lock → (False, existing)
  - release_lock: owner can release → True
  - release_lock: non-owner cannot release → False
  - release_lock: non-existent lock → False
  - heartbeat: owner can extend lock expiry
  - heartbeat: non-owner returns None
  - heartbeat: non-existent lock returns None
  - list_locks: returns only locks for the given team_folder
  - expired locks are automatically cleaned up
"""
import pytest
from datetime import datetime, timezone, timedelta

import lock_service
from lock_service import (
    acquire_lock,
    release_lock,
    heartbeat,
    list_locks,
    get_lock,
    _locks,
    LOCK_TTL_MINUTES,
)

TEAM_A = "team-a"
TEAM_B = "team-b"
FILE_1 = "users.sql"
FILE_2 = "orders.sql"


@pytest.fixture(autouse=True)
def clear_locks():
    """Clear the in-memory lock store before and after each test."""
    lock_service._locks.clear()
    yield
    lock_service._locks.clear()


# ── acquire_lock ──────────────────────────────────────────────────────────

class TestAcquireLock:
    def test_acquire_free_file_succeeds(self):
        """Acquiring a lock on an unlocked file should return (True, lock)."""
        success, lock = acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        assert success is True
        assert lock["username"] == "alice"
        assert lock["file_path"] == FILE_1
        assert lock["team_folder"] == TEAM_A

    def test_acquired_lock_has_expiry(self):
        """The lock should have a future expires_at."""
        success, lock = acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        expires_at = datetime.fromisoformat(lock["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        assert expires_at > datetime.now(timezone.utc)

    def test_acquire_by_same_user_refreshes_lock(self):
        """Re-acquiring a lock by the same user should succeed and refresh expiry."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        success, lock = acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        assert success is True

    def test_acquire_by_different_user_fails(self):
        """Another user cannot acquire a lock held by someone else."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        success, lock = acquire_lock(TEAM_A, FILE_1, "bob", "Bob Smith")
        assert success is False
        assert lock["username"] == "alice"

    def test_acquire_stores_display_name(self):
        """The lock should store the user's display_name."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        lock = get_lock(TEAM_A, FILE_1)
        assert lock is not None
        assert lock["display_name"] == "Alice Chen"

    def test_acquire_different_files_independently(self):
        """Two different files can be locked by different users simultaneously."""
        s1, _ = acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        s2, _ = acquire_lock(TEAM_A, FILE_2, "bob", "Bob Smith")
        assert s1 is True
        assert s2 is True

    def test_acquire_different_teams_independently(self):
        """Same filename in different team folders should be independent locks."""
        s1, _ = acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        s2, _ = acquire_lock(TEAM_B, FILE_1, "rita", "Rita Patel")
        assert s1 is True
        assert s2 is True


# ── release_lock ──────────────────────────────────────────────────────────

class TestReleaseLock:
    def test_owner_can_release(self):
        """The lock owner should be able to release the lock."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        result = release_lock(TEAM_A, FILE_1, "alice")
        assert result is True
        assert get_lock(TEAM_A, FILE_1) is None

    def test_non_owner_cannot_release(self):
        """A user who did not acquire the lock should not be able to release it."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        result = release_lock(TEAM_A, FILE_1, "bob")
        assert result is False
        assert get_lock(TEAM_A, FILE_1) is not None

    def test_release_nonexistent_lock_returns_false(self):
        """Releasing a lock that doesn't exist should return False."""
        result = release_lock(TEAM_A, "ghost.sql", "alice")
        assert result is False

    def test_after_release_file_can_be_locked_again(self):
        """After releasing, another user should be able to acquire the lock."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        release_lock(TEAM_A, FILE_1, "alice")
        success, lock = acquire_lock(TEAM_A, FILE_1, "bob", "Bob Smith")
        assert success is True
        assert lock["username"] == "bob"


# ── heartbeat ─────────────────────────────────────────────────────────────

class TestHeartbeat:
    def test_heartbeat_extends_expiry(self):
        """Heartbeat should push the expiry further into the future."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        old_lock = get_lock(TEAM_A, FILE_1)
        old_expiry = datetime.fromisoformat(old_lock["expires_at"])

        result = heartbeat(TEAM_A, FILE_1, "alice")
        assert result is not None
        new_expiry = datetime.fromisoformat(result["expires_at"])

        # New expiry should be >= old expiry (account for clock precision)
        if new_expiry.tzinfo is None:
            new_expiry = new_expiry.replace(tzinfo=timezone.utc)
        if old_expiry.tzinfo is None:
            old_expiry = old_expiry.replace(tzinfo=timezone.utc)
        assert new_expiry >= old_expiry

    def test_heartbeat_by_non_owner_returns_none(self):
        """Heartbeat from a user who doesn't own the lock should return None."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        result = heartbeat(TEAM_A, FILE_1, "bob")
        assert result is None

    def test_heartbeat_nonexistent_lock_returns_none(self):
        """Heartbeat on a non-existent lock should return None."""
        result = heartbeat(TEAM_A, "nonexistent.sql", "alice")
        assert result is None


# ── list_locks ────────────────────────────────────────────────────────────

class TestListLocks:
    def test_list_returns_team_locks(self):
        """list_locks should return all active locks for the given team folder."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        acquire_lock(TEAM_A, FILE_2, "bob", "Bob Smith")
        locks = list_locks(TEAM_A)
        assert len(locks) == 2

    def test_list_excludes_other_team_locks(self):
        """list_locks should NOT return locks belonging to a different team."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        acquire_lock(TEAM_B, FILE_1, "rita", "Rita Patel")
        team_a_locks = list_locks(TEAM_A)
        assert all(lock["team_folder"] == TEAM_A for lock in team_a_locks)
        assert len(team_a_locks) == 1

    def test_list_empty_when_no_locks(self):
        """list_locks should return empty list when no locks are held."""
        locks = list_locks(TEAM_A)
        assert locks == []

    def test_list_after_release(self):
        """Released locks should not appear in list_locks."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        release_lock(TEAM_A, FILE_1, "alice")
        locks = list_locks(TEAM_A)
        assert locks == []


# ── Expiry / TTL ──────────────────────────────────────────────────────────

class TestLockExpiry:
    def test_expired_lock_is_cleaned_up(self):
        """An expired lock should be automatically removed on the next operation."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        # Manually expire the lock
        key = f"{TEAM_A}/{FILE_1}"
        lock_service._locks[key]["expires_at"] = (
            datetime.now(timezone.utc) - timedelta(minutes=1)
        ).isoformat()

        # list_locks triggers _clean_expired()
        locks = list_locks(TEAM_A)
        assert locks == []

    def test_expired_lock_allows_new_acquisition(self):
        """After a lock expires, a new user should be able to acquire it."""
        acquire_lock(TEAM_A, FILE_1, "alice", "Alice Chen")
        key = f"{TEAM_A}/{FILE_1}"
        lock_service._locks[key]["expires_at"] = (
            datetime.now(timezone.utc) - timedelta(minutes=1)
        ).isoformat()

        success, lock = acquire_lock(TEAM_A, FILE_1, "bob", "Bob Smith")
        assert success is True
        assert lock["username"] == "bob"
