# Part 10: Optional passkeys and recovery keys

**Status:** Draft for owner review

## In one paragraph

A user can add a passkey, a recovery key, or both, as an optional backup of their user key. Nothing prompts for them. They matter only if the sealed service is down, the AWS account is lost, or the sealed key records are destroyed. A backup never replaces the EVE login: the browser unwraps the user key itself, only after an EVE login created the session (decision 5), and the user key then opens the user's map key wraps. This part sets the backup format, enrolment and removal, where the option appears at login, and what an outage unlock can do.

## How it works today

- No passkeys, WebAuthn or recovery keys exist. Better Auth runs only the `genericOAuth` (EVE) and `jwt` plugins. `package.json` has no passkey or WebAuthn library.
- There is no login page. Every "Log in with EVE" button (header, home hero, industry empty states) calls `authClient.signIn.oauth2` and goes straight to CCP.
- Login errors come back as `?auth_error=` and show as a callout on the home page (`state_mismatch`, `token_exchange_failed`, `db_write_failed`, `admin_required`).
- Settings → Account holds an Overview card and the Danger zone (purge, log out everywhere, delete account). Sessions last 7 days.
- `Permissions-Policy` does not restrict `publickey-credentials-*`, so WebAuthn already works on lgi.tools.

Files: `src/platform/auth/auth.ts`, `src/components/composition/account/LoginButton.tsx`, `src/components/composition/HomeHero.tsx`, `src/app/(site)/page.tsx`, `src/app/(site)/settings/settings-sections.ts`, `src/app/(site)/settings/account/page.tsx`, `src/components/composition/account/AccountDangerZone.tsx`, `next.config.ts`.

## What changes

For users who never use the feature, nothing visible changes. The new items are a "Backups" card on the Account settings page and an unlock panel that appears only during a sealed-service outage. Both are justified under What users see.

## Design

### Backup shape

Each backup is a separate wrap of the user key, so backups never depend on each other.

1. The browser makes a P-256 ECDH **backup key pair**.
2. It wraps the private half under a key derived from the passkey's PRF output or from the recovery key, then discards the plaintext.
3. It sends only the public half to the sealed service in a sealed request (Part 07).
4. The sealed service HPKE-seals the user key to that public key and writes the row.

The backup secret never leaves the browser; the sealed service sees only a public key, so it could re-seal to every backup if the user key ever changed. As everywhere, code served by lgi.tools could still leak the secret when the user types or taps it (Part 26).

| Item | Passkey backup | Recovery-key backup |
|---|---|---|
| Secret | WebAuthn PRF output on one fixed input, `lgi.tools/backup/v1` | 256 random bits made in the browser |
| Wrapping key | `HKDF(PRF output, info = ['lgi/backup/v1/prf', userId, credentialId])` | `HKDF(recovery key, info = ['lgi/backup/v1/rk', userId])` |
| How many | Up to 10 per account | One; making a new one replaces it |
| Readable fields | `credential_id`, created and last-used dates | Created and last-used dates |
| Format shown | Passkey manager's own name | `LGI1-` then Crockford base32 in groups of four, with a two-character checksum; copy and download as text |

### Storage: Neon `user_key_backups`

| Column | Class | Notes |
|---|---|---|
| `id`, `user_id`, `kind` (`passkey` or `recovery`), `credential_id`, `public_key`, `created_at`, `last_used_at` | Readable | No AAGUID or device name |
| `wrapped_private` | Sealed under the wrapping key | Seal v2 (Part 09), AAD = table, `user_id`, `id`, `kind` |
| `sealed_user_key` | HPKE to `public_key` | `info` binds `user_id`, `id` and the user key's `keyId` |

Only the sealed service writes rows. Vercel serves a user's own rows to their session.

### Enrolment and removal (Account settings, sealed service reachable)

| Step | Passkey | Recovery key |
|---|---|---|
| 1 | Feature check: `PublicKeyCredential` present and, where the browser answers, `getClientCapabilities()` reports PRF. Otherwise the passkey row is not shown | Always available |
| 2 | `create()` with `rp.id = lgi.tools`, `userVerification: 'required'`, `residentKey: 'preferred'`, `excludeCredentials` set to existing backups, PRF requested | Browser makes the key and shows it once with Copy and Download |
| 3 | If PRF output did not come back from `create()`, call `get()` for the same credential (a second tap on some platforms) | User clicks "I've saved it"; no type-back test |
| 4 | Make the backup pair, wrap, send the public half; the sealed service seals and stores | Same |
| 5 | Test unwrap: fetch the row, unwrap, and confirm the user key's `keyId` matches. Only then mark it active | Same |
| Failure | Delete any row written, call `signalUnknownCredential` where supported, and show one line: "This passkey can't be used as a backup. Try another, or use a recovery key." | Show today's generic error |

**Removal.** No re-wrapping is needed, because each backup wraps the user key on its own. Removal deletes the row, then calls `signalUnknownCredential` where supported. It never calls it before the row is gone. Removing the last backup needs no extra confirmation beyond today's `ConfirmDialog`.

Passkeys here are backups only. They never sign anyone in, and no server verifies a WebAuthn assertion; the PRF output is all that matters. The page calls `navigator.credentials` directly, with no new library.

### Where the option appears at login

Normal login is unchanged. The sealed service returns the keys, so there is nothing to choose and no option is shown.

The unlock panel appears only when all of these hold:

- the sealed service is unreachable;
- the browser holds a valid LGI session but no keys;
- the account has at least one active backup.

It replaces today's login button or error callout with one sentence and two buttons: "We couldn't load your data right now. Unlock with a passkey or recovery key instead." It offers only the kinds the account has. Accounts without backups see today's error, exactly as Part 08 describes.

### Outage unlock (decision 5 holds)

The EVE gate comes first in both cases:

- **Short outage:** a valid session from an earlier EVE login.
- **Permanent loss:** a fresh EVE login through the owner's break-glass identity-only release (Part 08).

Vercel serves the backup rows only to that session. The browser then:

1. derives the wrapping key from the PRF output or the typed recovery key;
2. unwraps the backup private key as non-extractable;
3. opens `sealed_user_key` and imports the user key as Part 09 does at login.

Map keys come from the user's own `mapKeyWraps` rows in Convex.

| During an outage unlock | Can | Cannot |
|---|---|---|
| Maps | Read maps whose current epoch was already wrapped to this user | Edit (map logic is in the workers, Part 15); open a map never opened before; get new epochs |
| Location tracking | n/a | Track; polling is in the workers (Part 17) |
| Personal data | Read precomputed views and documents (Part 19); save user-authored documents only if Part 20 keeps browser sealing | Sync from ESI |
| Corp data | n/a | Anything: corp keys never leave the enclave |
| Account | Sign out | Link characters, change backups, token-bearing lookups |

When the sealed service returns, the browser registers its browser session key with a request signed by an HMAC key derived from the user key, which the sealed service can check. The user does nothing.

### Restoring after permanent loss

Once a new sealed service runs under a new service root key (Part 06), a returning user with a backup unlocks as above. The browser opens the user key and the map key epochs it can reach as bytes this once and sends them to the new enclave in one sealed request, which creates fresh key records. The first member with a backup restores each map. Corp and token keys are gone: corp data re-pulls from ESI and everyone logs in with EVE again. Users without backups lose only personal data (decision 9).

### Dropped from the older design

The mandatory recovery secret (OD-17), recovery delay, veto and account proofs (04 §5.5, §5.7), the passphrase unlocker, the two-unlocker rule, passkey-as-login, the recovery bundle, recovery signing keys and weak-provider warnings. DR-C7's observed-PRF rule and §5.10's signal ordering carry over.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| That an account has backups, their kinds, count, credential IDs and dates | Yes | No | LGI server |
| Backup public key | Yes | No | Browser makes it |
| Wrapped backup private key | No | Yes (PRF or recovery-key wrap) | Browser |
| Sealed user key copy | No | Yes (HPKE to the backup key) | Sealed service seals; browser opens |
| PRF output, recovery key | Never stored | n/a | Browser only |
| Outage unlock state | No | n/a | Browser memory |

## Hard rules

1. [Agreed] Passkeys and recovery keys are optional. Nothing prompts, nudges, reminds or alerts anyone about them (decisions 1, 9).
2. [Agreed] Every unlock follows an EVE login and works at once, with no delay or veto (decision 5).
3. [Proposed] A backup is never a sign-in method. Vercel serves backup rows only to a session made by an EVE login for that account.
4. [Proposed] The PRF output, the recovery key and wrapping keys exist only in the browser. They are never sent, logged or stored in plaintext. The sealed service receives only backup public keys.
5. [Proposed] A backup becomes active only after a test unwrap succeeds on the enrolling device.
6. [Proposed] Each backup wraps the user key on its own. Removal deletes one row and never needs a re-wrap. `signalUnknownCredential` runs only after the row is deleted.
7. [Proposed] If PRF is unavailable, the passkey option is simply absent, with no warning. The only failure message is the single line shown after a failed enrolment.
8. [Proposed] The unlock panel shows only under the three conditions in the Design. No other login surface mentions backups.
9. [Proposed] An outage unlock is read-only except where a part explicitly allows browser-side writes. It never writes sealed rows that only the sealed service may write.
10. [Proposed] No new WebAuthn or passkey dependency. Better Auth's passkey plugin is not used.
11. [Proposed] Account deletion deletes `user_key_backups` rows; merge handling is Part 11.

## Assumptions

| Assumption | How to check |
|---|---|
| Users' passkey managers return PRF reliably (iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Bitwarden, security keys) | Owner enrols and unlocks on their own iPhone, Mac, Windows PC and Android, plus one security key, using a staging build. Playwright's virtual authenticator with PRF in CI |
| PRF output is the same whether the passkey is used on the device or across devices (Apple forum reports say not always) | Enrol on one device, unlock by phone-to-desktop hybrid; the test unwrap catches failures at enrolment only, so also re-test unlock |
| `getClientCapabilities()` is reliable enough to hide the option, with the test unwrap as the real gate | Compare its answer with real outcomes on the owner's devices |
| HPKE opens with a non-extractable P-256 key in every engine | Part 09's cross-engine vectors |

## What users see

Nothing new unless they look for it or an outage hits.

- **Backups card** on Settings → Account, below Overview: "Passkeys" with Add and Remove, and "Recovery key" with Create or Replace. It is a plain list with no explanation banner. It is justified because decisions 1 and 9 make backups available, and settings is the quietest place for them.
- **Unlock panel** during a sealed-service outage, only for accounts with backups. It is justified because without it a backup could never be used.
- **One failure line** after a passkey that cannot do PRF.

## Questions for the owner

1. **Where does the option show at login?** Recommended: nowhere in normal use, and plainly only during an outage. Alternative: a small "Unlock with a passkey" link on the callback loading screen. It adds a visible element and saves nothing, because the sealed service already returns keys.
2. **Recovery-key length?** Recommended: 256 bits, `LGI1-` plus 52 base32 characters and a checksum, copied or downloaded rather than typed. Alternative: 128 bits (26 characters), which is still beyond offline guessing and easier to type.
3. **What can an outage unlock do?** Recommended: read maps and personal data, and save user-authored documents only if Part 20 keeps browser sealing. Map edits, tracking, syncs and corp data wait for the sealed service.
4. **Restore after permanent loss: built now or written as a runbook?** Recommended: write and test the restore request in Phase 1 with the dev sealed service. Backups are worth little if restoring is untested.
