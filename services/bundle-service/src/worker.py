"""SQS worker: clone an immutable revision, export a validated bundle, and store it privately."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from typing import Any
from urllib.parse import urlsplit

import boto3

try:  # Lambda loads this directory as the module root; tests may load it as a package.
    from contract import canonical_git_url, opaque_id, valid_ref
except ImportError:
    from .contract import canonical_git_url, opaque_id, valid_ref

SHA_RE = re.compile(r"^[0-9a-fA-F]{40,64}$")


def _run(args: list[str], cwd: str | None = None, timeout: int = 60) -> str:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0:
        raise RuntimeError("build step failed")
    return result.stdout.strip()


def _update(table: Any, job_id: str, status: str, steps: list[dict[str, str]], **values: str) -> None:
    item = {"job_id": job_id, "status": status, "steps": steps, "updated_at": int(time.time()), **values}
    table.put_item(Item=item)


def _sha(url: str, ref: str) -> str:
    output = _run(["git", "ls-remote", url, ref], timeout=30)
    candidate = output.split()[0] if output else ""
    if not SHA_RE.fullmatch(candidate):
        raise RuntimeError("ref could not be resolved")
    return candidate.lower()


def _repo_name(url: str) -> str:
    parts = [part for part in urlsplit(url).path.strip("/").split("/") if part]
    return "/".join(parts).removesuffix(".git") if len(parts) == 2 else "unknown/unknown"


def _source_template(url: str) -> str | None:
    host = (urlsplit(url).hostname or "").lower()
    repo = _repo_name(url)
    if host == "github.com" and repo != "unknown/unknown":
        return f"https://github.com/{repo}/blob/{{revision}}/{{file}}#L{{line}}-L{{end_line}}"
    if host == "gitlab.com" and repo != "unknown/unknown":
        return f"https://gitlab.com/{repo}/-/blob/{{revision}}/{{file}}#L{{line}}-{{end_line}}"
    if host == "bitbucket.org" and repo != "unknown/unknown":
        return f"https://bitbucket.org/{repo}/src/{{revision}}/{{file}}#lines-{{line}}:{{end_line}}"
    return None


def _process(job: dict[str, Any], table: Any, storage: Any) -> None:
    job_id = str(job["job_id"])
    record = table.get_item(Key={"job_id": job_id}).get("Item") or {}
    url = canonical_git_url(record.get("git_url"))
    ref = valid_ref(record.get("ref"))
    steps = [{"key": key, "state": "pending"} for key in ("clone", "build", "export")]
    with tempfile.TemporaryDirectory(prefix="lachesis-job-") as work:
        sha = _sha(url, ref)
        steps[0]["state"] = "active"; _update(table, job_id, "cloning", steps, sha=sha)
        _run(["git", "clone", "--depth", "1", "--no-recurse-submodules", "-c", "core.hooksPath=/dev/null", url, work], timeout=180)
        _run(["git", "fetch", "--depth", "1", "origin", sha], cwd=work, timeout=120)
        _run(["git", "checkout", "--detach", sha], cwd=work, timeout=30)
        steps[0]["state"] = "done"; steps[1]["state"] = "active"; _update(table, job_id, "building", steps, sha=sha)
        graph = os.path.join(work, "graph.kuzu")
        _run(["lachesis", "build", work, graph, "--timeout", os.environ.get("BUILD_TIMEOUT_SECONDS", "600")], timeout=660)
        steps[1]["state"] = "done"; steps[2]["state"] = "active"; _update(table, job_id, "exporting", steps, sha=sha)
        bundle = os.path.join(work, "bundle.json")
        trace_args = ["lachesis", "trace", graph, "--out", bundle, "--repo-name", _repo_name(url),
                      "--commit", sha, "--schema-version", "2.0", "--quiet"]
        template = _source_template(url)
        if template:
            trace_args.extend(["--source-url-template", template])
        _run(trace_args, timeout=660)
        if os.path.getsize(bundle) > 5 * 1024 * 1024:
            raise RuntimeError("bundle exceeds direct API response limit")
        bundle_id = opaque_id("b")
        storage.upload_file(bundle, os.environ["BUNDLE_BUCKET"], f"bundles/{bundle_id}.json", ExtraArgs={"ContentType": "application/json", "ServerSideEncryption": "AES256"})
        steps[2]["state"] = "done"; _update(table, job_id, "ready", steps, sha=sha, bundle_id=bundle_id)


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    table = boto3.resource("dynamodb").Table(os.environ["JOBS_TABLE"])
    storage = boto3.client("s3")
    failures = []
    for message in event.get("Records", []):
        try:
            _process(json.loads(message["body"]), table, storage)
        except Exception:
            job_id = ""
            try: job_id = str(json.loads(message["body"])["job_id"])
            except Exception: pass
            if job_id:
                _update(table, job_id, "error", [], error={"message": "build failed", "kind": "build_failed"})
            failures.append({"itemIdentifier": message.get("messageId", "")})
    return {"batchItemFailures": failures}
