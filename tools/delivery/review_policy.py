"""Authorize review seats from policy on the independently established base commit."""
from __future__ import annotations

import base64
import json
import re

from tools.delivery import github_api
from tools.delivery.records import ID, values

PATH = "tools/delivery/review-policy.json"
SHA = r"[0-9a-f]{40}"
DESTINATIONS = {"development", "staging", "main"}


def _unique_fields(pairs: list[tuple]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("review policy contains duplicate fields")
        result[key] = value
    return result


def _roles(policy: dict, pr: dict) -> tuple[dict, list[str]]:
    if pr["base"]["ref"] not in DESTINATIONS:
        raise ValueError("review policy requires a supported delivery destination")
    if not isinstance(policy, dict) or type(policy.get("format")) is not int or policy["format"] != 1:
        raise ValueError("review policy format must be 1")
    repository_id = policy.get("repository_id")
    if type(repository_id) is not int or repository_id <= 0 or repository_id != pr["base"]["repo"].get("id"):
        raise ValueError("review policy repository ID does not match GitHub")
    roles, branches = policy.get("roles"), policy.get("branches")
    if not isinstance(roles, dict) or not roles or not isinstance(branches, dict) or not branches:
        raise ValueError("review policy requires roles and destination branches")
    for role, principals in roles.items():
        if not isinstance(role, str) or not re.fullmatch(ID, role) or not isinstance(principals, list) or not principals:
            raise ValueError("review policy role requires named principals")
        seen = set()
        for principal in principals:
            if not isinstance(principal, dict) or set(principal) != {"id", "type"} or type(principal.get("id")) is not int or principal["id"] <= 0 or principal.get("type") not in ("User", "Bot"):
                raise ValueError("review policy principal requires a positive GitHub ID and User/Bot type")
            identity = (principal["id"], principal["type"])
            if identity in seen:
                raise ValueError("review policy role contains duplicate principals")
            seen.add(identity)
    for branch, required in branches.items():
        if branch not in DESTINATIONS or not isinstance(required, list) or not required or any(not isinstance(role, str) or role not in roles for role in required) or len(required) != len(set(required)):
            raise ValueError("review policy branch requires unique declared roles")
    if pr["base"]["ref"] not in branches:
        raise ValueError("review policy does not authorize this destination branch")
    return roles, branches[pr["base"]["ref"]]


def collect(pr: dict, base_sha: str, token: str) -> dict:
    if not isinstance(base_sha, str) or not re.fullmatch(SHA, base_sha):
        raise ValueError("review policy requires an authoritative full base SHA")
    repository = pr["base"]["repo"]["full_name"]
    blob, _ = github_api.request("GET", f"/repos/{repository}/contents/{PATH}?ref={base_sha}", token, None)
    if not isinstance(blob, dict) or blob.get("type") != "file" or blob.get("path") != PATH or blob.get("encoding") != "base64" or not isinstance(blob.get("sha"), str) or not re.fullmatch(SHA, blob["sha"]):
        raise ValueError("review policy contents are unavailable or invalid")
    policy = json.loads(base64.b64decode(blob["content"]), object_pairs_hook=_unique_fields)
    _roles(policy, pr)
    return {"path": PATH, "commit_sha": base_sha, "blob_sha": blob["sha"], "policy": policy}


def violations(receipt: dict, record: dict, source: dict) -> list[str]:
    observation = source.get("review_policy")
    if not isinstance(observation, dict):
        return ["authoritative review policy is unavailable"]
    if observation.get("path") != PATH or observation.get("commit_sha") != receipt["subject"].get("base_sha") or not isinstance(observation.get("blob_sha"), str) or not re.fullmatch(SHA, observation["blob_sha"]):
        return ["authoritative review policy is invalid or stale"]
    try:
        roles, required = _roles(observation.get("policy"), source["pr"])
    except ValueError as error:
        return [str(error)]
    errors = []
    locator = {key: observation[key] for key in ("path", "commit_sha", "blob_sha")}
    if receipt.get("review_policy") != locator:
        errors.append("receipt review policy locator is missing, stale, or differs from GitHub")
    selected = values(record["Review roles"])
    if not set(required).issubset(selected):
        errors.append("candidate omits roles required by the authoritative review policy")
    if any(role not in roles for role in selected):
        errors.append("candidate selects a role absent from the authoritative review policy")
    for review in receipt["reviews"]:
        evidence = next((item for item in source.get("reviews", []) if str(item.get("id")) == str(review.get("id")) and item.get("kind") == review.get("kind")), {})
        author = evidence.get("user")
        principals = roles.get(review.get("role"), [])
        if not isinstance(author, dict) or type(author.get("id")) is not int or not any(author.get("id") == principal["id"] and author.get("type") == principal["type"] for principal in principals):
            errors.append(f"review author is missing or unauthorized for role {review.get('role')}")
    return errors
