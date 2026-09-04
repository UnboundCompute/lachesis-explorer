import unittest
from unittest.mock import Mock
from unittest.mock import patch

from src import worker
from src.verify_bundle import validate_bundle


class WorkerTests(unittest.TestCase):
    def test_update_preserves_expiry_for_dynamodb_ttl(self):
        table = Mock()

        worker._update(table, "j_12345678", "building", [], expires_at=123, sha="a" * 40)

        update = table.update_item.call_args.kwargs
        self.assertEqual(update["ExpressionAttributeValues"][":expires_at"], 123)
        self.assertEqual(update["ExpressionAttributeValues"][":sha"], "a" * 40)

    def test_git_commands_disable_prompts_and_global_configuration(self):
        completed = Mock(returncode=0, stdout="", stderr="")
        with patch.object(worker.subprocess, "run", return_value=completed) as run:
            worker._run(["git", "ls-remote", "https://github.com/owner/repo.git", "main"])

        env = run.call_args.kwargs["env"]
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(env["GIT_CONFIG_NOSYSTEM"], "1")
        self.assertEqual(env["GIT_CONFIG_GLOBAL"], worker.os.devnull)

    def test_ready_job_is_idempotent(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"job_id": "j_12345678", "status": "ready"}}
        storage = Mock()

        worker._process({"job_id": "j_12345678"}, table, storage)

        table.put_item.assert_not_called()
        storage.upload_file.assert_not_called()

    def test_cancelled_job_is_not_started(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"job_id": "j_12345678", "status": "cancelled"}}

        worker._process({"job_id": "j_12345678"}, table, Mock())

        table.put_item.assert_not_called()

    def test_validator_rejects_a_bundle_with_an_unknown_edge_target(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {
                "nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}],
                "edges": [{"source": "n1", "target": "missing"}],
            },
        }
        with self.assertRaises(ValueError):
            validate_bundle(bundle)

    def test_process_exports_and_validates_before_uploading(self):
        table = Mock()
        table.get_item.return_value = {"Item": {
            "job_id": "j_12345678", "status": "queued", "git_url": "https://github.com/owner/repo.git",
            "ref": "main", "expires_at": 123,
        }}
        storage = Mock()
        commands = []

        def run(args, **_kwargs):
            commands.append(args)
            return ""

        with patch.object(worker, "_sha", return_value="a" * 40), patch.object(worker, "_run", side_effect=run), \
             patch.object(worker, "validate_file") as validate, patch.object(worker.os.path, "getsize", return_value=1), \
             patch.dict(worker.os.environ, {"BUNDLE_BUCKET": "bucket"}):
            worker._process({"job_id": "j_12345678"}, table, storage)

        trace = next(command for command in commands if command[:2] == ["lachesis", "trace"])
        self.assertIn("--schema-version", trace)
        validate.assert_called_once()
        storage.upload_file.assert_called_once()

    def test_handler_creates_aws_clients_lazily(self):
        clients = Mock()
        clients.resource.return_value.Table.return_value = Mock()
        clients.client.return_value = Mock()
        with patch.dict(worker.os.environ, {"JOBS_TABLE": "jobs"}), patch.dict("sys.modules", {"boto3": clients}):
            result = worker.handler({"Records": []}, None)
        self.assertEqual(result, {"batchItemFailures": []})
        clients.resource.assert_called_once_with("dynamodb")
        clients.client.assert_called_once_with("s3")


if __name__ == "__main__":
    unittest.main()
