"""Bind Actions check runs to their immutable, runtime-emitted merge subject."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import io
import json
import re
import stat
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from tools.delivery import github_api

MAX_ARCHIVE = 65536
MAX_JSON = 16384
WORKFLOW = ".github/workflows/test.yml"


def _get(path: str, token: str) -> dict:
    data, _ = github_api.request("GET", path, token, None)
    return data


def _number(value: object) -> int:
    if isinstance(value, bool) or not re.fullmatch(r"[1-9]\d{0,19}", str(value)):
        raise ValueError("Actions runtime identifier must be a positive bounded decimal")
    return int(str(value))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download(repository: str, artifact_id: int, token: str) -> bytes:
    """Authenticate the API hop only; signed storage URLs receive no credentials."""
    url = f"https://api.github.com/repos/{repository}/actions/artifacts/{_number(artifact_id)}/zip"
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=30):
            raise ValueError("GitHub artifact endpoint did not return its expected redirect")
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise ValueError(f"GitHub artifact download unavailable ({error.code})") from None
        location = error.headers.get("Location", "")
        error.close()
    parsed = urllib.parse.urlparse(location)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("GitHub artifact redirect is not a credential-free HTTPS URL")
    try:
        with opener.open(urllib.request.Request(location), timeout=30) as response:
            if response.status != 200:
                raise ValueError("GitHub artifact storage response was not successful")
            content = response.read(MAX_ARCHIVE + 1)
    except urllib.error.URLError:
        raise ValueError("GitHub artifact storage download failed") from None
    if len(content) > MAX_ARCHIVE:
        raise ValueError("CI subject archive exceeds its byte limit")
    return content


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("CI subject JSON contains duplicate keys")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("CI subject JSON contains a non-standard number")


def read_subject(content: bytes, digest: str | None = None) -> dict:
    if len(content) > MAX_ARCHIVE:
        raise ValueError("CI subject archive exceeds its byte limit")
    if digest is not None and digest != "sha256:" + hashlib.sha256(content).hexdigest():
        raise ValueError("CI subject archive digest differs from GitHub metadata")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) != 1:
                raise ValueError("CI subject artifact must contain one JSON entry")
            entry = entries[0]
            mode = entry.external_attr >> 16
            if entry.filename != "ci-subject.json" or entry.is_dir() or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)) or entry.flag_bits & 1 or entry.file_size > MAX_JSON:
                raise ValueError("CI subject artifact entry is not the bounded regular JSON file")
            with archive.open(entry) as stream:
                raw = stream.read(MAX_JSON + 1)
            if len(raw) > MAX_JSON:
                raise ValueError("CI subject JSON exceeds its byte limit")
            value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object, parse_constant=_invalid_constant)
    except (zipfile.BadZipFile, UnicodeError, RuntimeError, NotImplementedError) as error:
        raise ValueError("CI subject archive is malformed") from error
    if not isinstance(value, dict):
        raise ValueError("CI subject JSON must be an object")
    return value


def validate_subject(subject: dict, run: dict, pr: dict, merge_sha: str, base_sha: str) -> None:
    repository = pr["base"]["repo"]["full_name"]
    expected = {"schema": 1, "repository": repository,
                "workflow_ref": f"{repository}/{WORKFLOW}@refs/pull/{pr['number']}/merge",
                "workflow_sha": merge_sha, "event_name": "pull_request",
                "base_ref": pr["base"]["ref"], "base_sha": base_sha,
                "head_ref": pr["head"]["ref"], "head_sha": pr["head"]["sha"], "merge_sha": merge_sha}
    if any(type(subject.get(key)) is not type(value) or subject.get(key) != value for key, value in expected.items()):
        raise ValueError("CI runtime subject does not match the exact repository/workflow/base/head/merge")
    for key, value in {"run_id": run["id"], "run_attempt": run["run_attempt"], "pull_request_number": pr["number"]}.items():
        if _number(subject.get(key)) != _number(value):
            raise ValueError(f"CI runtime {key} does not match the authoritative Actions run")


def bind_checks(repository: str, checks: list[dict], pr: dict, merge_sha: str, base_sha: str, token: str, *, historical: dict | None = None) -> dict:
    """Selected Actions checks must come from one successful current run attempt."""
    if not checks or any(check.get("app", {}).get("slug") != "github-actions" for check in checks):
        raise ValueError("CI subject adapter requires GitHub Actions check runs")
    suites = {_number(check.get("check_suite", {}).get("id")) for check in checks}
    if len(suites) != 1 or any(check.get("head_sha") != pr["head"]["sha"] or check.get("status") != "completed" or check.get("conclusion") != "success" for check in checks):
        raise ValueError("selected Actions checks do not share one successful source-head suite")
    suite_id = suites.pop()
    prefix = f"/repos/{repository}/actions"
    workflow = _get(f"{prefix}/workflows/test.yml", token)
    if workflow.get("path") != WORKFLOW:
        raise ValueError("Actions workflow does not identify test.yml")
    workflow_id = _number(workflow["id"])
    if historical is None:
        runs = github_api.get_all(f"{prefix}/workflows/{workflow_id}/runs?check_suite_id={suite_id}&per_page=100", token, "workflow_runs")
        matching = [run for run in runs if run.get("check_suite_id") == suite_id]
        if len(matching) != 1:
            raise ValueError("selected checks do not identify exactly one Actions run")
        run = matching[0]
    else:
        run = _get(f"{prefix}/runs/{_number(historical['run_id'])}/attempts/{_number(historical['run_attempt'])}", token)
        if run.get("check_suite_id") != suite_id:
            raise ValueError("historical checks do not belong to the recorded Actions suite")
    if run.get("workflow_id") != workflow_id or run.get("path") != WORKFLOW or run.get("event") != "pull_request" or run.get("status") != "completed" or run.get("conclusion") != "success" or run.get("head_sha") != pr["head"]["sha"] or run.get("repository", {}).get("id") != pr["base"]["repo"]["id"]:
        raise ValueError("Actions run has the wrong workflow, provider subject, event, or outcome")
    run_id, attempt = _number(run["id"]), _number(run["run_attempt"])
    jobs = github_api.get_all(f"{prefix}/runs/{run_id}/attempts/{attempt}/jobs?per_page=100", token, "jobs")
    for check in checks:
        url = f"https://api.github.com/repos/{repository}/check-runs/{_number(check['id'])}"
        matches = [job for job in jobs if job.get("check_run_url") == url and job.get("run_id") == run_id and job.get("run_attempt") == attempt]
        if len(matches) != 1 or matches[0].get("status") != "completed" or matches[0].get("conclusion") != "success":
            raise ValueError("selected check is not a successful job of the exact run attempt")
    if historical is None:
        artifacts = github_api.get_all(f"{prefix}/runs/{run_id}/artifacts?name=ci-subject&per_page=100", token, "artifacts")
        matching = [item for item in artifacts if item.get("name") == "ci-subject"]
        if len(matching) != 1:
            raise ValueError("Actions run must have exactly one ci-subject artifact")
        artifact = matching[0]
        if artifact.get("expired") is not False or artifact.get("workflow_run", {}).get("id") != run_id or artifact.get("workflow_run", {}).get("head_sha") != pr["head"]["sha"] or not isinstance(artifact.get("size_in_bytes"), int) or not 0 < artifact["size_in_bytes"] <= MAX_ARCHIVE:
            raise ValueError("CI subject artifact is missing, expired, oversized, or from another run")
        artifact_id = _number(artifact["id"])
        content = download(repository, artifact_id, token)
        subject = read_subject(content, artifact.get("digest"))
        artifact_digest = "sha256:" + hashlib.sha256(content).hexdigest()
        observed_at = datetime.now(timezone.utc).isoformat()
    else:
        if historical.get("provider") != "github-actions" or not re.fullmatch(r"sha256:[0-9a-f]{64}", historical.get("artifact_digest", "")):
            raise ValueError("historical CI observation has no original provider/artifact digest")
        artifact_id = _number(historical["artifact_id"])
        artifact_digest = historical["artifact_digest"]
        subject = historical["subject"]
        observed_at = historical["observed_at"]
        observed_time = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
        if observed_time.tzinfo is None or observed_time > datetime.now(timezone.utc):
            raise ValueError("historical CI observation must have a past timezone-aware timestamp")
        for job in jobs:
            if job.get("check_run_url", "").rsplit("/", 1)[-1] not in {str(check["id"]) for check in checks}:
                continue
            completed = datetime.fromisoformat(job.get("completed_at", "").replace("Z", "+00:00"))
            if completed.tzinfo is None or completed > observed_time:
                raise ValueError("historical CI observation predates the completed checks")
    validate_subject(subject, run, pr, merge_sha, base_sha)
    run_path = f"{prefix}/runs/{run_id}" + (f"/attempts/{attempt}" if historical is not None else "")
    current = _get(run_path, token)
    if any(current.get(key) != run.get(key) for key in ("id", "run_attempt", "head_sha", "check_suite_id", "workflow_id", "event", "status", "conclusion")):
        raise ValueError("Actions run changed during subject verification")
    for check in checks:
        check["tested_merge_sha"] = merge_sha
    return {"provider": "github-actions", "run_id": run_id, "run_attempt": attempt, "artifact_id": artifact_id, "artifact_digest": artifact_digest, "observed_at": observed_at, "check_ids": sorted(check["id"] for check in checks), "subject": subject}


def retained_checks(repository: str, observation: dict, token: str) -> list[dict]:
    identifiers = observation.get("check_ids")
    if not isinstance(identifiers, list) or not identifiers or len(identifiers) > 100:
        raise ValueError("historical CI observation requires bounded original check IDs")
    identifiers = [_number(identifier) for identifier in identifiers]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("historical CI check IDs must be unique")
    return [_get(f"/repos/{repository}/check-runs/{identifier}", token) for identifier in identifiers]
