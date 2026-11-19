"""Stateless operator authentication and signed simulation records (HMAC-SHA256).

Serverless instances share no memory, so every token, proposal and valve state
is signed by the backend. The browser carries them but cannot forge or alter them.
"""

import base64
import hashlib
import hmac
import json
import os
import time

_DEV_SECRET = "aquagrid-development-signing-key-change-me"
SECRET = os.environ.get("AQUAGRID_SECRET", _DEV_SECRET).encode()
USING_DEV_SECRET = SECRET == _DEV_SECRET.encode()

TOKEN_TTL_S = 30 * 60

# Demonstration accounts. PINs can be overridden with environment variables.
OPERATORS = {
    "CR-07": {"name": "Control-Room Operator 07", "role": "control_room_operator",
              "pin": os.environ.get("AQUAGRID_OPERATOR_PIN", "2468")},
    "AN-02": {"name": "Network Analyst 02", "role": "analyst",
              "pin": os.environ.get("AQUAGRID_ANALYST_PIN", "1357")},
}
APPROVER_ROLES = {"control_room_operator"}


class AuthError(Exception):
    def __init__(self, message, status=401):
        super().__init__(message)
        self.status = status


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sign(obj) -> str:
    return hmac.new(SECRET, canonical(obj), hashlib.sha256).hexdigest()


def verify(obj, signature) -> bool:
    return isinstance(signature, str) and hmac.compare_digest(sign(obj), signature)


def login(operator_id, pin, now=None):
    now = int(now or time.time())
    op = OPERATORS.get(str(operator_id or "").strip().upper())
    if not op or not hmac.compare_digest(str(pin or ""), op["pin"]):
        raise AuthError("Operator ID or PIN not recognised.")
    payload = {"sub": str(operator_id).strip().upper(), "name": op["name"], "role": op["role"],
               "iat": now, "exp": now + TOKEN_TTL_S}
    body = _b64(canonical(payload))
    token = body + "." + hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return {"token": token, "operator": {k: payload[k] for k in ("sub", "name", "role", "exp")}}


def read_token(token, now=None):
    now = int(now or time.time())
    try:
        body, sig = str(token).split(".", 1)
    except ValueError:
        raise AuthError("Missing or malformed operator session.")
    expected = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise AuthError("Operator session signature is invalid.")
    payload = json.loads(_unb64(body))
    if payload["exp"] < now:
        raise AuthError("Operator session has expired. Sign in again.")
    return payload


def require_approver(token, now=None):
    if os.getenv("VERCEL") and USING_DEV_SECRET:raise AuthError("Production signing key is not configured; privileged actions disabled.",503)
    payload = read_token(token, now)
    if payload["role"] not in APPROVER_ROLES:
        raise AuthError(f"{payload['name']} is signed in but does not hold Control-Room approval authority.", 403)
    return payload
