# Part 20: User-authored documents: profiles, custom structures and preferences

**Status:** Draft for owner review

## In one paragraph

Users write three kinds of document that LGI stores but no server needs to understand: production profiles, custom structures and the favourite-blueprints list. This part seals them in the browser under the account's user key (Part 09) and has LGI store the blobs. The browser holds the user key all session and is the only normal reader. Fit parsing moves into the browser. The server's hull, rig and system existence checks are dropped, because a bad document hurts only its author. LGI keeps checks on readable rows: sign-in, caps, envelope header and size. Writes stay last-writer-wins. Other preference keys stay readable. Unused `saved_plans` code is deleted. Users see nothing new.

## How it works today

- **Custom structures.** `custom_structures` holds `name`, `structure_type_id`, `rig_type_ids`, `system_id`, `tax_pct` and `bonuses` in plaintext, plus `id`, `user_id` and `created_at`. Updates are a plain last-writer-wins update. Create and update run `rejectInvalidCustomStructure`, which checks hull and rigs against SDE lists (`validateCustomStructureSelection`) and that a pinned system exists (`solarSystemExists`). These checks run only on the server. The browser runs only `payloadFromDraft` (name, hull present, tax and bonus ranges) and limits rig choices in the composer. Reads apply no checks: `listCustomStructures` returns rows as stored. Create makes the UUID on the server and caps 50 per user with a non-atomic count then insert. Every write returns the full list.
- **Fit parsing.** `StructureComposer` posts pasted fit text to `…/custom-structures/parse-fit`, which runs the pure `parseStructureFit` against names from `getStructureTypes()` and `getStructureRigs()`. The composer already receives both lists as props.
- **Structure search.** As the user types a name, `useStructureSearch` calls `…/custom-structures/search`. On Vercel, `searchUpwellStructures` fetches each linked character's EVE access token and returns up to 8 dockable structures (name, system, hull). The typed name reaches Vercel in plaintext.
- **Server readers.** `CustomStructuresContent.tsx` passes `listCustomStructures` output to `StructuresManager`. `GET /api/account/structures` loads custom and corp structures, `getStructureTypes()`, `getCapitalShipyardHullIds()`, `getProductionModifiers()` for the named hulls and rigs, and `getIndustryTargetFilterSets()`, then runs `buildAvailableStructures`.
- **Production profiles.** `industry_profiles` stores `name` and a JSONB `document` (members, facilities; `v: 2`) beside readable `revision`, timestamps and `deleted_at`. Create is a serializable insert capped at 20 live profiles. Update is a compare-and-swap on `revision` (`409 stale_revision`). Create and update reject unlinked members. Duplicate copies the document on the server. Writes return the full list. `readStoredDocument` turns any invalid or `v: 1` document into an empty profile.
- **Preferences.** `user_preferences` is `(user_id, key) → jsonb value`. `/api/preferences` validates with `validatePreferenceValue` and upserts. `PreferencesProvider` merges server values with a `localStorage` mirror, seeds missing keys, sends fire-and-forget PUTs with no revision, and toasts "Save failed" on error. `usePreference` falls back to the default when a value fails its schema. `industry.favoriteBlueprints` holds up to 24 `{typeId, name}` pairs. Other keys are UI toggles, a profile ID and own-character IDs.
- **Saved plans.** `saved_plans` has list, create, delete, favourite and rename routes. No UI calls them.
- **Lifecycle.** Merge rekeys structures and profiles to the survivor; preferences are survivor-wins by key. Purge deletes all three.

Files: `src/features/custom-structures/` (`schema`, `save-boundary`, `validation`, `structure-draft`, `queries`, `purge`, `use-structure-search`, `api-contract`, `components/StructureComposer.tsx`), `src/app/api/account/custom-structures/` (including `search/` and `parse-fit/`), `src/composition/structure-search.ts`, `src/app/(site)/industry/CustomStructuresContent.tsx`, `src/app/api/account/structures/route.ts`, `src/features/industry-planner/` (`schema`, `purge`, `saved-plans-queries`, `template-snapshot`, `api-contract`, `available-structures`, `structure-fit-parse`, `profiles/`), `src/app/api/account/industry-profiles/`, `src/app/api/account/saved-plans/`, `src/composition/purge/register-all.ts`, `src/data/telemetry/capability.ts`, `src/data/preferences/`, `src/lib/preferences.ts`, `src/app/api/preferences/route.ts`, `src/components/PreferencesProvider.tsx`.

## What changes

Nothing visible changes for users. Behind the same pages, the browser seals before saving and opens after loading. Fit parsing and profile duplication move into the browser. Structure search becomes a sealed request (Part 21). Saved-plans code is deleted.

## Design

**Save checks.** The hull, rig and system existence checks are dropped, not moved. `payloadFromDraft` and the composer's rig filter stay exactly as today and already produce every error users see now. Placement options:

| | Drop checks (default) | Keep in browser | Sealed service |
|---|---|---|---|
| New code | None | Checks behind the loaded `structureTypes` and `structureRigs` props; skip the system check if the systems index has not loaded | Enclave copy of SDE lists and checks |
| Saves during an enclave outage | Work | Work | Stop |
| Extra latency | None | None | One relayed round trip (Part 07) |
| What bypassing achieves | A broken document for its author only | Same | Nothing |

Principle 3 prefers the sealed service, but the check protects no one: the author is the only reader.

**Storage (shape F from Part 02):**

| Table | Readable columns | Sealed content | Changes |
|---|---|---|---|
| `custom_structures` | `id`, `user_id`, `created_at`, new `updated_at`, `key_id` | `sealed` (bytea): `{name, structureTypeId, rigTypeIds, systemId, taxPct, bonuses}` | Content columns dropped; `name` from `ownedRowIdentityColumns` becomes nullable and stays null. No revision column |
| `industry_profiles` | `id`, `user_id`, `revision`, timestamps, `deleted_at`, `key_id` | `sealed` (bytea): `{name, document}` | `name` and `document` dropped. Existing revision compare-and-swap kept only because it exists today |
| `user_preferences` | All columns; all values except one | `industry.favoriteBlueprints` value stored as `{"sealed":"<base64 envelope>"}` in the existing `value` | No new columns |
| `saved_plans` | — | — | Dropped (see deletion scope) |

The envelope is Seal v2 from `src/lib/seal/`. AAD is (label, table, `userId`, row `id` or preference key, `keyId`), with no version. A version stops no attack on a document only its author reads: the browser learns it from the server, so an operator could serve an older pair anyway. This amends Part 09's binding table.

**Routes after the change:**

| Route | Server does | Browser does |
|---|---|---|
| `POST …/custom-structures` | Same-origin and session; `id` is a UUID and not taken; count below 50 in one capped insert; envelope header and size cap. Returns `{createdId}` | Generates the UUID; `payloadFromDraft`; seals; updates its in-memory list and calls `onSaved` as today |
| `…/custom-structures/update` | Plain update, last-writer-wins as today. Returns `{id}` | Seals; updates its list |
| `…/custom-structures/delete` | Deletes. Returns `{id}` | Removes from its list |
| `…/custom-structures/parse-fit` | Deleted | `parseStructureFit` against the props it has |
| `…/custom-structures/search` | Becomes a sealed request to the workers: term in, up to 8 results sealed to the browser session key (Parts 21, 08) | Opens results |
| `GET …/industry-profiles` | Lists live rows with blobs | Opens each, then `readStoredDocument` as today |
| `POST …/industry-profiles` | Session; UUID; serializable capped insert (20 live). Returns `{id, revision}` | Schema and member check against `useAccountCharacters`; seals |
| `…/industry-profiles/duplicate` | Deleted; duplicates use the create route | Opens the source, seals a copy under a new `id` |
| `…/industry-profiles/update` | Compare-and-swap; `409 stale_revision` as today. Returns `{id, revision}` | Seals; updates its list |
| `…/industry-profiles/delete` | Sets `deleted_at` | Removes from its list |
| `/api/preferences` | Readable keys as today. Favourites: envelope shape and size cap, then upsert as today | Seals and opens favourites; 24-item cap in `useFavoriteBlueprints` as today |

**Readers that move.**

- `StructuresManager` opens the sealed rows in the crypto worker behind its existing loading state.
- The custom half of `GET /api/account/structures` moves to `useAvailableStructures`. `buildAvailableStructures` needs the whole production-modifiers table for structure hulls and rigs (not per-ID lookups, which reveal fits), the target filter sets, the capital-shipyard hull IDs and the structure types. Part 24 ships these as versioned public tables. This is a named principle-3 exception: a saved custom structure must appear in the planner at once, as today (Part 21 Question 2). The alternative is an enclave-built sealed view rebuilt after each custom save. The corp half is Parts 21 and 23.
- Dropping the server `not_linked` check costs nothing: `team-skill-levels` returns skills only for linked characters.

**Saved-plans deletion scope:** `saved_plans` schema with a drop-table migration; `saved-plans-queries.ts`; `template-snapshot.ts`; the saved-plan endpoints in `industry-planner/api-contract.ts`; `src/app/api/account/saved-plans/`; `savedPlansPurgeContributor` in `purge.ts` and `register-all.ts`; capability IDs `create-saved-plan`, `delete-saved-plan`, `rename-saved-plan`, `favorite-saved-plan`, plus `parse-structure-fit` and `duplicate-industry-profile` in `telemetry/capability.ts`; and entries in the idempotency, data-ownership, table-growth and route-coverage test registries.

**Lifecycle.** Purge is unchanged (Part 11). Merge needs the sealed service to re-seal moved rows, and a moved favourites value, under the survivor's user key, because AAD binds `userId` (Part 11). Migration runs in the sealed service and seals stored values as they are, including invalid ones, so they read back as today (Part 31).

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Custom structure identity, count, timestamps | Yes | No | LGI server |
| Custom structure name, hull, rigs, system, tax, bonuses | No | Yes (user key) | Browser |
| Fit text and parsing | Never sent | — | Browser |
| Structure search term and results | No | Sealed request and reply | Sealed service |
| Available structures (custom half) | No | Opened in browser | Browser |
| Profile identity, `revision`, timestamps, `deleted_at`, count | Yes | No | LGI server |
| Profile name and document | No | Yes (user key) | Browser |
| `industry.favoriteBlueprints` | Key, `updated_at` | Value (user key) | Browser |
| Other preference keys | Yes | No | LGI server validates; browser uses |
| `saved_plans` | Dropped | — | — |

## Hard rules

1. [Agreed] Users notice nothing. Same dialogs, limits, errors and toasts. No new prompts or encryption wording (principle 1, decision 2).
2. [Agreed] Profiles and custom structures are content and are sealed (principle 2, decision 9).
3. [Proposed] Favourite blueprints are sealed; other preference keys are metadata and stay readable. Depends on Question 2.
4. [Proposed] Sealed under the user key with Seal v2 and a registered label per item. Opened in the browser for normal use, and in the sealed service only for merge and migration (rule 11). No Vercel, Convex or Neon code accepts or returns their plaintext.
5. [Proposed] AAD is (label, table, `userId`, row id or preference key, `keyId`), without a version. Writes stay last-writer-wins, except the existing profile compare-and-swap.
6. [Proposed] The server checks only session, same-origin, UUID format, caps, envelope header and size, never a body. The envelope `keyId` must name the account's current user-key record.
7. [Proposed] Reads keep today's tolerance: profiles go through `readStoredDocument` (invalid becomes empty); preferences through `usePreference`'s fallback; custom structures get only a wire-shape parse with the `CustomStructureRow` zod shape, no SDE or system check. A failed open logs a code, never content.
8. [Proposed] Row IDs are generated in the browser before sealing. The server rejects IDs already taken.
9. [Proposed] Size caps are computed from the schema worst case (maximum counts × maximum string lengths × 4 bytes per character, plus envelope and base64 overhead), using constants from `profile-document.ts`, the custom-structures `api-contract.ts` and `MAX_FAVORITE_BLUEPRINTS`. Never from measured rows. A test seals a maximal valid document of each type under its cap.
10. [Proposed] No request may carry custom-structure, fit, search-term or favourite contents as plaintext, including per-ID lookups of the rigs or blueprints they name. The structure search route is handled by Part 21.
11. [Proposed] Merge and migration re-seal these rows only inside the sealed service.
12. [Proposed] Write routes return identifiers only; the browser updates its list from its own plaintext.
13. [Proposed] `parse-fit`, the profile `duplicate` route and the saved-plans scope under Design are deleted.
14. [Proposed] A new preference key is readable only if it holds UI state or own-character IDs; anything naming game content is sealed like favourites. Depends on Question 2.

## Assumptions

- **No other server code reads these contents.** Check: grep for dropped columns and run `pnpm check` for zero Fallow findings.
- **Opening the structure list adds no visible delay.** Check: Part 32 timing budget with 50 rows.
- **No `saved_plans` rows matter.** Check: count production rows and route calls in logs.
- **`useAccountCharacters` has the roster before a profile save.** Check: profile dialog tests.
- **The public tables `buildAvailableStructures` needs are small enough to load whole.** Check: count structure hull and rig modifier rows and filter sets (Parts 21, 24).
- **Rough schema worst cases fit comfortably in Neon rows** (about 100 KiB for a profile, 27 KiB base64 for favourites). Check: the rule 9 test.

## What users see

Nothing new. Profiles, custom structures and favourites load, save, duplicate and fail as today, and saves keep working during a sealed-service outage for signed-in users. Structure search follows Part 21.

## Questions for the owner

1. **What happens to the hull, rig and system save checks?** Recommended: drop them; `payloadFromDraft` and the rig filter already give today's errors. Alternatives: keep them in the browser behind loaded props, or run them in the sealed service, which adds a round trip and an outage dependency for no protection.
2. **Which preference keys are sealed?** Recommended: only `industry.favoriteBlueprints`. `industry.profileId` is a random ID, and the character-ID keys name the user's own characters, already readable.
3. **Saved plans?** Recommended: drop them. This can ship in Phase 0 (Part 30), since it changes nothing visible.
4. **Keep the `localStorage` copy of favourites?** It persists after sign-out today. Recommended: keep it, like planner recents. It is on the device, outside the threat model, and removing it changes first paint. A named exception to Part 09's "no decrypted content persisted in the browser" rule. Alternative: stop mirroring that key for signed-in users.
5. **Custom half of available structures: browser or enclave?** Recommended: browser, so new structures appear at once (Part 21 Question 2). Alternative: an enclave-built sealed view rebuilt after each save.
