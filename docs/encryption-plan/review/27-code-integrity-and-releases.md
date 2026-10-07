# Part 27: Code integrity: reproducible enclave builds, fingerprints and releases

**Status:** Draft for owner review

## In one paragraph

This part makes decision 1's code promise real. CI builds the enclave image on GitHub's arm64 runners from the public repo, with every input pinned, so anyone can rebuild it and get the same fingerprint (PCR0). Each fingerprint goes into `sealed-service/fingerprints.json` with GitHub build provenance. The app bundles that file, and browsers accept only listed fingerprints. Enclave changes travel only through development → staging → main: staging key first, then Part 06's production key-policy rollover. Release jobs rebuild, require a matching PCR0 and attest what they deploy. An optional public check confirms the answering enclave runs a listed image. The limit stays plain: whoever serves lgi.tools could ship browser code that leaks keys after login. That can be detected, not prevented without new UI.

## How it works today

- There is no enclave, image, fingerprint or build provenance.
- `Verify` (manual) runs typecheck, lint, static Fallow, `pnpm build` and e2e smoke. `Coverage health` runs on pull request pushes.
- Actions are pinned by major tag. No workflow uses GitHub environments, OIDC or AWS. pnpm is pinned, installs use `--frozen-lockfile`, and `minimumReleaseAge` holds new versions back 7 days.
- Vercel deploys only `main` and `staging`. `vercel-build` runs `convex deploy --cmd 'pnpm build:vercel'`. Staging builds are previews, detected by `isStagingPreviewBuild()`.
- The promote skill commits each review round's fixes straight onto the head branch: `development` for a promote, `staging` for a release (463a4750, d3046805). It waits for green Verify and Coverage health, then stops without merging.
- Promotes and releases are GitHub merge commits (b520a549), so nothing but Vercel builds on a `staging` or `main` ref.
- Hotfix pull requests sometimes merge straight into `main` (#634, d3503a08).
- Nothing compares the code served on lgi.tools with the public repo.

Files: `.github/workflows/test.yml`, `.github/workflows/coverage-health.yml`, `.github/actions/setup-node-pnpm/action.yml`, `.claude/skills/promote/SKILL.md`, `.claude/skills/release/SKILL.md`, `src/scripts/vercel-convex-deploy.ts`, `pnpm-workspace.yaml`, `package.json`, `vercel.json`.

## What changes

Nothing visible changes for users. The project gains `sealed-image.yml`, Part 06's `sealed-release.yml`, a fingerprint file and its scripts, provenance, one required check and an optional public check.

## Design

### Reproducible build

| Input | How it is pinned |
| --- | --- |
| Source | The commit, built only in CI |
| JavaScript bundle | esbuild from the frozen lockfile (Part 05), no install scripts |
| Node runtime | Official arm64 tarball, SHA-256 checked |
| Base image | By digest; no package installs |
| BuildKit | `docker/setup-buildx-action` pinned by SHA, with `driver-opts: image=moby/buildkit@sha256:…` (0.13 or later), never the runner's own |
| Docker layers | `SOURCE_DATE_EPOCH` from the commit, `rewrite-timestamp=true`, sorted files, fixed owners |
| NSM/KMS helper (Part 05) | Built from a pinned commit in the pinned builder image, or a checked-in binary with SHA-256 |
| CA bundle (Part 05) | A checked-in repo file |
| EIF | Pinned `nitro-cli build-enclave` in a pinned builder image |
| Runner | `ubuntu-24.04-arm`, matching the `c7g` instance (Part 25) |
| Workflow actions | Full commit SHA |

`fingerprints.json` and the browser lists are never image inputs. The image holds no secrets.

**Narrow import surface.** The build writes esbuild's reached files to `sealed-service/bundle-inputs.txt`; a test fails if it is stale. The trigger paths are that list plus the Dockerfile, pins, helper and CA bundle. App-only changes leave PCR0 unchanged, so most releases are not enclave releases.

**PCR0 is the identity.** `nitro-cli` writes build-time metadata the PCRs do not cover, so EIF file hashes differ between builds with the same PCR0. Only PCR0 is compared across builds. Each release job records the SHA-256 of the exact EIF it deploys.

### `sealed-image.yml`

| Trigger | What it does |
| --- | --- |
| Pull request touching the trigger paths | Builds; writes PCR0, PCR1 and PCR2 to the summary |
| Every pull request into `staging` or `main` | Builds; fails unless PCR0 is listed for that environment. Covers promotes, releases, review-round commits and hotfixes |
| Push to `development` | Builds; attests the EIF and `measurements.json` with `actions/attest-build-provenance` |
| Weekly | Rebuilds the production commit; fails if PCR0 differs |

### Published fingerprints

`sealed-service/fingerprints.json` on `main` holds one entry per image: `pcr0`, `pcr1`, `pcr2`, commit, build run URL, and a state per environment (Part 06's `current` or `previous`, or `retired`) with dates. Sigstore attestations cover the development build and each release job's EIF; anyone can run `gh attestation verify`. There is no GitHub release per image: outsiders rebuild from the commit, and deployed EIFs sit in S3 by hash (Part 25).

`pnpm fingerprints:add <run-id>` verifies the run's attestation, accepts only a push to `development`, and writes the entry; `pnpm fingerprints:retire <pcr0>` retires one. An agent commits the output through the normal `pnpm check` flow. Nothing is bot-committed, so all checks run as usual.

The browser lists (the bundle and `/sealed/fingerprints.json`, Part 26) are generated inside `build:vercel` and `pnpm build`, so Verify exercises the step. Production gets the production list only when `VERCEL_ENV=production` on `main`; staging gets the staging list only when `isStagingPreviewBuild()` is true. Any other Vercel build fails. Builds off Vercel get only the dev sealed service entry, which release builds refuse (Part 25).

### Release flow

| Step | Branch | Action |
| --- | --- | --- |
| 1 | `development` | The enclave change merges after `pnpm check`, `pnpm verify` and review. CI builds and attests |
| 2 | `development` | An agent lands `pnpm fingerprints:add`: new image `current` for both environments, old one `previous`. Early production listing is harmless; the production policy does not allow it yet |
| 3 | `staging` | The promote merges with `sealed-image.yml` green. Vercel deploys the new list |
| 4 | `staging` | `sealed-release.yml` (`sealed-staging`) rebuilds, requires identical PCR0 and the development provenance, attests its EIF on `staging`, uploads it by hash, updates the staging policy and runs Part 25's instance refresh |
| 5 | `main` | The release merges. Vercel deploys production |
| 6 | `main` | `sealed-release.yml` (`sealed-production`, owner approval) does the same on `main` and rolls the policy forward (Part 06) |
| 7 | any | `previous` drops at the next release (Part 06). For a security flaw, an owner-approved `retire` run removes the hash from the policy at once, with no app deploy. `pnpm fingerprints:retire` then follows through the normal flow |

Part 06 already pins each release role, through OIDC, to its branch and environment, and requires provenance from the deploying branch; the job's own attestation meets that.

**Paths outside the flow.** A review-round commit or hotfix that changes PCR0 fails `sealed-image.yml`, because it has no entry. The release stops and the fix goes back through `development`. App-only hotfixes are unaffected. An emergency enclave fix takes hotfix branch → `development` → entry → `staging` → `main` the same day.

**Restarts.** Planned releases use Part 25's instance refresh: the new enclave takes the lease before the old stops. Staging must show no tracking gap beyond one poll, queued edits resubmitted and no error toast. Releases start in Part 25's downtime window (11:02 to 11:12 UTC), confirmed against the app's hourly activity telemetry.

### Optional public check

`pnpm check:attestation [origin]` reuses the browser verifier (Part 26). It sends the pre-login attest request (Part 07) with a fresh nonce, verifies the chain to the AWS Nitro root and checks PCR0 against `fingerprints.json` on `main`. It also fetches `/sealed/fingerprints.json` and the deployed crypto-worker script, extracts the embedded list, and compares both with the file. A scheduled workflow runs it every six hours and opens an issue on a mismatch. It needs no LGI credentials.

It proves only that the answering enclave runs a listed image and the served lists match. It cannot see the KMS key policy: if the AWS account owner allowed an unpublished image and ran it alongside, it would stay green. Only the account holder sees policy changes (CloudTrail alerts, Part 06's drift check). Nor can it show whether one user got different JavaScript.

### The served-code caveat

The browser trusts the code lgi.tools serves, including the fingerprint list. A bad deploy could add an unpublished fingerprint or leak keys after login. Git-only production deploys, the public history and the public check only detect this; the CSP (Part 26) blocks injected script, not code LGI ships. Prevention needs something outside the served code that warns users (WEBCAT, a service-worker pin): new UI, so dropped.

### Dropped from older docs

WEBCAT, Sigsum, the service-worker pin, the self-host bundle and Tauri, hardware-key signing, the watch monitor, vendored dependencies and the isolated static origin (01 "Code integrity" and "Release process"; 04 D-INT-1, D-INT-5, D-INT-6). Owner approval on the protected GitHub environment replaces the hardware-key signature.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| Enclave source, pins, `bundle-inputs.txt` | Yes (public repo) | No | n/a |
| EIF image | Yes (S3 by hash) | No; no secrets | LGI server (CI) |
| PCR values, `fingerprints.json`, provenance | Yes (public) | No | LGI server (CI) |
| Browser fingerprint lists | Yes (bundle, `/sealed/fingerprints.json`) | No | LGI server (build) |
| Release approvals and job logs | Yes (GitHub) | No | LGI server (CI) |
| Running fingerprint | Yes (Convex heartbeat, Part 05) | No | Sealed service |
| Public check results | Yes (job summary, issues) | No | LGI server (CI) |

## Hard rules

1. [Agreed] Enclave builds are reproducible, fingerprints are published, and browsers verify the attestation before sending anything.
2. [Agreed] Users see nothing new: no in-app release, fingerprint or encryption messaging.
3. [Agreed] Enclave changes ship through the normal development → staging → main flow (decision 2).
4. [Proposed] Same repo; `pnpm check` and `pnpm verify` at zero Fallow findings, covering new scripts. Fixed by AGENTS.md and the brief, not a README decision.
5. [Agreed] The AWS-signs and account-owner caveats are stated in docs, never in the app.
6. [Proposed] The served-code caveat is stated the same way.
7. [Proposed] Release images are built only in GitHub-hosted CI.
8. [Proposed] Every image input is pinned by digest, checksum, version or commit SHA, including BuildKit, the helper and the CA bundle.
9. [Proposed] The image holds no secrets; `fingerprints.json` and the browser lists are never inputs.
10. [Proposed] `fingerprints.json` changes only through the two scripts, committed by an agent through the normal flow. No bot-generated pull requests or commits.
11. [Proposed] Every pull request into `staging` or `main` needs a green `sealed-image.yml` showing its PCR0 listed. The promote skill waits for it.
12. [Proposed] A review-round or hotfix commit that changes PCR0 stops the release; the fix goes back through `development`.
13. [Proposed] `sealed-release.yml` refuses unless its rebuild matches the listed PCR0, then attests and deploys its own EIF by that file's SHA-256. Production needs the owner's approval.
14. [Proposed] PCR0 is the only identity compared across builds. Each production image has at least three matching builds.
15. [Proposed] The deploy that lists a hash ships before the policy allows it. Retirement removes the hash from the policy, then the list; a security flaw triggers an immediate retire run.
16. [Proposed] `bundle-inputs.txt` lists every file the bundle reaches; a test fails if it is stale.
17. [Proposed] The browser list generator fails closed on any Vercel build that is not production on `main` or a staging preview.
18. [Proposed] A weekly rebuild fails on any PCR0 drift; the public check runs every six hours and opens an issue on a mismatch.
19. [Proposed] Planned enclave releases show no visible gap on staging before production.
20. [Proposed] Production deploys only through Git integration from `main`.
21. [Proposed] The dropped items stay out unless the owner brings them back.

## Assumptions

| Assumption | How to check |
| --- | --- |
| Same Docker image gives the same PCR0; EIF file hashes differ | Build twice on separate runners and days; compare PCRs and file hashes |
| Pinned BuildKit with `rewrite-timestamp` gives identical layers | Compare image digests; else try Nix (`aws-nitro-util`) |
| `nitro-cli` builds on a plain arm64 runner | Spike on `ubuntu-24.04-arm` |
| arm64 runners and Sigstore provenance are free for this repo | First run |
| Most promotes leave PCR0 unchanged | Check recent promotes against `bundle-inputs.txt` |
| The attest request works before login | Part 07; staging |
| Activity is low in the downtime window | Hourly app telemetry |
| Vercel can block manual production deploys | Settings; else the drift check compares deployment SHAs with `main` |

## What users see

Nothing new. Releases, fingerprints and checks happen in CI and AWS. Planned enclave releases overlap two instances, so nothing pauses (Part 25).

## Questions for the owner

1. **Which tooling builds the image?** *Recommended:* pinned BuildKit plus pinned `nitro-cli`, closest to AWS's documentation. Fall back to Nix if two builds disagree and a day cannot fix it.
2. **Publication format?** *Recommended:* `fingerprints.json` on `main` plus Sigstore provenance; no per-image GitHub release.
3. **Should the public check exist?** *Recommended:* yes, every six hours, opening an issue on a mismatch. It reuses the browser verifier.
4. **How often do enclave releases ship?** *Recommended:* only when PCR0 changes, with the normal release, in Part 25's downtime window. Emergency fixes go the same day through `development`.
5. **Bring back any dropped item?** *Recommended:* no. GitHub environment approval with two-factor login stands in for hardware-key signing.
