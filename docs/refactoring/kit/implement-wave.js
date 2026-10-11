export const meta = {
  name: 'implement-wave',
  description: 'Implement one wave of the primitive extraction guide item by item (map, implement, pnpm check, commit), then review the wave and run pnpm verify',
  phases: [
    { title: 'Prepare', detail: 'environment guard and docs-researcher briefs' },
    { title: 'Implement', detail: 'per item: repo-mapper, implement, test-runner pnpm check, fix, commit' },
    { title: 'Review', detail: 'adversarial review of the wave diff, then fixes' },
    { title: 'Verify', detail: 'pnpm verify through test-runner, then fixes' },
  ],
}

// Args come from docs/refactoring/kit/tools/make_args.py. See docs/refactoring/HANDOFF.md.
const A = args
const REPO = A.repo
const T = `${REPO}/docs/refactoring/kit/tools`
const S = A.scratch
const FE = A.fallowEnv || ''
const DB_URL = 'postgres://lgi:lgi@localhost:5433/lgi_tools'
const GUIDE = `docs/refactoring/${A.waveFile}`
const MAX_FIX = 3

const GIT = { type: 'object', properties: { ok: { type: 'boolean' }, output: { type: 'string' } }, required: ['ok', 'output'] }
const CHECK = {
  type: 'object',
  properties: {
    passed: { type: 'boolean', description: 'true only when every command exited 0 and nothing was skipped (the known DATABASE_URL-gated advisory-lock concurrency file is the only acceptable skip)' },
    skipped: { type: 'string', description: 'Skipped suites or commands, or empty' },
    failures: { type: 'string', description: 'Per failing command: the command and the smallest actionable failure output verbatim (file, line, message). Empty when passed.' },
  },
  required: ['passed', 'skipped', 'failures'],
}
const IMPL = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['implemented', 'already-done', 'blocked'] },
    summary: { type: 'string', description: '3-6 sentences: what changed, where, and any bug fixed' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    commitSubject: { type: 'string' },
    commitBody: { type: 'string' },
    testsRun: { type: 'string' },
    deviations: { type: 'string', description: 'Where you departed from the write-up and why, or empty' },
    followUps: { type: 'string', description: 'What later items must know (new primitive names and homes, renamed symbols), or empty' },
    blockedReason: { type: 'string', description: 'Empty unless status is blocked' },
  },
  required: ['status', 'summary', 'filesChanged', 'commitSubject', 'commitBody', 'testsRun', 'deviations', 'followUps', 'blockedReason'],
}
const FIXR = { type: 'object', properties: { summary: { type: 'string' }, gaveUp: { type: 'boolean' }, reason: { type: 'string' }, commitSubject: { type: 'string', description: 'Commit subject for these changes: one imperative sentence, at most 72 characters, naming what was fixed (for example "Keep the anchor jump on fragment segment links (P020 review)"), not the process ("Address the review findings", "Fix the verify gate").' }, commitBody: { type: 'string', description: 'Commit message body for these changes: 2-8 lines wrapped at 72 columns, stating what was wrong and what changed, per item id. No process narration, no first person, no claims about committing.' } }, required: ['summary', 'gaveUp', 'reason', 'commitSubject', 'commitBody'] }
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          itemId: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'itemId', 'file', 'line', 'issue', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const CONTEXT = `You are working in ${REPO} on branch ${A.branch}, implementing wave ${A.wave} ("${A.heading}") of the primitive extraction guide in docs/refactoring/. Items land one at a time; each gets its own commit after the test-runner's pnpm check passes.

Ground rules for this project:
- The guide was written against commit e5b7b17. Since then development has moved a long way and earlier waves of this project have landed. Line ranges in the guide are stale: re-open every site and grep for new ones. Status lines in the guide say which items are done, already done, or blocked. ${A.projectNote}
- Environment: \`next dev\` is deliberately stopped because it corrupts .next/dev/types; never start it or the dev stack. Route types live in .next/types; if you add, rename, or remove a route, page, or layout under src/app, run \`pnpm exec next typegen\`. Postgres is up on :5433 for *.db.test.ts suites. src/db/advisory-lock.concurrency.test.ts only runs with DATABASE_URL exported; if you touch advisory locks, run it with \`DATABASE_URL=${DB_URL}\`.
- Never commit, push, stash, reset, rebase, or switch branches; the workflow commits. Never edit the Status lines or status boxes in docs/refactoring; the workflow ticks them.
- The workflow already ran docs-researcher (briefs below) and repo-mapper for you, and runs the test-runner's pnpm check after you. Run focused checks yourself.
- AGENTS.md and src/AGENTS.md apply in full: preserve .fallowrc.json boundaries; no eslint-disable, no @ts-ignore or @ts-expect-error to dodge errors, no Fallow suppressions, threshold raises, overrides, or baselines; fix every Fallow finding wherever it is; respect the src/AGENTS.md landmines (advisory locks on the direct client, createClientStore for app-wide client state, Popover not Tooltip for (?) hints, runtime CSS via style.setProperty, styling placement).
- Read node_modules/next/dist/docs/ before using any Next.js API the briefs do not cover.
- This runs on the owner's own machine: treat its CPU, memory and disk with care. Work only in this checkout. Never create git worktrees, clones or copies of the repo or of node_modules. Never run \`pnpm install\` or add dependencies unless the item itself requires it. Never start \`next dev\`, \`next start\` or \`next build\`; start the Convex local backend only when an item needs codegen, and stop it before you finish. Run vitest once (\`vitest run\`), never in watch mode, and never two vitest processes at a time. Stop every process you start before you return. Keep scratch files outside the repo tree (or delete them) and do not write large logs, dumps or screenshots. The workflow sweeps leftover processes and worktrees at the end, but leaving none is your job.
- Run Fallow as \`${FE}pnpm fallow:static\`. If Fallow warns that its type-aware sidecar timed out, its findings are not trustworthy (a timed-out sidecar reports hundreds of false unused exports): rerun with FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 set.
- Never export a constant or helper that only tests read: pnpm verify runs Fallow's production dead-code pass, which does not count test references.`

const LONG_CMDS = '\n\nLong commands: typecheck, lint, Fallow, and vitest runs can take several minutes. Call Bash with timeout 600000 for them, and never act on a command you did not see finish; if one is moved to the background, wait for it and read its real result.'

function shell(steps, label, phase) {
  return agent(`Run these shell steps in ${REPO}, in order, exactly as written, and report their combined output. Do nothing else: no edits, no extra commands, no fixes. Set ok=false if any step exits non-zero.\n\n${steps}`, { label, phase, effort: 'low', schema: GIT })
}

async function runCheck(label, phase, full) {
  const what = full
    ? `Run full verification with exactly: \`${FE}pnpm verify\`.`
    : `Run the pre-commit gate (\`pnpm check\`: your four commands), writing the Fallow one as \`${FE}pnpm fallow:static\`.`
  const sidecar = ' If a Fallow run warns "type-aware sidecar timed out", report that warning explicitly rather than its findings: a timed-out sidecar falls back to syntactic findings and reports false unused exports. FALLOW_TYPE_AWARE_TIMEOUT_SECS raises only that timeout; it changes no rule, threshold, baseline or suppression.'
  for (let attempt = 0; attempt < 2; attempt++) {
    const waitRule = ' These commands can take several minutes: call Bash with timeout 600000 for each one, and never report while a command is still running or was moved to the background. If one is backgrounded, wait for it to finish and read its real result. A command you did not see finish is not a failure: run it again in the foreground with the long timeout. Never start a second vitest run while an earlier one may still be running (for example one moved to the background): the *.db.test.ts suites share fixed schema names on the one local Postgres, so overlapping runs break each other. Make sure the earlier process has exited (pgrep -f "[v]itest" prints nothing) before rerunning.'
    const r = await agent(`${what} The working directory is ${REPO}. Postgres is up on :5433. The only acceptable skip is src/db/advisory-lock.concurrency.test.ts, which is gated on DATABASE_URL being exported; any other skip means passed=false. Report passed=true only when every command exits 0. Keep failures to the smallest actionable output per failing command, verbatim, with file and line.${waitRule}${sidecar}`, { label, phase, agentType: 'test-runner', schema: CHECK })
    if (!r) return { passed: false, skipped: '', failures: 'test-runner returned nothing' }
    if (!r.passed && /\.next\/dev\/types/.test(r.failures) && attempt === 0) {
      await shell(`bash "${T}/env_guard.sh"${A.killNextDev ? ' --kill-next' : ''}`, `${label}:guard`, phase)
      continue
    }
    return r
  }
}

async function fixUntilGreen(label, phase, describe, full) {
  let chk = await runCheck(`${label}:check`, phase, full)
  let used = 0
  let subject = ''
  let body = ''
  for (let round = 1; !chk.passed && round <= MAX_FIX; round++) {
    used = round
    const fx = await agent(`${CONTEXT}\n\n${describe}\n\nThe test-runner's ${full ? 'pnpm verify' : 'pnpm check'} failed.\nFailures:\n${chk.failures}\n${chk.skipped ? `Skipped: ${chk.skipped}` : ''}\n\nFix the root cause. Never pass a check by deleting or skipping a test, weakening an assertion without reason, suppressing a lint or Fallow finding, or raising a threshold. A Fallow finding fails the run wherever it is, even outside this change; fix it. Rerun the failing commands yourself until they pass. Do not commit. If the failure cannot be fixed within scope, set gaveUp=true with the reason and leave the tree as it is.${LONG_CMDS}`, { label: `${label}:fix${round}`, phase, schema: FIXR })
    if (!fx || fx.gaveUp) return { passed: false, failures: fx ? fx.reason : 'fix agent failed', rounds: round }
    subject = fx.commitSubject || subject
    body = [body, fx.commitBody].filter(Boolean).join('\n\n')
    chk = await runCheck(`${label}:check${round}`, phase, full)
  }
  return { passed: chk.passed, failures: chk.failures, rounds: used, subject, body }
}

function clip(text, max) {
  const t = (text || '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
  return end > max / 2 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…'
}

async function commitStep(tag, msg, mark, label, phase, pre = '') {
  const full = A.trailers ? `${msg}\n\n${A.trailers}` : msg
  const steps = `${ICLOUD_GUARD}\n${pre}${heredoc(`${S}/msg-${tag}.txt`, full)}\n${mark ? `python3 "${T}/mark.py" ${mark}\n` : ''}git add -A\ngit commit -q -F "${S}/msg-${tag}.txt"\ngit log -1 --format='%h %s'\ngit status --porcelain`
  for (let tryNo = 1; tryNo <= 2; tryNo++) {
    const c = await shell(steps, tryNo === 1 ? label : `${label}:retry`, phase)
    if (c && c.ok) return c
  }
  return null
}

// The checkout lives in an iCloud-synced folder: a branch switch or bulk file creation can spawn
// untracked "name 2.ext" copies, which `git add -A` would sweep into an item commit.
const ICLOUD_GUARD = `if git ls-files --others --exclude-standard | grep -E ' [0-9]+(\\.[^/]*)?$'; then echo 'untracked iCloud duplicate copies (listed above): move them out of the repo before committing'; exit 1; fi`

function heredoc(path, text) {
  return `cat > "${path}" <<'LGI_WAVE_EOF'\n${text}\nLGI_WAVE_EOF`
}

// ---------------------------------------------------------------------------------------
phase('Prepare')
const guard = await shell(`bash "${T}/env_guard.sh"${A.killNextDev ? ' --kill-next' : ''}\nmkdir -p "${S}"\ngit status --porcelain\ngit log --oneline -1`, 'env-guard', 'Prepare')
if (!guard || !guard.ok) return { aborted: 'environment guard failed', output: guard && guard.output }
await shell(`bash "${T}/cleanup.sh" snapshot "${S}"`, 'cleanup:snapshot', 'Prepare')
async function finish(result) {
  const sweep = await shell(`bash "${T}/cleanup.sh" sweep "${S}"`, 'cleanup:sweep', 'Verify')
  return { ...result, cleanup: sweep ? sweep.output : 'cleanup sweep did not run; run docs/refactoring/kit/tools/cleanup.sh sweep yourself' }
}
if (/^\s*[MADRCU?]{1,2} /m.test(guard.output.split('\n').slice(1).join('\n'))) return { aborted: 'working tree not clean at start', output: guard.output }

const briefRuns = await parallel(A.briefs.map(b => () => agent(`Task: implementers will make these changes in LGI.tools (${REPO}) during wave ${A.wave} of a refactoring project:\n${A.items.map(i => `- ${i.id}: ${i.title}`).join('\n')}\n\nThe detailed write-ups are in ${GUIDE} (read the sections for the items this technology touches).\n\nTechnology: ${b.tech}. Resolve the exact version from package.json and pnpm-lock.yaml.\nQuestions: ${b.focus}\n\nReturn a Documentation brief the implementers can rely on without a second lookup. Keep it under about 1,500 words.`, { label: `brief:${b.tech}`, phase: 'Prepare', agentType: 'docs-researcher' })))
const BRIEFS = briefRuns.map((r, i) => r ? `### ${A.briefs[i].tech}\n${r}` : `### ${A.briefs[i].tech}\n(brief failed; consult official docs for the installed version yourself)`).join('\n\n')

// ---------------------------------------------------------------------------------------
phase('Implement')
const todo = A.items.filter(i => !/^\[x\]|blocked/.test(i.status || ''))
if (todo.length < A.items.length) log(`Skipping ${A.items.length - todo.length} items already marked in the guide`)

const mapItem = (item) => agent(`Blast radius for one refactoring item in ${REPO} (branch ${A.branch}). Item ${item.id}: ${item.title}. Its write-up is the "## ${item.id}:" section of ${GUIDE}; the line ranges there are stale. Map, against the CURRENT tree: where each cited site lives now, every caller and importer of each symbol the item creates, moves, renames, or deletes (including tests, mocks, coverage pins, registries, and CSS), any NEW sites of the same pattern the write-up missed, the .fallowrc.json zone of the proposed home and of each consumer, and whether development already did some or all of the item. Repository map only; do not edit.`, { label: `map:${item.id}`, phase: 'Implement', agentType: 'repo-mapper' })

const results = []
let progress = ''
let nextMap = todo.length ? mapItem(todo[0]) : null
for (let i = 0; i < todo.length; i++) {
  const item = todo[i]
  const map = await nextMap
  nextMap = i + 1 < todo.length ? mapItem(todo[i + 1]) : null
  const blockedSoFar = results.filter(r => r.status === 'blocked').map(r => r.id)
  const deps = item.dependsOn && item.dependsOn.length ? item.dependsOn.join(', ') : 'none'

  const impl = await agent(`${CONTEXT}

YOUR ITEM: ${item.id}: ${item.title}
Its full write-up is the "## ${item.id}:" section of ${GUIDE}: problem, sites, home, boundary check, API sketch, migration steps, tests, and notes. Also read the "Implementer guidance" section and every "Conflicts to reconcile" entry in docs/refactoring/README.md that mentions ${item.id}. It depends on: ${deps}.${blockedSoFar.length ? ` Blocked in this wave so far (their changes did not land): ${blockedSoFar.join(', ')}.` : ''}

Earlier items in this wave:
${progress || 'none yet'}

Repository map from repo-mapper (it may predate the most recent commit):
${map || 'repo-mapper failed; map the blast radius yourself with codegraph and grep.'}

Documentation briefs for this wave:
${BRIEFS}

Steps:
1. Decide whether the item is still needed against the current code. If development or an earlier item already did all of it, change nothing and return status "already-done" with the evidence in summary. If part is done, do the rest.
2. Implement the whole item: the primitive or fix plus every migration in the write-up, adapted to the current code. No partial migrations and no leftover copies of the old pattern (grep to confirm). Preserve the behavior differences listed under Notes; where copies drifted, follow the write-up on which copy is correct. Remove exports, files, mocks, and coverage pins that become unused.
3. Add or move tests as the write-up's Tests paragraph says, following docs/principles/testing-principles.md.
4. Run the focused tests for every file you touched or whose behavior changed (\`pnpm exec vitest run <paths>\`), then \`pnpm typecheck\`, \`pnpm lint\`, and \`pnpm fallow:static\`. Fix what fails.
5. If the item cannot be done safely within its scope (the design no longer fits, it needs a large unplanned change, or it would break an invariant), stop, revert every change you made (\`git checkout -- . && git clean -fd\`; the tree was clean when you started), and return status "blocked" with a precise reason. Never leave a partial migration.

commitSubject: one imperative sentence in this repo's style (see \`git log --oneline -20 origin/development\`), at most 72 characters, ending with " (${item.id})". commitBody: 2-6 lines wrapped at 72 columns saying what changed and why, including any bug fixed. No trailers; the workflow adds them.${LONG_CMDS}`, { label: `impl:${item.id}`, phase: 'Implement', schema: IMPL })

  let status = impl ? impl.status : 'blocked'
  let reason = impl ? impl.blockedReason : 'implementer agent failed'
  let gate = null

  if (status === 'implemented') {
    gate = await fixUntilGreen(item.id, 'Implement', `You are fixing the working tree after item ${item.id} (${item.title}) was implemented. The uncommitted changes are that item's. Write-up: the "## ${item.id}:" section of ${GUIDE}.\n\nImplementer summary:\n${impl.summary}`, false)
    if (!gate.passed) { status = 'blocked'; reason = `pnpm check stayed red after ${gate.rounds} fix rounds: ${gate.failures.slice(0, 600)}` }
  }

  if (status === 'blocked') {
    await shell(`git checkout -- .\ngit clean -fd\ngit status --porcelain`, `revert:${item.id}`, 'Implement')
    const msg = `Record that ${item.id} is blocked\n\n${(reason || 'No reason given.').slice(0, 900)}`
    const note = (reason || 'see commit').replace(/\s+/g, ' ').slice(0, 300)
    const c = await commitStep(item.id, msg, `${item.id} blocked "@${S}/note-${item.id}.txt"`, `commit:${item.id}`, 'Implement', `${heredoc(`${S}/note-${item.id}.txt`, note)}\n`)
    if (!c) return await finish({ aborted: `commit failed for blocked ${item.id}; the tree may hold uncommitted docs changes`, results })
    results.push({ id: item.id, status: 'blocked', reason, commit: c && c.output })
    progress += `- ${item.id} BLOCKED (nothing landed): ${(reason || '').slice(0, 300)}\n`
    log(`${item.id} blocked`)
    continue
  }

  const state = status === 'already-done' ? 'upstream' : 'done'
  const msg = status === 'already-done'
    ? `Mark ${item.id} as already done\n\n${clip(impl.summary, 900)}`
    : `${impl.commitSubject}\n\n${impl.commitBody}`
  const c = await commitStep(item.id, msg, `${item.id} ${state}`, `commit:${item.id}`, 'Implement')
  if (!c) return await finish({ aborted: `commit failed for ${item.id}; its changes are still uncommitted in the tree`, results })
  results.push({ id: item.id, status, summary: impl.summary, deviations: impl.deviations, followUps: impl.followUps, fixRounds: gate ? gate.rounds : 0, commit: c && c.output })
  progress += `- ${item.id} ${status}: ${impl.summary.slice(0, 350)}${impl.followUps ? ` Follow-ups: ${impl.followUps.slice(0, 250)}` : ''}\n`
  log(`${item.id} ${status}`)
}

// ---------------------------------------------------------------------------------------
phase('Review')
const landed = results.filter(r => r.status === 'implemented').map(r => r.id)
let review = { findings: 0, fixed: null }
if (landed.length) {
  const lenses = [
    `Hunt for real defects the wave introduced: behavior changes the guide did not intend, broken edge cases (null, empty, zero, negative, boundary dates), lost error handling or retries, server/client boundary mistakes (a client module pulling in server-only code, a missing 'use client'), missing awaits, races, cache tags not invalidated or invalidated wrongly, auth or ownership checks weakened, accessibility regressions, and imports that cross .fallowrc.json zones illegally.`,
    `Check completeness against the guide: for each item this wave marked done (${landed.join(', ')}), confirm every site was migrated (grep for leftover copies of the old pattern, including sites added since the guide), the new primitive has tests, exports, mocks, and coverage pins that became unused were removed, the home matches the write-up or its Conflicts entry, and nothing changed behavior beyond what the write-up lists. Also confirm that items marked "already done on development" really are. Check that each new or changed test can actually fail: fixtures built from the helper under test, fake timers that move both clocks, timezone cases on one side of UTC only, and literal pins lost when a test file was moved or consolidated.`,
  ]
  const reviews = await parallel(lenses.map((lens, k) => () => agent(`${CONTEXT}\n\nREVIEW wave ${A.wave}. Its commits are \`git log --oneline ${A.base}..HEAD\` and its diff is \`git diff ${A.base}...HEAD -- . ':!docs/refactoring'\`. ${lens}\n\nVerify every finding by reading the code and, where cheap, by running a focused test. Report only issues you are confident are real, each with a concrete fix. Return an empty list if there are none. Read-only: do not edit files.${LONG_CMDS}`, { label: `review:${k === 0 ? 'correctness' : 'completeness'}`, phase: 'Review', schema: FINDINGS, model: k === 0 ? 'opus' : 'fable', effort: 'high' })))
  const all = reviews.filter(Boolean).flatMap(r => r.findings)
  review.findings = all.length
  if (all.length) {
    const fx = await agent(`${CONTEXT}\n\nTwo reviewers checked wave ${A.wave} (diff: \`git diff ${A.base}...HEAD\`). Their findings:\n${JSON.stringify(all, null, 1)}\n\nFor each finding: verify it against the code first. Fix the ones that are real (blockers and majors always; minors when the fix is small and safe). Skip the ones that are wrong and say why. Keep fixes minimal and within the wave's items. Add tests for real bugs. Run focused tests, typecheck, and lint yourself. Do not commit. Return a summary listing each finding as fixed or skipped with the reason; set gaveUp=true only if a real blocker cannot be fixed.${LONG_CMDS}`, { label: 'review:fix', phase: 'Review', schema: FIXR })
    review.fixed = fx ? fx.summary : 'review fix agent failed'
    review.body = fx && fx.commitBody ? fx.commitBody : ''
    const gate = await fixUntilGreen('review', 'Review', `You are fixing the working tree after review fixes for wave ${A.wave}. Review fix summary:\n${review.fixed}`, false)
    if (gate.passed) {
      const subject = (fx && fx.commitSubject) || `Address the wave ${A.wave} review findings`
      const c = await commitStep(`review-${A.wave}`, `${subject}\n\n${clip([review.body, gate.body].filter(Boolean).join('\n\n') || review.fixed || '', 1500)}`, '', 'review:commit', 'Review')
      if (!c) return await finish({ aborted: 'review commit failed; review fixes are uncommitted in the tree', results, review })
      review.commit = c && c.output
    } else {
      await shell(`git checkout -- .\ngit clean -fd`, 'review:revert', 'Review')
      review.reverted = gate.failures.slice(0, 800)
    }
  }
}

// ---------------------------------------------------------------------------------------
phase('Verify')
const verify = await fixUntilGreen('verify', 'Verify', `You are fixing the branch so the full gate passes at the end of wave ${A.wave}. The wave's commits are \`git log --oneline ${A.base}..HEAD\`.`, true)
if (verify.passed) {
  const vsubject = verify.subject || `Fix the full verify gate for wave ${A.wave}`
  const vbody = verify.body || 'Changes needed for pnpm verify (coverage, CRAP, or production dead code) after the wave\'s items landed.'
  const vmsg = `${vsubject}\n\n${clip(vbody, 1500)}${A.trailers ? `\n\n${A.trailers}` : ''}`
  const c = await shell(`if [ -n "$(git status --porcelain)" ]; then\n${heredoc(`${S}/msg-verify-${A.wave}.txt`, vmsg)}\n${ICLOUD_GUARD}\ngit add -A\ngit commit -q -F "${S}/msg-verify-${A.wave}.txt"\nfi\ngit log -1 --format='%h %s'`, 'verify:commit', 'Verify')
  verify.commit = c && c.output
}

return await finish({
  wave: A.wave,
  counts: {
    implemented: results.filter(r => r.status === 'implemented').length,
    alreadyDone: results.filter(r => r.status === 'already-done').length,
    blocked: results.filter(r => r.status === 'blocked').length,
  },
  items: results.map(r => ({ id: r.id, status: r.status, fixRounds: r.fixRounds, note: (r.status === 'blocked' ? r.reason : r.deviations || '').slice(0, 300), commit: (r.commit || '').split('\n')[0].slice(0, 120) })),
  review,
  verify: { passed: verify.passed, failures: verify.passed ? '' : verify.failures.slice(0, 1500), commit: verify.commit },
})
