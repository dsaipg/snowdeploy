"""
auth.py — Authentication & authorization

Supports three modes (set AUTH_MODE in .env):
  mock  — accepts any login; team resolved from teams.yaml by team_id param
  jwt   — validates a Bearer JWT issued by external IdP (Okta, Azure AD, etc.)
  oauth — full OAuth 2.0 PKCE (to be wired to your IdP)
"""
import jwt
import httpx
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials

from config import settings, TEAMS
from models import UserInfo

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


# ── Token helpers ──────────────────────────────────────────────────────
def create_access_token(user: UserInfo) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "team_id": user.team_id,
        "team_name": user.team_name,
        "team_folder": user.team_folder,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# ── Team resolver ──────────────────────────────────────────────────────
def get_team_by_id(team_id: str) -> Optional[dict]:
    return next((t for t in TEAMS if t["id"] == team_id), None)


def resolve_team_for_user(email: str, groups: list[str]) -> Optional[dict]:
    """
    Given a user's email and SSO group memberships,
    find which team they belong to from teams.yaml.
    Returns the first matching team.
    """
    for team in TEAMS:
        members = team.get("members", [])
        if email in members:
            return team
        for group in groups:
            if group in members:
                return team
    return None


# ── Mock auth ──────────────────────────────────────────────────────────
def mock_login(username: str, password: str, team_id: Optional[str]) -> UserInfo:
    """
    In mock mode: validate username/password against users list in teams.yaml.
    Team is auto-resolved from the username — no team dropdown needed.
    Falls back to accepting any username if no users are configured (backwards compat).
    """
    # Try to find the user in teams.yaml
    for team in TEAMS:
        for user in team.get("users", []):
            if user["username"].lower() == username.lower():
                if user.get("password") and user["password"] != password:
                    raise HTTPException(status_code=401, detail="Incorrect password")
                return UserInfo(
                    username=user["username"],
                    email=f"{user['username']}@mock.local",
                    display_name=user.get("display_name", username.title()),
                    team_id=team["id"],
                    team_name=team["name"],
                    team_folder=team["folder"],
                )

    # Fallback: no users configured — accept any username (original behaviour)
    team = get_team_by_id(team_id) if team_id else (TEAMS[0] if TEAMS else None)
    if not team:
        raise HTTPException(status_code=401, detail=f"User '{username}' not found. Check teams.yaml.")
    return UserInfo(
        username=username,
        email=f"{username}@mock.local",
        display_name=username.replace(".", " ").title(),
        team_id=team["id"],
        team_name=team["name"],
        team_folder=team["folder"],
    )


# ── JWT auth (external IdP issues the token) ───────────────────────────
async def jwt_login_from_external_token(external_token: str) -> UserInfo:
    """
    Validates a JWT from an external IdP (Okta, Azure AD).
    Decodes without full signature verification here — in production,
    fetch the JWKS from the IdP and verify properly.
    """
    try:
        payload = jwt.decode(
            external_token,
            options={"verify_signature": False},  # Replace with JWKS in prod
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid external token: {e}")

    email = payload.get("email") or payload.get("upn") or payload.get("preferred_username", "")
    groups = payload.get("groups", [])
    display_name = payload.get("name", email)

    team = resolve_team_for_user(email, groups)
    if not team:
        raise HTTPException(
            status_code=403,
            detail=f"User {email} is not a member of any configured team. "
                   "Check config/teams.yaml.",
        )

    return UserInfo(
        username=email.split("@")[0],
        email=email,
        display_name=display_name,
        team_id=team["id"],
        team_name=team["name"],
        team_folder=team["folder"],
    )


# ── Dependency: get current user ───────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> UserInfo:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    return UserInfo(
        username=payload["sub"],
        email=payload["email"],
        display_name=payload.get("display_name", payload["sub"]),
        team_id=payload["team_id"],
        team_name=payload["team_name"],
        team_folder=payload["team_folder"],
    )


# ── Dependency shorthand ───────────────────────────────────────────────
CurrentUser = Depends(get_current_user)
