"""HTTP API for opaque hosted bundle IDs and asynchronous build jobs."""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any

try:  # Lambda loads this directory as the module root; tests load it as a package.
    from contract import canonical_git_url, opaque_id, valid_opaque_id, valid_ref
except ImportError:
    from .contract import canonical_git_url, opaque_id, valid_opaque_id, valid_ref

MAX_RESPONSE_BYTES = 5 * 1024 * 1024


def _aws():
    import boto3
    return boto3.resource("dynamodb").Table(os.environ["JOBS_TABLE"]), boto3.client("sqs"), boto3.client("s3")


def _response(status: int, body: Any, headers: dict[str, str] | None = None) -> dict[str, Any]:
    allowed = os.environ.get("EXPLORER_ORIGIN", "")
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store",
                     **({"access-control-allow-origin": allowed} if allowed else {}), **(headers or {})},
        "body": json.dumps(body, separators=(",", ":")),
    }


def _json(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("request body must be a JSON object")
    return value


def _path(event: dict[str, Any]) -> str:
    return str(event.get("rawPath") or event.get("path") or "/")


def _job_view(item: dict[str, Any]) -> dict[str, Any]:
    result = {"job_id": item["job_id"], "status": item.get("status", "queued"),
              "steps": item.get("steps", [])}
    for key in ("sha", "bundle_id", "error"):
        if item.get(key) is not None:
            result[key] = item[key]
    return result


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    method = str(event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    path = _path(event)
    try:
        if method == "POST" and path.endswith("/api/build"):
            body = _json(event)
            git_url = canonical_git_url(body.get("git_url"))
            ref = valid_ref(body.get("ref"))
            job_id = opaque_id("j")
            jobs, queue, _storage = _aws()
            jobs.put_item(Item={"job_id": job_id, "status": "queued", "git_url": git_url, "ref": ref,
                                "expires_at": int(time.time()) + 3600,
                                "steps": [{"key": "clone", "state": "pending"}, {"key": "build", "state": "pending"},
                                           {"key": "export", "state": "pending"}]})
            queue.send_message(QueueUrl=os.environ["BUILD_QUEUE_URL"], MessageBody=json.dumps({"job_id": job_id}))
            return _response(202, {"job_id": job_id, "status": "queued"})
        if method == "GET" and path.endswith("/api/build"):
            job_id = (event.get("queryStringParameters") or {}).get("job_id", "")
            if not valid_opaque_id(job_id, "j"):
                return _response(400, {"error": {"message": "job_id is invalid"}})
            jobs, _queue, _storage = _aws()
            item = jobs.get_item(Key={"job_id": job_id}).get("Item")
            return _response(404 if not item else 200, {"error": {"message": "job not found"}} if not item else _job_view(item))
        if method == "GET" and "/api/build/" in path:
            job_id = path.rsplit("/", 1)[-1]
            if not valid_opaque_id(job_id, "j"):
                return _response(400, {"error": {"message": "job_id is invalid"}})
            jobs, _queue, _storage = _aws()
            item = jobs.get_item(Key={"job_id": job_id}).get("Item")
            return _response(404 if not item else 200, {"error": {"message": "job not found"}} if not item else _job_view(item))
        if method == "GET" and "/api/bundles/" in path:
            bundle_id = path.rsplit("/", 1)[-1]
            if not valid_opaque_id(bundle_id, "b"):
                return _response(400, {"error": {"message": "bundle_id is invalid"}})
            _jobs, _queue, storage = _aws()
            obj = storage.get_object(Bucket=os.environ["BUNDLE_BUCKET"], Key=f"bundles/{bundle_id}.json")
            if int(obj.get("ContentLength", 0)) > MAX_RESPONSE_BYTES:
                return _response(413, {"error": {"message": "bundle is too large for direct API delivery"}})
            allowed = os.environ.get("EXPLORER_ORIGIN", "")
            headers = {"content-type": "application/json", "cache-control": "private, max-age=60"}
            if allowed:
                headers["access-control-allow-origin"] = allowed
            return {"statusCode": 200, "headers": headers,
                    "body": obj["Body"].read().decode("utf-8")}
        return _response(404, {"error": {"message": "route not found"}})
    except (ValueError, json.JSONDecodeError) as error:
        return _response(400, {"error": {"message": str(error)}})
    except Exception:
        # Do not expose repository URLs, command lines, storage keys or worker details.
        return _response(500, {"error": {"message": "hosted bundle service is temporarily unavailable"}})
