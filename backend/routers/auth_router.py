"""
routers/auth_router.py — Login & token endpoints
"""
from fastapi import APIRouter, HTTPException
from models import LoginRequest, TokenResponse, UserInfo
from auth import mock_login, jwt_login_from_external_token, create_access_token
from config import settings, TEAMS

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """
    Authenticate and receive a JWT.

    mock mode  : any username/password; supply team_id from teams.yaml
    jwt mode   : supply the external IdP token as the password field
    """
    if settings.auth_mode == "mock":
        user = mock_login(body.username, body.password, body.team_id)

    elif settings.auth_mode == "jwt":
        # Treat the "password" field as the raw IdP token in JWT mode
        user = await jwt_login_from_external_token(body.password)

    else:
        raise HTTPException(status_code=501, detail=f"auth_mode '{settings.auth_mode}' not yet implemented")

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expire_minutes * 60,
        user=user,
    )


@router.get("/teams")
async def list_teams_for_login():
    """Returns team list for the login screen dropdown (no auth required)."""
    return [{"id": t["id"], "name": t["name"]} for t in TEAMS]
