---
name: version-audit
description: >-
  Internal lifecycle handler that executes an approved LGI.tools version audit
  or periodic health pass, fully
  replace the live code-health baseline, and archive a completed version bundle
  only after the version-close audit passes. Use for "version audit", "baseline
  the codebase", "health pass", "refresh the baseline", or "finish the version
  audit". Normally dispatched by start-session except for an explicitly requested
  periodic health pass.
---

# Run an LGI.tools version audit

<!-- shared-policy-revision: 28 -->

Follow `docs/VERSION_AUDIT.md`; it owns measurement, classification, the fixed
baseline schema, and completion rules. `docs/DESIGN_PRINCIPLES.md` is the
constitution. The approved `docs/version-audits/X.Y/PLAN.md` supplies this run's
scope.

## Authorization and sequence

Invoking this skill authorizes audit-local documentation changes and, for an
approved `Version close` plan, the final verified archive transition. It does
not authorize a merge, deployment, production change, or destructive recovery.

1. Run the lifecycle resolver and require its directive to name `version-audit`
   as the handler. Otherwise report the directive and return control to
   `start-session`; do not select a sibling handler here. Use the directive's
   action to distinguish an initial/resumed audit, complete restart, or verified
   archive transition. Validate mode, version, markers, finding ledger, and
   procedure digest. On a restart action, advance the cycle and `Audited ref` to
   current canonical `main`, set the audit back to Approved, and rerun the
   complete audit rather than only changed surfaces.
2. Read the constitution, current baseline, audit procedure, approved plan, and
   every version artifact the procedure names.
3. Create a native Codex todo list from each numbered audit step plus the
   approved plan. Keep one item in progress and reopen checks after fixes.
4. Measure, re-rank, inspect drift, and classify findings exactly as the audit
   document requires. Evidence outranks the previous baseline. Give every new
   actionable finding a stable `AF-NNN` id; mark delivered findings Verified
   only when the fresh run proves their required outcome.
5. Replace `docs/CODE_HEALTH_BASELINE.md` in full using the fixed schema; never append
   an audit log. Reconcile backlog and campaign decisions in the same run.
6. If any Floss or Campaign remains, mark it Open, set `Audit status` to
   `Remediation required`, update SCRATCHPAD, and stop without archival. Watch
   findings remain non-blocking only with an explicit trigger.
7. Mark the audit Complete only when all actionable findings are Verified, the
   current cycle found none, required gates pass, and the baseline code ref
   matches `Audited ref`. A periodic audit stops without archival.
8. For a clean version-close audit, require `verify_archive.py --check --phase
   pre`, copy the verified master plan, contracts, session plans, and audit plan
   as one bundle, then require `verify_archive.py --check --phase post` before
   removing active sources. Keep the baseline active.
9. Update SCRATCHPAD, rerun the resolver, report its new directive, run the agent
   drift check, and return control to `start-session` without predicting the next
   stage.
