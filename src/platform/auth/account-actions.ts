import type { EndpointCallArgs } from '@/transport/api-client';
import type {
  EndpointContract,
  OutcomeOf,
} from '@/transport/endpoint';
import type { FailedOutcome } from '@/transport/failure-copy';
import {
  accountDeleteEndpoint,
  purgeCharacterEndpoint,
  sessionsRevokeEndpoint,
} from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso-constants';

/** Calls an endpoint the way apiFetch does: it resolves every failure as an outcome rather than rejecting. */
export type AccountApiCaller = <E extends EndpointContract>(
  endpoint: E,
  ...args: EndpointCallArgs<E>
) => Promise<OutcomeOf<E>>;

export type PurgeOutcome =
  | { kind: 'emptied' }
  | { kind: 'stayed' }
  | { kind: 'error'; failure: FailedOutcome<typeof purgeCharacterEndpoint> };

export async function runPurgeCharacter(
  characterId: number,
  call: AccountApiCaller,
): Promise<PurgeOutcome> {
  const res = await call(purgeCharacterEndpoint, { body: { characterId } });
  if (!res.ok) return { kind: 'error', failure: res };
  return res.data.accountEmptied ? { kind: 'emptied' } : { kind: 'stayed' };
}

export type DeleteOutcome =
  | { kind: 'emptied' }
  | { kind: 'error'; failure: FailedOutcome<typeof accountDeleteEndpoint> };

export async function runDeleteAccount(call: AccountApiCaller): Promise<DeleteOutcome> {
  const res = await call(accountDeleteEndpoint);
  return res.ok ? { kind: 'emptied' } : { kind: 'error', failure: res };
}

export type LogoutOutcome =
  | { kind: 'done' }
  | { kind: 'error'; failure: FailedOutcome<typeof sessionsRevokeEndpoint> };

export async function runLogoutEverywhere(call: AccountApiCaller): Promise<LogoutOutcome> {
  const res = await call(sessionsRevokeEndpoint);
  return res.ok ? { kind: 'done' } : { kind: 'error', failure: res };
}

export type DestructionOutcome = PurgeOutcome | DeleteOutcome | LogoutOutcome;

export function redirectTargetFor(outcome: DestructionOutcome): string | null {
  if (outcome.kind === 'emptied') return EVE_AUTHORIZED_APPS_URL;
  if (outcome.kind === 'done') return '/';
  return null;
}
