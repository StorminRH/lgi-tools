import { bestEffort } from '@/lib/best-effort';

/**
 * Composition-owned Convex map side-effects for identity mutations.
 * Composition registers these because platform/auth cannot import composition
 * under Fallow. Absent hooks, Neon identity work still completes; claims heal
 * on the next successful projection or resync.
 */
export interface IdentityProjectionHooks {
  readonly beforeUserDelete: (userId: string) => Promise<void>;
  readonly afterCharacterLinkChanged?: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
}

export interface IdentityProjectionRunners {
  readonly runBeforeUserDelete: (userId: string) => Promise<void>;
  readonly runAfterCharacterLinkChanged: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
}

export function createIdentityProjectionRunners(
  hooks: IdentityProjectionHooks,
): IdentityProjectionRunners {
  return {
    async runBeforeUserDelete(userId: string): Promise<void> {
      await hooks.beforeUserDelete(userId);
    },
    async runAfterCharacterLinkChanged(args: {
      userId: string;
      characterId: number;
    }): Promise<void> {
      const action = hooks.afterCharacterLinkChanged;
      await bestEffort(
        'identity-projection',
        'afterCharacterLinkChanged',
        `${args.userId}:${args.characterId}`,
        action === undefined ? undefined : () => action(args),
      );
    },
  };
}

let registeredHooks: Partial<IdentityProjectionHooks> = {};

export function registerIdentityProjectionHooks(next: Partial<IdentityProjectionHooks>): void {
  registeredHooks = next;
}

export async function runBeforeUserDelete(userId: string): Promise<void> {
  const action = registeredHooks.beforeUserDelete;
  if (action === undefined) {
    throw new Error('Required before-user-delete map purge hook is not registered');
  }
  await action(userId);
}

export async function runAfterCharacterLinkChanged(args: {
  userId: string;
  characterId: number;
}): Promise<void> {
  const action = registeredHooks.afterCharacterLinkChanged;
  await bestEffort(
    'identity-projection',
    'afterCharacterLinkChanged',
    `${args.userId}:${args.characterId}`,
    action === undefined ? undefined : () => action(args),
  );
}

export const registeredIdentityProjectionRunners: IdentityProjectionRunners = {
  runBeforeUserDelete,
  runAfterCharacterLinkChanged,
};
