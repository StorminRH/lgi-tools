#!/usr/bin/env python3
"""Fixture tests for the env-example registry checker."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from check_env_example import collect_findings


class EnvFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "src/lib").mkdir(parents=True)

    def close(self) -> None:
        self.temporary.cleanup()

    def write_registry(self, required: str, verbatim: str) -> None:
        (self.root / "src/lib/env.ts").write_text(
            "const required = schema;\n"
            "const verbatim = schema;\n"
            "const REQUIRED_ENV = {\n"
            f"{required}"
            "} as const;\n"
            "const VERBATIM_ENV = {\n"
            f"{verbatim}"
            "} as const;\n",
            encoding="utf-8",
        )

    def write_example(self, text: str) -> None:
        (self.root / ".env.example").write_text(text, encoding="utf-8")


class EnvExampleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = EnvFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def messages(self) -> list[str]:
        return [finding.render() for finding in collect_findings(self.fixture.root)]

    def test_missing_registry_key_and_stale_example_key_name_file_and_line(self) -> None:
        self.fixture.write_registry("  DATABASE_URL: required,\n", "")
        self.fixture.write_example("STALE_KEY=\n")
        self.assertEqual(
            [
                "src/lib/env.ts:4: registry key DATABASE_URL is missing from .env.example",
                ".env.example:1: example key STALE_KEY is absent from the typed env registry",
            ],
            self.messages(),
        )

    def test_commented_keys_and_explicit_allowlists_are_clean(self) -> None:
        self.fixture.write_registry(
            "  DATABASE_URL: required,\n",
            "  VERCEL_ENV: verbatim,\n  NEXT_RUNTIME: verbatim,\n",
        )
        self.fixture.write_example(
            "# DATABASE_URL=\n"
            "NEXT_PUBLIC_CONVEX_URL=\n"
            "NEXT_PUBLIC_SITE_URL=\n"
            "CONVEX_DEPLOYMENT=\n"
        )
        self.assertEqual([], self.messages())

    def test_missing_registry_block_is_an_error(self) -> None:
        (self.fixture.root / "src/lib/env.ts").write_text(
            "const REQUIRED_ENV_RENAMED = {};\n"
            "const VERBATIM_ENV = {\n"
            "  LOCAL_DB_DRIVER: verbatim,\n"
            "} as const;\n",
            encoding="utf-8",
        )
        self.fixture.write_example("LOCAL_DB_DRIVER=\n")
        self.assertIn(
            "src/lib/env.ts:1: missing parseable REQUIRED_ENV registry block",
            self.messages(),
        )

    def test_unparseable_or_unterminated_registry_block_is_an_error(self) -> None:
        (self.fixture.root / "src/lib/env.ts").write_text(
            "const REQUIRED_ENV = {\n"
            "  DATABASE_URL: renamedSchema,\n"
            "const VERBATIM_ENV = {\n"
            "  LOCAL_DB_DRIVER: verbatim,\n"
            "} as const;\n",
            encoding="utf-8",
        )
        self.fixture.write_example("")
        messages = self.messages()
        self.assertIn(
            "src/lib/env.ts:2: unparseable REQUIRED_ENV registry entry",
            messages,
        )
        self.assertIn(
            "src/lib/env.ts:1: unterminated REQUIRED_ENV registry block",
            messages,
        )


if __name__ == "__main__":
    unittest.main()
