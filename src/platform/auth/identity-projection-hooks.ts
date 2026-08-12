import { bestEffort } from '@/lib/best-effort';

/**
 * Composition-owned Convex map side-effects for identity mutations.
 * Composition registers these because platform/auth cannot import composition
 * under Fallow. Absent hooks, Neon identity work still completes; claims heal
 * on the next successful projection or resync.
 */
export interface IdentityProjectionHooks {
  readonly beforeUserDelete?: (userId: string) => Promise<void>;
  readonly afterCharacterLinkChanged?: (characterId: number) => Promise<void>;
}

let hooks: IdentityProjectionHooks | null = null;

/**
 * Registers composition-owned projection side-effects for character unlink,
 * reassign, absorb, fresh account create, and emptied-account user deletes.
 * Call once at process boot.
 */
export function registerIdentityProjectionHooks(next: IdentityProjectionHooks): void {
  hooks = next;
}

/**
 * Runs before a user row is deleted because it has no remaining EVE accounts.
 * Required: deleting the durable row before its owned collaborative chains are
 * gone would strand unselectable personal data.
 */
export async function runBeforeUserDelete(userId: string): Promise<void> {
  const action = hooks?.beforeUserDelete;
  if (action === undefined) {
    throw new Error('Required before-user-delete map purge hook is not registered');
  }
  await action(userId);
}

/**
 * Runs after a character account row is unlinked or moved between users.
 * Best-effort: Neon identity work must not abort on a Convex outage.
 */
export async function runAfterCharacterLinkChanged(characterId: number): Promise<void> {
  const action = hooks?.afterCharacterLinkChanged;
  await bestEffort(
    'identity-projection',
    'afterCharacterLinkChanged',
    String(characterId),
    action === undefined ? undefined : () => action(characterId),
  );
}
