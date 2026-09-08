"""Actions runtime proof must identify the tested merge, not mutable PR links."""
from __future__ import annotations

import copy
import hashlib
import io
import json
import stat
import unittest
from unittest.mock import patch
import zipfile

from tools.delivery.actions_subject import bind_checks, read_subject
from tools.delivery.receipts import _apply_identity

HEAD, BASE, MERGE = "a" * 40, "b" * 40, "c" * 40
REPOSITORY = "StorminRH/lgi-tools"


def archive(subject: dict | str, filename: str = "ci-subject.json", mode: int | None = None) -> bytes:
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as zipped:
        entry = zipfile.ZipInfo(filename)
        if mode is not None:
            entry.external_attr = mode << 16
        zipped.writestr(entry, subject if isinstance(subject, str) else json.dumps(subject))
    return result.getvalue()


class ActionsSubjectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pr = {"number": 123, "base": {"ref": "staging", "sha": BASE, "repo": {"full_name": REPOSITORY, "id": 99}}, "head": {"ref": "development", "sha": HEAD}}
        self.subject = {"schema": 1, "repository": REPOSITORY, "workflow_ref": f"{REPOSITORY}/.github/workflows/test.yml@refs/pull/123/merge", "workflow_sha": MERGE, "run_id": "200", "run_attempt": "1", "event_name": "pull_request", "pull_request_number": "123", "base_ref": "staging", "base_sha": BASE, "head_ref": "development", "head_sha": HEAD, "merge_sha": MERGE}
        self.run = {"id": 200, "run_attempt": 1, "workflow_id": 10, "path": ".github/workflows/test.yml", "event": "pull_request", "status": "completed", "conclusion": "success", "head_sha": HEAD, "check_suite_id": 20, "repository": {"id": 99}, "pull_requests": [{"head": {"sha": HEAD}, "base": {"sha": BASE}}]}
        self.checks = [{"id": 100 + index, "name": name, "check_suite": {"id": 20}, "app": {"slug": "github-actions", "id": 15368}, "head_sha": HEAD, "status": "completed", "conclusion": "success"} for index, name in enumerate(("verify", "build", "e2e"))]
        self.jobs = [{"check_run_url": f"https://api.github.com/repos/{REPOSITORY}/check-runs/{check['id']}", "run_id": 200, "run_attempt": 1, "status": "completed", "conclusion": "success", "completed_at": "2026-09-08T12:00:00Z"} for check in self.checks]
        self.artifacts = [{"id": 300, "name": "ci-subject", "expired": False, "size_in_bytes": 1024, "workflow_run": {"id": 200, "head_sha": HEAD}}]

    def bind(self, *, historical: dict | None = None) -> dict:
        def get(path: str, token: str) -> dict:
            if path.endswith("/workflows/test.yml"):
                return {"id": 10, "path": ".github/workflows/test.yml"}
            if "/runs/200" in path:
                return self.run
            raise AssertionError(path)

        def all_rows(path: str, token: str, key: str) -> list:
            if key == "workflow_runs":
                return [self.run]
            if key == "jobs":
                return self.jobs
            if key == "artifacts":
                return self.artifacts
            raise AssertionError(path)

        with patch("tools.delivery.actions_subject._get", side_effect=get), patch("tools.delivery.actions_subject.github_api.get_all", side_effect=all_rows), patch("tools.delivery.actions_subject.download", return_value=archive(self.subject)) as download:
            result = bind_checks(REPOSITORY, self.checks, self.pr, MERGE, BASE, "fixture", historical=historical)
            if historical is not None:
                download.assert_not_called()
            return result

    def test_success_binds_all_checks_to_exact_runtime_merge(self) -> None:
        result = self.bind()
        self.assertEqual(200, result["run_id"])
        self.assertEqual([100, 101, 102], result["check_ids"])
        self.assertTrue(all(check["tested_merge_sha"] == MERGE for check in self.checks))

    def test_mutable_associated_pr_cannot_override_stale_runtime_base(self) -> None:
        self.subject["base_sha"] = "d" * 40
        self.run["pull_requests"] = [{"head": {"sha": HEAD}, "base": {"sha": BASE}}]
        with self.assertRaisesRegex(ValueError, "runtime subject"):
            self.bind()

    def test_runtime_attempt_run_workflow_and_pr_must_match(self) -> None:
        original = copy.deepcopy(self.subject)
        for key, value in (("run_id", "201"), ("run_attempt", "2"), ("pull_request_number", "124"), ("workflow_sha", HEAD), ("workflow_ref", f"{REPOSITORY}/.github/workflows/test.yml@refs/heads/staging"), ("schema", True)):
            with self.subTest(key=key):
                self.subject = dict(original, **{key: value})
                with self.assertRaises(ValueError):
                    self.bind()

    def test_missing_duplicate_expired_or_wrong_run_artifact_blocks(self) -> None:
        artifact = self.artifacts[0]
        for artifacts in ([], [artifact, artifact], [dict(artifact, expired=True)], [dict(artifact, workflow_run={"id": 201, "head_sha": HEAD})]):
            with self.subTest(artifacts=artifacts):
                self.artifacts = artifacts
                with self.assertRaises(ValueError):
                    self.bind()

    def test_checks_must_share_provider_suite_and_attempt(self) -> None:
        self.checks[0]["app"]["slug"] = "another-provider"
        with self.assertRaises(ValueError):
            self.bind()
        self.checks[0]["app"]["slug"] = "github-actions"
        self.checks[0]["check_suite"]["id"] = 21
        with self.assertRaises(ValueError):
            self.bind()
        self.checks[0]["check_suite"]["id"] = 20
        self.jobs[0]["run_attempt"] = 2
        with self.assertRaises(ValueError):
            self.bind()

    def test_wrong_workflow_event_or_failed_run_blocks(self) -> None:
        original = copy.deepcopy(self.run)
        for key, value in (("workflow_id", 11), ("event", "workflow_dispatch"), ("conclusion", "failure"), ("repository", {"id": 100})):
            with self.subTest(key=key):
                self.run = dict(original, **{key: value})
                with self.assertRaises(ValueError):
                    self.bind()

    def test_history_retains_proof_after_artifact_expiration(self) -> None:
        observation = self.bind()
        self.artifacts = []
        result = self.bind(historical=observation)
        self.assertEqual(observation["artifact_digest"], result["artifact_digest"])
        self.assertEqual(observation["subject"], result["subject"])

    def test_history_rejects_missing_original_digest_or_changed_subject(self) -> None:
        observation = self.bind()
        for changed in (dict(observation, artifact_digest=""), dict(observation, subject=dict(self.subject, base_sha="d" * 40))):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.bind(historical=changed)


class SubjectArchiveTests(unittest.TestCase):
    def test_digest_and_unique_regular_json_are_required(self) -> None:
        content = archive({"schema": 1})
        self.assertEqual({"schema": 1}, read_subject(content, "sha256:" + hashlib.sha256(content).hexdigest()))
        invalid = (archive({}, "../ci-subject.json"), archive({}, mode=stat.S_IFLNK | 0o777), archive('{"schema":1,"schema":2}'), b"not a zip", archive("x" * 17000))
        for content in invalid:
            with self.subTest(size=len(content)), self.assertRaises(ValueError):
                read_subject(content)
        with self.assertRaises(ValueError):
            read_subject(archive({}), "sha256:" + "0" * 64)

    def test_extra_zip_entries_are_rejected(self) -> None:
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w") as zipped:
            zipped.writestr("ci-subject.json", "{}")
            zipped.writestr("extra", "{}")
        with self.assertRaises(ValueError):
            read_subject(content.getvalue())


class GraphQLSubjectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pr = {"base": {"sha": BASE, "ref": "staging"}, "head": {"sha": HEAD, "ref": "development"}, "merge_commit_sha": "d" * 40}
        self.identity = {"baseRefOid": BASE, "baseRefName": "staging", "headRefOid": HEAD, "headRefName": "development", "merged": False, "isDraft": False, "mergeable": "MERGEABLE", "mergeCommit": None, "potentialMergeCommit": {"oid": MERGE, "parents": {"nodes": [{"oid": BASE}, {"oid": HEAD}]}}}

    def test_stale_rest_merge_sha_cannot_select_ci_subject(self) -> None:
        self.assertEqual(MERGE, _apply_identity(self.pr, self.identity, "pre-merge"))
        self.assertIsNone(self.pr["merge_commit_sha"])

    def test_missing_potential_merge_or_wrong_parent_pair_blocks(self) -> None:
        self.identity["potentialMergeCommit"]["parents"]["nodes"].reverse()
        with self.assertRaises(ValueError):
            _apply_identity(self.pr, self.identity, "pre-merge")
        self.identity["potentialMergeCommit"] = None
        with self.assertRaises(ValueError):
            _apply_identity(self.pr, self.identity, "pre-merge")

    def test_archive_does_not_require_current_base_or_potential_merge(self) -> None:
        self.identity.update(baseRefOid="e" * 40, potentialMergeCommit=None, merged=True, mergeCommit={"oid": "f" * 40})
        self.assertIsNone(_apply_identity(self.pr, self.identity, "promoted", archive_history=True))
        self.assertEqual("f" * 40, self.pr["merge_commit_sha"])


class ArtifactDownloadTests(unittest.TestCase):
    def test_only_api_request_receives_github_credentials(self) -> None:
        import urllib.error
        from unittest.mock import MagicMock
        from tools.delivery.actions_subject import download

        redirect = urllib.error.HTTPError("https://api.github.com/repos/x/y/actions/artifacts/1/zip", 302, "Found", {"Location": "https://storage.example.test/temporary?signature=fixture"}, io.BytesIO())
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b"bounded zip bytes"
        opener = MagicMock()
        opener.open.side_effect = [redirect, response]
        with patch("tools.delivery.actions_subject.urllib.request.build_opener", return_value=opener):
            self.assertEqual(b"bounded zip bytes", download("x/y", 1, "credential"))
        first, second = [call.args[0] for call in opener.open.call_args_list]
        self.assertEqual("Bearer credential", first.get_header("Authorization"))
        self.assertIsNone(second.get_header("Authorization"))
        self.assertIsNone(second.get_header("Cookie"))

    def test_non_https_redirect_is_rejected_before_storage_request(self) -> None:
        import urllib.error
        from unittest.mock import MagicMock
        from tools.delivery.actions_subject import download

        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError("https://api.github.com/example", 302, "Found", {"Location": "http://storage.example.test/temporary"}, io.BytesIO())
        with patch("tools.delivery.actions_subject.urllib.request.build_opener", return_value=opener), self.assertRaises(ValueError):
            download("x/y", 1, "credential")
        self.assertEqual(1, opener.open.call_count)
