---
name: version-audit
description: >-
  Internal lifecycle handler that executes an approved LGI.tools version audit
  or health pass, fully replaces the
  live baseline, and archive a completed version bundle only after its audit.
  Use for "version audit", "baseline the codebase", "health pass", "refresh the
  baseline", or "finish the version audit". Normally dispatched by start-session
  except for an explicitly requested periodic health pass.
---

# Run an LGI.tools version audit

<!-- shared-policy-revision: 26 -->

Follow `docs/VERSION_AUDIT.md`; read `docs/DESIGN_PRINCIPLES.md`, the current
baseline, and the approved audit plan first. Invocation authorizes audit-local
documentation changes and the verified archive transition for an approved
Version close plan, but no merge, deploy, production change, or destructive
recovery.

Run the lifecycle resolver and require its directive to name `version-audit` as
the handler. Otherwise report it and return control to `start-session`; never
select a sibling handler here. Use the directive action to distinguish an
initial/resumed audit, full restart, or verified archive. Validate mode/version,
cycle/ref markers, finding ledger, and procedure digest. On a restart action,
advance the cycle and audited ref to current canonical `main`, set Approved, and
rerun the complete audit.
Create a native Claude Code task list
from every audit step and plan item. Measure and classify from current evidence,
then replace `docs/CODE_HEALTH_BASELINE.md` in full using the fixed schema—never append
an audit log. Give actionable findings stable `AF-NNN` ids and mark Delivered
findings Verified only from fresh proof. Any Floss or Campaign sets Remediation
required (`Audit status: Remediation required`) and stops without archival;
Watch is non-blocking only with
an explicit trigger. Mark Complete and archive only when every actionable
finding is Verified, the current cycle is clean, required gates pass, and the
baseline matches the Audited ref. Periodic mode stops without archival. For the
clean version-close transition, require `verify_archive.py --check --phase pre`,
copy the complete bundle, then require `verify_archive.py --check --phase post`
before removing active sources. Finally update SCRATCHPAD, rerun the resolver,
report its new directive, run the drift check, and return control to
`start-session` without predicting the next stage.
