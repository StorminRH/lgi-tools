import { bestEffort } from '@/lib/best-effort';

/**
 * Composition-owned Convex map side-effects for identity mutations.
 * Composition registers these because platform/auth cannot import composition
 * under Fallow. Absent hooks, Neon identity work still completes; claims heal
 * on the next successful projection or resync.
 */
export interface IdentityProjectionHooks {
  readonly beforeUserDelete?: (userId: string) => Promise<void>;
  readonly afterCharacterLinkChanged?: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
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

export async function runBeforeUserDelete(userId: string): Promise<void> {
  const action = hooks?.beforeUserDelete;
  if (action === undefined) {
    throw new Error('Required before-user-delete map purge hook is not registered');
  }
  await action(userId);
}

export async function runAfterCharacterLinkChanged(args: {
  userId: string;
  characterId: number;
}): Promise<void> {
  const action = hooks?.afterCharacterLinkChanged;
  await bestEffort(
    'identity-projection',
    'afterCharacterLinkChanged',
    `${args.userId}:${args.characterId}`,
    action === undefined ? undefined : () => action(args),
  );
}
