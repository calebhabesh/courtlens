"""Planner sign-in from the early fantasy-league work: local only.

Accounts are invite-only (finish plan F04): there is no sign-up endpoint, and the CLI creates
accounts. The site's own sign-in lives in ``routers/account.py``. This bearer token is kept for
the local Planner and is refused in production, where the Planner is hidden.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.api.dependencies import current_user
from courtlens.api.schemas import LoginRequest, TokenResponse
from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.models import User
from courtlens.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])


def local_only() -> None:
    if get_settings().environment == "production":
        raise HTTPException(status_code=404, detail="Not Found")


@router.post("/token", response_model=TokenResponse, dependencies=[Depends(local_only)])
def login(payload: LoginRequest, session: Session = Depends(get_db)) -> TokenResponse:
    user = session.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", dependencies=[Depends(local_only)])
def me(user: User = Depends(current_user)) -> dict[str, str]:
    return {"id": user.id, "email": user.email}
