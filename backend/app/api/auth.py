from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import create_user, get_user_by_email
from app.schemas import AuthResponse, LoginRequest, SignupRequest, UserResponse


router = APIRouter(prefix="/api/auth", tags=["authentication"])


def _auth_response(user: dict) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(str(user["id"])),
        user=UserResponse.model_validate(user),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest):
    if get_user_by_email(payload.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    try:
        user = create_user(
            user_id=str(uuid4()),
            email=payload.email,
            password_hash=hash_password(payload.password),
            name=payload.name,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to create account.") from exc

    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return _auth_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: dict = Depends(get_current_user)):
    # JWTs are stateless; the client removes the token after this acknowledgement.
    return None
