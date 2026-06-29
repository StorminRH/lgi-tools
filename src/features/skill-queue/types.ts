// Shared types for the skill-queue Neon slice (MIGRATE.B.1). Kept I/O-free so the
// refresh orchestration (refresh.ts) can depend on the port abstraction WITHOUT
// importing the DB layer (queries.ts) or the auth slice — which it may not
// (feature→feature is boundary-banned). The non-zone wrapper (src/db/skills-sync.ts)
// builds the real port; the orchestration is unit-tested against a fake one. Mirrors
// the owned-blueprints slice, simplified to a character-only owner axis.
import type { SkillQueueEntry } from './esi-projection';

// The stored per-character payload — the trained totals + the training queue. Mirrors
// the Convex SyncedData shape, so the UI's view-model (roster-view-model.ts) consumes
// it unchanged. The wire/consumer shape too (the API contract references it).
export interface CharacterSkillData {
  entries: SkillQueueEntry[];
  totalSp: number;
  unallocatedSp?: number;
}

// A linked character as the refresh enumerates it — identity plus the scope health
// the eligibility predicate (canSyncSkillQueue) reads. No corp id: skills is
// per-character only.
export interface RefreshCharacter {
  characterId: number;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

// Per-character sync state: the staleness stamp + the two held etags (one per
// endpoint) to replay so an unchanged half returns a 304.
export interface CharacterSkillSyncState {
  lastRefreshedAt: Date | null;
  queueEtag: string | null;
  skillsEtag: string | null;
}

// The slice's own read result for ONE endpoint, decoupled from lib/esi's
// EsiAuthedRead (the Neon path's fixed TTL ignores the ESI cache window the gate
// returns). 'fresh' carries the raw body for the slice's projection to parse.
export type SkillsEsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

// The halves to persist on a refresh. At least one is present (an all-304 refresh
// stamps freshness instead of saving). A 304 half is simply omitted, so saveSkills
// leaves that half's stored columns + etag untouched — no stored-data read needed
// to merge (the row already holds the unchanged half from a prior save).
export interface SkillsSaveHalves {
  queue?: { entries: SkillQueueEntry[]; etag: string | null };
  skills?: { totalSp: number; unallocatedSp?: number; etag: string | null };
}

// The injected I/O the refresh runs over: auth (character enumeration, token vend),
// the two authed ESI gate reads, and Neon storage. The real implementations are
// wired in src/db/skills-sync.ts.
export interface SkillsPort {
  now(): Date;
  // The user's linked characters with scope health.
  listCharacters(userId: string): Promise<RefreshCharacter[]>;
  // A fresh access token for a character, or null when unavailable / reauth-needed.
  vendToken(characterId: number): Promise<string | null>;
  // The two single-page authed conditional reads through the ESI gate.
  readSkillQueue(characterId: number, accessToken: string, heldEtag: string | null): Promise<SkillsEsiRead>;
  readSkills(characterId: number, accessToken: string, heldEtag: string | null): Promise<SkillsEsiRead>;
  // Live (uncached) per-character sync state, or null if never synced.
  readSyncState(characterId: number): Promise<CharacterSkillSyncState | null>;
  // Persist the fresh half(s) + new etag(s), stamping freshness; a 304 half is omitted.
  saveSkills(characterId: number, halves: SkillsSaveHalves): Promise<void>;
  // Stamp freshness only (the both-304 path), leaving stored data + etags as-is.
  stampFresh(characterId: number): Promise<void>;
}
