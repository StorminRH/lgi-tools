import type { IndustryProfileRow } from './api-contract';
import { MAX_PROFILE_NAME_LEN, type ProfileDocument } from './profile-document';

export interface PendingEdit {
  name: string;
  document: ProfileDocument;
}

/** Edits still queued for the server stay on screen over an older echo. */
export function overlayPending(
  rows: readonly IndustryProfileRow[],
  pending: ReadonlyMap<string, PendingEdit>,
): IndustryProfileRow[] {
  return rows.map((row) => {
    const edit = pending.get(row.id);
    return edit === undefined ? row : { ...row, name: edit.name, document: edit.document };
  });
}

const NOT_LINKED = 'A character on this profile is no longer linked to your account.';

/** Why a save was refused, by the server's reason; any other refusal is a plain failure. */
export function saveFailureMessage(reason: string | undefined): string {
  if (reason === 'stale_revision') return 'This profile changed somewhere else. Showing the latest version.';
  if (reason === 'profile_missing') return 'This profile was deleted somewhere else.';
  if (reason === 'not_linked') return NOT_LINKED;
  return "Couldn't save the profile. Showing the last saved version.";
}

export function createFailureMessage(reason: string | undefined): string {
  if (reason === 'profile_limit') return 'You have reached the profile limit. Delete one to make room.';
  if (reason === 'not_linked') return NOT_LINKED;
  return "Couldn't create the profile.";
}

/** "Production", then "Production 2", "Production 3"… skipping names in use. */
export function suggestProfileName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));
  if (!taken.has('production')) return 'Production';
  let n = 2;
  while (taken.has(`production ${n}`)) n += 1;
  return `Production ${n}`;
}

export function copyName(name: string, existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));
  const candidate = (n: number) => {
    const suffix = n === 1 ? ' copy' : ` copy ${n}`;
    return `${name.slice(0, MAX_PROFILE_NAME_LEN - suffix.length).trim()}${suffix}`;
  };
  let n = 1;
  while (taken.has(candidate(n).toLowerCase())) n += 1;
  return candidate(n);
}
