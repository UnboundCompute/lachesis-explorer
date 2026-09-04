import unittest
from unittest.mock import Mock
from unittest.mock import patch

from src import worker
from src.verify_bundle import validate_bundle


class WorkerTests(unittest.TestCase):
    def test_update_preserves_expiry_for_dynamodb_ttl(self):
        table = Mock()

        worker._update(table, "j_12345678", "building", [], expires_at=123, sha="a" * 40)

        item = table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["expires_at"], 123)
        self.assertEqual(item["sha"], "a" * 40)

    def test_ready_job_is_idempotent(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"job_id": "j_12345678", "status": "ready"}}
        storage = Mock()

        worker._process({"job_id": "j_12345678"}, table, storage)

        table.put_item.assert_not_called()
        storage.upload_file.assert_not_called()

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


if __name__ == "__main__":
    unittest.main()
