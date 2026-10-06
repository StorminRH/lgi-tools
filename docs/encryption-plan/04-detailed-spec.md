# Detailed spec

This tab is the implementation-level spec behind the Design and spec tab. Each decision has an ID (D-…) that other tabs cite. Owner decisions are OD-… and open questions are OQ-…; recommended defaults bind until the owner changes them. Status: canonical as of 2026-10-06.

Milestone IDs M0-M9 map to phases P0-P5 as described in Rebuild plan: M0 and M1 are P0, M2a and M2b are P1, M3 is P2, M5 is P3, M6 is P4 and M8 is P5; M4, M7 and M9 are later, on demand. GA means cutover at the end of P5. Where this tab disagrees with Alignment with the current app (Design and spec tab), the alignment section wins.

## 1. Names and acronyms (defined once)

| Term | Meaning |
| --- | --- |
| ARS | Account root secret: 32 random bytes; root of a user's keyring. Never stored unwrapped. |
| Keyring | AEAD blob under HKDF(ARS) holding ASK, VMK, per-character key sets, the signed unlocker list, high-water marks and contact pins. |
| Unlocker | Anything that wraps ARS: DUK, passkey CUK, recovery keypair, optional passphrase. |
| DUK | Device unlock key: per trusted device, non-extractable X25519. ARS is HPKE-wrapped to it, and that row lives on the server. Replaces an earlier AES "DWK" design. |
| DAK | Device authentication key: per device, non-extractable Ed25519. Signs session requests and socket upgrades. Control plane only; peers never see it. |
| DCK | Device cache key: non-extractable AES-256-GCM key for the local ciphertext cache. |
| CUK | Credential unlock key: X25519 keypair per passkey credential. Its private half is wrapped under the PRF-derived KEK. |
| RK | Recovery key: a 256-bit secret printed on the recovery kit. A generated passphrase of 6 or more words, stretched with Argon2id, may take its role. |
| RKP | Recovery keypair (X25519) derived from RK. ARS is wrapped to its public half. |
| RSK | Recovery signing key (Ed25519, account level) derived from RK. The server verifies it as an account proof. |
| RAK\_c | Recovery anchor key for character c (Ed25519) derived from RK. Its public half sits in c's sigchain, and it authorises compromise rotations that peers can verify. |
| Account proof | A factor the server can verify that a copied browser profile cannot reproduce: a fresh WebAuthn user-verified (UV) assertion, or an RSK signature. |
| ASK | Account signing key (Ed25519, in the keyring). Signs the unlocker list, device list and keyring-version records. Never shown to peers. |
| VMK | Vault master key for the personal vault. |
| CIK\_c | Character identity key (Ed25519) per linked character. Signs c's sigchain. |
| CEK\_c,g | Character encryption key, generation g (X25519). The recipient of group wraps. |
| DSK\_d,c | Device signing key for device d acting as character c (non-extractable Ed25519), certified by CIK\_c. |
| Sigchain\_c | Hash-chained, CIK-signed log of c's device certificates, CEK generations and rotations. |
| Group | Any keyed space: map (MapRoom), personal vault, character vault, CorpSpace, access class. |
| GES\_e | Group epoch secret for epoch e. Epoch keys are HKDF subkeys of it. |
| HK | History key: access-class key that gives eligible members archived GES from past epochs. |
| Confirm tag | HMAC under HKDF(GES\_e, 'confirm') over the commit hash, carried inside the signed commit. |
| KT | Key directory (key transparency): a verifiable map of per-character bindings, run by the KeyDirectory DO. |
| STH | Signed tree head of the KT. |
| Sigsum | External transparency log with witness cosignatures. Used for STHs, releases and JWKS snapshots. |
| IS / ISK | Invite secret (URL fragment) / invite signing key derived from it. |
| GS / GK | Guest secret (URL fragment) / guest keypair derived from it. |
| MapRoom, UserHub, CorpSpace, KeyDirectory | Durable Objects (DO): one per map, one per user, one per corp, and one global KT. |
| Bot principal | Corp-run headless member whose keys are anchored by a sponsor's signature. |
| Steward | Standard-tier escrow service (isolated Worker plus AWS KMS), M7. |
| Sealed / Standard | Tiers fixed in a group's signed genesis. Standard is operator-readable by design. |
| Trusted / session device | Device classes: persistent DUK, or no persistent keys. |
| rV1 | reducerVersion 1, the alpha protocol. |

---

## 2. Trust statement and hard rules

**D-TRUST-1 Sealed rules (S1-S8).**

- S1 The server never starts a key grant in a Sealed group. Every addition (member wrap, device certificate, guest key) needs a signature from a current member device that verified the recipient.
- S2 No user-level secret is escrowed in any tier: ARS, keyring, ASK, VMK, CIK, CEK, RK-derived keys, EVE tokens, the personal vault or character vaults.
- S3 Removing access is always safe for the server, through signed system revokes. Adding access always needs a member-side check.
- S4 Rotation recipients are computed only from the verified, signed membership log.
- S5 Every key a client accepts (epoch, history, guest projection, access class) is checked against a signed confirm tag before first use.
- S6 Browser storage is a cache, never the system of record.
- S7 No public data is ever queried by private IDs through LGI.
- S8 No live ESI-scoped bearer credential ever reaches LGI servers. CCP JWTs reach LGI only as zero-scope Identity tokens or expired tokens, and only inside CIK-signed requests. There is no bare-JWT login.

**D-TRUST-2 Standard rules (T-rules).**

- The Steward is an escrow recipient of that group's epochs only.
- It may rotate the group, and may re-wrap a member's key for recovery after a 72 h delay that can be vetoed (D-STD-3).
- Every escrow open produces a CloudTrail record and a Sigsum receipt.
- S2, S6 and S7 apply unchanged.
- S8 is relaxed only for the two explicitly delegated grants: the Standard server tracker (location scopes) and the hosted corp agent. Both are labelled LGI-readable.
- S1, S4 and S5 apply to members; the Steward is the one privileged escrow member.
- Standard is labelled everywhere "Standard: LGI can read and recover this".

**D-TRUST-3 Guarantee wording, published verbatim on the security page.**

- "Sealed: LGI stores only ciphertext and metadata, and cannot add itself or anyone else to a group."
- "Whoever serves the app code can steal keys on your next load. Self-hosters and WEBCAT users get prevention; everyone else gets detection."
- "Key directory: trust on first login plus transparency detection. LGI cannot bind a key to a character that has never logged in to LGI. For an active character, substitution shows up as a reset or a red alarm." (This replaces an earlier "substitution prevented" claim.)
- "Alt privacy: peers cannot link your characters cryptographically. Timing correlation is reduced, not eliminated. LGI's control plane knows which characters share an account."
- "Removed members keep what they already decrypted. Losing every unlocker loses Sealed data. XSS can use unlocked keys as an oracle."

---

## 3. Components and origins

In v1, Convex is the relay for sealed frames behind the transport interface. The Durable Objects below (MapRoom, UserHub, CorpSpace) are the planned migration if Convex cost or fan-out requires it.

| Origin or component | Host | Role | Sees | From |
| --- | --- | --- | --- | --- |
| lgi.tools | Vercel, Next.js 16.3.4 (trimmed current app) | Public shell: landing, sites, market, public industry pages, changelog, docs, legal, security and metadata-disclosure pages with a release verifier. Reads only data.lgi.tools datasets: no Neon, no auth, no keys. Never embeds the core. | Public data | M1 |
| app.lgi.tools | Workers Static Assets; also a signed tarball and Caddy OCI image | Crypto core SPA: unlock, keyring, crypto worker, mapper engine and UI, ESI scheduler, vaults, corp grant engine, invites and approvals, local search. WebAuthn RP ID = app.lgi.tools. | Whatever the user is entitled to, in the browser | M2a |
| api.lgi.tools | Worker (Hono) + Neon via Hyperdrive | Control plane: accounts, bind/attest endpoints, devices, sessions and relay capabilities, passkey ceremonies, unlock-wrap and keyring rows (separate Neon project, history 0), room registry and ACL mirror, hourly affiliation re-resolution and system revokes, quotas, kill switch, dataset manifest, feedback relay | Metadata | M2a |
| KeyDirectory DO | Workers | KT log and sparse map, an STH alarm every 2 min, Sigsum submission, inclusion promises, room-scoped lookups. Neon is not on the lookup path. | Commitments and metadata | M2b |
| relay.lgi.tools | Workers + SQLite DOs + R2 | MapRoom, UserHub, CorpSpace: sequencing, coarse ACL gate, wrap rows, invites, leases, location batching. Snapshots and 30-day ops go to R2. | Ciphertext and metadata | M3 |
| data.lgi.tools | R2 + CDN | Immutable signed datasets; STHs with Sigsum proofs and witness cosignatures; release manifests with proofs; JWKS snapshots; kill-feed chunks; EVE-Scout mirror | Public | M1 |
| ops.lgi.tools | Worker behind Cloudflare Access | Metadata-only operator console | Metadata | M4 |
| watch | Public GitHub Action + npx CLI | Monitors the release log, KT STH consistency and the JWKS archive. Anyone can run it. | Public | M2b |
| Bot | Corp-run container (headless core) | Bot principal (§11) | That corp's data, on the corp's hardware | M4 |
| Steward | Isolated Worker (service binding) + AWS KMS | Standard escrow and conveniences (§15) | Standard groups only | M7 |
| Self-host bundle | Caddy OCI or tarball | Static core with runtime config, its own CCP apps and passkeys, QR enrolment | As app.lgi.tools | M8 (part of GA) |
| relay-node, control-plane-node, Tauri | Docker / desktop | Full self-host and always-on desktop | n/a | M9 |

- No shared cookies anywhere. Authentication is a bearer token plus a DAK proof.
- api and relay allow CORS only from app.lgi.tools, plus self-host origins registered per account.

**D-RELAY (facts).**

- Durable Object jurisdictions are `eu` and `fedramp` only. Research's 'us' was wrong; a 2026-10-06 search of Cloudflare docs confirms this.
- LGI offers `eu` as the one hard residency option. Every other region uses a best-effort location hint picked at room creation, and a DO never moves once created.
- DurableObjectIds are logged outside the jurisdiction.
- Every deploy disconnects every socket. The soft limit is 1,000 requests/s per object.
- DO point-in-time recovery (PITR) keeps data 30 days. Whether data removed with deleteAll() is recoverable is undocumented (OQ-7), so deletion means crypto-shredding.

---

## 4. Stack and pinned versions (pin exact at kickoff)

| Area | Choice |
| --- | --- |
| Repo | **The existing public lgi-tools repo becomes a pnpm 10.34 workspace on the development branch**. packages: crypto, protocol, engine-map, engine-industry, engine-corp, esi-client, datasets. apps: core, shell, api, relay, ops, bot (M4), watch. Fallow 3.22.0 boundaries from day one: engines are pure, crypto has no UI imports, the shell cannot import crypto. ESLint 9.39. Zero suppressions. `pnpm check`/`pnpm verify` green from the first commit. |
| Core UI | Vite 8.x, React 19.2.8, TanStack Router 1.x (hash history), Tailwind 4.3.3, Base UI 1.7.0 (including Toast), @xyflow/react 12.11.6, Comlink 4.x, idb 8.x. **sonner is dropped**, and so is any library that injects `<style>` at runtime. |
| Vite rationale (corrected) | Chosen for static output with no inline scripts and hash-pinned assets (CSP, WEBCAT, self-host). The current repo's `vite` pin is only a pnpm override of a transitive dependency, not prior build experience. |
| Shell | Next.js 16.3.4 on Vercel, public routes only |
| Edge | Workers Paid, wrangler 4.x, Hono 4.x. SQLite DOs with hibernatable WebSockets (ctx.acceptWebSocket, setWebSocketAutoResponse), alarms, transactionSync. Workflows, R2, Hyperdrive, Analytics Engine. partysocket 1.x on the client. **No setTimeout/setInterval, accept() or outgoing sockets in DOs** (lint rule plus billing test). |
| Database | Neon Launch via Hyperdrive. drizzle-orm 0.45.2 and drizzle-kit 0.31.x. History window 1 day for the main project and 0 for the key-wrap project. |
| Crypto | Native WebCrypto Ed25519, X25519, AES-256-GCM, HKDF-SHA256, HMAC-SHA256. `hpke` 1.1.7, base and PSK modes only (Auth modes never; they were removed from the republished HPKE draft). @noble/curves 2.4.0 for strict Ed25519 *verification* in every engine. @noble/hashes 2.x sha256 as the only synchronous hash, used by the engine and in DO critical sections and whitelisted by the determinism lint. @panva/hpke-noble 1.1.7 only once suite 2 (X-Wing) activates. |
| Encoding | cborg 4.x strict deterministic CBOR (canonical form, duplicate keys rejected). Signatures are verified over the bytes received. zod 4.5.x. **Every KDF, MAC and signature input is a CBOR array that starts with a registered label string.** There is no string concatenation, and the label registry lives in the protocol spec. |
| Key formats | Raw for public keys, pkcs8 for private keys (including HKDF-derived Ed25519 seeds). **Never JWK**, because of Safari bugs before 26. |
| Auth | Native `PublicKeyCredential.parse*OptionsFromJSON` in the core. @simplewebauthn/server **14.x** (14.0.x, Sep 2026) on Workers, with Workers compatibility verified in M2a. jose 6.2.x. Better Auth's server-side code exchange is dropped; its reusable pieces (JWKS cache, owner-hash claim and reconcile, link intent, merge logic, synthetic-pilot dev sign-in) are kept. |
| Passphrase KDF | hash-wasm 4.x Argon2id in a worker: m=64 MiB, t=3, p=1. Parameters stored, minimums enforced on unwrap. |
| Storage | IndexedDB holds CryptoKeys and a ciphertext cache under the DCK. Call navigator.storage.persist(). No OPFS for keys. |
| Testing | Vitest 4.1.11 browser mode (Chromium, Firefox, WebKit) plus real Safari through safaridriver; @cloudflare/vitest-pool-workers; fast-check 4.x; Playwright 1.62.1 with a CDP virtual authenticator; a workerd multi-client simulator; Tamarin and ProVerif (§26). |
| Release | Reproducible build, actions/attest (public-good Sigstore), WEBCAT-format manifest, Sigsum signing (sigsum-go). |

---

## 5. Keys and their lifecycle

### 5.1 Inventory (D-KEY-INV)

| Key | Type and storage | Purpose | Rotation |
| --- | --- | --- | --- |
| ARS | 32 B; only as wraps | Derives K\_keyring = HKDF(ARS, \['lgi/v1/keyring'\]) | Compromise, RK change, optional on unlocker removal |
| Keyring | AEAD blob, key-wrap Neon project | Holds ASK, VMK, character sets, unlocker list, high-water marks | Re-encrypted on ARS rotation; keyringVersion is monotonic |
| ASK | Ed25519 in keyring | Signs unlocker list, device list, version records, high-water marks. Clients refuse to re-wrap to any unlocker key that is not ASK-signed. | Compromise |
| DAK | Non-extractable Ed25519, device | Session requests and DPoP-style upgrade proofs | Per device |
| DUK | Non-extractable X25519, trusted device | ARS wrap recipient; the wrap row is server-side only | Per device; none in high-security mode |
| DCK | Non-extractable AES-GCM, device | Local cache encryption | Per device |
| CUK | X25519 per passkey; private half wrapped under KEK\_prf = HKDF(PRF('lgi.tools/prf/v1'), \['lgi/v1/prf-kek', credentialId\]) | ARS wrap recipient | Retired after a compromise |
| RK | 256-bit 'LGI1-' Crockford base32 with checksum, or a generated passphrase | Source of RKP, RSK, RAK\_c | Suspected exposure: account proof plus 24 h, then a reprint |
| RKP | X25519 = HKDF(RK, \['lgi/v1/recovery-kp'\]) | ARS wrap recipient, so ARS can be re-wrapped remotely | Follows RK |
| RSK | Ed25519 = HKDF(RK, \['lgi/v1/recovery-sign'\]) | Account proof (server-verified) | Follows RK |
| RAK\_c | Ed25519 = HKDF(RK, \['lgi/v1/rak', charId\]) | Authorises compromise rotations; per character, so it creates no alt linkage | Follows RK; re-registered with jitter |
| Passphrase wrap | Argon2id KEK | Optional extra ARS wrap | Stale after an ARS rotation until the next entry |
| VMK | 32 B in keyring | Personal vault keys; opaque tags HMAC(VMK, logicalKey) | Compromise |
| CIK\_c | Ed25519 in keyring | Signs sigchain\_c and membership requests | Routine (CIK-signed) or compromise (RAK plus a fresh JWT) |
| CEK\_c,g | X25519 generations in keyring | Group wrap recipient | 180 days with ±30 days jitter, or compromise (§5.9) |
| DSK\_d,c | Non-extractable Ed25519, device | Signs ops, frames, wraps and commits as c | Created lazily on first use per character; revoked with the device |
| GES\_e | 32 B, wrapped per recipient | Group content subkeys | §7 triggers |
| HK | Access-class key | Archived GES | Per policy |
| Escrow key (Standard) | X25519 per group, under monthly KMS keys | Escrow recipient | Shredded by KMS key deletion |
| CPK | Ed25519, api secret | Signs system revokes (removals only) | Yearly; the key change is Sigsum-logged |
| STH key | Ed25519, KeyDirectory secret | Signs STHs | Yearly; Sigsum-logged |
| Release key | Ed25519 Sigsum, owner hardware key | Signs release manifests | 1-of-1, then 2-of-N (OD-15) |

### 5.2 Enrolment (D-KEY-ENROL)

1. **Capability probe.** Non-extractable Ed25519 and X25519 generateKey, AES-GCM, and a CryptoKey round trip through IndexedDB. Below the floor (Chrome/Edge 137, Firefox 130, Safari/iOS 18.4), the user gets the public shell.
   - **In-app webview nudge.** A user-agent heuristic for Discord, Steam and similar webviews offers "open in your browser" and allows the session class only. It is UX, not a security gate.
2. **"Trust this browser?"** Trusted (gets a DUK) or session.
3. **Identity token.** Browser PKCE against **LGI Identity** (zero scopes) returns an access-token JWT.
4. **Key generation.** The client generates ARS, ASK, VMK, CIK\_c, CEK\_c,1, DAK and DCK (plus a DUK if trusted) and the sigchain genesis.
5. **POST /bind.** CBOR {jwt, CIK, CEK, sigchain genesis, ASK, DAK, DUK?}, signed by CIK and DAK.
   - The API verifies the signature by kid against the JWKS, both issuer forms, aud containing both the Identity client\_id and 'EVE Online', sub, exp, and iat no older than 20 min.
   - It **consumes the jti, which is single-use across every endpoint**, appends a KT first-bind record, and returns a session.
   - This is the only way an Identity JWT is ever accepted.
6. **Passkey offer.** create(), then an immediate get(), then a test unwrap. Record AAGUID and PRF status, set excludeCredentials, create the CUK and wrap ARS to it.
7. **Recovery kit.** Mandatory within 24 h, and before EVE tokens or authored data are persisted (OD-17).
   - Generate RK, show the kit, and require the user to type back 4 groups.
   - Derive RKP, RSK and RAK\_c. Register the RKP and RSK public keys (account level) and the RAK\_c public keys (sigchain entries, jittered).
8. **LGI Data grant.** All scopes requested at once with consent, as today; missing scopes show a reconnect state. The refresh token is sealed in the character vault.

Owners, Managers, Directors and stewards of shared spaces must hold at least two non-device unlockers (RK plus a passkey).

### 5.3 Unlock (D-KEY-UNLOCK)

- **Trusted device, zero taps.**
  - POST /session, DAK-signed {deviceId, ts, nonce}, returns a 15-min API token and 5-min relay capabilities bound to the DAK.
  - The client fetches the DUK-wrapped ARS row and unwraps it in the crypto worker.
  - Wrap rows are never cached locally, so a server-side revoke ends future unlocks. **Unlock needs the network** (stated in the UI).
- **Passkey, one tap.**
  - A discoverable get() with the fixed global PRF input 'lgi.tools/prf/v1' (UV required) authenticates the user.
  - The client then fetches the CUK and ARS wraps, derives KEK\_prf, opens the CUK and then ARS, and offers a DUK if the user trusts the browser.
- **High-security mode.** Strongly prompted for shared-map Owners, Managers and Directors (OD-12). There is no DUK; a session wrap is held in memory, so each browser session needs one tap. Zero-tap unlock means an infostealer that copies the profile gets the account, and the UI says so.
- **Session devices.** No persistent keys. They expire automatically and never cause rotation.
- **Recovery.** RK, then an RSK signature, then the delayed release flow (§5.7).

### 5.4 Device link by QR code (D-KEY-LINK)

1. The new device N generates an ephemeral X25519 key ePK\_N, a 128-bit secret s and a 16-byte linkId. It registers linkId at the API (5-min TTL, single use, rate-limited, no auth) and shows QR(v, linkId, ePK\_N, s).
2. The existing unlocked device E scans the code.
   - It opens HPKE in **PSK mode** to ePK\_N with psk = s and psk\_id = linkId, and sends {enc} through the API mailbox.
   - Both sides derive directional keys and a SAS from the HPKE exporter: 'lgi/v1/link/e2n', 'lgi/v1/link/n2e' and 'lgi/v1/link/sas'.
3. N sends its DAK and DUK public keys and probe results, encrypted under k\_n2e.
4. Both screens show a 6-digit SAS, and the user confirms on E.
5. E registers N with a DAK-signed request and an ASK-signed device-list update. All devices get a notice: "New device linked. Not you? Compromise revoke."
6. E wraps ARS to DUK\_N and stores the row (trusted device), or sends a session wrap over k\_e2n (session device). **ARS never crosses the relay unwrapped.**
7. N creates a session and unwraps.
   - N's per-character DSKs are certified lazily on first use per character. KT publication is jittered by 0-6 h, and certificates carry no device metadata.
8. Self-host origins use the same protocol and get the device class "self-host:\<origin>".

### 5.5 Account proofs, cooldowns and vetoes (D-KEY-PROOF)

| Action | Authenticated by | Delay | Who can veto |
| --- | --- | --- | --- |
| Link a device (QR); add a passkey | Existing device plus SAS or UV | None; announced | n/a (use compromise revoke) |
| Sign out or revoke the current device | Device | None | n/a |
| Tidy-up revoke of another device; remove an unlocker; routine CIK rotation | Device | 24 h, announced | Any device, or an account proof |
| Remove or rotate RK | Account proof | 24 h | Account proof only |
| Recovery via RK (new device) | RSK | 48 h (OD-5); immediate if approved by a passkey UV or a trusted device | Account proof only |
| Compromise revoke | Account proof, plus a fresh CCP JWT per character, plus RAK\_c signatures | Immediate | **None from devices**; only a competing account proof |

If account proofs conflict, unlocker and device changes freeze and the user is told that their factors are in different hands. The way out is a new identity: groups are re-joined as resets.

### 5.6 Revocation (D-KEY-REVOKE)

- **Tidy-up revoke is enforced by the server only.**
  - It deletes the device's wrap rows, revokes its sessions and pushes the revocation to every DO, which closes tagged sockets (D-SYNC-12).
  - It appends system cert-revokes for the device's DSKs in every room, plus sigchain entries.
  - The server rejects certificates signed from revoked deviceIds. No rotation happens.
  - UI copy: "Use only if the device is wiped or in your hands; otherwise use compromise revoke."
- **Compromise revoke takes effect immediately.**
  1. Every device and session not re-confirmed with an account proof during the flow is revoked.
  2. ARS is rotated (§5.8), excluding the revoked DUKs. **Every CUK is retired**, and the user registers fresh passkeys, which have fresh PRF secrets. The passphrase wrap is marked stale.
  3. For each character, the batch wizard gets a fresh CCP Identity JWT. A new CIK\_c' is cross-signed by the old CIK\_c and by RAK\_c, a new CEK\_c,g+1 is created, and a KT 'compromise-rotate' record is appended.
  4. VMK is rotated and the personal vault re-encrypted.
  5. rotationPending is set on every group.
  6. Data grants are re-consented. The client revokes at CCP through /v2/oauth/revoke if M0 shows public clients may; otherwise it deep-links to the authorized-apps page.
  7. Characters are staggered by 0-20 min to blunt alt correlation, or by up to 24 h if the user opts in.
- **Fork rule that peers enforce.**
  - When branches compete from one parent, a RAK-signed compromise-rotate beats any branch signed only by CIK.
  - A reset signed only by CIK, with no RAK (for example an attacker holding a CCP SSO cookie), is **contestable for 7 days**. Any RAK-signed rotation in that window supersedes it, and auto-admit never accepts a reset.
  - Two RAK-signed branches mean RK is in two hands. The character is suspended everywhere until the user starts a new identity.

### 5.7 Recovery key, passphrase and recovery bundle (D-KEY-RECOVERY)

- **The kit** holds RK, the accountId, the RKP fingerprint and a kit version. It **stays valid across ARS rotations**, because the server-side ARS wrap is re-made to the RKP public key. The kit is reprinted only when RK rotates, and the old kit then shows as void.
- **Recovery flow.**
  - The client sends an RSK-signed request, and every device and passkey user gets an in-app notice.
  - The RKP-wrapped ARS and the keyring are released after **48 h**, or at once if a passkey UV or a trusted device approves.
  - Only an account proof can veto. The delay covers keyring fetch and device enrolment.
- **Corrected guarantee.** The kit alone does not survive loss of LGI's database, because the keyring blob lives in the control plane. The **recovery bundle** does: an encrypted export {ARS wrap to RKP, keyring ciphertext, sigchain heads, room list} sealed to RKP. It is offered after every ARS rotation and monthly. A corp ciphertext mirror is an M9 option.
- **Passphrase.** Optional extra unlocker. It counts as a non-device unlocker only if generated (6 or more diceware words). After an ARS rotation its wrap is re-created at the next entry. A generated passphrase may serve as RK, with the same derivations taken from its Argon2id output.
- **Never type RK** outside app.lgi.tools or a signed build.

### 5.8 ARS rotation (D-KEY-ARS)

1. Generate ARS' and re-encrypt the keyring under HKDF(ARS').
2. Verify that the unlocker list is ASK-signed, and refuse any key the server added.
3. Wrap ARS' to every non-revoked DUK, to RKP, and to every CUK that has not been retired.
4. Bump keyringVersion and the ASK-signed high-water marks.
5. Delete the old wrap rows and prompt the user to download a new recovery bundle.

Other trusted devices keep zero-tap unlock without a re-tap.

### 5.9 CEK and CIK lifecycle (D-KEY-CEK)

- CEK\_c,1 is created at link. Routine rotation runs every 180 days ± 30 days; compromise rotation is immediate.
- **Announcing a new generation.**
  1. CIK-signed sigchain entry.
  2. KT leaf update: jittered 0-6 h if non-urgent, immediate if urgent.
  3. A DSK-signed 'member.cek-update' commit in each room, carrying the KT proof.
  - Rotators wrap to the KT-proven head and refuse lower generations.
- **Old private keys** are kept until the last epoch wrapped to them is older than op retention (30 days), then destroyed. After a compromise, old CEKs are treated as exposed and every group rotates.

### 5.10 PRF credential lifecycle (D-KEY-PRF)

- One fixed global input (v1) for every credential.
- Enrolment rules from §5.2. Re-wrap before removing any credential. No Signal-API deletes while a credential still wraps keys. Hybrid enrolment from iOS below 18.4 is blocked. Known-weak providers are warned (Bitwarden-stored passkeys, Windows Hello before 25H2).
- **After a compromise**, credentials are retired rather than re-keyed. signalUnknownCredential is sent where supported, and new passkeys are created.
- The verifier's suggested evalByCredential re-key is rejected: with discoverable sign-in it costs an extra tap on every sign-in.

---

## 6. Key directory (KT)

- **D-KT-1 Structure.**
  - The KeyDirectory DO holds an append-only Merkle log of update records plus a sparse Merkle map.
  - Index = SHA-256(\['lgi/v1/kt-index', kind, id\]), with kind char or bot.
  - Value = a per-index hash chain v\_n = H(\[n, recordKind, sigchainHead, evidenceCommitment, v\_{n-1}\]).
  - Record kinds: first-bind, rotate, compromise-rotate, reset, re-attest, cert-change, tombstone, bot-bind.
- **D-KT-2 Sigchain head in the leaf.**
  - Every sigchain event (device certificate add or revoke, CEK or CIK change) updates the leaf.
  - Before wrapping, admitting, or accepting a cekGen, a peer fetches the current leaf with a proof against an STH no older than 15 min, and refuses generations below the head.
- **D-KT-3 Cadence.**
  - STH {treeSize, logRoot, mapRoot, ts, prevSTHHash} every **2 min**, published to data.lgi.tools.
  - The latest STH is submitted to Sigsum every **10 min**, falling back to hourly if rate-limited. The prevSTHHash chain covers the STHs in between.
  - Sigsum proofs and witness cosignatures are served from data.lgi.tools and verified against pinned witness keys.
  - **Inclusion promise:** submitting an update returns a signed promise of inclusion in the next STH. Peers accept it provisionally and re-check; a breach is a red alarm and auto-removes the member.
- **D-KT-4 First-binding anchoring.**
  - The leaf holds a salted commitment H(salt, JWT).
  - Identity evidence, which is zero-scope, is opened only to the owner and to authenticated peers admitting that character. Data-app evidence is only ever posted after it has expired.
  - A first binding is accepted iff all of these hold:
    - the CCP signature verifies under a live kid or a witnessed archived kid;
    - sub matches;
    - the jti has never been seen;
    - the first Sigsum-logged STH that descends from the first STH containing the record has a witness timestamp no later than iat + 35 min (20 min token life + 10 min Sigsum cadence + 5 min slack). The bound widens to iat + 85 min while Sigsum is on its hourly fallback.
  - If the user's own client sees "jti already bound", that is a red alarm, never a retry.
- **D-KT-5 Witnessed JWKS archive.**
  - api.lgi.tools and the public watch Action each fetch the CCP JWKS hourly. On any change, each logs H(snapshot) to Sigsum, and snapshots are published on data.lgi.tools and in the repo.
  - A kid missing from the live JWKS is accepted only if a witnessed snapshot containing it was logged before the record's first STH.
  - The watch key stays owner-held until a community mirror exists. This is disclosed (OQ-12).
- **D-KT-6 Privacy.**
  - Records hold commitments only; no raw JWTs, names or owner hashes appear in public artefacts. Only STHs and consistency proofs are public.
  - A lookup needs a session plus a room-scoped capability signed by MapRoom R that lists the allowed targets: members and pending joiners of R, invite owners, and the requester's own characters. Lookups are rate-limited.
  - A VRF-indexed private map comes in v2.
- **D-KT-7 Deletion.** A tombstone record replaces the value. Record bodies are deleted, leaving only salted leaf hashes, which cannot be reversed.
- **D-KT-8 Monitoring.**
  - The owner's client checks its own full per-index chain on every unlock, and alarms on any version not made by its own devices or by its own JWT-anchored reset.
  - The watch Action checks STH linearity, consistency proofs between every logged STH, same-size forks and gaps in cadence, and publishes the results.
  - Clients show amber if the latest watch-confirmed STH is more than 24 h old, and require every STH they use to be consistent with it.
  - STH hashes are also gossiped inside signed ops.
- **D-KT-9 Re-attestation.**
  - Every bound character re-attests every **14 days**, silently (OD-7).
  - Evidence: an **expired** CCP access-token JWT, taken from the Identity app if M0 shows it can refresh, otherwise from the Data app, sent inside a CIK-signed request.
  - It records owner-hash continuity. An owner-hash change triggers the transfer flow (D-LIFE-5), and a Data invalid\_grant prompts a re-attest.
  - Groups suspend characters whose attestation is older than their policy (default 14 + 7 days).
  - The verifier's suggestion to post live Data tokens is rejected under S8.
- **D-KT-10 Bots.** bot-bind records are anchored by the sponsor's signature, live in a separate index namespace and get a distinct badge.
- **D-KT-11 Verification UX.** Safety numbers per character. An optional "verified in game" badge: the joiner puts a fingerprint phrase in their public character bio, and the approver's browser reads it from ESI /characters/{id}. This is recommended for Owners and Directors, because it is the only binding CCP itself anchors.

---

## 7. Groups and epochs

- **D-GRP-1 Genesis (e = 0).**
  - Signed by the creator's DSK: {tier, kind, policies, memberSet, memberSetHash, confirm\_0}, with genesisHash = H(body).
  - The tier is immutable. Clients refuse an escrow recipient on a Sealed genesis and raise an alarm.
- **D-GRP-2 Commits and confirm tags.**
  - C\_e = {groupId, e, prevCommitHash, cause, memberSet, memberSetHash, wrapsDigest, snapshotRef, actorCert}.
  - confirm\_e = HMAC(HKDF(GES\_e, \['lgi/v1/confirm', groupId, e\]), H(C\_e)). The commit is C\_e plus confirm\_e plus a DSK signature over both.
  - memberSetHash covers sorted (charId, role, cekGen, CEK fingerprint) entries.
  - Every key object is DSK-signed by its wrapper, names its commit, and is checked against that commit's confirm tag before first use. Key objects are: epoch wraps, join re-wraps, rewrap repairs, history blobs, guest projection wraps and access-class wraps.
  - HPKE base mode with info = \['lgi/v1/wrap', suiteId, genesisHash, groupId, e, commitHash, recipientId, cekGen, CEK fingerprint\].
- **D-GRP-3 Recipients.**
  - The rotator reduces the verified membership log from genesis, or from a verified checkpoint, up to the commit seq. It pins each recipient to the KT-proven cekGen.
  - The DO's view is only a mismatch detector: a mismatch is an alarm, never an input.
  - Recipients recompute memberSetHash and reject the commit on mismatch.
  - A 'rewrap' intent lets any member repair a missing or garbage wrap for a member in memberSet.
- **D-GRP-4 Atomic removal unit.** One transactionSync with no awaits inside: {ACL change, membership-remove commit (signed by a member or the system), delivery cutoff (close sockets, deny wrap fetches), rotationPending}. All validation finishes first, and hashing is synchronous (@noble/hashes).
- **D-GRP-5 Rotation.**
  - A separate commit. The writer takes a **30 s rotation lease**, and the commit is accepted by **CAS on epoch** plus the lease token, so the first valid rotate wins. When a lease expires, another writer may try.
  - While a removal has made rotation pending, the DO refuses appends sealed under the old epoch, except the lease holder's rotate commit. Honest clients re-seal their pending intents.
  - Every rotation writes a forced snapshot under e+1.
  - Triggers: removal, suspension, compromise, a member's CEK compromise, and every 30 days.
- **D-GRP-6 System revokes.**
  - Signed by the CPK, which is pinned in the bundle.
  - Removal only: affiliation loss, biomass, admin block, deletion, transfer, cert revocation. Additions never come from the CPK.
- **D-GRP-7 Suspension.**
  - Affiliation loss runs the atomic removal unit (cause 'suspend') and rotates immediately, recording a pinned pre-authorisation (CIK fingerprint, cekGen).
  - If the character re-affiliates within the grace window (default **7 days**, OD-8), verified at CCP by the re-wrapping client, any member re-wraps automatically to the pinned key.
  - A KT reset or newer CIK in the meantime requires normal approval.
  - If a whole corp loses affiliation, delivery stops, and the first re-affiliated writer rotates.
- **D-GRP-8 History.**
  - Genesis policy historyAccess is one of none, **managers (default)** or members-present (OD-3).
  - At each rotation, GES\_e is sealed under HK, whose recipients are Manager+.
  - Members keep their own epoch wraps for 30 days. New joiners get the forced snapshot and no history keys. Guests never get history keys.
  - Compaction drops raw jump.observe payloads older than 24 h, keeping only the derived state.
- **D-GRP-9 Guest projection key.** PK\_e = HKDF(GES\_e, \['lgi/v1/guest-proj', groupId, e\]), re-wrapped by the rotator each epoch to every active GK. A one-way derivation, so guests cannot reach GES.
- **D-GRP-10 Scale.** v1 caps maps at 1,024 members. Two-level corp sub-group keys come in M9.

**Genesis policy defaults:**

- tier Sealed; kind shared or personal; join policy **strict**; noLinkJoin on;
- historyAccess managers; attestationMaxAge 21 d; suspensionGrace 7 d;
- viewerTracking on (viewers may track, as today); maxTrackedPerAccount 32;
- caps: today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work;
- destructive ops at Member with audit, undo and rate limits;
- tick 5 s (adaptive); crossTierTracking warn; guestLinks off.

---

## 8. Membership

**D-MEM-ROLE Roles.**

- Owner, Manager, Member, Viewer and Blocked.
- Principals: character, corporation, alliance and bot. Access Lists are deferred (§13). Any grant can carry an expiry.

| Role | Rights |
| --- | --- |
| Owner | Everything, plus policies, transfer and delete |
| Manager | Membership and invites, revert, upgrade commits, canonical snapshots |
| Member | Write, destructive ops (with audit, undo and rate limits), tracking, rotation |
| Viewer | Read only; no tracking and no rotation by default |

**D-MEM-OWN Ownership.**

- **Shared map.** It cannot leave setup without either 2 or more Owners on **distinct accounts**, or an Owner plus a Manager with transfer rights on a distinct account.
  - The owner's client refuses to count its own alts, and the DO gives a yes/no answer on distinctness.
  - The rule is labelled "continuity guidance, not an anti-collusion guarantee".
- **Personal map.** One account, no outside principals, and a loud "only you can recover this" notice. It can be upgraded to a shared map.
  - Character-scoped maps today whose grants are all the owner's own characters migrate as personal maps; the rest migrate as shared.
- **Owner transfer.** A dedicated commit.
- **Succession.** If no Owner is seen for 30 days, Managers on k-of-n distinct accounts (DO yes/no, k = max(2, ⌈n/2⌉)) promote one of them. A map with a single Manager allows self-promotion after 60 days, with notices to members. That this trusts the relay for distinctness is stated.
- **Migration roles.** owner → Owner, admin → Manager, editor → Member, viewer → Viewer. Corp and alliance grants become genesis principals.

**D-MEM-INV Member invites.**

- IS (32 B) travels in the fragment: `#/join/{IS}`.
  - invite\_id = HKDF(IS, \['lgi/v1/invite-id'\]).
  - K\_blob = HKDF(IS, \['lgi/v1/invite-kek'\]).
  - ISK = Ed25519 from HKDF(IS, \['lgi/v1/invite-sign'\]). Only ISK\_pub goes into sealed state.
- The blob, sealed under K\_blob and signed by the inviter's DSK, holds {roomId, genesisHash, Owner CIK fingerprints, map name, role, pre-authorised charIds with optional CIK pins (or "any ACL-eligible"), maxUses, expiry, ISK\_pub}. It contains no GES.
- The DO releases the blob only to authenticated, ACL-passing or pre-authorised characters, rate-limited.
- The joiner verifies the genesis and the Owners through KT, then submits {charId, CIK, CEK, cekGen, ktLeafHash, inviteId}, signed by ISK over \['lgi/v1/join', roomId, genesisHash, inviteId, charId, CIK, CEK, ktLeafHash\] and by its own DSK. Members can verify the join signature but cannot forge it.
- Reducers reject a join if:
  - the inviter is not Manager+ at that seq;
  - the invite is expired or exhausted;
  - the subject is Blocked;
  - a pin does not match;
  - a pre-authorised subject's binding was reset after the invite was issued.
- An invite dies when its inviter is demoted.

**D-MEM-NOLINK No-link join.**

- An ACL-eligible character sees a list of maps shared with its corp or alliance. Each entry shows the Owners, KT-verified and with their affiliation checked by the joiner's browser at CCP.
- The joiner must **confirm the Owners** before any authored data or location frame is sent. Tracking stays off until then, and on strict maps until a Manager approves or a pinned contact vouches.
- The join request is flagged no-link, and admission follows the map's policy.

**D-MEM-ADMIT Admission.**

- **Default strict (OD-1).** A Manager+ approves each key after seeing the safety number, KT status, the CCP affiliation check, attestation age and any in-game badge.
  - **Bulk approve** handles onboarding ("approve 23 pending: non-reset, CCP-verified").
  - The bot may pre-verify and present a digest.
- **Opt-in auto-admit** (genesis policy). Any member device or a bot with an admit grant admits a binding that is:
  - KT-verified and CCP-anchored;
  - never reset;
  - attested within the policy window;
  - and whose affiliation the admitting client verified itself through POST /characters/affiliation.
  - Label: "Trusts LGI's key directory at first login; affiliation verified at CCP; substitution is detectable."
- Resets are never auto-admitted. Brand-new bindings may be admitted on an inclusion promise and are re-checked when the Sigsum proof lands.

**D-MEM-BLOCK Blocks.**

- A character Block denies access and runs the atomic removal unit plus rotation.
- An **account block** is only a server-side filter on future joins: it never removes existing members and never emits commits that would show linkage. The residual oracle (an alt's join attempt being refused) is documented.
- Today's map\_block\_accounts migrates to this filter.

**D-MEM-VERIFY Out-of-band checks.**

- Safety numbers and the in-game bio badge.
- **Map-head code:** 4 words from SHA-256(\['lgi/v1/headcode', roomId, checkpointSeq, headHash\]) at every 100th seq. Members compare it in game or on voice to detect relay forks.

**D-MEM-GUEST Guest links.**

- **Fragment and relay auth.** The fragment carries GS. The relay capability HKDF(GS, \['lgi/v1/guest-cap'\]) is checked against a stored hash: this is guest auth without an EVE account.
- **Access.** HTTP fetch of projection snapshots only. No socket, ops, history or location keys.
- **Snapshots.** Free of positions and tracking. Signed by an Owner, a Manager holding an Owner-signed publisher certificate, or the bot, with the certificate chain ending at an Owner fingerprint carried in the link. Refreshed every 5-15 min.
- **Revoke.** Delete the capability and stop re-wrapping, optionally with an immediate rotation.
- **Limits and warning.** Rate-limited per IP at the edge. Sealed maps warn that guest links reveal chain topology.
- Ships in M4.

---

## 9. Sync, op frames, snapshots and engine

- **D-SYNC-1 Model.** A server-sequenced total order per room, deterministic versioned reducers and optimistic rebase. No CRDT.
- **D-SYNC-2 Op frame.**
  - Layout: CBOR \[v, suite, kind, roomId, epoch, clientOpId (16 B random), salt (32 B), nonce (12 B), commitTag (32 B), ct\].
  - AAD = SHA-256(\['lgi/v1/op-aad', v, suite, kind, roomId, epoch, clientOpId, salt\]).
  - (k\_enc, k\_commit) = HKDF(subkey\_{e,kind}, salt, \['lgi/v1/aead', AAD\]), 64 bytes.
  - commitTag = HMAC(k\_commit, AAD), checked in constant time before decrypting.
  - ct = AES-256-GCM(k\_enc, nonce, padded plaintext, AAD).
  - The salt is generated inside the primitive and is never accepted from callers.
- **D-SYNC-3 Payload.**
  - {charId, deviceCertId, parentSeq, seenHead, sthHash, reducerVersion, datasetsHash, intent, sig}, where sig is the DSK signature over \['lgi/v1/op', roomId, genesisHash, epoch, kind, clientOpId, payloadWithoutSig\].
  - Padding uses power-of-two buckets from 256 B to 64 KiB.
  - Reducers dedupe on (charId, clientOpId) and reject repeats, so frames replayed at a new seq fail. Re-sealing a payload into another room or epoch fails the signature.
  - Ops originated by a tracker are released on the tick boundary.
- **D-SYNC-4 Relay chain.**
  - headHash\_s = SHA-256(\['lgi/v1/head', prevHead, seq, relayTs, SHA-256(frame)\]).
  - A fork blocks writes in that room only, with a recovery playbook. One peer's bad seenHead flags that peer, not the room.
- **D-SYNC-5 Time and determinism.**
  - Clients reject a non-monotonic relayTs or skew over 5 min. Reducers use relayTs only, with observedAt clamped to \[relayTs − 120 s, relayTs\] for time windows, and never for ordering.
  - The engine bans Date, Math.random, Intl, localeCompare, I/O and WebCrypto; only @noble/hashes sha256 is allowed. Comparison is by code unit, and math is integer.
  - Entity ids = H(clientOpId, intraOpIndex). Creation ordinals replace \_creationTime. rootSystemId is explicit.
- **D-SYNC-6 Snapshots.**
  - Offered every 200 ops or 256 KiB, and at every rotation.
  - **Canonical** iff signed by a Manager+, or carrying 2 stateHash attestations from accounts the DO certifies as distinct. That this trusts the relay for distinctness is stated. Otherwise a snapshot is provisional and shows an "unverified state" banner.
  - Online clients replay-check every snapshot and alarm on a mismatch. Owners and Managers spot-check by replaying from an older snapshot.
  - Retention: hourly for 48 h, daily for 30 days, plus Owner-pinned.
- **D-SYNC-7 Op retention.** 30 days of ciphertext in R2, independent of snapshot GC. Supports the audit view and a "revert ops by character X since T" intent (Manager+).
- **D-SYNC-8 Datasets and upgrades.**
  - A 'datasets.pin' commit pins dataset hashes.
  - A reducer upgrade activates only through a signed Owner or Manager commit at a future seq. Clients support versions N and N−1.
- **D-SYNC-9 DO authorisation.**
  - Coarse checks only: non-revoked member, role class, quotas, epoch, rotation lease.
  - Fine role checks run in reducers at seq. An invalid op becomes a deterministic rejection that its author sees.
- **D-SYNC-10 Offline.**
  - Unreceipted intents persist and are re-sealed across epochs.
  - scan.apply carries the revision it was pasted against, and delete-missing applies only to signatures known at paste time.
- **D-SYNC-11 Other logs.**
  - Vault docs: per-document revision CAS with field-level last-writer-wins and opaque tags.
  - Corp buckets: whole-blob CAS under fetch leases.
- **D-SYNC-12 Revocation on live sockets.**
  - The API pushes device and session revocations to every affected DO (found through the room index) and to UserHub.
  - DOs close tagged sockets and keep a revocation set until the token expires. Clients re-present relay capabilities over the socket every 4 min.
- **D-ENGINE Port list.** Ported "with determinism fixes":
  - the pure modules in src/data/maps: connection model, identity, lifetime, resolution and tombstone helpers, *excluding* the Drizzle schema, queries and purge files;
  - wormhole-contract;
  - hole-matching (fix localeCompare at :148) and signature-eliminator (fix :228);
  - movement-classification, chain-collapse (decideCollapse), connection-lifetime, stub-accounting, scan-parse;
  - the client layout kernel and reconciler.
  - Rewritten as reducers over MapStateRepo: scan apply, state and selection; elimination (as a derived step); jump authoring and identity; collapse; tombstone; fields; home; static claim.
  - optimistic-authoring.ts is dropped.

---

## 10. ESI custody and location

- **D-LOC-1 Custody.**
  - One PKCE Data grant per character per user. The refresh token is sealed in that character's vault (always Sealed) and synced through UserHub with version CAS.
  - The only write scope is waypoint. **This moves into M3**, because the alpha needs tracking.
- **D-LOC-2 Refresh.**
  - Web Locks serialise refreshes across tabs.
  - A UserHub lease per character (30 s TTL) serialises them across devices. Lease health is judged by the age of the last successful poll, and a device with fresher polls preempts the holder.
  - The holder refreshes and persists the newest token first.
  - Two-strike invalid\_grant handling, a circuit breaker and jittered backoff. The kill switch and polling config are fetched before any SSO call.
  - Keep-alive: on app open, refresh tokens older than 14 days.
  - The reconnect wizard waits a random 30 s-3 min between characters, and their KT appends are jittered.
- **D-LOC-3 Budget.** About 600 of the 1,200 char-location tokens per 15 min:
  - location only while the online check passes, cadence following ESI Expires with a 5 s floor, with If-None-Match;
  - ship only on system change;
  - online every 60 s;
  - clones on view, through the same pipeline as the sheet status.
- **D-LOC-4 Frame.** A fixed **256-byte wire frame**:
  - header (24 B) {v, suite, kind = loc, senderSlot, epoch, tick, roomTag}; salt 16; nonce 12; commitTag 32; **156-byte padded plaintext**; GCM tag 16.
  - Plaintext: {charId, deviceCertId, systemId, locationDetail, shipTypeId, flags, observedAt, sig}. sig is the DSK signature over \['lgi/v1/loc', roomId, genesisHash, epoch, tick, body\].
  - Frames use the same salted per-message HKDF primitive as ops. senderSlot is per room, so it is not linkable across rooms. Frames are never persisted.
- **D-LOC-5 Batching and tick.**
  - The room tick is aligned to relayTs. Each tracker sends one frame per tick with **independent per-character jitter**, uniform in \[0, 1.5 s). There is no per-device phase.
  - The DO keeps the latest frame per sender. It flushes one padded batch per socket per downstream period, when every sender from the previous tick has reported or when the first frame of the next tick arrives.
  - There is no timer and no per-tick alarm, so the DO stays eligible for hibernation.
  - Adaptive tick: 5 s up to 200 trackers, 10 s up to 500, 15 s up to 1,024.
  - Downstream rate per socket: full (every tick), lite (every 15 s, for hidden tabs and mobile) or off.
- **D-LOC-6 Load targets** (M0 S4, re-run in M3).

  | Trackers × sockets | Tick |
  | --- | --- |
  | 200 × 200 | 5 s |
  | 500 × 500 | 10 s |
  | 1,024 × 500 | 15 s |
  - Pass: p99 delivery under 1 s after flush; DO CPU under 50%; no time ineligible for hibernation; client downstream at most 11 KB/s for 200 trackers on full; measured cost per tracked room-hour.
  - If the largest size fails, the v1 tracker cap drops to the largest size that passes.
- **D-LOC-7 Background honesty.**
  - Tracking runs in a dedicated worker, woken by relay frames and by UserHub tick frames when a gap is detected.
  - A 'tracking degraded' marker, a "gap detected: which signature?" prompt, and PWA install recommended.
  - **Tracking stops when no client is open**, and the UI says so. Always-on options: a bot, Tauri, or the Standard tracker.
  - Truth check 1 (hidden-tab polling) decides whether the bot device moves into P2.
- **D-LOC-8 Personal datasets.**
  - Fetched per (character, part), with the ETag kept inside the ciphertext. Large blobs use Padmé padding, and non-urgent writes are jittered by 0-10 min.
  - The current **ESI dataset registry and freshness gates** (about 520 source lines and 1,510 test lines) port as the scheduler's freshness config, together with their gate tests.
- **D-LOC-9 Lookups.** No LGI proxies. The browser calls ESI directly for names, structure search, structure info, market history and route. 403-prone lookups get a negative cache.
- **D-LOC-10 Tracking limits.**
  - Viewers may track by default, as today.
  - Each account may track at most 32 characters per map, enforced by the DO; a map tracks at most 1,024.
  - A coverage view in the core shows which of your characters are live.

---

## 11. Bot principal

- **D-BOT-1 Identity.**
  - Principal kind 'bot', with its own CIK, CEK, DSKs and vault.
  - Enrolled by a membership commit signed by an Owner or Manager (maps) or a Director (CorpSpace), plus a KT bot-bind record anchored by that sponsor.
  - Badge: "Bot sponsored by \<character>".
- **D-BOT-2 Capabilities** (each must be granted):
  - **alerts:** the webhook secret is sealed in the bot's vault, and a DO lease dedupes alerts;
  - **admission:** only under auto-admit policy or pre-authorised invites;
  - **maintenance:** compaction, attestations and rotations; it needs the Manager role to sign canonical snapshots;
  - **corp agent:** a Director-delegated PKCE grant, run in the Director's browser and sealed to the bot;
  - **local read API.**
- **D-BOT-3 Tracking.**
  - Each consenting character runs a **separate** PKCE grant in their own browser, with only the location, ship and online scopes. It is sealed to CEK\_bot, and DSK\_bot,c is certified by CIK\_c.
  - It is never the character-vault token. The bot holds the poller lease exclusively.
  - The user can revoke it, and revoking the app at CCP may kill all of the app's tokens for that character (stated).
  - If M0 shows only one token family per (character, client\_id), the fallback is a dedicated "LGI Tracker" client\_id with those three scopes, used exclusively, after asking CCP (OQ-10).
- **D-BOT-4 Updates.**
  - A reproducible OCI image pinned by digest, whose manifest is Sigsum-logged.
  - The bot verifies inclusion and witness cosignatures before applying an update. A cooldown the corp chooses (default 72 h) or manual approval applies, and an unlogged build is never applied.
- **D-BOT-5 Rotation and removal triggers.** The sponsor loses the role or leaves; an Owner or Manager removes the bot; an update fails verification; 30-day key rotation.

---

## 12. ESI scope table (D-SCOPE)

| # | Scope | App | Route | Feature | Requested when (tier) | Rate group per 15 min |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | none (publicData only if M0 needs it to get a refresh token) | Identity | JWT only | login, binding, re-attest | always | n/a |
| 2 | esi-location.read\_location.v1 | Data | /characters/{id}/location | tracking, auto-mapping | first "track" (mapper) | char-location 1,200 |
| 3 | esi-location.read\_ship\_type.v1 | Data | /ship | mass accounting, presence | mapper | char-location |
| 4 | esi-location.read\_online.v1 | Data | /online | presence, poll gating | mapper | char-location |
| 5 | esi-ui.write\_waypoint.v1 | Data | /ui/autopilot/waypoint | destination, multi-character waypoints | first use (mapper) | ui 900 |
| 6 | esi-search.search\_structures.v1 | Data | /characters/{id}/search | structure search; ACL typeahead (replaces /api/maps/search-characters) | first search | error limit only |
| 7 | esi-universe.read\_structures.v1 | Data | /universe/structures/{id} | player-structure names, 403 negative cache | personal | error limit only |
| 8 | esi-clones.read\_clones.v1 | Data | /clones | sheet (jump clones, home) | personal | char-location |
| 9 | esi-clones.read\_implants.v1 | Data | /implants | sheet, net worth | personal | char-detail 600 |
| 10 | esi-skills.read\_skills.v1 | Data | /skills | industry factors, sheet | personal | char-detail |
| 11 | esi-skills.read\_skillqueue.v1 | Data | /skillqueue | sheet, board | personal | char-detail |
| 12 | esi-assets.read\_assets.v1 | Data | /characters/{id}/assets (+names) | assets, net worth, planner | personal | char-asset 1,800 |
| 13 | esi-wallet.read\_character\_wallet.v1 | Data | /wallet | net worth | optional toggle | char-wallet 150 |
| 14 | esi-markets.read\_character\_orders.v1 | Data | /orders | net worth (orders, escrow), sheet | optional toggle | per spec |
| 15 | esi-industry.read\_character\_jobs.v1 | Data | /industry/jobs | jobs, slots | personal | char-industry 600 |
| 16 | esi-characters.read\_blueprints.v1 | Data | /blueprints | owned blueprints | personal | per spec |
| 17 | esi-characters.read\_corporation\_roles.v1 | Data | /characters/{id}/roles | detect own roles | enabling corp | char-detail |
| 18 | **esi-corporations.read\_corporation\_membership.v1 (new)** | Data | /corporations/{id}/roles, /members | grant engine: every member's tiered roles | Directors (verify role and route in M0) | per spec |
| 19 | esi-corporations.track\_members.v1 | Data | /membertracking | member bases | Director | per spec |
| 20 | esi-corporations.read\_divisions.v1 | Data | /divisions | division names | Director | per spec |
| 21 | esi-assets.read\_corporation\_assets.v1 | Data | /corporations/{id}/assets (+names) | holdings, placement | Director | corp-asset 1,800 |
| 22 | esi-corporations.read\_structures.v1 | Data | /corporations/{id}/structures | structures, rigs, tax | Station\_Manager | corp-structure 300 |
| 23 | esi-industry.read\_corporation\_jobs.v1 | Data | /corporations/{id}/industry/jobs | corp jobs bucket | Factory\_Manager | corp-industry 600 |
| 24 | esi-corporations.read\_blueprints.v1 | Data | /corporations/{id}/blueprints | corp blueprints | Director | per spec |
| 25 | esi-access.read\_lists.v1 | Data | /characters/{id}/access-lists | Access List principals (deferred) | list managers, when shipped | char-access 600 |

- **Registration.** All 24 Data scopes are registered on the Data app in M0 S2; the Identity app has none.
- **S2 tests:**
  - whether incrementally requesting a pre-registered scope keeps earlier tokens valid;
  - whether several token families can coexist per (character, client\_id);
  - whether a zero-scope app gets a refresh token.
- **Public, no scope:** POST /characters/affiliation, /universe/names and /ids, POST /route, /characters/{id} (bio), /corporations/{id} (HQ, description), system\_jumps and system\_kills, market data.
- **Never requested:** mail, contacts, or any write scope other than waypoint.
- The bot tracking grant uses rows 2-4 only.

---

## 13. In-game Access Lists (D-ACL-1: deferred, design fixed)

- **Not in v1 or GA.** The scope is registered in M0 and never requested until the feature ships. Revisit when 2 or more beta corps ask (OD-9).
- **Design.**
  - A list manager's client or the bot reads the list every 300-3,600 s and appends a signed 'acl.sync' commit {listId, expanded character, corp and alliance IDs, fetchedAt, managerCharId}.
  - The server mirrors the expansion into the ACL mirror; this is disclosed metadata.
  - If the list is more than 24 h stale, members derived from it are suspended, not removed.
  - Admitting clients rely on the manager's signed snapshot. This is member-side trust, never server-side.

---

## 14. Corp spaces

- **D-CORP-1 Scope.** Part of v1, and it gates GA and cutover (OD-2). The DR-SCOPE list is amended to match.
- **D-CORP-2 Authority.**
  - A Director's client, or a corp agent bot holding a Director-signed delegation, pulls under a CorpSpace fetch lease (one pull per cache window):
    - /corporations/{id}/roles (scope row 18), membertracking, public HQ, divisions, assets and names, and blueprints;
    - structures (Station\_Manager) and jobs (Factory\_Manager).
- **D-CORP-3 Computation.** The ported placement/buildHoldingIndex and compileCorpGrant/canSeeHolding run locally, with the 378-line corp-visibility suite as the spec.
- **D-CORP-4 Keys.**
  - Bucket keys are wrapped to access-class keys, and class keys to members. Manifests are padded to one corp-wide size, and bucket writes are signed with the bucket signing key.
  - A member's first key needs a KT-verified, non-reset, attested binding, with affiliation verified at CCP by the granting client. Resets need a Director's approval.
- **D-CORP-5 Rotation.** A departure, a role or base change, or turning sharing off makes the next pull mint fresh class keys. Turning sharing off is a crypto-shred.
- **D-CORP-6 Audit.**
  - Signed CorpSpace commits, visible to members, record sharing on/off, key minting, Directors being added or removed, and re-genesis.
  - The server keeps a metadata-only log for 90 days. This replaces corp\_access\_audit and its 400-day plaintext retention.
- **D-CORP-7 Succession.**
  - A new Director is added when another key-holding Director verifies the role through /corporations/{id}/roles.
  - Authored records (rigs, tax) are mirrored to every Director.
  - Warnings when only one Director holds keys, or when grants are more than 6 h old.
- **D-CORP-8 Re-genesis.**
  - If no key-holding Director has been seen for 14 days, any Director (whose client checked its own roles) may propose a new genesis. Members accept it only if one of these holds:
    - (a) a key-holding Director co-signs;
    - (b) a fingerprint appears in the **public corporation description**, which only the CEO and Directors can edit (verified in M0), and each member's browser reads it from ESI. This is a CCP-anchored channel.
    - (c) each member confirms manually after an out-of-band check.
  - Old buckets are re-pulled from ESI. Invites and guest links bound to the old genesis die.
- **D-CORP-9 Deletion.** Account deletion is blocked while the user is the last key-holding Director without a handover; the user is warned first.
- **D-CORP-10 Honesty and performance.** Grants advance only while a Director, role-holder or agent is online. Large pulls are desktop or agent only, decrypted in a worker with columnar encoding.

---

## 15. Standard tier

- **D-STD-1 Hard rules.** D-TRUST-2 governs. The rule "the server never starts a key grant" is scoped to Sealed.
- **D-STD-2 Escrow custody.**
  - Each group has its own X25519 escrow keypair. The private half is wrapped under **that month's AWS KMS key** and stored only in the Steward's store (separate Neon project, history 0).
  - A monthly job re-wraps live escrow keys to the new month's key.
  - Each month key is scheduled for deletion once its month has ended and the longest backup window (30 days) has passed, with the 7-day KMS waiting period.
  - Published claim: "Standard escrow is unrecoverable within about 70 days of group deletion."
- **D-STD-3 Steward powers.**
  - It rotates Standard groups, computing recipients from the signed log like any other rotator.
  - **Recovery:** any Manager+ may re-approve a recovered member immediately. Otherwise the Steward re-wraps the member's new CEK after 72 h, unless an Owner or Manager vetoes.
  - Every escrow open produces a receipt in the group's audit.
- **D-STD-4 Never escrowed.** Personal vault, character vaults, net worth, EVE tokens and keyrings. **Correction:** nightly exact net-worth revaluation is not a Standard feature (DR-NETWORTH amended).
- **D-STD-5 Conveniences.**
  - **Server tracker:** a separate delegated grant limited to location scopes, sharded DO loops of 100-500 characters. It publishes only into Standard maps and self-declares in every map the character belongs to.
  - Offline sweeps, compaction and Discord for Standard maps.
  - A hosted corp agent for Standard CorpSpaces.
- **D-STD-6 Standard leaking into Sealed.**
  - A Sealed map's badge counts **every member who is active in any Standard map**: "N members also appear in LGI-readable maps".
  - Sealed policy can forbid cross-tier tracking. It is enforced by honest clients, counted by the server, and labelled as such.
  - Clients warn before tracking one character in both tiers. DR-C4's "removed by construction" wording is softened.
- **D-STD-7 Conversion.**
  - Standard to Sealed uses a guided new genesis: members are pre-approved, the escrow key is shredded, earlier history is declared LGI-readable, and invites and guest links are re-issued.
  - Sealed to Standard is impossible.
- **D-STD-8 Delivery.**
  - Protocol support lands in M3: the tier field, escrow-slot validation, and a property test that escrow can never join a Sealed genesis.
  - The Steward is M7, after GA, committed but cancellable (OD-4).

---

## 16. Lifecycles

- **D-LIFE-1 Room lifecycle (M3).**
  - **Archive:** any Owner, by a signed commit. Writes freeze, members are notified, and an export prompt appears.
  - **Restore:** any Owner, within 30 days.
  - **Purge:** automatic at 30 days. A sole Owner may purge at once. With 2 or more Owners, purge-now needs a second Owner's signature, or a 72 h wait that any Owner can veto.
  - **Purge Workflow:** wraps first (the crypto-shred), then DO deleteAll, then R2 ops and snapshots, then the Neon registry row.
  - Honest clients wipe their caches when they see the purge commit. PITR keeps only undecryptable ciphertext, for up to 30 days. Invites and guest links die.
- **D-LIFE-2 Idle rooms.** A warning after 365 days idle; never auto-deleted.
- **D-LIFE-3 Account deletion.**
  - **Client steps:**
    1. Block if the user is the last key-holding Director or the sole Owner of a shared map without a handover; warn first.
    2. Revoke each character's grants at CCP through /v2/oauth/revoke if public clients may (OQ-1); otherwise deep-link to the authorized-apps page.
    3. Send `signalUnknownCredential` for each passkey where supported.
    4. Show a checklist: destroy the printed kit and the recovery bundles.
  - **Server Workflow** (idempotent, with a reconciliation sweep): unlock wraps, keyring, UserHub deleteAll, character vaults, R2 blobs, Neon rows, KT tombstones, system revokes staggered over 0-24 h, socket closes.
  - Authored ops in shared maps stay with the remaining members, and this is stated.
- **D-LIFE-4 Merge.**
  - Client-mediated, with both keyrings unlocked. Per-character key sets move.
  - The old account's device certificates are revoked in each moved character's sigchain.
  - If the old account has devices not under control, a "compromise merge" runs instead: rotate CIK and CEK for the moved characters and set rotationPending.
  - The old account is then deleted under D-LIFE-3.
- **D-LIFE-5 Transfer, sale and biomass.**
  - **Owner-hash change** (seen at re-attest, or prompted by invalid\_grant): the binding is revoked in KT, the character vault is shredded, system revokes go to every group, and the user is told to revoke at CCP. The buyer binds fresh, which shows as a reset and stays contestable for 7 days.
  - **Biomass** (affiliation corp 1000001 Doomheim, or character not found): removal plus a tombstone.
  - **Unlink:** the same as transfer, without alarms.
- **D-LIFE-6 Migration.**
  - M1: hardening, the export route, datasets, and **export of production sites content**.
  - Imports happen client-side, using the role table in D-MEM-OWN. Grants become genesis principals, and pre-authorised invites carry the "no reset after issue" condition.
  - The old app serves corp and industry until GA, then stays read-only for 30 days. After that it revokes CCP grants server-side with its app secrets and destroys its tables and env keys.

---

## 17. Code integrity and CSP

- **D-INT-1 Layers.**
  - L0: isolated static origin and RP ID.
  - L1: SRI plus Integrity-Policy where supported; immutable assets.
  - L2: reproducible build, Sigstore attestation, WEBCAT manifest, Sigsum signing.
  - L3: WEBCAT on staging from M2b, production after GA.
  - L4: service-worker pin plus a Sigsum-proof check of each release. Amber if the log is unreachable, red only on a verified mismatch. Labelled TOFU plus detection; Safari eviction resets the pin.
  - L5: self-host bundle at GA, Tauri in M9.
- **D-INT-2 Final core CSP:** `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' https://images.evetech.net; font-src 'self'; manifest-src 'self'; connect-src 'self' https://api.lgi.tools wss://relay.lgi.tools https://data.lgi.tools https://esi.evetech.net https://login.eveonline.com; worker-src 'self'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types lgi-workers; report-to csp`
  - Fonts (Barlow Condensed, JetBrains Mono, Geist) are self-hosted and subset.
  - **api.eve-scout.com is dropped**; data.lgi.tools mirrors EVE-Scout.
  - Sigsum proofs and witness cosignatures come from data.lgi.tools and are verified against pinned witness keys, so no third-party log origin is needed.
  - The one Trusted Types policy, `lgi-workers`, implements only createScriptURL, over an allowlist of hashed worker assets.
- **D-INT-3 Tests.**
  - Byte-exact headers on every response, including 404s and assets.
  - A PWA install test under production headers.
  - Trusted Types and CSP violations fail e2e. CSP reports go to api.lgi.tools and carry no PII.
- **D-INT-4 Dependency audit (M2a).** No runtime `<style>` injection (sonner dropped), no innerHTML, and worker URLs only through the Trusted Types policy. Player strings and importer files are parsed in a worker.
- **D-INT-5 Release.**
  - Sigsum signing starts 1-of-1 on a hardware key with a break-glass procedure and moves to 2-of-N.
  - The log entry is published before deploy. Only CI can deploy, with an alarm on any unlogged manifest.
  - Dependencies are vendored and minimal, with no install scripts. WEBCAT goes to production only after GA, with a rehearsed rollback.
- **D-INT-6 Self-host.**
  - The static bundle ships in M8 as part of GA, with its own CCP apps and passkeys and QR enrolment.
  - The protocol spec is published before beta.
  - Export is always available, and a shutdown never deletes the only copy.

---

## 18. Public datasets and pipelines (D-DATA)

| Dataset | Source and pipeline | Cadence | Consumers |
| --- | --- | --- | --- |
| Geography (systems, adjacency, gates, stations, security) | SDE through GitHub Actions | On SDE change | core, shell |
| Wormhole codex and effects | SDE plus curation | On change | core, shell |
| Wormhole statics | anoik.is ingest, Pathfinder cross-check, review in ops | On review | core (pinned) |
| Ship mass | SDE dogma subset | On SDE change | reducers (pinned) |
| Universe and type names | SDE | On change | core, shell |
| Blueprint bundles, structure and rig modifiers | SDE | On change | shell /industry/\[id\], core planner |
| Cost indices, adjusted prices | ESI public, Worker cron | Daily | core |
| **Daily price book** (all marketable types, hub prices) | ESI orders with Fuzzwork fallback | Daily, immutable per day, kept 400+ days | net-worth backfill, shell market |
| System jumps and kills | ESI public | Hourly | core activity charts (M4) |
| W-space activity (90 days) | R2Z2 aggregate | Daily | core |
| Kill feed chunks | R2Z2 Worker cron (1 min), 15-60 s chunks | Continuous, kept 7 days | core (filtered locally) |
| EVE-Scout Thera/Turnur mirror | EVE-Scout public API | 5 min | core routes |
| **Sites catalogue and Sleeper NPC stats** | Exported from production in M1 (drizzle/0006 seed plus production edits), then edited in ops | On edit | shell /sites, core intel panel |
| ESI status | ESI /meta/status | 5 min | core banner |
| KT STHs, Sigsum proofs, JWKS snapshots, release manifests | KeyDirectory, watch, CI | 2 min / 10 min / on change | core, watch |
| Signed dataset manifest | Pipeline | Every publish | everyone |

The shell reads only these datasets: no Neon, no per-user calls. seedUnpricedTypes is deleted, and the price sweep covers every marketable type.

---

## 19. Route map (D-ROUTE): all 28 pages and 77 API handlers

| Current page | New home | Data |
| --- | --- | --- |
| / | Shell landing; core `#/board` for the signed-in board | Datasets / vaults |
| /atlas | Core `#/maps/{room}`; shell /atlas marketing page (replaces the guest landing) | MapRoom |
| /changelog, /changelog/\[slug\] | Shell | Markdown |
| /contact, /legal | Shell (legal credits CCP, anoik.is, Pathfinder MIT, Fuzzwork, EVE-Scout) | Static |
| /industry | Shell public landing and search | Datasets |
| /industry/\[id\] | Shell read-only public render, linking to `app.lgi.tools/#/industry/{id}` (the id stays in the fragment) | Blueprint dataset |
| /industry/planner, /industry/jobs | Core only (`#/industry`, `#/industry/jobs`) | Datasets + vaults + CorpSpace |
| /sites, /sites/\[id\] | Shell (with OG images) | Sites dataset |
| /settings/account | Core: devices, passkeys, recovery, sessions, deletion, merge | Control plane + keyring |
| /settings/characters | Core: link and unlink, scopes, reconnect wizard, attestation status | Control plane + vaults |
| /settings/corporations | Core: corp spaces, sharing, Directors, bot | CorpSpace |
| /settings/preferences | Core | Personal vault |
| /preview/cards, /primitives, /widgets | Dev-only build, not deployed | n/a |
| /admin | Ops overview | Metadata |
| /admin/esi | Dropped; becomes ops "ESI status, kill switch, polling config" | Config |
| /admin/health | Ops content-free health metrics | Analytics Engine |
| /admin/queue | Dropped (no esi\_refresh\_jobs) | n/a |
| /admin/search | Ops search-console view for the shell | Google Search Console |
| /admin/statics | Ops dataset publishing (statics review) | Pipeline |
| /admin/traffic | Ops route-template counters | Analytics Engine |
| /admin/users, /admin/users/\[userId\] | Ops metadata-only lookup; no character reassignment with data | Control plane |

Root files (sitemap, robots, opengraph-image, social card) go to the shell.

| API group (count) | Handlers | New home |
| --- | --- | --- |
| account (27) | board, industry-slots, structures, industry-jobs, corp-industry-jobs, corp-structures, active-character (7) | Computed in the core over vaults and CorpSpace |
|  | custom-structures ×5 (parse-fit in a worker; search through browser-direct ESI), industry-profiles ×4, corp-structures/rigs, corp-sharing | Vault docs and signed CorpSpace records |
|  | saved-plans ×4 | Kept as personal vault documents (core) |
|  | characters, characters/unlink, purge-character, delete, sessions/revoke | api bind/unlink, deletion Workflow, revocation push |
| admin (6) | characters/reassign, esi-jobs/retry | Dropped |
|  | characters/unlink, sessions/revoke, role, wh-statics | Ops (system revoke, revocation push, Access groups, dataset publishing) |
| auth (1) | Better Auth catch-all | Dropped; replaced by api /bind, /attest, /session, /webauthn/*, /devices/*, /link/\* |
| cron (8) | refresh-sde | GitHub Actions SDE pipeline |
|  | refresh-prices, refresh-industry-indices, refresh-wh-statics | Data-pipeline Worker crons |
|  | refresh-gsc | Ops Worker cron |
|  | purge-maps | DO alarms plus the purge Workflow |
|  | daily-batch | Public parts move to the pipeline; private parts are dropped |
|  | drain-esi-refresh-jobs | Dropped |
| dev (1) | synthetic-pilot | Dev-only fake SSO and fixtures |
| eve (2) | names, type-names | Dropped; names datasets plus browser-direct /universe/names |
| feedback (1) | feedback | api /feedback with explicit preview, path excluded by default, forwarded to Linear |
| industry (9) | blueprints, stations, systems, cost-indices | Datasets |
|  | owned-assets, owned-blueprints, skill-levels, team-skill-levels, build-location | Computed in the core |
| internal (2) | eve-characters, eve-token | Dropped |
| maps (8) | create, access | api room registry, MapRoom genesis and ACL commits |
|  | delete, restore, purge-now | Room-lifecycle commits and Workflow |
|  | jump, signature-elimination | Client reducers |
|  | search-characters | Browser-direct ESI search and /universe/ids |
| market-history (1) | refresh | Shell: public server fetch. Core: browser-direct ESI. |
| market-prices (1) | refresh | Dropped (daily price book) |
| preferences (1) | preferences | Core personal vault |
| sites (2) | sites, sites/\[id\] | Shell, from the dataset |
| sync-leave (1) | sync-leave | Dropped (socket close) |
| telemetry (1) | telemetry | api /t route-template counters |
| universe (5) | assets, the three assets/\[version\] routes, statics/\[systemId\] | data.lgi.tools datasets; per-system statics dropped |

---

## 20. Mapper parity matrix (D-PARITY)

| Feature (2026 bar or current app) | Decision | When |
| --- | --- | --- |
| Scanner paste, reconcile, delete-missing | rV1 | M3 |
| Identify, type setter, remove/restore with undo | rV1 | M3 |
| Static-slot elimination; static placeholders and claims | rV1 (derived step) | M3 |
| Connection fields incl. CCP lifetime states (<1 h from 2025-09-09; Reliable Lifetime/Expired from 2026-03-18; today's stages are under 1 day, 4 h, 1 h and expired, and the reliable-lifetime state is a new feature, later) | rV1 | M3 |
| Jump-log mass, rolling calculator | rV1 (calculator derived) | M3 |
| Auto-mapping (jump.observe), "which signature?" prompt, inbound K162 | rV1 | M3 |
| Sever, collapse, restore; lazy lifetime expiry plus sweep.lifetime | rV1 | M3 |
| Audit log, revert by character, snapshot rollback (new feature, later; today: 7-day event log, 24 h undo) | rV1 | M3 |
| Chain canvas, layout worker, WebGL, fog, motion, windows, intel panel, glance badges | UI port | M3 |
| Live presence, pilot paths, AFK gate, dock picker, coverage view | M3 | M3 |
| Roles over character and corp; Blocked (alliance grants and grant expiry are new features, later) | M3 | M3 |
| Viewers may track by default (as today) | Policy default | M3 |
| Personal maps, archive/restore/purge, export, LGI importer | M3 | M3 |
| Map caps: today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work | Genesis policy | M3 |
| PWA, mobile foreground; set-waypoint is a new feature, later | M3 | M3 |
| Command palette | Basic local navigation in M3; full search over local data and public indices in M4 | M3/M4 |
| Routes (gates, chain, Thera/Turnur, POST /route), multi-character waypoints | M4 | M4 |
| zKill feed; 24 h system\_jumps/kills charts; 90-day activity | Datasets | M4 |
| Structures as map entities | Signed records, rV2 | M4 |
| D-scan and local-list paste | Encrypted ephemeral intents (1 h TTL), parsed in a worker | M4 |
| System and signature notes | **NEW feature** (not parity; never shipped), rV2 (OD-10) | M4 |
| Guest links (read-only, position-free) | §8 | M4 |
| Discord and webhook alerts | Bot only (Sealed); Steward (Standard) | M4 / M7 |
| Importers: Pathfinder, Wanderer, Tripwire, Nexum, WormholeSystems | Parsed locally into intents | M4 |
| Plaintext API | Bot local read API (M4); local decrypting SDK later | M4 / M9 |
| Multiple reusable named ACLs (Wanderer) | Many principals per map in v1; named reusable lists later | M9 |
| In-game Access List principals | Deferred (§13) | post-GA |
| Bookmark naming templates | Client-only, later | post-GA |
| Non-English scanner paste | Later unless beta asks (the parser is English-only today) | M9 |
| wh\_observations | Dropped | n/a |

---

## 21. Features lost or changed, by tier (D-FEATURES)

| Feature | Sealed | Standard |
| --- | --- | --- |
| Tracking with no client open | Stops. Close to today's 5-min cold-off. Bot (M4), own device, or Tauri (M9). | Server tracker with a separate location-only grant; publishes only into Standard maps (M7) |
| Hidden-tab tracking | Regression risk; M0 S3 go/no-go | Unaffected |
| Auto-mapping while nobody is online | Bot only | Steward |
| Revocation | Instant relay cutoff, rotation in seconds. Affiliation loss rotates at once, with automatic re-admit to the pinned key within 7 days. Removed members keep what they decrypted. | Same, and the Steward rotates when no member is online |
| Paste gate, server validation | Advisory and client-side; reducer rejections, audit and revert | Same |
| Lifetime collapse, purges | Lazy plus client sweeps | Steward sweeps |
| Discord alerts | Bot only | Steward or bot |
| Plaintext REST API | None; bot local API | Steward later |
| Net-worth history | Computed on open, with backfill estimates from the price book. Exact nightly values only with your own always-on device. | **No Standard option** (personal data is never escrowed) |
| Corp grant freshness | Advances only while a Director, role-holder or agent is online (about 1 h lag) | Hosted corp agent |
| Joining a corp map | Strict approval by default (OD-1); auto-admit opt-in | Same |
| Recovery after losing every unlocker | Personal data lost (ESI data re-fetched); maps re-approved as a reset | Manager+ approves now, or Steward re-wraps after 72 h unless vetoed |
| Character sale detection | Today: daily server check. Now: silent re-attest every 14 days, suspension after 21 days. | Same |
| Offline unlock | Needs the network (wraps are server-side) | Same |
| Account-level block | Filters future joins only | Same |
| In-game Access Lists | Deferred | Deferred |
| Admin console | Metadata only; no reassignment with data | Plus escrow audit |
| Support | Locally redacted diagnostics bundle | Escrow-assisted only with Owner consent |
| Guest links | M4, position-free projection | Same |
| Audit and undo | 30-day signed log, revert, rollback | Same |
| Telemetry, feedback | Route templates; explicit feedback | Same |
| Multi-character privacy | Per-character identities; residual timing correlation disclosed | Same |
| Map size | today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work | Same |
| Map lifecycle | Archive, 30-day restore, purge with a second-Owner check | Same |
| Corp access audit | Signed CorpSpace commits plus a 90-day metadata log | Same |
| Name and structure search | Browser-direct ESI: CCP sees the terms, LGI does not | Same |
| Industry planner | Core only; the shell shows public pages | Same |
| Self-hosted frontend | Static bundle at GA; full stack in M9 | Trusts LGI escrow for that group |
| Browser support | Chrome/Edge 137+, Firefox 130+, Safari/iOS 18.4+ | Same |
| Saved plans, wh\_observations | Dropped | Dropped |
| Map roles | viewer/editor/admin become Viewer/Member/Manager (+Owner) | Same |
| Merge and transfer | Client merge; transfer detected by re-attest | Same |

---

## 22. Operations

- **Ops console.**
  - Metadata only: account lookup, devices, room counts and tiers, freeze or suspend (through system revokes), kill switch, polling config, dataset publishing, search-console metrics, route-template traffic, health metrics.
  - An append-only admin audit.
  - No "view as user" and no reassignment with data.
- **Telemetry.** Workers Analytics Engine route templates. No characterId, no query strings, no visitor id.
- **Health metrics.** Append rejections by code, rotationPending age, fork and divergence reports by client version, unlock failure classes, lease churn, CSP reports.
- **Support.**
  - A diagnostics bundle the user opts into, redacted locally and previewed.
  - A local replay CLI.
  - Linear feedback with a preview; the path is excluded by default.

---

## 23. Metadata budget (published on the disclosure page)

| LGI sees | LGI does not see |
| --- | --- |
| Account-to-characters links, owner hashes (from bind and attest evidence), names (public) | Map content: systems, signatures, connections, names, notes |
| Affiliations; ACL principals (including Access List expansions once that ships) | Positions, ships, routes, d-scan, local |
| Devices, classes, passkey count, AAGUIDs, last-seen; IPs and UAs at the edge (minimal logging, no IP storage in API or relay DBs) | Assets, wallet, orders, skills, jobs, blueprints, net worth |
| KT event timing per character; who looks up whom (room-scoped); re-attest timing and granted scopes (scp claim) | Profiles, custom structures, preferences |
| Room existence, tier, region hint, created and last-activity times, member characters and roles, invite use counts, guest fetch timing | Corp roles, bases, HQ, holdings, structures |
| Op timing (1 s quantized), op kinds, padded sizes, per-account op counts | ESI tokens, search terms, which public dataset items you view |
| Socket presence per account and device; who is tracking (tick participation, not location); UserHub lease activity (hours each character is polled) | Bot alert contents (they go from the bot to Discord) |
| Personal blob update slots (jittered), corp bucket counts and pull times, uniform manifest sizes |  |

- **Third parties.** CCP sees ESI calls, including POST /route connections, search terms and portrait fetches. Cloudflare and Vercel see edge logs. Discord sees the plaintext of bot alerts.
- **Mitigations.** Padding, quantization, cover-traffic ticks, random room IDs, per-room sender slots, jitter on non-urgent KT and sigchain events, staggered wizards, room-scoped lookups, and no blind indexes on low-entropy IDs.
- **Not yet (v2).** Privacy Pass or unlinkable relay tokens, sealed sender, VRF-indexed KT.

---

## 24. Cost table: the single source (D-COST)

Assumptions:

- Inputs: 30% DAU; about 2,250 concurrent trackers at 10k MAU; hibernation-eligible DOs; 1 KiB padded ops.
- Cost scales with concurrent trackers and op traffic, not with MAU.
- M0 S4 and the M1 counters replace these estimates with measurements.

| Line item | 1k MAU / month | 10k MAU / month | Notes |
| --- | --- | --- | --- |
| Workers Paid base | $5 | $5 | Includes 10M Worker requests, 1M DO requests, 400k GB-s, 50M rows written, 5 GB DO storage |
| Relay requests and messages (ops, location frames at 20:1, capability re-presentation) | $0-2 | $5-15 | No per-tick alarms |
| DO duration | $0 | $0-5 | Handler time only; requires no timers, accept() or outgoing sockets |
| DO storage | $0 | $0-10 | Research: 50 GB is about $9 |
| R2 (snapshots, 30-day ops, kill feed, datasets, STHs) | $0-2 | $2-8 | Free egress |
| Neon (control plane plus key-wrap project) | $5-20 | $20-45 | Launch; 0.25-1 CU; KT is not on Neon |
| Vercel shell | $0-20 | $0-20 | Pro if ads make the site commercial |
| **Steady-state total, Sealed v1** | **$10-50** | **$32-110** |  |
| Contingency: hibernation defeated by a bug | +$15 | +$200 | Billing alarms on every vendor |
| Standard (M7) | +$5-10 base (KMS keys, Steward); server tracker $0.01-0.05 per character-month sharded (about $0.8 unsharded) | same | Only if built |
| *Path B comparison: Convex* | $25-70 | **$230-1,050** | Research figure |
| *Path relay-node comparison: Fly plus Neon* | $30-90 | $55-115 |  |
| One-off | External design review about $15-30k (M4); implementation review about $25-60k (M8); device lab about $1-2k of hardware; macOS CI $0 on a public repo's standard runners |  | Get quotes (OD-6) |

**Path B verdict, corrected.**

- At $230-1,050/month, Convex is 2-10x the DO path.
- The deciding difference is not account-JWT metadata, since A also authenticates every call by account. It is that the DO path can move to capability or Privacy Pass tokens and carry cover frames almost free, while Convex bills every call.

---

## 25. Serial solo-developer timeline (D-PLAN)

| Milestone | Weeks | Cumulative | Month at end | Scope | Exit |
| --- | --- | --- | --- | --- | --- |
| M0 Truth spikes | 5-6 | 5-6 | 1.2-1.4 | See the spike list below | Written go/no-go per spike; harness green in 3 engines and 3 locales |
| M1 Current-app hardening and bridges | 3-4 | 8-10 | 1.8-2.3 | Remove plaintext Convex access tokens; revocable short JWTs; AAD and key ids; telemetry fixes, Speed Insights removed; export route; R2 dataset pipeline with signed manifest; global price sweep; **sites-catalogue export**; content-free traffic counters | `pnpm verify` green; export round-trips; datasets consumed |
| M2a Crypto, identity, sessions | 6-8 | 14-18 | 3.2-4.2 | New repo and gates; @lgi/crypto (envelopes, HPKE base and PSK, CBOR label registry); protocol spec v0; /bind; devices (DAK/DUK); sessions, capabilities, revocation push; passkeys (CUK); unlock UX and high-security mode; capability probe, in-app nudge; recovery key and kit; CSP, Trusted Types, dependency audit | Zero-, one-tap and fallback unlock e2e incl. storage-wipe ceremony count; vectors pass in 4 engines |
| M2b KT, recovery, release integrity | 5-7 | 19-25 | 4.4-5.8 | KeyDirectory (STH 2 min, promises, Sigsum 10 min, room-scoped lookups, tombstones, re-attest); JWKS archive and watch Action; self-monitoring; QR link; tidy and compromise revoke, fork rule; ARS rotation; recovery delay; recovery bundle; reproducible build, Sigstore, Sigsum signing, WEBCAT staging; **ProVerif/Tamarin models: link, recovery, compromise** | Injected substitution, stale head and split view detected; models pass |
| M3 Sealed mapper alpha | 11-14 | 30-39 | **6.9-9.0 (alpha)** | Full reducer replay corpus at 100% (moved from M0); engine-map rV1; MapRoom (atomic removal unit, CAS rotation with lease, confirm tags, log-derived recipients); snapshots and retention; invites (ISK), strict approval with bulk approve, no-link join; **character vaults, token custody, leases, reconnect wizard (moved from M5)**; ESI scheduler, location batching, jump.observe; room lifecycle; personal maps; UI port; LGI importer; **models: join and rotate** | One corp dogfoods for 2 weeks with no divergence alarm; simulator green under fault injection; rotation resolves within 60 s; fan-out targets met |
| M4 Beta, design review, bot | 5-7 | 35-46 | **8.1-10.6 (beta)** | External design review (runs in parallel on the calendar); bot principal; 5 importers; routes, R2Z2, activity datasets; guest links; notes, d-scan/local, structures (rV2); command palette; ops console; diagnostics; disclosure page | Findings resolved or accepted in writing; 3-5 beta corps incl. one current self-hoster; interviews done |
| M5 Personal vault and industry | 6-8 | 41-54 | 9.5-12.5 | Vault docs; per-character datasets; board; net worth with backfill; industry overlays; local names and structure search; registry and freshness gates | Planner and board parity; no per-ID requests to LGI in the network log |
| M6 Corp spaces | 8-10 | 49-64 | 11.3-14.8 | §14 in full | Golden visibility tests match; revocation within one cache window; desktop budget met |
| M8 Integrity, implementation review, cutover | 6-8 | 55-72 | **12.7-16.6 (GA)** | Service-worker pin; Sigsum hardware key; self-host bundle; implementation review; migration tooling | Review closed; at least 90% of active maps migrated or explicitly abandoned |
| Post-GA overlap | 13 (calendar) | n/a | about 16-20 | Old app read-only, then CCP revoke and destruction of tables and keys | Env keys destroyed |
| M7 Standard (committed, cancellable) | 6-8 | 61-80 | 14-18.5 | §15 | Escrow never accepted on a Sealed genesis (property test); every open receipted |
| M9 Later tracks | ongoing |  |  | Alliance keys, relay-node, Tauri, X-Wing, Privacy Pass, VRF KT, enclave research | Each track justified by demand or a platform change |

**M0 spikes.**

- **S1** A thin replay harness (MapStateRepo plus 3 scenarios) and a prototype of the determinism lint. The full replay moved to M3.
- **S2** SSO and ESI truths: token rotation and grace; idle expiry; public-client revoke; multiple callbacks; scope-change invalidation; incremental scopes; **multiple token families**; refresh for zero-scope apps; **ownerHash per character**; bio and **corp-description** exposure, CORS and edit rights; the requirements of /corporations/{id}/roles; CORS on affiliation; Doomheim detection; X-User-Agent.
- **S3** Hidden-tab polling: Windows Chrome and Edge with EVE fullscreen, Firefox, macOS Safari.
- **S4** DO latency (EU, US, AU); billing with hibernation eligibility; deploy resume; 1k-member wraps; 50-200 appenders; **the fan-out targets in D-LOC-6**; revocation push latency.
- **S5** PRF device matrix; ceremony counts; re-enrolment after a compromise.
- **S6** Cross-engine vectors.
- **S7** Largest-corp fixture on a mid-range phone; dataset sizes.
- **S8** Sigsum rate limits and witness availability.
- **S9** Cloudflare ticket: PITR after deleteAll, log minimisation.

These ranges have **no slack** and assume no old-app firefighting. A 15% buffer moves GA to month 15-19.

---

## 26. Testing and assurance (D-TEST)

- **Crypto vectors** in Chromium, Firefox, WebKit and real Safari:
  - cross-implementation HPKE (base and PSK);
  - strict Ed25519 verification (noble);
  - Wycheproof-style cases, including X25519 low-order points;
  - pkcs8 seed import, and no JWK on Safari before 26;
  - comparison by verification only, because Safari's Ed25519 signatures are randomized.
- **Protocol models, written before the M4 external review** (M2b-M3, then reviewed by the external reviewer):
  - ProVerif for secrecy and authentication: join with ISK; rotation with confirm tags and log-derived recipients; the device-link PSK channel; recovery.
  - Tamarin for the state machine: compromise revoke against a thief and a colluding server; the veto and cooldown matrix; the sigchain fork rule; KT split view with Sigsum.
  - Properties: forged wraps rejected; stale sigchain heads refused; no veto deadlock; split view detected; the server cannot start a grant.
- **Lifecycle tests.** Model-based fast-check tests of the key lifecycle (enrol, link, tidy, compromise, recovery, ARS rotation) with an adversarial server and a thief.
- **Deterministic simulator.**
  - N clients plus Miniflare DOs, with disconnects, clock skew, lease expiry, deploy resume, partitions and duplicate delivery.
  - Malicious-relay behaviours: forged wraps, injected recipients, withheld commits, stale heads, forked chains.
  - Malicious-member behaviours: garbage wraps, forged snapshots, alt attestations.
  - Checks: stateHash convergence and invariants (one static claimant, no duplicate connections, caps enforced, no mass double-count).
- **Reducer replay corpus.** About 9.4k lines of tests at 100% in M3, with divergences documented, across 3 engines and the et-EE, sv-SE and tr-TR locales.
- **DO tests.**
  - transactionSync floods with injected delays; the atomic removal unit; CAS rotation races.
  - The hibernation-eligibility lint plus a billing check; fan-out load tests.
- **Passkeys.** CDP virtual authenticator, including wipe-storage ceremony counts. A manual PRF device-matrix checklist gates every release that touches unlock.
- **CSP.** Byte-exact headers including 404s; PWA install test; Trusted Types violations fail e2e.
- **Test unlock.** Injected only through runtime config that release builds refuse, enforced by a build assertion and a Fallow boundary.
- **Gates.** `pnpm check` before every commit and `pnpm verify` before promote or release. Zero suppressions, and no raised thresholds.
- **External reviews.** A design review gates beta (M4); an implementation review gates GA (M8).

---

## 27. Owner decisions (recommended defaults are binding until changed)

| ID | Decision | Recommended default | Alternative and its cost |
| --- | --- | --- | --- |
| OD-1 | Default join policy | **Strict approval** with bulk approve and bot pre-verification; auto-admit opt-in | Auto-admit default: faster mid-op joins; accepts first-login TOFU races |
| OD-2 | Do corp spaces gate GA? | **Yes**: old keys can be destroyed at cutover | GA at about month 11-14 without corp; the old corp path keeps running (labelled "legacy, LGI-readable") until a dated sunset |
| OD-3 | History-key policy | **Manager+ only**; never guests | members-present, or none |
| OD-4 | Standard tier | **Committed post-GA (M7)**; protocol support from M3; cancellable after interviews | Build only on demand, against the brief; or pull before GA (+6-8 weeks) |
| OD-5 | Recovery delay | **48 h**; skipped if a passkey or trusted device approves | 0-7 days per account |
| OD-6 | External review budget | **Fund both** (about $40-90k) | Design review only, with GA labelled "unaudited implementation" |
| OD-7 | Re-attestation | **14 days plus 7 days grace** | 30 days (slower sale detection) |
| OD-8 | Auto-re-admit after suspension | **7 days**, pinned key only | 0 (always re-approve) |
| OD-9 | Access List principals | **Defer**; register the scope now | Ship in M6 (+2-3 weeks) |
| OD-10 | Notes | **New feature in M4** | Drop |
| OD-11 | Repo visibility | **Public from day one** (needed for public-good Sigstore and free macOS runners) | Private: needs GitHub Enterprise Cloud for attestation |
| OD-12 | High-security mode | **Strongly prompted** for shared-map Owners, Managers and Directors | Enforced |
| OD-13 | Location tick | **5 s, adaptive** to 10/15 s | 10 s fixed (lower load, coarser) |
| OD-14 | Old-app overlap | **Feature freeze now; read-only for 90 days after GA** | Longer overlap |
| OD-15 | Second Sigsum key holder | **Recruit before GA** | Stay 1-of-1 with break-glass |
| OD-16 | Personal maps with a single Owner | **Allowed** | Require 2 Owners |
| OD-17 | Recovery secret | **Mandatory within 24 h** (RK, or a generated passphrase) | Optional, risking sealed data loss |

---

## 28. Open questions and how to resolve them

| ID | Question | How to resolve | Blocks |
| --- | --- | --- | --- |
| OQ-1 | SSO token rotation and grace, idle expiry, public-client revoke, scope-change invalidation, incremental scopes, multiple families, zero-scope refresh | M0 S2 plus a written query to CCP | Custody, bot and Standard tracker, re-attest method, deletion revoke |
| OQ-2 | Hidden-tab polling under EVE fullscreen | M0 S3 on real hardware | Tracking promise |
| OQ-3 | Do corps accept client-open tracking, bot-only alerts and strict approval? | Interviews with 5+ corps before M4 ends | OD-1, OD-4 |
| OQ-4 | Character bio and corp description exposed by ESI, readable over CORS, and editable by whom? | M0 S2 | Verified-in-game badge, corp re-genesis |
| OQ-5 | Is ownerHash per character? | M0 S2 | Who may open evidence. If it is per account, evidence opens only to the owner and the first approver, and the residual risk is disclosed. |
| OQ-6 | Sigsum rate limits and witness latency | M0 S8 | KT cadence |
| OQ-7 | DO PITR after deleteAll; log minimisation | Cloudflare ticket (M0 S9) | Deletion claims |
| OQ-8 | Real traffic: clients per map, ops per minute, trackers per user, platform mix | M1 counters plus the Convex dashboard | Costs, tick defaults |
| OQ-9 | Dataset sizes on mobile | M0 S7 / M1 | Asset budgets |
| OQ-10 | CCP's view of a browser-first product, multiple token families, and a tracker client\_id | Written query before beta | D-BOT-3, Standard tracker |
| OQ-11 | Who does the external reviews, and at what cost? | 2-3 quotes during M2a | Beta and GA gates |
| OQ-12 | A second key holder; a community JWKS/KT mirror | Recruit before M8 | 2-of-N signing, independent witness |
| OQ-13 | Demand for full self-host | Interviews | M9 priority |
| OQ-14 | Exact role and scope for /corporations/{id}/roles | M0 S2 | D-CORP-2 |
| OQ-15 | Can the old app stay frozen for 12-18 months? | Owner, based on maintenance load | Overlap |
| OQ-16 | Location lag and bandwidth on mobile | M0 S4 plus beta | OD-13 |
| OQ-17 | Does Safari's persist() exempt an origin from ITP eviction? | M0 S5 matrix | Trusted-device durability messaging |
| OQ-18 | Several callback URLs per CCP app? | M0 S2 | How many apps to register (staging, self-host) |

(Discord alerts come only from the bot, so browser CORS to Discord does not matter.)

---
