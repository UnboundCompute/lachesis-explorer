import unittest
from unittest.mock import Mock
from unittest.mock import patch

from src import worker
from src.verify_bundle import prepare_file, validate_bundle


class WorkerTests(unittest.TestCase):
    def test_update_preserves_expiry_for_dynamodb_ttl(self):
        table = Mock()

        worker._update(table, "j_12345678", "building", [], expires_at=123, sha="a" * 40)

        update = table.update_item.call_args.kwargs
        self.assertEqual(update["ExpressionAttributeValues"][":expires_at"], 123)
        self.assertEqual(update["ExpressionAttributeValues"][":sha"], "a" * 40)

    def test_conditional_stage_conflict_stops_the_worker_cleanly(self):
        class Cancelled(Exception):
            response = {"Error": {"Code": "ConditionalCheckFailedException"}}

        table = Mock()
        table.update_item.side_effect = Cancelled()
        with self.assertRaises(worker.JobStopped):
            worker._update(table, "j_12345678", "building", [], expected_statuses={"cloning"})

    def test_git_commands_disable_prompts_and_global_configuration(self):
        completed = Mock(returncode=0, stdout="", stderr="")
        with patch.object(worker.subprocess, "run", return_value=completed) as run:
            worker._run(["git", "ls-remote", "https://github.com/owner/repo.git", "main"])

        env = run.call_args.kwargs["env"]
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(env["GIT_CONFIG_NOSYSTEM"], "1")
        self.assertEqual(env["GIT_CONFIG_GLOBAL"], worker.os.devnull)

    def test_failed_build_step_keeps_private_diagnostics_and_redacts_workspace(self):
        completed = Mock(returncode=2, stdout="", stderr="/tmp/lachesis-job-secret/src/main.ts: failed")
        with patch.object(worker.subprocess, "run", return_value=completed):
            with self.assertRaises(worker.BuildStepFailed) as raised:
                worker._run(["lachesis", "build", "/tmp/lachesis-job-secret"])

        self.assertIn("lachesis build exited 2", str(raised.exception))
        self.assertIn("<workspace>/src/main.ts", str(raised.exception))
        self.assertNotIn("lachesis-job-secret", str(raised.exception))

    def test_successful_step_without_stdout_capture_returns_empty_text(self):
        completed = Mock(returncode=0, stdout=None, stderr="")
        with patch.object(worker.subprocess, "run", return_value=completed):
            result = worker._run(["git", "clone"], capture_stdout=False)

        self.assertEqual(result, "")

    def test_repository_file_limit_accepts_the_launch_cap(self):
        with patch.object(worker, "_run", return_value="\0".join(f"src/{index}.py" for index in range(5_000)) + "\0"), \
             patch.dict(worker.os.environ, {"MAX_REPOSITORY_FILES": "5000"}):
            worker._enforce_repository_file_limit("/tmp/repository")

    def test_repository_file_limit_rejects_an_oversized_tree(self):
        with patch.object(worker, "_run", return_value="\0".join(f"src/{index}.py" for index in range(5_001)) + "\0"), \
             patch.dict(worker.os.environ, {"MAX_REPOSITORY_FILES": "5000"}):
            with self.assertRaises(worker.RepositoryTooLarge) as raised:
                worker._enforce_repository_file_limit("/tmp/repository")
        self.assertEqual(raised.exception.limit, 5_000)

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

    def test_worker_reads_queued_job_strongly_consistently(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"job_id": "j_12345678", "status": "cancelled"}}

        worker._process({"job_id": "j_12345678"}, table, Mock())

        table.get_item.assert_called_once_with(Key={"job_id": "j_12345678"}, ConsistentRead=True)

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

    def test_validator_accepts_a_readable_unmapped_node(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "typescript", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {
                "nodes": [{"id": "synthetic", "kind": "value", "file": "", "line": 0, "label": "synthetic value", "snippet": "synthetic value"}],
                "edges": [],
            },
        }

        self.assertIs(validate_bundle(bundle), bundle)

    def test_validator_accepts_a_source_less_graph_node(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {"nodes": [{"id": "synthetic", "kind": "module", "file": "", "line": 0, "label": "generated module"}]},
        }
        self.assertIs(validate_bundle(bundle), bundle)

    def test_validator_accepts_a_safe_source_url_template(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {
                "repository": "owner/repo", "language": "python", "revision": "a" * 40,
                "lines": 1, "indexed_nodes": 1,
                "source_url_template": "https://github.com/owner/repo/blob/{revision}/{file}#L{line}-L{end_line}",
            },
            "graph": {"nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}]},
        }
        self.assertIs(validate_bundle(bundle), bundle)

    def test_validator_rejects_an_unsafe_source_url_template(self):
        for template in (
            "javascript:alert(1)",
            "https://user:pass@example.com/{file}",
            "https://example.com/{owner}/{file}",
            "https://example.com/{revision}",
        ):
            bundle = {
                "format": "lachesis-explorer-bundle",
                "schema_version": "2.0",
                "meta": {
                    "repository": "owner/repo", "language": "python", "revision": "a" * 40,
                    "lines": 1, "indexed_nodes": 1, "source_url_template": template,
                },
                "graph": {"nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}]},
            }
            with self.assertRaises(ValueError):
                validate_bundle(bundle)

    def test_validator_requires_understanding_entrypoint_and_source_backed_path(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "analysis_projection": "code-understanding",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 2, "indexed_nodes": 2},
            "graph": {"nodes": [
                {"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"},
                {"id": "n2", "kind": "call", "file": "main.py", "line": 2, "label": "run", "snippet": "run()"},
            ], "entrypoints": [{"id": "entry.main", "label": "main", "node_id": "n1"}]},
            "paths": {"values": [{"id": "flow.main", "kind": "call-path", "steps": [{"node_id": "n1"}, {"node_id": "n2"}]}]},
        }
        self.assertIs(validate_bundle(bundle), bundle)

    def test_validator_rejects_understanding_projection_without_guided_path(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "analysis_projection": "code-understanding",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {"nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}], "entrypoints": [{"id": "entry.main", "label": "main", "node_id": "n1"}]},
        }
        with self.assertRaises(ValueError):
            validate_bundle(bundle)

    def test_validator_rejects_a_request_path_with_an_unknown_hop(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {"nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}]},
            "paths": {"requests": [{"id": "request.main", "hops": [{"node_id": "missing"}]}]},
        }
        with self.assertRaises(ValueError):
            validate_bundle(bundle)

    def test_validator_rejects_a_path_with_an_unknown_endpoint(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {"nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}]},
            "paths": {"values": [{"id": "flow.main", "source_node": "missing", "steps": [{"node_id": "n1"}]}]},
        }
        with self.assertRaises(ValueError):
            validate_bundle(bundle)

    def test_validator_rejects_a_module_with_an_unknown_parent(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "python", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {
                "nodes": [{"id": "n1", "kind": "function", "file": "main.py", "line": 1, "label": "main", "snippet": "def main(): pass"}],
                "modules": [{"id": "module.main", "name": "main", "parent_id": "module.missing", "node_ids": ["n1"]}],
            },
        }
        with self.assertRaises(ValueError):
            validate_bundle(bundle)

    def test_prepare_file_canonicalizes_a_null_source_mapping(self):
        bundle = {
            "format": "lachesis-explorer-bundle",
            "schema_version": "2.0",
            "meta": {"repository": "owner/repo", "language": "typescript", "revision": "a" * 40, "lines": 1, "indexed_nodes": 1},
            "graph": {
                "nodes": [{"id": "synthetic", "kind": "value", "file": None, "line": None, "label": "synthetic value", "snippet": "synthetic value"}],
                "edges": [],
            },
        }
        with worker.tempfile.NamedTemporaryFile(mode="w+", suffix=".json") as artifact:
            worker.json.dump(bundle, artifact)
            artifact.flush()
            prepared = prepare_file(artifact.name)

        self.assertEqual(prepared["graph"]["nodes"][0]["file"], "")
        self.assertEqual(prepared["graph"]["nodes"][0]["line"], 0)

    def test_process_exports_and_validates_before_uploading(self):
        table = Mock()
        table.get_item.return_value = {"Item": {
            "job_id": "j_12345678", "status": "queued", "git_url": "https://github.com/owner/repo.git",
            "ref": "main", "expires_at": 123,
        }}
        storage = Mock()
        class Missing(Exception):
            response = {"Error": {"Code": "NotFound"}}
        storage.head_object.side_effect = Missing()
        commands = []

        def run(args, **_kwargs):
            commands.append(args)
            return ""

        with patch.object(worker, "_sha", return_value="a" * 40), patch.object(worker, "_run", side_effect=run), \
             patch.object(worker, "prepare_file") as validate, patch.object(worker.os.path, "getsize", return_value=1), \
             patch.dict(worker.os.environ, {"BUNDLE_BUCKET": "bucket"}):
            worker._process({"job_id": "j_12345678"}, table, storage)

        trace = next(command for command in commands if command[:2] == ["lachesis", "trace"])
        self.assertIn("--schema-version", trace)
        validate.assert_called_once()
        storage.upload_file.assert_called_once()
        storage.copy_object.assert_called_once()

    def test_cache_key_is_opaque_and_changes_with_cache_version(self):
        with patch.dict(worker.os.environ, {"LACHESIS_CACHE_VERSION": "one"}):
            first = worker._cache_key("https://github.com/owner/repo.git", "a" * 40)
        with patch.dict(worker.os.environ, {"LACHESIS_CACHE_VERSION": "two"}):
            second = worker._cache_key("https://github.com/owner/repo.git", "a" * 40)
        self.assertNotEqual(first, second)
        self.assertRegex(first, r"^cache/[0-9a-f]{64}\.json$")

    def test_cache_key_changes_with_schema_toolchain_and_build_options(self):
        url = "https://github.com/owner/repo.git"
        sha = "a" * 40
        baseline = worker._cache_key(url, sha)
        for key in ("BUNDLE_SCHEMA_VERSION", "LACHESIS_TOOLCHAIN_FINGERPRINT", "BUILD_OPTIONS_FINGERPRINT", "BUILD_TIMEOUT_SECONDS"):
            with self.subTest(key=key), patch.dict(worker.os.environ, {key: "changed"}):
                self.assertNotEqual(baseline, worker._cache_key(url, sha))

    def test_cache_hit_skips_analysis_and_publishes_a_new_opaque_bundle(self):
        table = Mock()
        table.get_item.return_value = {"Item": {
            "job_id": "j_12345678", "status": "queued", "git_url": "https://github.com/owner/repo.git",
            "ref": "main", "expires_at": 123,
        }}
        storage = Mock()

        with patch.object(worker, "_sha", return_value="a" * 40), patch.object(worker, "_run") as run, \
             patch.dict(worker.os.environ, {"BUNDLE_BUCKET": "bucket"}):
            worker._process({"job_id": "j_12345678"}, table, storage)

        run.assert_not_called()
        storage.head_object.assert_called_once()
        storage.copy_object.assert_called_once()
        self.assertEqual(table.update_item.call_args.kwargs["ExpressionAttributeValues"][":status"], "ready")
        self.assertTrue(table.update_item.call_args.kwargs["ExpressionAttributeValues"][":cache_hit"])

    def test_handler_creates_aws_clients_lazily(self):
        clients = Mock()
        clients.resource.return_value.Table.return_value = Mock()
        clients.client.return_value = Mock()
        with patch.dict(worker.os.environ, {"JOBS_TABLE": "jobs"}), patch.dict("sys.modules", {"boto3": clients}):
            result = worker.handler({"Records": []}, None)
        self.assertEqual(result, {"batchItemFailures": []})
        clients.resource.assert_called_once_with("dynamodb")
        clients.client.assert_called_once_with("s3")

    def test_handler_marks_file_limit_as_terminal_without_retry(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"job_id": "j_12345678", "expires_at": 123}}
        clients = Mock()
        clients.resource.return_value.Table.return_value = table
        clients.client.return_value = Mock()
        event = {"Records": [{"messageId": "message-1", "body": '{"job_id":"j_12345678"}'}]}

        with patch.object(worker, "_process", side_effect=worker.RepositoryTooLarge(5_000)), \
             patch.dict(worker.os.environ, {"JOBS_TABLE": "jobs"}), patch.dict("sys.modules", {"boto3": clients}):
            result = worker.handler(event, None)

        self.assertEqual(result, {"batchItemFailures": []})
        update = table.update_item.call_args.kwargs["ExpressionAttributeValues"]
        self.assertEqual(update[":status"], "too_large")
        self.assertEqual(update[":error"]["kind"], "file_limit")


if __name__ == "__main__":
    unittest.main()
