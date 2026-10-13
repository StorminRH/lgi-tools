import { hasToken, type VendedToken } from './types';

export interface CorpCredential {
  characterId: number;
  accessToken: string;
}

/** Why the roster yielded no more credentials: every member was judged and none holds the role, or one could not be judged. */
export type CorpCredentialsEnd = { kind: 'denied' } | { kind: 'unavailable' };

export interface CorpCredentialProbe {
  vendToken(characterId: number): Promise<VendedToken>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

/**
 * Every member holding one of `requiredRoles`, in roster order, judged
 * lazily: a caller that stops at the first one vends and reads nothing
 * for the rest, and a caller ESI refused (a 403 despite the stored roles)
 * pulls the next. The return value says why the roster ran out.
 */
export async function* corpCredentials(
  characterIds: readonly number[],
  requiredRoles: readonly string[],
  probe: CorpCredentialProbe,
): AsyncGenerator<CorpCredential, CorpCredentialsEnd> {
  // A member we could not evaluate might hold the role, so it blocks a `denied` verdict.
  let everyMemberEvaluated = characterIds.length > 0;
  for (const characterId of characterIds) {
    const accessToken = await probe.vendToken(characterId);
    const roles = hasToken(accessToken) ? await probe.readRoles(characterId, accessToken) : null;
    if (!hasToken(accessToken) || roles === null) {
      everyMemberEvaluated = false;
      continue;
    }
    if (requiredRoles.some((role) => roles.includes(role))) yield { characterId, accessToken };
  }
  return everyMemberEvaluated ? { kind: 'denied' } : { kind: 'unavailable' };
}

/** The first sufficient member, for a check that needs one credential and no fallback (the mutation gates). */
export async function firstCorpCredential(
  characterIds: readonly number[],
  requiredRoles: readonly string[],
  probe: CorpCredentialProbe,
): Promise<CorpCredential | null> {
  const first = await corpCredentials(characterIds, requiredRoles, probe).next();
  return first.done ? null : first.value;
}
