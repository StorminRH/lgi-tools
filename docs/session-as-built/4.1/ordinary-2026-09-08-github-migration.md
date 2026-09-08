# Ordinary GitHub migration preparation

**Record format:** 2
**Record status:** Candidate
**Recorded:** 2026-09-08
**Scope:** ordinary
**Delivery ID:** LGI-119-github-migration-1
**Receipt issue:** https://linear.app/lgitools/issue/LGI-119
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Criteria:** None.
**Branch:** codex/github-primary-migration
**PR:** https://github.com/StorminRH/lgi-tools/pull/486
**Review roles:** structure-reviewer, behavior-reviewer, thermo-nuclear-review-subagent, thermo-nuclear-code-quality-review-subagent, coderabbit, greptile, bugbot
**Prior deliveries:** None.
**Record standard:** docs/workflows/schema/session-as-built-v2.md

## Delivered outcome

This candidate prepares repository tooling and procedures for GitHub delivery.
The implementation supports the migration's acceptance work; service cutover and
scheduled automation activation remain separate delivery obligations.

- [LGI-119-github-ci] Added: GitHub Actions verification, production build and browser jobs with PostgreSQL 16, SDE preparation, dependency cache checks, bounded artifact retention and an isolated CI-subject artifact that binds successful jobs to the tested pull request base and head.
- [LGI-119-github-bootstrap] Added: Shared development bootstrap and environment reconciliation for local and cloud checkouts, including service ownership, local-target guards, PostgreSQL, SDE, authentication readiness and checkout identity checks.
- [LGI-119-github-browser] Changed: Browser checks run through Playwright Test with mandatory smoke coverage, selected route and Atlas probes, separate local seeded and remote supplied-auth lanes, fixture cleanup, and sanitized failure diagnostics persisted beside the report. The standalone overlapping probe runners are removed.
- [LGI-119-github-receipts] Added: Offline format-2 candidate parsing and delivery-time receipt validation that binds frozen record bytes, current CI subjects and review evidence to the real GitHub pull request. Required roles and author IDs come from the fixed policy at the authoritative base; deployment and archive checks retain delivery observations and historical policy authority. Legacy records retain their existing format.
- [LGI-119-github-guidance] Changed: Codex and Cursor share delivery, verification, skill and role contracts with native model pins preserved. The guidance distinguishes requested pins from observed runtime identity and selects local checks from the cumulative unverified change.
- [LGI-119-github-maintenance] Added: Shared test-cleanup and rotating data-design audit procedures, contributor data-design guidance and an audit inventory to support resumable maintenance through Linear checkpoints.

## Successor notes

- Final acceptance of PR486 requires current verify/build/e2e evidence, all seven selected reviews at the frozen head, disposition of findings and threads, and an authenticated Linear receipt. Earlier CI runs and focused checks retain their original input limits. The fixed review policy was installed separately by PR487; distribution and protection on each destination must precede delivery there. Track remaining audit dispositions in [LGI-119](https://linear.app/lgitools/issue/LGI-119) and final manual provider reviews in [LGI-113](https://linear.app/lgitools/issue/LGI-113).
- Complete the current mandatory browser cases, representative Atlas journeys and failure-path fixture cleanup/census evidence in [LGI-114](https://linear.app/lgitools/issue/LGI-114). Implemented probes and diagnostic artifacts do not establish full browser acceptance.
- Accept and activate the GitHub-backed Cursor Build only after the default-branch, warm-start, changed-head, environment and native cloud discovery checks in [LGI-120](https://linear.app/lgitools/issue/LGI-120). Preserve the documented Codex Cloud setup limits in [LGI-121](https://linear.app/lgitools/issue/LGI-121) and the native identity evidence and observation limits in [LGI-123](https://linear.app/lgitools/issue/LGI-123).
- Complete maintenance dry runs, checkpoint ownership, branch/environment readback, scheduling and concurrency checks before activating the prepared automations in [LGI-115](https://linear.app/lgitools/issue/LGI-115) and [LGI-118](https://linear.app/lgitools/issue/LGI-118). Retarget or retire the old routines without duplicate writers.
- Complete coordinated cutover and retirement in [LGI-116](https://linear.app/lgitools/issue/LGI-116) and [LGI-117](https://linear.app/lgitools/issue/LGI-117): preserve Origin refs and drafts, prove GitHub protections and staging/production deployment identity with backend and authentication readiness, retain rollback evidence, demonstrate a fresh delivery workflow, and verify retirement and billing. The Actions cost/parity decision in [LGI-112](https://linear.app/lgitools/issue/LGI-112) does not replace these final proofs.
