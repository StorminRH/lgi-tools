import type { EndpointContract } from '@/transport/endpoint';
import { failureMessage, type FailedOutcome, type FailureCopy } from '@/transport/failure-copy';
import type {
  createIndustryProfileEndpoint,
  deleteIndustryProfileEndpoint,
  duplicateIndustryProfileEndpoint,
  IndustryProfileRow,
  updateIndustryProfileEndpoint,
} from './api-contract';
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
const PROFILE_LIMIT = 'You have reached the profile limit. Delete one to make room.';
const PROFILE_MISSING = 'This profile was deleted somewhere else.';

const SAVE_FAILURE_COPY = {
  fallback: "Couldn't save the profile. Showing the last saved version.",
  codes: {
    stale_revision: 'This profile changed somewhere else. Showing the latest version.',
    profile_missing: PROFILE_MISSING,
    not_linked: NOT_LINKED,
  },
} satisfies FailureCopy<FailedOutcome<typeof updateIndustryProfileEndpoint>>;

const CREATE_FAILURE_COPY = {
  fallback: "Couldn't create the profile.",
  codes: { profile_limit: PROFILE_LIMIT, not_linked: NOT_LINKED },
} satisfies FailureCopy<FailedOutcome<typeof createIndustryProfileEndpoint>>;

const DUPLICATE_FAILURE_COPY = {
  fallback: "Couldn't duplicate the profile.",
  codes: { profile_limit: PROFILE_LIMIT, profile_missing: PROFILE_MISSING },
} satisfies FailureCopy<FailedOutcome<typeof duplicateIndustryProfileEndpoint>>;

/** Why a save failed, by the server's reason; any other failure is a plain one. */
export function saveFailureMessage(failure: FailedOutcome<typeof updateIndustryProfileEndpoint>): string {
  return failureMessage(failure, SAVE_FAILURE_COPY);
}

/** A failure's copy, or the fallback for null: a queued call that never answered, such as one a session change dropped. */
function droppedOrFailed<TFailure extends FailedOutcome<EndpointContract>>(
  failure: TFailure | null,
  copy: FailureCopy<TFailure>,
): string {
  return failure === null ? copy.fallback : failureMessage(failure, copy);
}

export function createFailureMessage(failure: FailedOutcome<typeof createIndustryProfileEndpoint> | null): string {
  return droppedOrFailed(failure, CREATE_FAILURE_COPY);
}

export function duplicateFailureMessage(
  failure: FailedOutcome<typeof duplicateIndustryProfileEndpoint> | null,
): string {
  return droppedOrFailed(failure, DUPLICATE_FAILURE_COPY);
}

export function deleteFailureMessage(failure: FailedOutcome<typeof deleteIndustryProfileEndpoint> | null): string {
  return droppedOrFailed(failure, { fallback: "Couldn't delete the profile." });
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
