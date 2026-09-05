"""HTTP API for opaque hosted bundle IDs and asynchronous build jobs."""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import time
from typing import Any

try:  # Lambda loads this directory as the module root; tests load it as a package.
    from contract import canonical_git_url, opaque_id, valid_opaque_id, valid_ref
except ImportError:
    from .contract import canonical_git_url, opaque_id, valid_opaque_id, valid_ref

MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = 64 * 1024
DEFAULT_BUILD_RATE_LIMIT = 5


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
    if len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ValueError("request body is too large")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("request body must be a JSON object")
    return value


def _path(event: dict[str, Any]) -> str:
    return str(event.get("rawPath") or event.get("path") or "/")


def _job_view(item: dict[str, Any]) -> dict[str, Any]:
    if item.get("expires_at") is not None and int(item["expires_at"]) <= int(time.time()):
        return {"job_id": item["job_id"], "status": "expired", "steps": []}
    result = {"job_id": item["job_id"], "status": item.get("status", "queued"),
              "steps": item.get("steps", [])}
    for key in ("sha", "bundle_id", "error"):
        if item.get(key) is not None:
            result[key] = item[key]
    return result


def _cancel_job(jobs: Any, job_id: str) -> dict[str, Any] | None:
    """Cancel only jobs that have not reached a terminal state."""
    try:
        jobs.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #status = :cancelled, updated_at = :updated_at",
            ConditionExpression="#status IN (:queued, :cloning, :building, :exporting)",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":cancelled": "cancelled", ":updated_at": int(time.time()),
                ":queued": "queued", ":cloning": "cloning", ":building": "building", ":exporting": "exporting",
            },
            ReturnValues="ALL_NEW",
        )
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code != "ConditionalCheckFailedException":
            raise
    return jobs.get_item(Key={"job_id": job_id}).get("Item")


def _source_ip(event: dict[str, Any]) -> str:
    context = event.get("requestContext") or {}
    http = context.get("http") or {}
    identity = context.get("identity") or {}
    return str(http.get("sourceIp") or identity.get("sourceIp") or "unknown")


def _within_build_quota(jobs: Any, event: dict[str, Any]) -> bool:
    """Consume one hourly quota slot without storing the caller's raw IP."""
    now = int(time.time())
    window = now // 3600
    digest = hashlib.sha256(_source_ip(event).encode("utf-8")).hexdigest()
    bucket_id = f"rate_{digest}_{window}"
    limit = max(1, int(os.environ.get("BUILD_RATE_LIMIT", str(DEFAULT_BUILD_RATE_LIMIT))))
    try:
        jobs.update_item(
            Key={"job_id": bucket_id},
            UpdateExpression="SET request_count = if_not_exists(request_count, :zero) + :one, expires_at = :expires_at",
            ConditionExpression="attribute_not_exists(request_count) OR request_count < :limit",
            ExpressionAttributeValues={":zero": 0, ":one": 1, ":limit": limit, ":expires_at": window + 7200},
        )
        return True
    except Exception as error:
        code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
        if code == "ConditionalCheckFailedException":
            return False
        raise


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
            if not _within_build_quota(jobs, event):
                retry_after = 3600 - (int(time.time()) % 3600)
                return _response(429, {"error": {"message": "The hourly hosted build limit has been reached."}},
                                 {"retry-after": str(retry_after)})
            expires_at = int(time.time()) + 3600
            steps = [{"key": "clone", "state": "pending"}, {"key": "build", "state": "pending"},
                     {"key": "export", "state": "pending"}]
            jobs.put_item(Item={"job_id": job_id, "status": "queued", "git_url": git_url, "ref": ref,
                                "expires_at": expires_at, "steps": steps})
            try:
                queue.send_message(QueueUrl=os.environ["BUILD_QUEUE_URL"], MessageBody=json.dumps({"job_id": job_id}))
            except Exception:
                try:
                    jobs.put_item(Item={"job_id": job_id, "status": "error", "expires_at": expires_at,
                                        "steps": steps, "error": {"message": "build could not be queued", "kind": "queue_unavailable"},
                                        "updated_at": int(time.time())})
                except Exception:
                    pass
                return _response(503, {"error": {"message": "The hosted builder is temporarily unavailable."}},
                                 {"retry-after": "30"})
            return _response(202, {"job_id": job_id, "status": "queued"})
        if method == "GET" and path.endswith("/api/build"):
            job_id = (event.get("queryStringParameters") or {}).get("job_id", "")
            if not valid_opaque_id(job_id, "j"):
                return _response(400, {"error": {"message": "job_id is invalid"}})
            jobs, _queue, _storage = _aws()
            item = jobs.get_item(Key={"job_id": job_id}).get("Item")
            return _response(404 if not item else 200, {"error": {"message": "job not found"}} if not item else _job_view(item))
        if method == "POST" and path.endswith("/cancel") and "/api/build/" in path:
            job_id = path.rsplit("/", 2)[-2]
            if not valid_opaque_id(job_id, "j"):
                return _response(400, {"error": {"message": "job_id is invalid"}})
            jobs, _queue, _storage = _aws()
            item = jobs.get_item(Key={"job_id": job_id}).get("Item")
            if not item:
                return _response(404, {"error": {"message": "job not found"}})
            return _response(200, _job_view(_cancel_job(jobs, job_id) or item))
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
            try:
                obj = storage.get_object(Bucket=os.environ["BUNDLE_BUCKET"], Key=f"bundles/{bundle_id}.json")
            except Exception as error:
                error_code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
                if error_code in {"404", "NoSuchKey", "NoSuchBucket"}:
                    return _response(404, {"error": {"message": "hosted bundle not found or expired"}})
                raise
            if int(obj.get("ContentLength", 0)) > MAX_RESPONSE_BYTES:
                return _response(413, {"error": {"message": "bundle is too large for direct API delivery"}})
            payload = obj["Body"].read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                return _response(413, {"error": {"message": "bundle is too large for direct API delivery"}})
            allowed = os.environ.get("EXPLORER_ORIGIN", "")
            headers = {"content-type": "application/json", "cache-control": "private, max-age=60"}
            if allowed:
                headers["access-control-allow-origin"] = allowed
            return {"statusCode": 200, "headers": headers,
                    "body": payload.decode("utf-8")}
        return _response(404, {"error": {"message": "route not found"}})
    except (ValueError, json.JSONDecodeError, UnicodeError, binascii.Error) as error:
        return _response(400, {"error": {"message": str(error)}})
    except Exception:
        # Do not expose repository URLs, command lines, storage keys or worker details.
        return _response(500, {"error": {"message": "hosted bundle service is temporarily unavailable"}})
