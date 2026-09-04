import unittest
from unittest.mock import patch
import json

from src.contract import canonical_git_url, valid_opaque_id, valid_ref
from src import handler


class ContractTests(unittest.TestCase):
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
            def update_item(self, **_kwargs): pass

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
