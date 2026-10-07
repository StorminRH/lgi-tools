# Part 10: Optional passkeys and recovery keys

**Status:** Draft for owner review

## In one paragraph

A user can add a passkey, a recovery key, or both, as an optional backup of their user key. Nothing prompts for them. They matter only if the sealed service is down, the AWS account is lost, or the sealed key records are destroyed. A backup never replaces the EVE login: the browser unwraps the user key itself, only after an EVE login created the session (decision 5), and the user key then opens the user's map key wraps. This part sets the backup format, enrolment and removal, when the unlock panel appears, what an outage unlock can do, and how backups restore keys after permanent loss.

## How it works today

- No passkeys, WebAuthn or recovery keys exist. Better Auth runs only the `genericOAuth` (EVE) and `jwt` plugins. `package.json` has no passkey or WebAuthn library.
- Auth takes its origin from `BETTER_AUTH_URL` (`baseURL` and the JWT issuer), so staging and local dev run on their own hosts.
- There is no login page. Every "Log in with EVE" button (header, home hero, industry empty states) calls `authClient.signIn.oauth2` and goes straight to CCP.
- Login errors come back as `?auth_error=` and show as a callout on the home page (`state_mismatch`, `token_exchange_failed`, `db_write_failed`, `admin_required`).
- Settings → Account holds an Overview card and the Danger zone (purge, log out everywhere, delete account). Sessions last 7 days.
- `Permissions-Policy` does not restrict `publickey-credentials-*`, so WebAuthn already works.

Files: `src/platform/auth/auth.ts`, `src/components/composition/account/LoginButton.tsx`, `src/components/composition/HomeHero.tsx`, `src/app/(site)/page.tsx`, `src/app/(site)/settings/settings-sections.ts`, `src/app/(site)/settings/account/page.tsx`, `src/components/composition/account/AccountDangerZone.tsx`, `next.config.ts`.

## What changes

For users who never use the feature, nothing visible changes. The new items are a "Backups" card on the Account settings page and an unlock panel that appears only during a sealed-service outage or a restore. Both are justified under What users see.

## Design

### Backup shape

Each backup is a separate wrap of the user key, so backups never depend on each other.

1. The browser makes a P-256 ECDH **backup key pair**.
2. It wraps the private half under a key derived from the passkey's PRF output or from the recovery key, then discards the plaintext.
3. It sends only the public half to the sealed service in a sealed request (Part 07).
4. The sealed service HPKE-seals the user key to that public key and writes the row.

The backup secret never leaves the browser. As everywhere, code served by lgi.tools could still leak it when the user types or taps it (Part 26).

| Item | Passkey backup | Recovery-key backup |
|---|---|---|
| Secret | WebAuthn PRF output on one fixed input, `lgi.tools/backup/v1` | 256 random bits made in the browser |
| Wrapping key | `HKDF(PRF output, info = ['lgi/backup/v1/prf', userId, credentialId])` | `HKDF(recovery key, info = ['lgi/backup/v1/rk', userId])` |
| How many | Up to 3 per account | One; making a new one replaces it |
| Readable fields | `credential_id`, created date | Created date |
| Format shown | Passkey manager's own name | Crockford base32 in groups of four with a two-character checksum, no prefix; copy and download as text |

**Per environment.** `rp.id` is the host of `BETTER_AUTH_URL` for each environment (lgi.tools in production, the staging host, `localhost` in dev). Backups are per environment: a staging backup never unlocks production, because the PRF output differs per RP ID and the HKDF info includes `userId`.

### Storage: Neon `user_key_backups`

| Column | Class | Notes |
|---|---|---|
| `id`, `user_id`, `kind` (`passkey` or `recovery`), `credential_id`, `public_key`, `created_at` | Readable | No AAGUID, device name or last-used date |
| `wrapped_private` | Sealed under the wrapping key | Seal v2 (Part 09), AAD = table, `user_id`, `id`, `kind` |
| `sealed_user_key` | HPKE to `public_key` | `info` binds `user_id`, `id` and the user key's `keyId` |

Only the sealed service writes rows. Vercel serves a user's own rows to their session.

### Enrolment and removal (Account settings, sealed service reachable)

| Step | Passkey | Recovery key |
|---|---|---|
| 1 | Show the passkey row only if `PublicKeyCredential` exists and, where the browser answers, `getClientCapabilities()` reports PRF. This only hides the row; the test unwrap is the gate | Always available |
| 2 | `create()` with `rp.id` as above, `userVerification: 'required'`, `residentKey: 'preferred'`, `excludeCredentials` set to existing backups, PRF requested | Browser makes the key and shows it once with Copy and Download |
| 3 | If PRF output did not come back from `create()`, call `get()` for the same credential (a second tap on some platforms) | User clicks "I've saved it"; no type-back test |
| 4 | Make the backup pair, wrap, send the public half; the sealed service seals and stores | Same |
| 5 | Test unwrap: fetch the row, unwrap, and confirm the user key's `keyId` matches. Only then mark it active | Same |
| Failure | Delete any row written and show one line: "This passkey can't be used as a backup. Try another, or use a recovery key." | Show today's generic error |

**Removal** deletes the row. No re-wrap is needed. The passkey stays in the user's passkey manager; LGI does not touch it. Removing the last backup needs only today's `ConfirmDialog`.

Passkeys here are backups only. They never sign anyone in, and no server verifies a WebAuthn assertion; the PRF output is all that matters. The page calls `navigator.credentials` directly, with no new library.

### When the unlock panel appears

Normal login is unchanged and shows no option, because the sealed service returns the keys. Enrolment in Settings and no login option outside the cases below depart from the README's "options at login" (decision 1, decision-2 notes). This matches canonical default 11, but the README needs amending (Question 1).

The panel appears only when the browser holds a valid LGI session but no keys, the account has at least one active backup, and either:

- **Outage:** the sealed service is unreachable; or
- **Restore needed:** the sealed service is reachable, has no key record for the account, and replied "restore needed" (below).

It replaces today's login button or error callout with one sentence and the buttons for the kinds the account has: "We couldn't load your data right now. Unlock with a passkey or recovery key instead." Accounts without backups see today's error (Part 08).

### What backups actually cover

In a short outage, backups rarely help. A live session already holds its keys in IndexedDB (Part 09), and new devices cannot sign in because Part 08 pauses logins. A backup helps only a browser whose session cookie outlived its IndexedDB keys; new devices wait for the service or the break-glass release. Backups matter mainly after permanent loss (Question 2, with Part 08 Question 6).

### Outage unlock (decision 5 holds)

The EVE gate comes first: a valid session from an earlier EVE login, or a fresh EVE login through the owner's break-glass identity-only release (Part 08). Vercel serves the backup rows only to that session. The crypto worker then derives the wrapping key from the PRF output or the typed recovery key, unwraps the backup private key as non-extractable, opens `sealed_user_key` and imports the user key as Part 09 does at login. Map keys come from the user's own `mapKeyWraps` rows in Convex.

| During an outage unlock | Can | Cannot |
|---|---|---|
| Maps | Read maps whose current epoch was already wrapped to this user | Edit (map logic is in the workers, Part 15); open a map never opened before; get new epochs |
| Location tracking | n/a | Track; polling is in the workers (Part 17) |
| Personal data | Read precomputed views and documents (Part 19); save user-authored documents only if Part 20 keeps browser sealing | Sync from ESI |
| Corp data | n/a | Anything: corp keys never leave the enclave |
| Account | Sign out | Link characters, change backups, token-bearing lookups |

When the sealed service returns, a browser with a registered browser session key keeps using it for its 7 days (Part 09 step 4). A browser that unlocked from a backup without one stays read-only until its next normal EVE login, through today's button. Nothing derived from a backup or the user key can register a session key.

### Restoring after permanent loss

A new sealed service runs under a new service root key (Part 06). Every record MAC'd under keys derived from the old root key is now unverifiable: character-link records and browser session key registrations (Part 08), access snapshots and affiliation observations (Part 12). Before it accepts any login, the new enclave runs a one-time re-genesis:

- **Link records.** It seeds one record per readable `account` row, using the stored `owner_hash`, as Part 31 does at migration. This is trust on first use: the readable rows are believed once. Each record is confirmed or corrected by the character's next EVE login, where the enclave checks the owner hash itself.
- **Access snapshots.** It signs a new genesis snapshot for each map from the current readable `map_access` rows, blocks and map records, as Part 31 does at conversion (Part 12).
- **Session registrations and affiliation observations** are discarded. Every browser registers a new session key at its next EVE login, and affiliation is re-fetched from ESI.
- **Report.** It reports rows where a column and the stored owner hash disagree, as Part 31 does, and raises a boot alert naming re-genesis.

From that point Part 08 rule 6 and Part 12 rule 6 apply in full: membership and key release read only the re-seeded link records and re-signed snapshots, never readable rows. The trust gap is the window between the loss and re-genesis: an operator who edited `account` or `map_access` rows in that window, or before it, has those edits believed once. Part 28 needs to record this as an accepted risk.

Users then log in with EVE as usual; the new enclave checks the login and owner hash itself against the re-seeded link record. Part 09 step 4 gains a restore mode:

1. **Restore needed.** If the enclave has no key record for the account and the account has active backups, it creates no user key and replies "restore needed", and the browser shows the unlock panel. It creates a fresh user key only for accounts with no backups, or once the user removes them.
2. **Send.** The user unlocks as above. The crypto worker opens the user-key and map-key wraps to raw bytes, sends them in one sealed request to the attested enclave, and zeroes them. The bytes never reach page script (hard rule 13).
3. **Check.** The enclave accepts a user key only if it opens one of that account's existing sealed documents (Seal v2 commitment check); an account with none has nothing to protect. It accepts a map key epoch only if it opens an existing sealed row of that map and epoch, and the sender is on the map's current access list in Part 12's re-signed snapshot.
4. **Rotate.** The enclave then moves each restored map to a fresh epoch (Part 13), so a removed member's old wraps gain nothing.

Corp and token keys are gone: corp data re-pulls from ESI and everyone logs in with EVE again.

**What survives.** Map metadata (names, access lists, roles, blocks) is readable in Neon and survives. Map contents survive only where some member has a backup; otherwise the map reopens empty. With no prompts and 18 users, most maps likely have no such member. Users without backups also lose personal data. Decision 9 assumed "Maps survive with other members", which this design does not deliver. Chain contents go stale within hours to days anyway, so the owner can likely accept this (Question 5).

### Dropped from the older design

The mandatory recovery secret (OD-17), recovery delay, veto and account proofs (04 §5.5, §5.7), the passphrase unlocker, the two-unlocker rule, passkey-as-login, the recovery bundle, recovery signing keys, weak-provider warnings, `signalUnknownCredential` and §5.10's signal ordering (as in Part 11), and the versioned recovery-key prefix. DR-C7's observed-PRF rule carries over.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| That an account has backups, their kinds, count, credential IDs and created dates | Yes | No | LGI server |
| Backup public key | Yes | No | Browser makes it |
| Wrapped backup private key | No | Yes (PRF or recovery-key wrap) | Browser |
| Sealed user key copy | No | Yes (HPKE to the backup key) | Sealed service seals; browser opens |
| PRF output, recovery key | Never stored | n/a | Browser only |
| Outage unlock state | No | n/a | Browser memory |
| Restore request (user key and map key epochs) | No | Yes (sealed request) | Browser sends; sealed service checks |

## Hard rules

1. [Agreed] Passkeys and recovery keys are optional. Nothing prompts, nudges, reminds or alerts anyone about them (decisions 1, 9).
2. [Agreed] Every unlock follows an EVE login and works at once, with no delay or veto (decision 5).
3. [Agreed] The sealed service registers a browser session key only inside an EVE login it checked itself, after the owner-hash check. No key derived from a backup or the user key can register one (principle 4, decision 5).
4. [Proposed] A backup is never a sign-in method. Vercel serves backup rows only to a session made by an EVE login for that account.
5. [Proposed] The PRF output, the recovery key and wrapping keys exist only in the browser. They are never sent, logged or stored in plaintext. The sealed service receives only backup public keys.
6. [Proposed] A backup becomes active only after a test unwrap succeeds on the enrolling device.
7. [Proposed] Each backup wraps the user key on its own. Removal deletes one row and never needs a re-wrap. LGI never calls `signalUnknownCredential`.
8. [Proposed] If PRF is unavailable, the passkey option is simply absent, with no warning. The only failure message is the single line shown after a failed enrolment.
9. [Proposed, needs README amendment] The unlock panel shows only under the conditions in the Design. No other login surface mentions backups. This replaces the README's "options at login".
10. [Proposed] An outage unlock is read-only except where a part explicitly allows browser-side writes. It never writes sealed rows that only the sealed service may write.
11. [Proposed] `rp.id` comes from the host of `BETTER_AUTH_URL`. Backups never cross environments.
12. [Proposed] The enclave never creates a fresh user key for an account with active backups; it replies "restore needed".
13. [Proposed] Only during a permanent-loss restore, the crypto worker decrypts the user-key and map-key wraps to raw bytes, sends them in one sealed request to an attested enclave, and zeroes them. They never reach page script. Part 09 rule 7 gains this exception.
14. [Proposed] The enclave accepts a restored key only if it opens an existing sealed row of that account, or of that map and epoch. Map keys also need the sender on the current access list in Part 12's re-signed snapshot. Each restored map rotates to a fresh epoch at once.
15. [Proposed] Only the sealed service writes `user_key_backups`. No new WebAuthn or passkey dependency; Better Auth's passkey plugin is not used.
16. [Proposed] Account deletion deletes `user_key_backups` rows; merge handling is Part 11.
17. [Proposed] After permanent loss, the new enclave runs re-genesis once, before accepting any login: it seeds link records and signs genesis access snapshots from readable rows (trust on first use, as in Part 31) and discards session registrations and affiliation observations. Only re-genesis reads readable rows as truth; afterwards Part 08 rule 6 and Part 12 rule 6 apply. The window is an accepted risk in Part 28.

## Assumptions

| Assumption | How to check |
|---|---|
| Users' passkey managers return PRF reliably (iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Bitwarden, security keys) | Owner enrols and unlocks on their own iPhone, Mac, Windows PC and Android, plus one security key, using a staging build. Playwright's virtual authenticator with PRF in CI, against the local host |
| PRF output is the same whether the passkey is used on the device or across devices (Apple forum reports say not always) | Enrol on one device, unlock by phone-to-desktop hybrid; the test unwrap catches failures at enrolment only, so also re-test unlock |
| HPKE opens with a non-extractable P-256 key in every engine | Part 09's cross-engine vectors |
| Every restored map has a sealed row to check its epoch against | Phase 1 restore test (Question 4) |
| Readable `account` and `map_access` rows are intact enough at re-genesis to seed from | Re-genesis report of mismatched rows; Phase 1 restore test (Question 4) |

## What users see

Nothing new unless they look for it, an outage hits, or a restore is needed.

- **Backups card** on Settings → Account, below Overview: "Passkeys" with Add and Remove, and "Recovery key" with Create or Replace. A plain list, no banner. Justified because decisions 1 and 9 make backups available, and settings is the quietest place.
- **Unlock panel** during an outage or a restore, only for accounts with backups. Justified because otherwise a backup could never be used.
- **One failure line** after a passkey that cannot do PRF.

## Questions for the owner

1. **Where does the option show at login?** Recommended: nowhere in normal use, plainly only during an outage or restore, and amend the README's "options at login" to match. Alternative: a small "Unlock with a passkey" link on the callback loading screen. It adds a visible element and saves nothing, because the sealed service already returns keys.
2. **Keep the short-outage unlock?** It helps only a browser whose session outlived its IndexedDB keys. Recommended: keep it, since it reuses the restore panel and code; decide it with Part 08 Question 6. Alternative: show the panel only for restore and break-glass.
3. **What can an outage unlock do?** Recommended: read maps and personal data, and save user-authored documents only if Part 20 keeps browser sealing. Map edits, tracking, syncs and corp data wait for the sealed service.
4. **Restore after permanent loss: built now or written as a runbook?** Recommended: write and test the restore request in Phase 1 with the dev sealed service. Test re-genesis (link records and snapshots re-seeded from readable rows, no login before it ends), restore mode (no key record, backups exist, no fresh user key), refusal of a forged or stale epoch and of a sender off the access list, and the rotation. Backups are worth little if restoring is untested.
5. **Accept that maps with no backed-up member reopen empty after permanent loss?** Recommended: yes, and reword decision 9's accepted risk: map metadata survives; contents survive only where a member has a backup.
6. **Recovery-key length?** Recommended: 256 bits, 52 base32 characters plus a checksum, copied or downloaded rather than typed. Alternative: 128 bits (26 characters), which is still beyond offline guessing and easier to type.
