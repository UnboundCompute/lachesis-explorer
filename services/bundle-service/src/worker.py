"""SQS worker: clone an immutable revision, export a validated bundle, and store it privately."""
from __future__ import annotations

import json
import hashlib
import os
import re
import subprocess
import tempfile
import time
from typing import Any
from urllib.parse import urlsplit

try:  # Lambda loads this directory as the module root; tests may load it as a package.
    from contract import canonical_git_url, opaque_id, valid_ref
    from verify_bundle import validate_file
except ImportError:
    from .contract import canonical_git_url, opaque_id, valid_ref
    from .verify_bundle import validate_file

SHA_RE = re.compile(r"^[0-9a-fA-F]{40,64}$")


class JobStopped(Exception):
    """The job was cancelled or changed state while the worker was running."""


def _run(args: list[str], cwd: str | None = None, timeout: int = 60, capture_stdout: bool = True) -> str:
    env = None
    if args and args[0] == "git":
        env = os.environ.copy()
        env.update({
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
        })
    result = subprocess.run(
        args,
        cwd=cwd,
        stdout=subprocess.PIPE if capture_stdout else subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=timeout,
        check=False,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError("build step failed")
    return result.stdout.strip()


def _update(
    table: Any,
    job_id: str,
    status: str,
    steps: list[dict[str, str]],
    expires_at: int | None = None,
    expected_statuses: set[str] | None = None,
    **values: Any,
) -> None:
    names = {"#status": "status"}
    attributes: dict[str, Any] = {":status": status, ":steps": steps, ":updated_at": int(time.time())}
    assignments = ["#status = :status", "steps = :steps", "updated_at = :updated_at"]
    if expires_at is not None:
        assignments.append("expires_at = :expires_at")
        attributes[":expires_at"] = expires_at
    for key, value in values.items():
        names[f"#{key}"] = key
        attributes[f":{key}"] = value
        assignments.append(f"#{key} = :{key}")
    kwargs: dict[str, Any] = {
        "Key": {"job_id": job_id},
        "UpdateExpression": "SET " + ", ".join(assignments),
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": attributes,
    }
    if expected_statuses:
        ordered = sorted(expected_statuses)
        placeholders = [f":expected_{index}" for index in range(len(ordered))]
        kwargs["ConditionExpression"] = "#status IN (" + ", ".join(placeholders) + ")"
        kwargs["ExpressionAttributeValues"].update(dict(zip(placeholders, ordered)))
    try:
        table.update_item(**kwargs)
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code == "ConditionalCheckFailedException":
            raise JobStopped from error
        raise


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


def _cache_key(url: str, sha: str) -> str:
    identity = "|".join((
        url,
        sha,
        os.environ.get("LACHESIS_CACHE_VERSION", "lachesis-0.4.2|explorer-2.0"),
        os.environ.get("BUILD_TIMEOUT_SECONDS", "600"),
    ))
    return f"cache/{hashlib.sha256(identity.encode('utf-8')).hexdigest()}.json"


def _cache_exists(storage: Any, bucket: str, key: str) -> bool:
    try:
        storage.head_object(Bucket=bucket, Key=key)
        return True
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _copy_bundle(storage: Any, bucket: str, source_key: str, bundle_id: str) -> None:
    storage.copy_object(
        CopySource={"Bucket": bucket, "Key": source_key},
        Bucket=bucket,
        Key=f"bundles/{bundle_id}.json",
        MetadataDirective="COPY",
        ServerSideEncryption="AES256",
    )


def _process(job: dict[str, Any], table: Any, storage: Any) -> None:
    job_id = str(job["job_id"])
    record = table.get_item(Key={"job_id": job_id}).get("Item") or {}
    if record.get("status") in {"ready", "cancelled", "expired"}:
        return
    url = canonical_git_url(record.get("git_url"))
    ref = valid_ref(record.get("ref"))
    expires_at = record.get("expires_at")
    bucket = os.environ["BUNDLE_BUCKET"]
    steps = [{"key": key, "state": "pending"} for key in ("clone", "build", "export")]
    with tempfile.TemporaryDirectory(prefix="lachesis-job-") as work:
        sha = _sha(url, ref)
        if table.get_item(Key={"job_id": job_id}).get("Item", {}).get("status") == "cancelled":
            return
        cache_key = _cache_key(url, sha)
        if _cache_exists(storage, bucket, cache_key):
            bundle_id = opaque_id("b")
            _copy_bundle(storage, bucket, cache_key, bundle_id)
            done_steps = [{"key": key, "state": "done"} for key in ("clone", "build", "export")]
            _update(table, job_id, "ready", done_steps, expires_at=expires_at,
                    expected_statuses={"queued"}, sha=sha, bundle_id=bundle_id, cache_hit=True)
            return
        steps[0]["state"] = "active"; _update(table, job_id, "cloning", steps, expires_at=expires_at, expected_statuses={"queued"}, sha=sha)
        _run(["git", "clone", "--depth", "1", "--no-tags", "--no-recurse-submodules", "-c", "core.hooksPath=/dev/null", "-c", "filter.lfs.smudge=--skip", "-c", "filter.lfs.required=false", url, work], timeout=180, capture_stdout=False)
        _run(["git", "fetch", "--depth", "1", "origin", sha], cwd=work, timeout=120, capture_stdout=False)
        _run(["git", "checkout", "--detach", sha], cwd=work, timeout=30, capture_stdout=False)
        steps[0]["state"] = "done"; steps[1]["state"] = "active"; _update(table, job_id, "building", steps, expires_at=expires_at, expected_statuses={"cloning"}, sha=sha)
        graph = os.path.join(work, "graph.kuzu")
        _run(["lachesis", "build", work, graph, "--timeout", os.environ.get("BUILD_TIMEOUT_SECONDS", "600")], timeout=660, capture_stdout=False)
        if table.get_item(Key={"job_id": job_id}).get("Item", {}).get("status") == "cancelled":
            return
        steps[1]["state"] = "done"; steps[2]["state"] = "active"; _update(table, job_id, "exporting", steps, expires_at=expires_at, expected_statuses={"building"}, sha=sha)
        bundle = os.path.join(work, "bundle.json")
        trace_args = ["lachesis", "trace", graph, "--out", bundle, "--repo-name", _repo_name(url),
                      "--commit", sha, "--schema-version", "2.0", "--quiet"]
        template = _source_template(url)
        if template:
            trace_args.extend(["--source-url-template", template])
        _run(trace_args, timeout=660, capture_stdout=False)
        if table.get_item(Key={"job_id": job_id}).get("Item", {}).get("status") == "cancelled":
            return
        if os.path.getsize(bundle) > 5 * 1024 * 1024:
            raise RuntimeError("bundle exceeds direct API response limit")
        validate_file(bundle)
        bundle_id = opaque_id("b")
        storage.upload_file(bundle, bucket, cache_key, ExtraArgs={"ContentType": "application/json", "ServerSideEncryption": "AES256"})
        _copy_bundle(storage, bucket, cache_key, bundle_id)
        steps[2]["state"] = "done"; _update(table, job_id, "ready", steps, expires_at=expires_at, expected_statuses={"exporting"}, sha=sha, bundle_id=bundle_id)


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    import boto3

    table = boto3.resource("dynamodb").Table(os.environ["JOBS_TABLE"])
    storage = boto3.client("s3")
    failures = []
    for message in event.get("Records", []):
        try:
            _process(json.loads(message["body"]), table, storage)
        except JobStopped:
            continue
        except Exception:
            job_id = ""
            try: job_id = str(json.loads(message["body"])["job_id"])
            except Exception: pass
            if job_id:
                try:
                    existing = table.get_item(Key={"job_id": job_id}).get("Item") or {}
                    _update(table, job_id, "error", [], expires_at=existing.get("expires_at"),
                            error={"message": "build failed", "kind": "build_failed"})
                except Exception:
                    pass
            message_id = message.get("messageId")
            if message_id:
                failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
