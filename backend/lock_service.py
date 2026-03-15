"""
lock_service.py — File locking

Prevents two analysts editing the same file simultaneously.
Locks are in-memory only (no persistence needed — they expire on restart anyway).

Lock TTL: 30 minutes. The editor sends a heartbeat every 5 minutes to keep
the lock alive while actively editing. If the browser closes without releasing,
the lock expires automatically after 30 minutes.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

LOCK_TTL_MINUTES = 30

# key: "{team_folder}/{rel_path}" → lock dict
_locks: dict[str, dict] = {}


def _key(team_folder: str, rel_path: str) -> str:
    return f"{team_folder}/{rel_path}"


def _is_expired(lock: dict) -> bool:
    expires_at = datetime.fromisoformat(lock["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires_at


def _clean_expired():
    expired = [k for k, v in _locks.items() if _is_expired(v)]
    for k in expired:
        del _locks[k]


def get_lock(team_folder: str, rel_path: str) -> Optional[dict]:
    _clean_expired()
    return _locks.get(_key(team_folder, rel_path))


def acquire_lock(team_folder: str, rel_path: str, username: str, display_name: str) -> tuple[bool, dict]:
    """
    Try to acquire a lock.
    - If not locked: create lock, return (True, lock)
    - If locked by same user: refresh expiry, return (True, lock)
    - If locked by someone else: return (False, existing_lock)
    """
    _clean_expired()
    key = _key(team_folder, rel_path)
    existing = _locks.get(key)

    if existing and existing["username"] != username:
        return False, existing

    now = datetime.now(timezone.utc)
    lock = {
        "file_path": rel_path,
        "team_folder": team_folder,
        "username": username,
        "display_name": display_name,
        "locked_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat(),
    }
    _locks[key] = lock
    return True, lock


def release_lock(team_folder: str, rel_path: str, username: str) -> bool:
    key = _key(team_folder, rel_path)
    lock = _locks.get(key)
    if lock and lock["username"] == username:
        del _locks[key]
        return True
    return False


def heartbeat(team_folder: str, rel_path: str, username: str) -> Optional[dict]:
    """Extend lock expiry. Called every 5 minutes by the editor."""
    key = _key(team_folder, rel_path)
    lock = _locks.get(key)
    if lock and lock["username"] == username:
        lock["expires_at"] = (
            datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)
        ).isoformat()
        return lock
    return None


def list_locks(team_folder: str) -> list[dict]:
    _clean_expired()
    return [v for v in _locks.values() if v["team_folder"] == team_folder]
