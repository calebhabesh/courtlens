from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from courtlens.api.dependencies import current_user
from courtlens.api.schemas import LoginRequest, RegisterRequest, TokenResponse
from courtlens.database import get_db
from courtlens.models import User
from courtlens.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower()
    if session.scalar(select(User).where(func.lower(User.email) == email)) is not None:
        raise HTTPException(status_code=409, detail="an account with that email already exists")
    user = User(email=email, password_hash=hash_password(payload.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="an account with that email already exists"
        ) from error
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/token", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_db)) -> TokenResponse:
    user = session.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict[str, str]:
    return {"id": user.id, "email": user.email}
