export type CorpCredentialSelection =
  | { kind: 'sufficient'; characterId: number; accessToken: string }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

export interface CorpCredentialProbe {
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

export async function selectCorpCredential(
  characterIds: readonly number[],
  requiredRoles: readonly string[],
  probe: CorpCredentialProbe,
): Promise<CorpCredentialSelection> {
  // A member we could not evaluate might hold the role, so it blocks a `denied` verdict.
  let everyMemberEvaluated = characterIds.length > 0;
  for (const characterId of characterIds) {
    const accessToken = await probe.vendToken(characterId);
    const roles = accessToken === null ? null : await probe.readRoles(characterId, accessToken);
    if (accessToken === null || roles === null) {
      everyMemberEvaluated = false;
      continue;
    }
    if (requiredRoles.some((role) => roles.includes(role))) {
      return { kind: 'sufficient', characterId, accessToken };
    }
  }
  return everyMemberEvaluated ? { kind: 'denied' } : { kind: 'unavailable' };
}
