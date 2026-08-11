#!/usr/bin/env python3
"""Unit tests for the Production deploy waiter (no network)."""

from __future__ import annotations

import unittest
from typing import Any
from unittest import mock

from tools.delivery import wait_prod_deploy as w

SHA = "f56b2722acd10bc160a0a686b4249621516888c8"
OTHER = "a1f2dfda4d5cfcb676569daa2aa4af9e4e113b78"


def deployment(sha: str, deployment_id: int = 1, created_at: str = "2026-08-11T23:34:24Z") -> dict[str, Any]:
    return {
        "id": deployment_id,
        "sha": sha,
        "environment": "Production",
        "created_at": created_at,
    }


def status(
    state: str,
    *,
    status_id: int = 10,
    created_at: str = "2026-08-11T23:34:24Z",
    url: str = "https://lgi-tools-example.vercel.app",
) -> dict[str, Any]:
    return {
        "id": status_id,
        "state": state,
        "created_at": created_at,
        "environment_url": url,
        "target_url": url,
    }


class EvaluateProdDeploy(unittest.TestCase):
    def test_waiting_when_no_deployment(self) -> None:
        phase, detail = w.evaluate_prod_deploy(SHA, [], [], None)
        self.assertEqual(phase, "waiting")
        self.assertIn("no Production deployment", detail)

    def test_waiting_when_building(self) -> None:
        phase, _ = w.evaluate_prod_deploy(
            SHA,
            [deployment(SHA)],
            [status("in_progress")],
            deployment(SHA),
        )
        self.assertEqual(phase, "waiting")

    def test_failed_on_error_state(self) -> None:
        phase, detail = w.evaluate_prod_deploy(
            SHA,
            [deployment(SHA)],
            [status("error")],
            deployment(SHA),
        )
        self.assertEqual(phase, "failed")
        self.assertIn("error", detail)

    def test_failed_when_inactive(self) -> None:
        phase, detail = w.evaluate_prod_deploy(
            SHA,
            [deployment(SHA)],
            [status("inactive")],
            deployment(OTHER),
        )
        self.assertEqual(phase, "failed")
        self.assertIn("inactive", detail)

    def test_ready_when_success_and_tip_matches(self) -> None:
        tip = deployment(SHA)
        phase, detail = w.evaluate_prod_deploy(
            SHA,
            [tip],
            [status("pending", status_id=1, created_at="2026-08-11T23:33:00Z"), status("success")],
            tip,
        )
        self.assertEqual(phase, "ready")
        self.assertIn("success", detail)

    def test_newest_status_wins_not_list_order(self) -> None:
        # Older success listed first; newer failure must win.
        phase, detail = w.evaluate_prod_deploy(
            SHA,
            [deployment(SHA)],
            [
                status("success", status_id=1, created_at="2026-08-11T23:33:00Z"),
                status("failure", status_id=2, created_at="2026-08-11T23:35:00Z"),
            ],
            deployment(SHA),
        )
        self.assertEqual(phase, "failed")
        self.assertIn("failure", detail)

    def test_failed_when_tip_moved(self) -> None:
        phase, detail = w.evaluate_prod_deploy(
            SHA,
            [deployment(SHA)],
            [status("success")],
            deployment(OTHER),
        )
        self.assertEqual(phase, "failed")
        self.assertIn("tip moved", detail)


class NewestHelpers(unittest.TestCase):
    def test_newest_by_created_prefers_later_timestamp(self) -> None:
        older = deployment(SHA, 1, "2026-08-11T20:00:00Z")
        newer = deployment(SHA, 2, "2026-08-11T23:00:00Z")
        self.assertEqual(w.newest_by_created([older, newer]), newer)

    def test_deployment_url_reads_environment_url(self) -> None:
        url = w.deployment_url([status("success", url="https://example.vercel.app")])
        self.assertEqual(url, "https://example.vercel.app")


class PollUntilReady(unittest.TestCase):
    def test_rejects_short_sha(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "40-char"):
            w.poll_until_ready(
                "f56b2722",
                environment="Production",
                timeout_s=1,
                interval_s=0.01,
                sleep=lambda _: None,
                token_factory=lambda: "token",
            )

    def test_polls_until_ready(self) -> None:
        loops = {"n": 0}

        def fake_deployments(token: str, *, sha: str | None, environment: str) -> list[dict[str, Any]]:
            del token, environment
            # First full poll has no SHA deploy yet; later polls succeed.
            if sha is not None and loops["n"] == 0:
                return []
            return [deployment(SHA)]

        def fake_statuses(token: str, deployment_id: int) -> list[dict[str, Any]]:
            del token, deployment_id
            return [status("success")]

        def fake_sleep(_: float) -> None:
            loops["n"] += 1

        with mock.patch.object(w, "fetch_deployments", side_effect=fake_deployments), mock.patch.object(
            w, "fetch_statuses", side_effect=fake_statuses
        ):
            result = w.poll_until_ready(
                SHA,
                environment="Production",
                timeout_s=5,
                interval_s=0.01,
                sleep=fake_sleep,
                token_factory=lambda: "token",
            )
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(result["state"], "success")
        self.assertEqual(result["url"], "https://lgi-tools-example.vercel.app")
        self.assertGreaterEqual(loops["n"], 1)

    def test_timeout(self) -> None:
        ticks = {"n": 0}

        def fake_now() -> float:
            # 1: deadline base, 2: enter loop, 3+: past deadline.
            ticks["n"] += 1
            return 0.0 if ticks["n"] <= 2 else 100.0

        with mock.patch.object(w, "fetch_deployments", return_value=[]), mock.patch.object(
            w, "fetch_statuses", return_value=[]
        ):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                w.poll_until_ready(
                    SHA,
                    environment="Production",
                    timeout_s=1,
                    interval_s=0.01,
                    sleep=lambda _: None,
                    token_factory=lambda: "token",
                    now=fake_now,
                )


if __name__ == "__main__":
    unittest.main()
