"""Deterministic repository-index records for canonical Explorer links.

The build cache is intentionally opaque and content-addressed.  The repository
index is the small, human-addressable projection that lets the UI resolve a
repository (or an exact revision) to the latest published bundle without
enumerating jobs or exposing S3 keys.
"""
from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import urlsplit

try:
    from contract import canonical_git_url, valid_opaque_id
except ImportError:
    from .contract import canonical_git_url, valid_opaque_id

SHA_RE = re.compile(r"^[0-9a-f]{40,64}$")


def _parts(git_url: str) -> tuple[str, str, str]:
    canonical = canonical_git_url(git_url)
    parsed = urlsplit(canonical)
    owner, repo = [part for part in parsed.path.strip("/").split("/") if part]
    return parsed.hostname or "", owner, repo.removesuffix(".git")


def repository_slug(git_url: str) -> str:
    host, owner, repo = _parts(git_url)
    return f"{host}/{owner}/{repo}"


def latest_key(git_url: str) -> str:
    host, owner, repo = _parts(git_url)
    return f"repository-index/{host}/{owner}/{repo}/latest.json"


def revision_key(git_url: str, sha: str) -> str:
    if not isinstance(sha, str) or not SHA_RE.fullmatch(sha.lower()):
        raise ValueError("revision is invalid")
    host, owner, repo = _parts(git_url)
    return f"repository-index/{host}/{owner}/{repo}/revisions/{sha.lower()}.json"


def manifest(
    *,
    git_url: str,
    ref: str,
    sha: str,
    bundle_id: str,
    built_at: int | None = None,
    cache_hit: bool = False,
) -> dict[str, Any]:
    canonical = canonical_git_url(git_url)
    if not isinstance(sha, str) or not SHA_RE.fullmatch(sha.lower()):
        raise ValueError("revision is invalid")
    if not isinstance(ref, str) or not ref or len(ref) > 256:
        raise ValueError("ref is invalid")
    if not valid_opaque_id(bundle_id, "b"):
        raise ValueError("bundle ID is invalid")
    return {
        "schema_version": "1",
        "repository": repository_slug(canonical),
        "git_url": canonical,
        "ref": ref,
        "revision": sha.lower(),
        "bundle_id": bundle_id,
        "built_at": int(time.time()) if built_at is None else int(built_at),
        "cache_hit": bool(cache_hit),
    }
