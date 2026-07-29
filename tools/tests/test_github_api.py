#!/usr/bin/env python3
"""Tests for the shared GitHub reader: a truncated page must never look complete."""

from __future__ import annotations

import unittest

from tools.delivery import github_api
from tools.delivery.github_api import get_all, next_path


class NextPathTest(unittest.TestCase):
    def test_reads_the_next_relation_out_of_a_link_header(self) -> None:
        header = (
            '<https://api.github.com/repositories/1/issues/1/comments?per_page=100&page=2>; rel="next", '
            '<https://api.github.com/repositories/1/issues/1/comments?per_page=100&page=5>; rel="last"'
        )

        self.assertEqual(
            next_path(header),
            "/repositories/1/issues/1/comments?per_page=100&page=2",
        )

    def test_reports_no_next_page_on_the_last_page(self) -> None:
        self.assertIsNone(next_path(None))
        self.assertIsNone(
            next_path('<https://api.github.com/x?page=1>; rel="prev"'),
        )


class GetAllTest(unittest.TestCase):
    def setUp(self) -> None:
        self.requested: list[str] = []
        self.original = github_api.request
        self.addCleanup(setattr, github_api, "request", self.original)

    def serve(self, pages: dict[str, tuple[object, dict[str, str]]]) -> None:
        def fake_request(method: str, path: str, token: str, data: object | None):
            self.requested.append(path)
            return pages[path]

        github_api.request = fake_request

    def test_follows_every_page_of_a_list_endpoint(self) -> None:
        self.serve(
            {
                "/c?per_page=100": ([1, 2], {"Link": '</c?page=2>; rel="next"'}),
                "/c?page=2": ([3], {}),
            }
        )

        self.assertEqual(get_all("/c?per_page=100", "t"), [1, 2, 3])
        self.assertEqual(self.requested, ["/c?per_page=100", "/c?page=2"])

    def test_follows_every_page_of_an_object_wrapped_endpoint(self) -> None:
        self.serve(
            {
                "/r?per_page=100": (
                    {"total_count": 3, "check_runs": [1, 2]},
                    {"Link": '</r?page=2>; rel="next"'},
                ),
                "/r?page=2": ({"total_count": 3, "check_runs": [3]}, {}),
            }
        )

        self.assertEqual(get_all("/r?per_page=100", "t", key="check_runs"), [1, 2, 3])

    def test_refuses_a_response_that_is_not_the_expected_list(self) -> None:
        self.serve({"/c": ({"message": "Not Found"}, {})})

        with self.assertRaises(RuntimeError):
            get_all("/c", "t")


if __name__ == "__main__":
    unittest.main()
