"""
routers/lock_router.py — File locking endpoints

POST   /locks/{path}            — acquire lock (409 if locked by someone else)
DELETE /locks/{path}            — release lock
PUT    /locks/{path}/heartbeat  — extend lock TTL (called every 5 min by editor)
GET    /locks                   — list all active locks for this team
"""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from models import UserInfo
import lock_service

router = APIRouter(prefix="/locks", tags=["locks"])


@router.get("")
async def list_locks(user: UserInfo = Depends(get_current_user)):
    return lock_service.list_locks(user.team_folder)


@router.post("/{file_path:path}")
async def acquire_lock(file_path: str, user: UserInfo = Depends(get_current_user)):
    success, lock = lock_service.acquire_lock(
        user.team_folder, file_path, user.username, user.display_name
    )
    if not success:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"{lock['display_name']} is currently editing this file",
                "lock": lock,
            },
        )
    return lock


@router.delete("/{file_path:path}")
async def release_lock(file_path: str, user: UserInfo = Depends(get_current_user)):
    lock_service.release_lock(user.team_folder, file_path, user.username)
    return {"released": True}


@router.put("/{file_path:path}/heartbeat")
async def heartbeat(file_path: str, user: UserInfo = Depends(get_current_user)):
    lock = lock_service.heartbeat(user.team_folder, file_path, user.username)
    if not lock:
        raise HTTPException(404, "Lock not found or not owned by you")
    return lock
