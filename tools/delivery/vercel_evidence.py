"""Compare authenticated Vercel deployment and alias exports with GitHub identity.

The caller freshly retrieves v13 deployments (withGitRepoInfo=true) and v4
aliases with the expected team/project scope. This module does not authenticate
JSON files; it rejects exports whose provider subjects do not agree.
"""
from __future__ import annotations


def deployment_source(export: dict, expected: dict, pr: dict, stage: str, merge_sha: str, *, archive_history: bool = False) -> dict:
    deployment, alias = export["deployment"], export["alias"]
    project, team, domain = expected["project_id"], expected["team_id"], expected["alias"]
    if not project or not team or not domain:
        raise ValueError("Vercel expected project, team, and durable alias are required")
    if deployment.get("projectId") != project or deployment.get("ownerId") != team:
        raise ValueError("Vercel deployment belongs to another project/team")
    if deployment.get("team") is not None and deployment["team"].get("id") != team:
        raise ValueError("Vercel deployment team disagrees with its owner")
    if deployment.get("readyState") != "READY":
        raise ValueError("Vercel deployment is not READY")
    source = deployment.get("gitSource", {})
    repository = pr["base"]["repo"]
    if source.get("type") != "github" or str(source.get("repoId")) != str(repository["id"]):
        raise ValueError("Vercel deployment is not from the expected GitHub repository")
    if source.get("sha") != merge_sha or source.get("ref") != pr["base"]["ref"]:
        raise ValueError("Vercel deployment has the wrong commit or branch")
    owner, name = repository["full_name"].split("/")
    git_repo = deployment.get("gitRepo")
    if git_repo is not None and (git_repo.get("type") != "github" or git_repo.get("org") != owner or git_repo.get("repo") != name or str(git_repo.get("repoId")) != str(repository["id"])):
        raise ValueError("Vercel gitRepo disagrees with the GitHub subject")
    for key, value in {"githubCommitSha": merge_sha, "githubCommitRef": pr["base"]["ref"], "githubCommitOrg": owner, "githubCommitRepo": name, "githubRepoId": str(repository["id"])}.items():
        metadata = deployment.get("meta", {})
        if key in metadata and str(metadata[key]) != value:
            raise ValueError(f"Vercel metadata {key} disagrees with gitSource")
    custom = deployment.get("customEnvironment")
    if stage == "promoted":
        if not expected.get("environment_id") or deployment.get("target") is not None or not isinstance(custom, dict) or custom.get("id") != expected["environment_id"] or custom.get("slug") != "staging":
            raise ValueError("Vercel deployment does not match the staging custom environment")
        environment = "staging"
    elif stage == "released":
        if deployment.get("target") != "production" or custom is not None:
            raise ValueError("Vercel deployment is not the production target")
        environment = "production"
    else:
        raise ValueError("Vercel deployment proof applies only to promoted/released stages")
    if alias.get("alias") != domain or alias.get("projectId") != project or alias.get("deploymentId") != deployment.get("id") or not deployment.get("id"):
        raise ValueError("Vercel durable alias does not route to this project's deployment")
    if alias.get("deployment") is not None and alias["deployment"].get("id") != deployment["id"]:
        raise ValueError("Vercel alias deployment identities disagree")
    if not archive_history and (deployment.get("aliasAssigned") is not True or domain not in deployment.get("alias", [])):
        raise ValueError("Vercel deployment does not confirm durable alias assignment")
    return {"provider": "vercel", "id": deployment["id"], "sha": source["sha"],
            "environment": environment, "state": "success", "project_id": project,
            "team_id": team, "alias": domain, "environment_id": expected.get("environment_id") if stage == "promoted" else None}
