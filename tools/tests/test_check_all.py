#!/usr/bin/env python3
"""Tests for the complete ordinary-safe policy compatibility gate."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from tools.policy import check_all


class CheckAllTests(unittest.TestCase):
    def test_runs_policy_tests_and_document_references(self) -> None:
        with patch("tools.policy.check_all.subprocess.call", side_effect=[0, 0, 0]) as call:
            self.assertEqual(0, check_all.main())
        self.assertEqual(3, call.call_count)
        arguments = [entry.args[0][2:] for entry in call.call_args_list]
        self.assertEqual(
            [
                ["policy", "check"],
                ["test"],
                ["policy", "check-doc-refs", "--check", "--pretty"],
            ],
            arguments,
        )

    def test_stops_at_first_failure(self) -> None:
        with patch("tools.policy.check_all.subprocess.call", side_effect=[0, 7]) as call:
            self.assertEqual(7, check_all.main())
        self.assertEqual(2, call.call_count)


if __name__ == "__main__":
    unittest.main()
