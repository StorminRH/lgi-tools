"""Check freshly collected Linear receipts against authoritative GitHub subjects."""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote

from tools.delivery import github_api, review_policy
from tools.delivery.records import fields, values, violations as record_violations

STAGES = {"pre-merge": 0, "merged": 1, "promoted": 2, "released": 2}
SHA = r"[0-9a-f]{40}"


def parse_comment(comment: dict, comment_id: str, record: dict) -> dict:
    """Accept the raw connector comment, whose collection the caller must attest."""
    if comment.get("id") != comment_id:
        raise ValueError("Linear comment ID does not match requested receipt")
    issue = comment.get("issue", {})
    expected_issue = re.search(r"/issue/([A-Z]+-\d+)", record["Receipt issue"]).group(1)
    if issue.get("identifier", issue.get("id")) != expected_issue:
        raise ValueError("Linear comment belongs to another issue")
    blocks = re.findall(r"```lgi-delivery-receipt\s*\n(.*?)\n```", comment.get("body", ""), re.DOTALL)
    if len(blocks) != 1:
        raise ValueError("Linear comment must contain one lgi-delivery-receipt JSON block")
    receipt = json.loads(blocks[0])
    if not isinstance(receipt, dict):
        raise ValueError("delivery receipt must be an object")
    return receipt


def validate(receipt: dict, record: dict, source: dict, stage: str) -> list[str]:
    """Pure comparison seam; source is collected by collect_github, never a CLI file."""
    errors: list[str] = []
    if stage not in STAGES:
        return ["unsupported delivery stage"]
    if any(not isinstance(receipt.get(key), dict) for key in ("subject", "criteria", "local")) or not isinstance(receipt.get("reviews"), list) or any(not isinstance(item, dict) for item in receipt.get("reviews", [])) or any(not isinstance(item, dict) for item in receipt.get("criteria", {}).values()):
        return ["receipt subject, criteria, local proof, or reviews have an invalid shape"]
    subject = receipt.get("subject", {})
    pr = source["pr"]
    if receipt.get("format") != 2 or receipt.get("delivery_id") != record["Delivery ID"]:
        errors.append("receipt format or delivery identity is wrong")
    if receipt.get("stage") != stage:
        errors.append("receipt stage does not match requested finalization")
    expected = {"repository": pr["base"]["repo"]["full_name"], "pr": pr["number"],
                "base": pr["base"]["ref"], "head_sha": pr["head"]["sha"]}
    for key, value in expected.items():
        if subject.get(key) != value:
            errors.append(f"receipt subject {key} does not match GitHub")
    if pr.get("html_url") != record["PR"] or pr["head"]["ref"] != record["Branch"]:
        errors.append("GitHub PR or head branch does not match candidate record")
    for key in ("head_sha", "base_sha", "merge_ref_sha"):
        if not re.fullmatch(SHA, subject.get(key, "")):
            errors.append(f"subject {key} must be a full SHA")
    if stage == "pre-merge":
        if pr.get("state") != "open" or pr.get("merged") or pr.get("draft") or pr.get("mergeable") is not True:
            errors.append("PR is not open, ready, and mergeable")
        if subject.get("base_sha") != pr["base"]["sha"] or subject.get("merge_ref_sha") != source.get("merge_ref_sha"):
            errors.append("base or CI merge-ref is stale")
    else:
        merge = source.get("merge", {})
        parents = merge.get("parents", [])
        if not pr.get("merged") or receipt.get("merge_sha") != pr.get("merge_commit_sha") or merge.get("sha") != receipt.get("merge_sha"):
            errors.append("merge receipt does not match the merged GitHub PR")
        if not parents or parents[0].get("sha") != subject.get("base_sha"):
            errors.append("recorded base is not the actual merge parent")
        if not source.get("merge_ref_valid"):
            errors.append("CI merge-ref does not bind the recorded base and head")
    checks = {str(check["id"]): check for check in source.get("checks", [])}
    required = source.get("required_checks", [])
    if not required:
        errors.append("no authoritative required checks were discovered")
    for rule in required:
        matching = [check for check in checks.values() if check.get("name") == rule["context"] and
                    (rule.get("app_id") in (None, -1) or check.get("app", {}).get("id") == rule["app_id"]) and
                    (check.get("head_sha") == subject.get("merge_ref_sha") or check.get("tested_merge_sha") == subject.get("merge_ref_sha"))]
        latest = max(matching, key=lambda check: check["id"], default={})
        if latest.get("status") != "completed" or latest.get("conclusion") != "success":
            errors.append(f"required check {rule['context']} is missing, stale, or not successful")
    if source.get("ci"):
        observation = receipt.get("ci_observation")
        if observation is None and stage in {"promoted", "released"}:
            errors.append("final delivery receipt must retain the verified CI observation")
        elif observation is not None and any(observation.get(key) != source["ci"].get(key) for key in ("provider", "run_id", "run_attempt", "artifact_id", "artifact_digest", "subject", "check_ids", "required_checks")):
            errors.append("retained CI observation does not match the verified Actions evidence")
    criteria = receipt.get("criteria", {})
    if list(criteria) != values(record["Criteria"]):
        errors.append("receipt must cover every candidate criterion once in order")
    for criterion, proof in criteria.items():
        evidence = proof.get("checks", [])
        if proof.get("status") != "PASS" or not proof.get("observable") or not evidence:
            errors.append(f"{criterion} lacks passed evidence and an observable")
        for evidence_id in evidence:
            check = checks.get(str(evidence_id), {})
            if check.get("status") != "completed" or check.get("conclusion") != "success" or check.get("head_sha") not in {subject.get("head_sha"), subject.get("merge_ref_sha")}:
                errors.append(f"{criterion} references missing, failed, or stale evidence")
    reviews = receipt.get("reviews", [])
    errors.extend(review_policy.violations(receipt, record, source))
    if sorted(item.get("role", "") for item in reviews) != sorted(values(record["Review roles"])):
        errors.append("receipt must cover every required review role exactly once")
    for review in reviews:
        evidence = next((item for item in source.get("reviews", []) if str(item.get("id")) == str(review.get("id")) and item.get("kind") == review.get("kind")), {})
        body = evidence.get("body", "") or ""
        if not evidence or any(not review.get(key) for key in ("requested", "observed", "disposition")) or review.get("verdict") not in {"PASS", "CLEAN"}:
            errors.append("review lacks identity, verdict, or disposition")
        if any(str(value) not in body for value in (review.get("role", ""), subject.get("head_sha", ""), review.get("disposition", ""), review.get("verdict", ""))):
            errors.append("review source does not bind role, exact SHA, successful verdict, and disposition")
        for key in ("requested", "observed"):
            attestation = [line[len(key) + 1:] for line in body.splitlines() if line.startswith(f"{key}=")]
            if not isinstance(review.get(key), str) or not review[key].strip() or attestation != [review[key]]:
                errors.append(f"review source does not bind {key} runtime attestation")
        if review.get("kind") == "review" and (evidence.get("commit_id") != subject.get("head_sha") or evidence.get("state") not in {"APPROVED", "COMMENTED"}):
            errors.append("GitHub review is dismissed, stale, or requests changes")
    if source.get("unresolved_threads", True):
        errors.append("GitHub has unresolved review threads or thread evidence is unavailable")
    local = receipt.get("local", {})
    if local.get("status") not in {"PASS", "NOT REQUIRED"} or local.get("head_sha") != subject.get("head_sha") or not local.get("applicability"):
        errors.append("local verification status or applicability is missing or stale")
    if local.get("status") == "PASS" and not local.get("evidence"):
        errors.append("local PASS requires an evidence locator; caller verifies local proof applicability")
    if stage in {"promoted", "released"}:
        environment = "staging" if stage == "promoted" else "production"
        if subject.get("base") != ("staging" if stage == "promoted" else "main"):
            errors.append("delivery stage does not match the PR destination")
        deployment = receipt.get("deployment", {})
        actual = source.get("deployment", {})
        if actual.get("provider") == "vercel" and any(deployment.get(key) != actual.get(key) for key in ("provider", "project_id", "team_id", "alias", "environment_id")):
            errors.append("Vercel receipt differs from provider project/team/environment/alias evidence")
        if any(deployment.get(key) != actual.get(key) for key in ("id", "sha", "environment", "state")) or actual.get("sha") != receipt.get("merge_sha") or str(actual.get("environment", "")).lower() != environment or actual.get("state") != "success":
            errors.append("deployment is missing, failed, or belongs to another SHA/environment")
    return errors


def _get(path: str, token: str) -> dict:
    data, _ = github_api.request("GET", path, token, None)
    return data


def _threads(repository: str, number: int, token: str) -> bool:
    owner, name = repository.split("/")
    cursor = None
    while True:
        query = """query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}"""
        data, _ = github_api.request("POST", "/graphql", token, {"query": query, "variables": {"owner": owner, "name": name, "number": number, "cursor": cursor}})
        page = data["data"]["repository"]["pullRequest"]["reviewThreads"]
        if any(not thread["isResolved"] for thread in page["nodes"]):
            return True
        if not page["pageInfo"]["hasNextPage"]:
            return False
        cursor = page["pageInfo"]["endCursor"]


def _pull_identity(repository: str, number: int, token: str) -> dict:
    owner, name = repository.split("/")
    query = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){baseRefName baseRefOid headRefName headRefOid merged isDraft mergeable mergeCommit{oid} potentialMergeCommit{oid parents(first:3){nodes{oid}}}}}}"""
    response, _ = github_api.request("POST", "/graphql", token, {"query": query, "variables": {"owner": owner, "name": name, "number": number}})
    if response.get("errors"):
        raise ValueError("GitHub GraphQL could not establish the current PR identity")
    identity = response["data"]["repository"]["pullRequest"]
    if not isinstance(identity, dict):
        raise ValueError("GitHub PR identity is unavailable")
    return identity


def _apply_identity(pr: dict, identity: dict, stage: str, *, archive_history: bool = False) -> str | None:
    comparisons = [("head", "sha", "headRefOid"), ("head", "ref", "headRefName")]
    if not archive_history:
        comparisons.extend((("base", "sha", "baseRefOid"), ("base", "ref", "baseRefName")))
    if any(pr[end][key] != identity[field] for end, key, field in comparisons):
        raise ValueError("GitHub REST and GraphQL subjects disagree; collect again")
    pr["merged"] = identity["merged"]
    pr["draft"] = identity["isDraft"]
    pr["mergeable"] = {"MERGEABLE": True, "CONFLICTING": False}.get(identity["mergeable"])
    pr["merge_commit_sha"] = (identity.get("mergeCommit") or {}).get("oid")
    if stage != "pre-merge":
        return None
    merge = identity.get("potentialMergeCommit")
    if not merge or [node["oid"] for node in merge["parents"]["nodes"]] != [identity["baseRefOid"], identity["headRefOid"]]:
        raise ValueError("current potential merge commit is unavailable or has the wrong base/head parents")
    return merge["oid"]


def _actions_checks(checks: list[dict], required: list[dict], receipt: dict, head_sha: str, merge_sha: str) -> list[dict]:
    selected = {}
    for rule in required:
        matching = [check for check in checks if check.get("name") == rule["context"] and
                    rule.get("app_id") in (None, -1, check.get("app", {}).get("id")) and
                    check.get("head_sha") in {head_sha, merge_sha}]
        latest = max(matching, key=lambda check: check["id"], default=None)
        if latest is not None:
            selected[latest["id"]] = latest
    for proof in receipt.get("criteria", {}).values():
        for identifier in proof.get("checks", []):
            match = next((check for check in checks if str(check["id"]) == str(identifier)), None)
            if match is not None:
                selected[match["id"]] = match
    return [check for check in selected.values() if check.get("app", {}).get("slug") == "github-actions" and check.get("head_sha") == head_sha]


def collect_github(record: dict, receipt: dict, path: Path, root: Path, stage: str, vercel_export: dict | None = None, vercel_expected: dict | None = None, *, archive_history: bool = False) -> dict:
    observation = receipt.get("deployment_observation", {})
    if archive_history and stage not in {"promoted", "released"}:
        raise ValueError("archive history requires a previously finalized promotion or release receipt")
    if stage in {"promoted", "released"}:
        observed_at = datetime.fromisoformat(observation.get("observed_at", "").replace("Z", "+00:00"))
        if observed_at.tzinfo is None or observed_at > datetime.now(timezone.utc):
            raise ValueError("deployment observation must be a past timezone-aware timestamp")
    match = re.fullmatch(r"https://github.com/([^/]+/[^/]+)/pull/(\d+)", record["PR"])
    repository, number = match.groups()
    token = github_api.github_token()
    prefix = f"/repos/{repository}"
    pr = _get(f"{prefix}/pulls/{number}", token)
    configured = subprocess.run(
        ["git", "config", "--get-regexp", r"^remote\.(origin|github)\.url$"],
        cwd=root, check=True, capture_output=True, text=True,
    ).stdout
    repositories = re.findall(r"github\.com[:/]([^\s]+?)(?:\.git)?(?=\s|$)", configured)
    if repository.lower() not in {item.lower() for item in repositories}:
        raise ValueError("candidate GitHub repository does not match configured origin/github remote")
    source = {"pr": pr}
    encoded_path = quote(path.resolve().relative_to(root.resolve()).as_posix(), safe="/")
    blob = _get(f"{prefix}/contents/{encoded_path}?ref={pr['head']['sha']}", token)
    if hashlib.sha256(base64.b64decode(blob["content"])).digest() != hashlib.sha256(path.read_bytes()).digest():
        raise ValueError("local candidate record differs from GitHub frozen head")
    identity = _pull_identity(repository, int(number), token)
    potential_sha = _apply_identity(pr, identity, stage, archive_history=archive_history)
    if stage == "pre-merge":
        source["merge_ref_sha"] = potential_sha
    else:
        source["merge"] = _get(f"{prefix}/commits/{pr['merge_commit_sha']}", token)
        ci_commit = _get(f"{prefix}/commits/{receipt['subject']['merge_ref_sha']}", token)
        source["merge_ref_valid"] = [item["sha"] for item in ci_commit.get("parents", [])] == [receipt["subject"]["base_sha"], pr["head"]["sha"]]
    if stage != "pre-merge" and not source["merge"].get("parents"):
        raise ValueError("merge parent is unavailable for review policy authorization")
    policy_base = pr["base"]["sha"] if stage == "pre-merge" else source["merge"]["parents"][0]["sha"]
    source["review_policy"] = review_policy.collect(pr, policy_base, token)
    retained_ci = receipt.get("ci_observation") if archive_history else None
    if retained_ci is not None:
        from tools.delivery.actions_subject import retained_checks

        required = retained_ci.get("required_checks")
        if not isinstance(required, list) or not required or any(not isinstance(rule, dict) or not isinstance(rule.get("context"), str) for rule in required):
            raise ValueError("historical CI observation requires the original required-check contexts")
        source["required_checks"] = required
        source["checks"] = retained_checks(repository, retained_ci, token)
    else:
        rules = github_api.get_all(f"{prefix}/rules/branches/{quote(pr['base']['ref'], safe='')}", token)
        required = [item for rule in rules if rule["type"] == "required_status_checks" for item in rule["parameters"]["required_status_checks"]]
        # Rulesets omit classic branch protection. An unavailable protection read fails closed.
        try:
            protection = _get(f"{prefix}/branches/{quote(pr['base']['ref'], safe='')}/protection/required_status_checks", token)
            required.extend(protection.get("checks", [{"context": name} for name in protection.get("contexts", [])]))
        except RuntimeError as error:
            if "GitHub API 404:" not in str(error):
                raise
        source["required_checks"] = [dict(rule, app_id=rule.get("app_id", rule.get("integration_id"))) for rule in required]
        subject_shas = {pr["head"]["sha"], source.get("merge_ref_sha", receipt["subject"]["merge_ref_sha"])}
        source["checks"] = [check for sha in subject_shas for check in github_api.get_all(f"{prefix}/commits/{sha}/check-runs?filter=latest&per_page=100", token, "check_runs")]
    selected_actions = _actions_checks(source["checks"], source["required_checks"], receipt, pr["head"]["sha"], source.get("merge_ref_sha", receipt["subject"]["merge_ref_sha"]))
    if selected_actions:
        from tools.delivery.actions_subject import bind_checks

        if archive_history and retained_ci is None:
            raise ValueError("archive requires the original authenticated Linear CI observation")
        source["ci"] = bind_checks(repository, selected_actions, pr, source.get("merge_ref_sha", receipt["subject"]["merge_ref_sha"]), pr["base"]["sha"] if stage == "pre-merge" else receipt["subject"]["base_sha"], token, historical=retained_ci)
        source["ci"]["required_checks"] = source["required_checks"]
    source["reviews"] = [dict(item, kind=kind) for kind, endpoint in (("review", f"pulls/{number}/reviews"), ("comment", f"issues/{number}/comments")) for item in github_api.get_all(f"{prefix}/{endpoint}?per_page=100", token)]
    source["unresolved_threads"] = _threads(repository, int(number), token)
    if stage in {"promoted", "released"} and vercel_export is not None:
        from tools.delivery.vercel_evidence import deployment_source

        if archive_history:
            vercel_export = dict(vercel_export, alias=observation["alias"])
        elif observation.get("alias") != vercel_export.get("alias"):
            raise ValueError("final receipt must retain the exact authenticated alias observation")
        alias_updated = vercel_export["alias"].get("updatedAt")
        if not isinstance(alias_updated, (int, float)) or alias_updated > observed_at.timestamp() * 1000:
            raise ValueError("deployment observation predates its alias routing evidence")
        source["deployment"] = deployment_source(vercel_export, vercel_expected or {}, pr, stage, pr["merge_commit_sha"], archive_history=archive_history)
    elif stage in {"promoted", "released"}:
        deployment_id = receipt.get("deployment", {}).get("id")
        if not isinstance(deployment_id, int) or deployment_id <= 0:
            raise ValueError("GitHub deployment ID must be a positive integer")
        deployment = _get(f"{prefix}/deployments/{deployment_id}", token)
        statuses = github_api.get_all(f"{prefix}/deployments/{deployment_id}/statuses?per_page=100", token)
        if archive_history:
            latest = next((item for item in statuses if item["id"] == observation.get("success_status_id") and item.get("state") == "success"), {})
        else:
            latest = max(statuses, key=lambda item: item["id"], default={})
            if observation.get("success_status_id") != latest.get("id"):
                raise ValueError("final receipt must retain the actual successful deployment status ID")
        if latest.get("state") == "success":
            succeeded_at = datetime.fromisoformat(latest.get("created_at", "").replace("Z", "+00:00"))
            if succeeded_at.tzinfo is None or succeeded_at > observed_at:
                raise ValueError("receipt predates its successful deployment status")
        source["deployment"] = {"id": deployment_id, "sha": deployment["sha"], "environment": deployment["environment"], "state": latest.get("state")}
    current_identity = _pull_identity(repository, int(number), token)
    identity_keys = ("headRefOid", "headRefName", "merged", "mergeCommit") if archive_history else tuple(identity)
    if any(current_identity.get(key) != identity.get(key) for key in identity_keys):
        raise ValueError("GitHub GraphQL PR identity changed during evidence collection")
    current = _get(f"{prefix}/pulls/{number}", token)
    if any(current[key]["sha"] != pr[key]["sha"] for key in (("head",) if archive_history else ("head", "base"))) or current.get("merged") != pr.get("merged"):
        raise ValueError("GitHub PR subject changed during evidence collection")
    return source


def check_record_receipt(path: Path, root: Path, comment: dict, comment_id: str, stage: str, vercel_export: dict | None = None, vercel_expected: dict | None = None, *, archive_history: bool = False, ci_observation_out: Path | None = None) -> list[str]:
    errors = record_violations(path, root)
    if errors:
        return errors
    record = fields(path)
    receipt = parse_comment(comment, comment_id, record)
    source = collect_github(record, receipt, path, root, stage, vercel_export, vercel_expected, archive_history=archive_history)
    errors = validate(receipt, record, source, stage)
    if not errors and ci_observation_out is not None:
        if "ci" not in source:
            return ["no Actions CI observation was produced"]
        ci_observation_out.write_text(json.dumps(source["ci"], indent=2) + "\n")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--comment-file", type=Path, required=True, help="raw comment freshly retrieved by authenticated Linear connector, including issue identity")
    parser.add_argument("--comment", required=True, help="expected Linear comment UUID")
    parser.add_argument("--stage", choices=STAGES, required=True)
    parser.add_argument("--ci-observation-out", type=Path, help="save verified Actions CI observation for the final Linear receipt")
    parser.add_argument("--archive-history", action="store_true", help="verify a prior final receipt for archive; does not assert current alias routing")
    parser.add_argument("--deployment-file", type=Path, help="fresh authenticated Vercel {deployment,alias} API exports")
    parser.add_argument("--vercel-project")
    parser.add_argument("--vercel-team")
    parser.add_argument("--vercel-alias")
    parser.add_argument("--vercel-environment", help="expected staging custom environment ID")
    args = parser.parse_args()
    try:
        vercel_export = json.loads(args.deployment_file.read_text()) if args.deployment_file else None
        vercel_expected = {"project_id": args.vercel_project, "team_id": args.vercel_team, "alias": args.vercel_alias, "environment_id": args.vercel_environment}
        errors = check_record_receipt(args.record, args.root, json.loads(args.comment_file.read_text()), args.comment, args.stage, vercel_export, vercel_expected, archive_history=args.archive_history, ci_observation_out=args.ci_observation_out)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.CalledProcessError) as error:
        errors = [f"delivery evidence unavailable or invalid: {error}"]
    result = "Historical delivery verified; current alias routing is not asserted." if args.archive_history else "Current delivery evidence verified."
    print("\n".join(errors) if errors else result + " Caller must freshly authenticate Linear/Vercel exports and verify local proof applicability; this command does not authenticate export files.")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
