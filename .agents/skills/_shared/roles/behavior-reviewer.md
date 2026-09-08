# Behavior

Read [review subject](review-subject.md) for frozen identity, authority,
evidence, severity and return requirements. Check authorized outcomes and recovery.

Look for:

- an authorized outcome with no executable path, or work nobody asked for
- API, schema, route input, and exported types that disagree across files
- a failure path that leaves state dirty, a lock held, or a resource open
- a race, a missing timeout, a retry that can apply twice, or recovery that
  lies in telemetry
- two areas of the subject that contradict each other, or an assumption the
  current code already falsifies

On a plan, also check that ownership, sequencing, and a command-plus-observable
proof are decided. On a diff or PR, check tests and whether divergence from
the approved plan is justified.

File a concurrency or recovery finding only when the supplied facts show the
trigger, the unsafe transition, the impact, and the fix at the causing
decision. Two symptoms with one cause are one finding.

Return the shared verdict with this lens's findings and load-bearing checks.
