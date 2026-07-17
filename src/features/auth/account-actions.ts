// The decision logic behind the account page's destructive controls, extracted
// from the JSX so it is node-unit-testable with no React and no DOM (the
// Humble-Component split). Each runner takes the `apiFetch` seam as an argument —
// the components pass the real `apiFetch`; a test passes a stub — so the
// `{accountEmptied}` branch, the route wiring, and the post-action redirect rule
// are proven without a network. The shipped ACCOUNT.2 routes are consumed exactly
// as-is; nothing here touches the server.
//
// Each runner is TOTAL: it maps both a non-2xx response and a network-level failure
// (apiFetch can reject — offline, DNS, an aborted request) to an `error` outcome, so
// it never rejects. That keeps the confirm gate from freezing mid-call — a rejected
// action would skip the gate's error dispatch and strand its phase in `running`.

import type { ApiEndpoint, ApiResult } from '@/lib/api-client';
import {
  accountDeleteEndpoint,
  purgeCharacterEndpoint,
  sessionsRevokeEndpoint,
} from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso';

/**
 * The minimal slice of `apiFetch` the runners use: the no-body call and the
 * body call. The real `apiFetch` is assignable to this (its init params are
 * optional); a test stub is too. Keeps these runners off a hard import of the
 * client function while staying fully typed.
 */
export interface AccountApiCaller {
  <TData>(endpoint: ApiEndpoint<null, TData>): Promise<ApiResult<TData>>;
  <TIn, TData>(endpoint: ApiEndpoint<TIn, TData>, init: { body: TIn }): Promise<ApiResult<TData>>;
}

/**
 * Purging a character either empties the account (it was the last one → the user
 * row is already gone server-side → the D-5 lightbox + redirect) or leaves the
 * pilot signed in with their other characters (`stayed`). `error` is any non-2xx.
 */
export type PurgeOutcome = { kind: 'emptied' } | { kind: 'stayed' } | { kind: 'error' };

/**
 * Deletes one linked character and all contributor-owned personal data after the caller's
 * confirmation and ownership checks.
 */
export async function runPurgeCharacter(
  characterId: number,
  call: AccountApiCaller,
): Promise<PurgeOutcome> {
  try {
    const res = await call(purgeCharacterEndpoint, { body: { characterId } });
    if (!res.ok) return { kind: 'error' };
    return res.data.accountEmptied ? { kind: 'emptied' } : { kind: 'stayed' };
  } catch {
    return { kind: 'error' }; // network-level failure — retryable, same as a non-2xx
  }
}

/** Deleting the whole account always empties it (always the D-5 lightbox on success). */
export type DeleteOutcome = { kind: 'emptied' } | { kind: 'error' };

/**
 * Purges every linked character and user-keyed contributor row, then deletes the Better Auth user
 * as the final irreversible step.
 */
export async function runDeleteAccount(call: AccountApiCaller): Promise<DeleteOutcome> {
  try {
    const res = await call(accountDeleteEndpoint);
    return res.ok ? { kind: 'emptied' } : { kind: 'error' };
  } catch {
    return { kind: 'error' }; // network-level failure — retryable, same as a non-2xx
  }
}

/**
 * Log-out-everywhere revokes EVERY session including this one, so success means the
 * current device is signed out too → navigate home, signed out.
 */
export type LogoutOutcome = { kind: 'done' } | { kind: 'error' };

/**
 * Revokes every active session for the current user and returns the destruction-style outcome
 * consumed by account controls.
 */
export async function runLogoutEverywhere(call: AccountApiCaller): Promise<LogoutOutcome> {
  try {
    const res = await call(sessionsRevokeEndpoint);
    return res.ok ? { kind: 'done' } : { kind: 'error' };
  } catch {
    return { kind: 'error' }; // network-level failure — retryable, same as a non-2xx
  }
}

/** Closed account-action outcome preserving success, already-empty, and surfaced failure states. */
export type DestructionOutcome = PurgeOutcome | DeleteOutcome | LogoutOutcome;

/**
 * Where the browser goes after a destructive action resolves. An emptied account
 * (last-character purge or full delete) → EVE's authorized-apps page so the pilot
 * can confirm the grant is gone (the D-5 redirect); a successful log-out-everywhere
 * → home, signed out. Anything that leaves the session intact (a one-of-many purge)
 * or errored → no navigation (`null`).
 */
export function redirectTargetFor(outcome: DestructionOutcome): string | null {
  if (outcome.kind === 'emptied') return EVE_AUTHORIZED_APPS_URL;
  if (outcome.kind === 'done') return '/';
  return null; // stayed | error
}

/**
 * The whole-account delete is gated on an explicit acknowledgement checkbox (the
 * strongest confirm, D-3). Kept as a named predicate so the gate's rule lives in
 * one tested place — and so a future stricter gate (type-to-confirm) slots here
 * without touching the control.
 */
export function isDeleteAcknowledged(acknowledged: boolean): boolean {
  return acknowledged === true;
}
