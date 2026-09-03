import type { EndpointCallArgs } from '@/transport/api-client';
import type {
  EndpointContract,
  OutcomeOf,
} from '@/transport/endpoint';
import {
  accountDeleteEndpoint,
  purgeCharacterEndpoint,
  sessionsRevokeEndpoint,
} from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso-constants';

export type AccountApiCaller = <E extends EndpointContract>(
  endpoint: E,
  ...args: EndpointCallArgs<E>
) => Promise<OutcomeOf<E>>;

export type PurgeOutcome = { kind: 'emptied' } | { kind: 'stayed' } | { kind: 'error' };

export async function runPurgeCharacter(
  characterId: number,
  call: AccountApiCaller,
): Promise<PurgeOutcome> {
  try {
    const res = await call(purgeCharacterEndpoint, { body: { characterId } });
    if (!res.ok) return { kind: 'error' };
    return res.data.accountEmptied ? { kind: 'emptied' } : { kind: 'stayed' };
  } catch {
    return { kind: 'error' };
  }
}

export type DeleteOutcome = { kind: 'emptied' } | { kind: 'error' };

export async function runDeleteAccount(call: AccountApiCaller): Promise<DeleteOutcome> {
  try {
    const res = await call(accountDeleteEndpoint);
    return res.ok ? { kind: 'emptied' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export type LogoutOutcome = { kind: 'done' } | { kind: 'error' };

export async function runLogoutEverywhere(call: AccountApiCaller): Promise<LogoutOutcome> {
  try {
    const res = await call(sessionsRevokeEndpoint);
    return res.ok ? { kind: 'done' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export type DestructionOutcome = PurgeOutcome | DeleteOutcome | LogoutOutcome;

export function redirectTargetFor(outcome: DestructionOutcome): string | null {
  if (outcome.kind === 'emptied') return EVE_AUTHORIZED_APPS_URL;
  if (outcome.kind === 'done') return '/';
  return null;
}

export function isDeleteAcknowledged(acknowledged: boolean): boolean {
  return acknowledged === true;
}
