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

export function saveFailureMessage(status: number): string {
  if (status === 409) return 'This profile changed somewhere else. Showing the latest version.';
  if (status === 404) return 'This profile was deleted somewhere else.';
  if (status === 400) return 'A character on this profile is no longer linked to your account.';
  return "Couldn't save the profile. Showing the last saved version.";
}

export function createFailureMessage(status: number): string {
  if (status === 409) return 'You have reached the profile limit. Delete one to make room.';
  if (status === 400) return 'A character on this profile is no longer linked to your account.';
  return "Couldn't create the profile.";
}

function clampName(name: string): string {
  return name.slice(0, MAX_PROFILE_NAME_LEN).trim();
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
  const base = clampName(`${name} copy`);
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(clampName(`${name} copy ${n}`).toLowerCase())) n += 1;
  return clampName(`${name} copy ${n}`);
}
