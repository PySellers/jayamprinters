"""
Pure-stdlib password hashing + signed-token helpers, deliberately kept free of
FastAPI/SQLAlchemy imports so app/seed_data.py (and this verification tooling)
can hash a default password without needing the web framework installed.

The FastAPI-specific plumbing (get_current_user, require_role, HTTPBearer)
lives in app/auth.py, which imports these functions.
"""
import base64
import hashlib
import hmac
import json
import os
import time

SECRET_KEY = os.environ.get("SJP_AUTH_SECRET", "dev-only-insecure-secret-change-me")
TOKEN_TTL_SECONDS = 12 * 60 * 60  # 12 hours


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_b64, _ = stored_hash.split("$", 1)
        salt = base64.b64decode(salt_b64)
    except Exception:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored_hash)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


class TokenError(Exception):
    pass


def create_token_payload(user_id: int, username: str, role: str) -> str:
    payload = {"sub": user_id, "username": username, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    body = _b64url(json.dumps(payload).encode())
    sig = _b64url(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def decode_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise TokenError("Malformed token")
    expected_sig = _b64url(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected_sig):
        raise TokenError("Bad signature")
    payload = json.loads(_b64url_decode(body))
    if payload.get("exp", 0) < time.time():
        raise TokenError("Token expired")
    return payload
