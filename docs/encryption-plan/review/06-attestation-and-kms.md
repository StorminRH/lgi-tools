# Part 06: Attestation, KMS sealing and the key-release rule

**Status:** Draft for owner review

## In one paragraph

This part ties sealed data to published code. One AWS KMS key per environment seals the service root key. The key's policy releases it only to an enclave whose image hash is on a published list. At boot the enclave proves its image to KMS and unseals the root key into memory. At each login the browser checks a fresh attestation document from the enclave before it sends anything, and then seals its requests to the public key that document vouches for. On a release, the old and new image hashes are both allowed for a short overlap, then the old one is removed. KMS deletion takes 30 days and can be cancelled. Any deletion request or policy change sends the owner an alert. The limits stay plain: AWS signs the attestation, and the AWS account owner can change the rule. Such a change shows only through the published fingerprints.

## How it works today

There is no attestation, no KMS and no AWS dependency. Server-side secrets are environment keys that operators can read:

- EVE tokens are sealed with AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY`.
- ESI snapshots are sealed the same way under `ESI_SNAPSHOT_ENCRYPTION_KEY`.
- Both are required variables, loaded once and cached in process memory.
- CI runs tests only. No workflow deploys anything, uses a GitHub environment or needs an approval. The app has no alert channel for operations.

Files: `src/platform/auth/token-crypto.ts`, `src/data/esi-snapshots/crypto.ts`, `src/lib/aes-gcm.ts`, `src/lib/env.ts`, `package.json`, `.github/workflows/test.yml`, `.github/workflows/coverage-health.yml`, `.github/workflows/cleanup-build-artifact.yml`.

## What changes

Nothing visible changes for users. Behind the scenes the project gains:

- two KMS keys, one for staging and one for production;
- a CloudTrail trail, EventBridge rules and an email alert topic;
- a protected GitHub release job that edits the key policy;
- a fingerprint file in the repo;
- attestation-checking code in the browser, which runs during the login that exists today.

The environment keys retire in Phase 5 (Part 31).

## Design

### Key chain (the upper end; Part 09 covers the rest)

| Layer | What it is | Where it lives |
| --- | --- | --- |
| KMS key | Symmetric key, one per environment, `alias/lgi-sealed-production` and `alias/lgi-sealed-staging` | Inside KMS; never exported |
| Service root key | 256-bit key made once by `GenerateDataKey` with an attestation | Its ciphertext blob is stored in Neon (`sealed_root_key`: environment, KMS key ARN, ciphertext, created at). The plaintext exists only in enclave memory |
| Everything below | User, map, corp and token keys | Wrapped under the service root key (Part 09) |

The enclave calls KMS once at boot, not once per key record. A restart therefore costs one KMS call, and KMS charges stay at cents per month.

### Key policy

| Statement | Principal | Actions | Condition |
| --- | --- | --- | --- |
| Use | Parent instance role | `Decrypt`, `GenerateDataKey` | `StringEqualsIgnoreCase` on `kms:RecipientAttestation:ImageSha384` against the list of allowed image hashes |
| Deny unattested use | `*` | `Decrypt`, `GenerateDataKey*`, `ReEncrypt*`, `DeriveSharedSecret` | `StringNotEqualsIgnoreCase` on the same key and list. A request that carries no attestation is caught too |
| Deny grants | `*` | `CreateGrant` | None. A grant could allow decryption without the image check |
| Policy edits | Release role (GitHub OIDC) | `GetKeyPolicy`, `PutKeyPolicy` | None |
| Break-glass admin | Account root, with MFA | Admin actions only (`Describe*`, `Enable`/`Disable`, `ScheduleKeyDeletion`, `CancelKeyDeletion`, `PutKeyPolicy`) | No use actions |

Rules for this policy:

- It omits AWS's default statement that delegates the key to IAM policies. IAM alone can therefore never grant use of the key.
- The parent role holds AWS credentials and passes them into the enclave over vsock. That role cannot decrypt anything without an attestation document signed by the Nitro hardware.
- KMS answers with `CiphertextForRecipient`, encrypted to a key that exists only inside the enclave. The parent never sees the root key.

### Which measurement

The policy names the image hash, which is PCR0. It covers the kernel, boot ramdisk and application, so it pins exactly one build. PCR1 and PCR2 add nothing that PCR0 lacks. PCR3 repeats the principal check. PCR4, the instance ID, would break when an instance is replaced. A rule based only on the signing certificate (PCR8) is rejected: whoever holds that signing key could build any image and unseal with it, and no fingerprint would change. Debug-mode enclaves report all-zero PCRs. No list may contain zeros, and browsers reject them.

### Boot and unseal

1. The enclave starts and generates a fresh RSA key pair for KMS and a fresh request key pair in memory.
2. It asks the Nitro Security Module for an attestation document that includes the RSA public key.
3. It calls `Decrypt` on the stored root-key blob with that document as the recipient.
4. KMS checks the image hash against the policy and returns the root key, encrypted to the enclave's RSA key.
5. The enclave decrypts it, discards the RSA pair, and only then takes the leader lease (Part 05).

If any step fails, the enclave serves nothing. It writes the failure as a code to its heartbeat row and retries with backoff.

### What the attestation document carries

| Field | Contents |
| --- | --- |
| `pcrs` | The image hash checked by browsers |
| `public_key` | The per-boot request key. Browsers seal requests to it (algorithm in Part 09; P-256 ECDH works in every current browser) |
| `user_data` | SHA-256 of {environment profile, identity-assertion public key (Part 08), service version} |
| `nonce` | The browser's 32 random bytes, echoed back |

### Browser verification at each login

The login runs in the crypto worker (Part 26). The browser sends a nonce in a plain attest request through Convex (Part 07) and checks the reply:

1. Decode the CBOR and COSE_Sign1 structure and verify the ECDSA P-384 signature with WebCrypto.
2. Check that the certificate chain leads to the bundled AWS Nitro root certificate, pinned by its SHA-256 fingerprint. Check validity at the document's timestamp.
3. Check that the nonce matches. The nonce proves freshness, so a user with a wrong clock is never locked out.
4. Check that PCR0 is on the fingerprint list built into the app, and that it is not all zeros.
5. Check that `user_data` matches this environment's profile.
6. Only then send the PKCE verifier (Part 08), sealed to `public_key`.

If the enclave restarts, its request key changes. The next reply names a key the browser does not know, and the browser repeats steps 1 to 5 without telling the user. Any failure shows today's sign-in error. Production builds accept only the AWS root certificate. Only the dev sealed service has its own stand-in, which release builds refuse (Part 25).

### Rolling the rule forward

| Step | Action |
| --- | --- |
| 1 | CI builds the image reproducibly and records PCR0 with build provenance (Part 27) |
| 2 | A PR adds the hash to `sealed-service/fingerprints.json`. The app deploys with the old and new hashes both allowed |
| 3 | The release job adds the new hash to the key policy |
| 4 | The new enclave boots, unseals and takes the lease. The old one stops |
| 5 | After a 24-hour overlap with no rollback, a PR and the release job remove the old hash from both lists |

The app deploy always comes before the policy change, so browsers never reject a running enclave. Rolling back during the overlap means restarting the old image. Rolling back later is a normal release.

### Staging and production

There is one image for both environments. The image contains both environment profiles: KMS key ARN, Convex deployment, Neon host and identity-assertion key. The parent chooses only the profile name. A parent that picks the wrong profile gets the other environment's key and stores, not the production data. Staging's key policy may also list candidate images not yet promoted. Production lists only images built from `main`. The two environments use separate instance roles and separate release roles.

### Who may change the policy

`.github/workflows/sealed-release.yml` runs in the GitHub environments `sealed-staging` and `sealed-production`. Production requires the owner's approval. The job assumes a release role through OIDC, and the role's trust is limited to this repo, the `main` branch and that environment. The job renders the policy from `sealed-service/kms/key-policy.template.json`. It refuses if any hash in the result lacks CI provenance on `main`. A daily scheduled job compares the live policy with `fingerprints.json`, and the running fingerprint in Convex with the list. It alerts on any mismatch.

### Deletion and alerts

Deletion uses a 30-day waiting period, the maximum. Only the root account can schedule it. While deletion is pending KMS refuses use, so the running enclave keeps working but the next boot fails (incident playbook in Part 29). EventBridge rules on the CloudTrail management trail send to an SNS email topic for these events:

- `ScheduleKeyDeletion`, `CancelKeyDeletion`, `DisableKey`, `EnableKey`, `PutKeyPolicy`, `CreateGrant`;
- `AccessDenied` on either key;
- IAM changes to the parent and release roles;
- root sign-in.

All of this fits the free tiers.

### The honest caveat

- AWS signs the attestation, so trusting the enclave means trusting AWS.
- The AWS account owner can rewrite the key policy, for example to allow an unpublished image. That cannot be prevented. It is detectable: the alert fires, the drift check fails, and an image not on the published list fails every browser check.
- Whoever serves lgi.tools also serves the fingerprint list, so a malicious deploy could change both. That is visible in the public repo, not prevented (Part 27).

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| KMS key material | No (never leaves KMS) | n/a | AWS KMS |
| Service root key | No | Ciphertext blob in Neon; plaintext in enclave memory only | Sealed service |
| Per-boot RSA and request private keys | No | Memory only | Sealed service |
| Request public key, attestation documents | Yes | No | Sealed service makes them; browser verifies |
| Published fingerprint list | Yes (public repo and app bundle) | No | CI |
| Key policy | Yes (to the AWS account) | No | Release job |
| Running fingerprint, unseal status codes | Yes (Convex heartbeat) | No | Sealed service |
| CloudTrail records and alerts | Yes (AWS account, owner email) | No | AWS |

## Hard rules

1. [Agreed] Users' keys are sealed through AWS KMS, bound to the enclave's code fingerprint. Browsers verify the attestation before sending anything.
2. [Agreed] Enclave builds are reproducible and fingerprints are published.
3. [Agreed] The KMS key has a deletion waiting period, and an alert fires if deletion is scheduled. There is no second-region copy and no extra backup.
4. [Agreed] The caveat about AWS signing and the AWS account owner is stated in internal and public docs, never in the app.
5. [Proposed] The key policy names only image hashes (PCR0). It never relies on PCR8 alone and never lists all-zero values.
6. [Proposed] The key policy omits IAM delegation, denies unattested use and denies grants.
7. [Proposed] Policy changes come only from `sealed-release.yml`. Production changes need the owner's approval. Every listed hash has CI provenance on `main`.
8. [Proposed] The app deploy that allows a hash ships before the policy change. The old hash is removed after a 24-hour overlap.
9. [Proposed] Staging and production have separate KMS keys and roles. The image is shared, and both profiles are baked into it.
10. [Proposed] The service root key is unsealed once per boot, is never written anywhere in plaintext, and never leaves the enclave.
11. [Proposed] Browsers verify at every login and after every request-key change. Freshness comes from the nonce, not the clock.
12. [Proposed] Production browser builds accept only the AWS Nitro root certificate.
13. [Proposed] Deletion window 30 days. Alerts cover the events listed above. A daily drift check runs.

## Assumptions

| Assumption | How to check |
| --- | --- |
| The KMS conditions behave as described: an unattested or debug-mode `Decrypt` is denied | Staging test from the parent, from a debug enclave and from a correct enclave |
| WebCrypto plus a small CBOR and X.509 parser verifies the chain in Chrome, Firefox and Safari within the login budget | Spike with recorded AWS documents (Part 32) |
| A nonce round trip through Convex adds well under a second to login | Measure on staging |
| One free CloudTrail trail feeds EventBridge for these events | Trigger each event on staging and confirm the email |
| GitHub OIDC trust can pin repo, branch and environment | Try to assume the role from a non-`main` run |
| The AWS Nitro root certificate stays valid (30-year lifetime) | Check the pinned fingerprint against AWS's published value when bundling |

## What users see

Nothing new. Attestation runs inside today's login. Failures and enclave restarts show today's sign-in error or nothing at all.

## Questions for the owner

1. **Which measurement does the policy name?** *Recommended:* the image hash only. Reject rules based only on the signing certificate.
2. **Who may change the policy?** *Recommended:* the protected release job with your approval for production. Root with MFA is kept only as break-glass.
3. **Where are fingerprints published?** *Recommended:* `sealed-service/fingerprints.json` on `main`, release notes and GitHub build provenance. The app bundle is built from that file.
4. **Alert channel?** *Recommended:* SNS email to you. A Discord forward can come later (Part 29).
5. **Deletion window?** *Recommended:* 30 days.
6. **How long do old and new fingerprints overlap?** *Recommended:* 24 hours.
7. **One image across staging and production, or one per environment?** *Recommended:* one image with both profiles baked in, so the bits tested on staging are the bits released.
