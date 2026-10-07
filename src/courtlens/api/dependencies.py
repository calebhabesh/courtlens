from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.models import FantasyLeague, User
from courtlens.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required"
        )
    try:
        user_id = decode_access_token(credentials.credentials)
    except jwt.PyJWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired access token"
        ) from error
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="user no longer exists"
        )
    return user


def owned_league(league_id: str, user: User, session: Session) -> FantasyLeague:
    league = session.get(FantasyLeague, league_id)
    if league is None:
        raise HTTPException(status_code=404, detail="league not found")
    if league.owner_id != user.id:
        # Do not disclose whether another owner's private league exists.
        raise HTTPException(status_code=404, detail="league not found")
    return league
