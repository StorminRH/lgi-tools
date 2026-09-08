"""Vercel proof binds the provider project, GitHub commit, environment and alias."""
from __future__ import annotations

import copy
import unittest

from tools.delivery.vercel_evidence import deployment_source


class VercelEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sha = "a" * 40
        self.pr = {"base": {"ref": "staging", "repo": {"id": 123, "full_name": "StorminRH/lgi-tools"}}}
        self.expected = {"project_id": "prj_expected", "team_id": "team_expected", "alias": "staging.lgi.tools", "environment_id": "env_staging"}
        self.export = {"deployment": {"id": "dpl_correct", "projectId": "prj_expected", "ownerId": "team_expected", "target": None, "readyState": "READY", "gitSource": {"type": "github", "repoId": 123, "ref": "staging", "sha": self.sha}, "customEnvironment": {"id": "env_staging", "slug": "staging"}, "aliasAssigned": True, "alias": ["staging.lgi.tools"]}, "alias": {"alias": "staging.lgi.tools", "projectId": "prj_expected", "deploymentId": "dpl_correct", "deployment": {"id": "dpl_correct"}}}

    def result(self, *, archive_history: bool = False) -> dict:
        return deployment_source(self.export, self.expected, self.pr, "promoted", self.sha, archive_history=archive_history)

    def test_current_github_staging_deployment_and_alias_match(self) -> None:
        self.assertEqual("success", self.result()["state"])

    def test_wrong_project_team_environment_target_or_failed_deploy_rejected(self) -> None:
        original = copy.deepcopy(self.export)
        for key, value in (("projectId", "prj_wrong"), ("ownerId", "team_wrong"), ("readyState", "ERROR"), ("customEnvironment", None), ("target", "production")):
            with self.subTest(key=key):
                self.export = copy.deepcopy(original)
                self.export["deployment"][key] = value
                with self.assertRaises(ValueError):
                    self.result()

    def test_old_forge_or_wrong_github_source_is_rejected(self) -> None:
        original = copy.deepcopy(self.export)
        for key, value in (("type", "cursor-origin"), ("repoId", 456), ("sha", "b" * 40), ("ref", "main")):
            with self.subTest(key=key):
                self.export = copy.deepcopy(original)
                self.export["deployment"]["gitSource"][key] = value
                with self.assertRaises(ValueError):
                    self.result()

    def test_stale_alias_mapping_blocks_current_finalization(self) -> None:
        self.export["alias"]["deploymentId"] = "dpl_other"
        with self.assertRaises(ValueError):
            self.result()

    def test_archive_history_uses_prior_alias_evidence_without_claiming_current_routing(self) -> None:
        self.export["deployment"]["aliasAssigned"] = False
        self.export["deployment"]["alias"] = []
        with self.assertRaises(ValueError):
            self.result()
        self.assertEqual("success", self.result(archive_history=True)["state"])
        self.export["alias"]["deploymentId"] = "dpl_other"
        with self.assertRaises(ValueError):
            self.result(archive_history=True)

    def test_production_requires_production_target_and_exact_alias(self) -> None:
        self.pr["base"]["ref"] = "main"
        self.export["deployment"].update(target="production", customEnvironment=None, alias=["lgi.tools"])
        self.export["deployment"]["gitSource"]["ref"] = "main"
        self.expected.update(alias="lgi.tools", environment_id=None)
        self.export["alias"]["alias"] = "lgi.tools"
        result = deployment_source(self.export, self.expected, self.pr, "released", self.sha)
        self.assertEqual("production", result["environment"])
