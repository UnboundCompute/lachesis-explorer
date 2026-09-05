import unittest
from unittest.mock import patch
import json

from src.contract import canonical_git_url, valid_opaque_id, valid_ref
from src.repository_index import latest_key, manifest, repository_slug, revision_key
from src import handler


class ContractTests(unittest.TestCase):
    def test_repository_index_is_deterministic_and_revision_scoped(self):
        url = "https://github.com/GNOME/libxml2"
        sha = "A" * 40
        self.assertEqual(repository_slug(url), "github.com/GNOME/libxml2")
        self.assertEqual(latest_key(url), "repository-index/github.com/GNOME/libxml2/latest.json")
        self.assertEqual(revision_key(url, sha), "repository-index/github.com/GNOME/libxml2/revisions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json")
        record = manifest(git_url=url, ref="main", sha=sha, bundle_id="b_12345678", built_at=12)
        self.assertEqual(record["revision"], "a" * 40)
        self.assertEqual(record["repository"], "github.com/GNOME/libxml2")

    def test_canonicalizes_supported_public_repo(self):
        self.assertEqual(canonical_git_url("https://github.com/GNOME/libxml2"),
                         "https://github.com/GNOME/libxml2.git")

    def test_rejects_credentials_and_unsupported_hosts(self):
        for value in ("https://user:pass@github.com/a/b", "https://evil.example/a/b", "git@github.com:a/b"):
            with self.assertRaises(ValueError):
                canonical_git_url(value)

    def test_rejects_unsafe_ref(self):
        with self.assertRaises(ValueError):
            valid_ref("../../etc/passwd")

    def test_ids_are_opaque_and_prefix_bound(self):
        self.assertTrue(valid_opaque_id("b_12345678", "b"))
        self.assertFalse(valid_opaque_id("github-owner-repo", "b"))
        self.assertFalse(valid_opaque_id("j_12345678", "b"))

    def test_build_request_returns_no_repository_details_and_sets_expiry(self):
        class Table:
            def __init__(self): self.item = None
            def put_item(self, **kwargs): self.item = kwargs["Item"]
            def update_item(self, **_kwargs): pass

        class Queue:
            def send_message(self, **_kwargs): pass

        table = Table()
        with patch.object(handler, "_aws", return_value=(table, Queue(), object())), patch.dict(handler.os.environ, {"BUILD_QUEUE_URL": "queue"}):
            response = handler.handler({
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/api/build",
                "body": json.dumps({"git_url": "https://github.com/GNOME/libxml2", "ref": "main"}),
            }, None)
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 202)
        self.assertNotIn("git_url", body)
        self.assertIn("expires_at", table.item)
        self.assertTrue(body["job_id"].startswith("j_"))

    def test_build_request_enforces_the_hourly_quota(self):
        class LimitReached(Exception):
            response = {"Error": {"Code": "ConditionalCheckFailedException"}}

        class Table:
            def update_item(self, **_kwargs): raise LimitReached()

        class Queue:
            def send_message(self, **_kwargs): self.sent = True

        table = Table()
        with patch.object(handler, "_aws", return_value=(table, Queue(), object())), patch.dict(
            handler.os.environ, {"BUILD_RATE_LIMIT": "5"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "POST", "sourceIp": "203.0.113.4"}},
                "rawPath": "/api/build",
                "body": json.dumps({"git_url": "https://github.com/GNOME/libxml2", "ref": "main"}),
            }, None)
        self.assertEqual(response["statusCode"], 429)
        self.assertIn("retry-after", response["headers"])

    def test_build_request_marks_job_failed_when_queueing_fails(self):
        class Table:
            def __init__(self): self.items = []
            def put_item(self, **kwargs): self.items.append(kwargs["Item"])
            def update_item(self, **kwargs):
                values = kwargs["ExpressionAttributeValues"]
                if ":status" in values:
                    self.items.append({"status": values[":status"], "expires_at": values.get(":expires_at")})

        class Queue:
            def send_message(self, **_kwargs): raise RuntimeError("queue unavailable")

        table = Table()
        with patch.object(handler, "_aws", return_value=(table, Queue(), object())), patch.dict(
            handler.os.environ, {"BUILD_QUEUE_URL": "queue"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/api/build",
                "body": json.dumps({"git_url": "https://github.com/GNOME/libxml2", "ref": "main"}),
            }, None)
        self.assertEqual(response["statusCode"], 503)
        self.assertEqual(table.items[-1]["status"], "error")
        self.assertIn("expires_at", table.items[-1])

    def test_bundle_endpoint_rejects_non_opaque_ids_before_storage_access(self):
        with patch.object(handler, "_aws") as aws:
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/bundles/github-owner-repo",
            }, None)
        self.assertEqual(response["statusCode"], 400)
        aws.assert_not_called()

    def test_missing_bundle_is_an_expired_link_response(self):
        class Missing(Exception):
            response = {"Error": {"Code": "NoSuchKey"}}

        class Storage:
            def get_object(self, **_kwargs): raise Missing()

        with patch.object(handler, "_aws", return_value=(object(), object(), Storage())), patch.dict(handler.os.environ, {"BUNDLE_BUCKET": "bucket"}):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/bundles/b_12345678",
            }, None)
        self.assertEqual(response["statusCode"], 404)

    def test_repository_route_resolves_the_latest_index_record_without_enumerating_jobs(self):
        class Body:
            def read(self, _amount):
                return json.dumps({
                    "schema_version": "1", "repository": "github.com/owner/repo",
                    "revision": "a" * 40, "bundle_id": "b_12345678", "built_at": 12,
                }).encode()

        class Storage:
            def get_object(self, **kwargs):
                self.kwargs = kwargs
                return {"Body": Body(), "ContentLength": 128}

        storage = Storage()
        with patch.object(handler, "_aws", return_value=(object(), object(), storage)), patch.dict(
            handler.os.environ, {"BUNDLE_BUCKET": "bucket"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/repos/owner/repo",
            }, None)
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["bundle_url"], "/api/bundles/b_12345678")
        self.assertEqual(storage.kwargs["Key"], "repository-index/github.com/owner/repo/latest.json")

    def test_repository_route_supports_a_pinned_revision(self):
        class Body:
            def read(self, _amount):
                return json.dumps({"bundle_id": "b_12345678"}).encode()

        class Storage:
            def get_object(self, **kwargs):
                self.kwargs = kwargs
                return {"Body": Body(), "ContentLength": 32}

        storage = Storage()
        revision = "a" * 40
        with patch.object(handler, "_aws", return_value=(object(), object(), storage)), patch.dict(
            handler.os.environ, {"BUNDLE_BUCKET": "bucket"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/repos/gitlab.com/owner/repo",
                "queryStringParameters": {"revision": revision},
            }, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertIn(f"/revisions/{revision}.json", storage.kwargs["Key"])

    def test_repository_gallery_reads_only_latest_pointers_and_returns_newest_first(self):
        class Body:
            def __init__(self, record): self.record = record
            def read(self, _amount): return json.dumps(self.record).encode()

        class Storage:
            def list_objects_v2(self, **_kwargs):
                return {"Contents": [
                    {"Key": "repository-index/github.com/owner/old/latest.json"},
                    {"Key": "repository-index/github.com/owner/new/latest.json"},
                    {"Key": "repository-index/github.com/owner/new/revisions/abc.json"},
                ]}
            def get_object(self, **kwargs):
                repo = "new" if "/new/" in kwargs["Key"] else "old"
                return {"Body": Body({"bundle_id": f"b_{repo}12345678", "repository": f"github.com/owner/{repo}", "built_at": 20 if repo == "new" else 10}), "ContentLength": 128}

        with patch.object(handler, "_aws", return_value=(object(), object(), Storage())), patch.dict(
            handler.os.environ, {"BUNDLE_BUCKET": "bucket"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/repos",
            }, None)
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual([item["repository"] for item in body["repositories"]], [
            "github.com/owner/new", "github.com/owner/old",
        ])

    def test_status_endpoint_expires_jobs_before_dynamodb_ttl_cleanup(self):
        class Jobs:
            def get_item(self, **_kwargs): return {"Item": {
                "job_id": "j_12345678", "status": "ready", "expires_at": 1,
                "bundle_id": "b_12345678",
            }}

        with patch.object(handler, "_aws", return_value=(Jobs(), object(), object())):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/build/j_12345678",
            }, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"])["status"], "expired")

    def test_cancel_endpoint_marks_an_active_job_cancelled(self):
        class Jobs:
            def update_item(self, **_kwargs): pass
            def get_item(self, **_kwargs): return {"Item": {"job_id": "j_12345678", "status": "cancelled", "steps": []}}

        with patch.object(handler, "_aws", return_value=(Jobs(), object(), object())):
            response = handler.handler({
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/api/build/j_12345678/cancel",
            }, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"])["status"], "cancelled")

    def test_build_request_rejects_oversized_body_before_aws_access(self):
        with patch.object(handler, "_aws") as aws:
            response = handler.handler({
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/api/build",
                "body": "x" * (handler.MAX_REQUEST_BYTES + 1),
            }, None)
        self.assertEqual(response["statusCode"], 400)
        aws.assert_not_called()

    def test_build_request_rejects_malformed_base64(self):
        with patch.object(handler, "_aws") as aws:
            response = handler.handler({
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/api/build",
                "isBase64Encoded": True,
                "body": "not-base64",
            }, None)
        self.assertEqual(response["statusCode"], 400)
        aws.assert_not_called()

    def test_bundle_endpoint_enforces_body_limit_while_reading(self):
        class Body:
            def read(self, amount):
                self.amount = amount
                return b"x" * amount

        class Storage:
            def get_object(self, **_kwargs):
                return {"Body": Body(), "ContentLength": 0}

        with patch.object(handler, "_aws", return_value=(object(), object(), Storage())), patch.dict(
            handler.os.environ, {"BUNDLE_BUCKET": "bucket"}
        ):
            response = handler.handler({
                "requestContext": {"http": {"method": "GET"}},
                "rawPath": "/api/bundles/b_12345678",
            }, None)
        self.assertEqual(response["statusCode"], 413)


if __name__ == "__main__":
    unittest.main()
