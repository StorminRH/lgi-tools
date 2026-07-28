#!/usr/bin/env python3
"""Run one Grok and one-to-three Composer review seats through Cursor Agent.

The caller creates the reviewer briefs and chooses the Composer scopes. This
utility owns only concurrent process execution, same-session verdict collection,
JSON capture, and compact severity counts.

Example:
    python3 .agent-local/run_adversarial_review.py \
      --repository /path/to/repository \
      --output-dir /tmp/adversarial-review \
      --grok-brief /tmp/holistic.md \
      --composer-brief runtime=/tmp/runtime.md \
      --composer-brief tests=/tmp/tests.md
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


COLLECTION_PROMPT = (
    "Return the review verdict now as plain text in the required format. "
    "Do not perform more investigation, edit files, or refer me to a plan "
    "artifact. Output only the Verdict, Findings, and Load-bearing checks sections."
)
VERDICT_PATTERN = re.compile(r"^Verdict:\s*(CLEAN|FINDINGS)\s*$", re.MULTILINE)
FINDING_PATTERN = re.compile(
    r"^\s*\d+\.\s+\[(BLOCKER|MAJOR|MINOR)\]\s+",
    re.MULTILINE,
)


@dataclass(frozen=True)
class Seat:
    """One independent Cursor reviewer session."""

    key: str
    reviewer: str
    model: str
    scope: str
    brief: Path


class ReviewFailure(RuntimeError):
    """A selected reviewer seat did not produce a parseable collected verdict."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--grok-brief", type=Path, required=True)
    parser.add_argument(
        "--composer-brief",
        action="append",
        required=True,
        metavar="SCOPE=PATH",
        help="Add one bounded Composer scope and brief; repeat one to three times.",
    )
    parser.add_argument(
        "--cursor-agent",
        default="cursor-agent",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--trust",
        action="store_true",
        help="Pass --trust only after explicit operator authorization for this run.",
    )
    return parser.parse_args()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def safe_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not key:
        raise ReviewFailure("review scope must contain at least one letter or number")
    return key


def parse_composer_specs(specs: list[str]) -> list[tuple[str, Path]]:
    if not 1 <= len(specs) <= 3:
        raise ReviewFailure("select between one and three Composer reviewer seats")
    parsed: list[tuple[str, Path]] = []
    keys: set[str] = set()
    for spec in specs:
        scope, separator, raw_path = spec.partition("=")
        if not separator or not scope.strip() or not raw_path.strip():
            raise ReviewFailure(
                f"invalid Composer brief {spec!r}; expected SCOPE=PATH"
            )
        key = safe_key(scope)
        if key in keys:
            raise ReviewFailure(f"duplicate Composer scope key {key!r}")
        keys.add(key)
        parsed.append((scope.strip(), Path(raw_path).expanduser().resolve()))
    return parsed


def validate_inputs(
    repository: Path,
    output_dir: Path,
    grok_brief: Path,
    composer_specs: list[tuple[str, Path]],
) -> None:
    if not repository.is_dir():
        raise ReviewFailure(f"repository does not exist: {repository}")
    if is_within(output_dir, repository):
        raise ReviewFailure("review output directory must be outside the repository")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ReviewFailure("review output directory must start empty")
    for brief in [grok_brief, *(path for _, path in composer_specs)]:
        if not brief.is_file():
            raise ReviewFailure(f"review brief does not exist: {brief}")


def run_command(
    command: list[str],
    *,
    stdin: str | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            input=stdin,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise ReviewFailure(f"could not start {command[0]!r}: {exc}") from exc


def write_capture(
    output_dir: Path,
    seat: Seat,
    phase: str,
    result: subprocess.CompletedProcess[str],
) -> None:
    (output_dir / f"{seat.key}.{phase}.json").write_text(
        result.stdout,
        encoding="utf-8",
    )
    (output_dir / f"{seat.key}.{phase}.stderr.txt").write_text(
        result.stderr,
        encoding="utf-8",
    )


def parse_json_result(
    seat: Seat,
    phase: str,
    result: subprocess.CompletedProcess[str],
) -> dict[str, Any]:
    if result.returncode != 0:
        raise ReviewFailure(
            f"{seat.reviewer} {phase} exited {result.returncode}; "
            f"inspect {seat.key}.{phase}.stderr.txt"
        )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ReviewFailure(
            f"{seat.reviewer} {phase} returned invalid JSON: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise ReviewFailure(f"{seat.reviewer} {phase} JSON must be an object")
    if payload.get("is_error") is True:
        raise ReviewFailure(f"{seat.reviewer} {phase} returned an error result")
    return payload


def investigation_command(
    cursor_agent: str,
    repository: Path,
    seat: Seat,
    trust: bool,
) -> list[str]:
    command = [
        cursor_agent,
        "--print",
        "--output-format",
        "json",
        "--mode",
        "plan",
        "--sandbox",
        "enabled",
        "--model",
        seat.model,
        "--workspace",
        str(repository),
    ]
    if trust:
        command.append("--trust")
    return command


def collection_command(
    cursor_agent: str,
    repository: Path,
    session_id: str,
    trust: bool,
) -> list[str]:
    command = [
        cursor_agent,
        "--print",
        "--output-format",
        "json",
        "--mode",
        "plan",
        "--sandbox",
        "enabled",
        "--workspace",
        str(repository),
        "--resume",
        session_id,
    ]
    if trust:
        command.append("--trust")
    command.append(COLLECTION_PROMPT)
    return command


def run_investigations(
    cursor_agent: str,
    repository: Path,
    output_dir: Path,
    seats: list[Seat],
    trust: bool,
) -> dict[str, str]:
    sessions: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=len(seats)) as executor:
        futures = {
            executor.submit(
                run_command,
                investigation_command(cursor_agent, repository, seat, trust),
                stdin=seat.brief.read_text(encoding="utf-8"),
            ): seat
            for seat in seats
        }
        for future in as_completed(futures):
            seat = futures[future]
            result = future.result()
            write_capture(output_dir, seat, "investigation", result)
            payload = parse_json_result(seat, "investigation", result)
            session_id = payload.get("session_id")
            if not isinstance(session_id, str) or not session_id:
                raise ReviewFailure(
                    f"{seat.reviewer} investigation did not return session_id"
                )
            sessions[seat.key] = session_id
    return sessions


def summarize_verdict(seat: Seat, verdict_text: str) -> dict[str, Any]:
    verdict_match = VERDICT_PATTERN.search(verdict_text)
    if verdict_match is None:
        raise ReviewFailure(f"{seat.reviewer} collection has no parseable verdict")
    counts = {"blocker": 0, "major": 0, "minor": 0}
    for severity in FINDING_PATTERN.findall(verdict_text):
        counts[severity.lower()] += 1
    verdict = verdict_match.group(1)
    if verdict == "CLEAN" and any(counts.values()):
        raise ReviewFailure(f"{seat.reviewer} returned CLEAN with numbered findings")
    if verdict == "FINDINGS" and not any(counts.values()):
        raise ReviewFailure(
            f"{seat.reviewer} returned FINDINGS without parseable numbered findings"
        )
    return {
        "key": seat.key,
        "reviewer": seat.reviewer,
        "model": seat.model,
        "scope": seat.scope,
        "verdict": verdict,
        "reported": counts,
    }


def run_collections(
    cursor_agent: str,
    repository: Path,
    output_dir: Path,
    seats: list[Seat],
    sessions: dict[str, str],
    trust: bool,
) -> list[dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=len(seats)) as executor:
        futures = {
            executor.submit(
                run_command,
                collection_command(
                    cursor_agent,
                    repository,
                    sessions[seat.key],
                    trust,
                ),
            ): seat
            for seat in seats
        }
        for future in as_completed(futures):
            seat = futures[future]
            result = future.result()
            write_capture(output_dir, seat, "collection", result)
            payload = parse_json_result(seat, "collection", result)
            verdict_text = payload.get("result")
            if not isinstance(verdict_text, str):
                raise ReviewFailure(
                    f"{seat.reviewer} collection JSON did not contain result text"
                )
            summaries[seat.key] = summarize_verdict(seat, verdict_text)
    return [summaries[seat.key] for seat in seats]


def main() -> int:
    args = parse_args()
    try:
        repository = args.repository.expanduser().resolve()
        output_dir = args.output_dir.expanduser().resolve()
        grok_brief = args.grok_brief.expanduser().resolve()
        composer_specs = parse_composer_specs(args.composer_brief)
        validate_inputs(repository, output_dir, grok_brief, composer_specs)
        output_dir.mkdir(parents=True, exist_ok=True)

        seats = [
            Seat(
                key="grok-holistic",
                reviewer="Grok 4.5 High",
                model="cursor-grok-4.5-high",
                scope="Holistic",
                brief=grok_brief,
            ),
            *[
                Seat(
                    key=f"composer-{index}-{safe_key(scope)}",
                    reviewer=f"Composer 2.5 #{index}",
                    model="composer-2.5",
                    scope=scope,
                    brief=brief,
                )
                for index, (scope, brief) in enumerate(composer_specs, start=1)
            ],
        ]
        sessions = run_investigations(
            args.cursor_agent,
            repository,
            output_dir,
            seats,
            args.trust,
        )
        summaries = run_collections(
            args.cursor_agent,
            repository,
            output_dir,
            seats,
            sessions,
            args.trust,
        )
        summary = {"seat_count": len(seats), "seats": summaries}
        summary_path = output_dir / "review-summary.json"
        summary_path.write_text(
            json.dumps(summary, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(summary, indent=2))
        return 0
    except ReviewFailure as exc:
        print(f"adversarial review runner: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
