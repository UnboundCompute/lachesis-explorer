"""Untrusted-input validation shared by the hosted bundle API and tests."""
from __future__ import annotations

import re
import secrets
from urllib.parse import urlsplit

ID_RE = re.compile(r"^[bj]_[A-Za-z0-9_-]{8,128}$")
REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$")
ALLOWED_HOSTS = {"github.com", "gitlab.com", "bitbucket.org"}


def opaque_id(prefix: str) -> str:
    if prefix not in {"b", "j"}:
        raise ValueError("invalid opaque ID prefix")
    return f"{prefix}_{secrets.token_urlsafe(24)}"


def valid_opaque_id(value: object, prefix: str | None = None) -> bool:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        return False
    return prefix is None or value.startswith(f"{prefix}_")


def canonical_git_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("enter a public HTTPS repository URL")
    parsed = urlsplit(value.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
        raise ValueError("only public HTTPS repository URLs are supported")
    if host not in ALLOWED_HOSTS or len(parts) != 2 or any(part in {".", ".."} for part in parts):
        raise ValueError("repository host or path is not supported")
    if parsed.query or parsed.fragment:
        raise ValueError("repository URL must not contain a query or fragment")
    repo = parts[-1].removesuffix(".git")
    if not repo or repo in {".", ".."}:
        raise ValueError("repository path is not supported")
    return f"https://{host}/{parts[0]}/{repo}.git"


def valid_ref(value: object) -> str:
    ref = "main" if value in (None, "") else value
    if not isinstance(ref, str) or not REF_RE.fullmatch(ref) or ref.startswith("/") or ".." in ref:
        raise ValueError("ref is invalid")
    return ref
