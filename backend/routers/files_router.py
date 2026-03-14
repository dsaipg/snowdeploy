"""
routers/files_router.py — SQL file CRUD endpoints

All endpoints enforce team isolation: a user can only read/write
files within their own team folder, resolved from their JWT.
Paths support subfolders, e.g. GET /files/tables/core/users.sql
"""
from fastapi import APIRouter, HTTPException, Depends
from models import (
    FileListResponse, FileContentResponse,
    SaveFileRequest, SaveFileResponse,
    DeleteFileRequest, UserInfo,
)
from auth import get_current_user
import git_service

router = APIRouter(prefix="/files", tags=["files"])


@router.get("", response_model=FileListResponse)
async def list_files(user: UserInfo = Depends(get_current_user)):
    """List all SQL files in the current user's team folder, including subfolders."""
    files = git_service.list_files(user.team_folder)
    return FileListResponse(
        team_id=user.team_id,
        team_folder=user.team_folder,
        files=files,
    )


@router.post("", response_model=SaveFileResponse)
async def save_file(body: SaveFileRequest, user: UserInfo = Depends(get_current_user)):
    """Create or update a SQL file in the team folder (optionally in a subfolder)."""
    try:
        sha = git_service.save_file(
            team_folder=user.team_folder,
            filename=body.filename,
            content=body.content,
            author_name=user.display_name,
            author_email=user.email,
            commit_message=body.commit_message,
            subfolder=body.subfolder,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rel_path = f"{body.subfolder}/{body.filename}" if body.subfolder else body.filename
    return SaveFileResponse(
        path=f"{user.team_folder}/{rel_path}",
        commit_sha=sha,
        message=f"File '{rel_path}' saved successfully.",
    )


@router.get("/{path:path}", response_model=FileContentResponse)
async def get_file(path: str, user: UserInfo = Depends(get_current_user)):
    """Read the content of a SQL file. Path can include subfolders, e.g. tables/core/users.sql"""
    try:
        content = git_service.read_file(user.team_folder, path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return FileContentResponse(
        path=f"{user.team_folder}/{path}",
        content=content,
    )


@router.delete("/{path:path}")
async def delete_file(path: str, user: UserInfo = Depends(get_current_user)):
    """Delete a SQL file from the team folder. Path can include subfolders."""
    try:
        sha = git_service.delete_file(
            team_folder=user.team_folder,
            rel_path=path,
            author_name=user.display_name,
            author_email=user.email,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"message": f"File '{path}' deleted.", "commit_sha": sha}
