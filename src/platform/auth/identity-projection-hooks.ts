import { bestEffort } from '@/lib/best-effort';

/**
 * Composition-owned Convex map side-effects for identity mutations.
 * Platform/auth cannot import composition under Fallow, so callers pass
 * runners created with these hooks.
 */
export interface IdentityProjectionHooks {
  readonly beforeUserDelete?: (userId: string) => Promise<void>;
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

/**
 * Builds identity-mutation runners that close over the given hooks.
 * `runBeforeUserDelete` fails closed when the hook is missing.
 * `runAfterCharacterLinkChanged` is best-effort.
 */
export function createIdentityProjectionRunners(
  hooks: IdentityProjectionHooks,
): IdentityProjectionRunners {
  return {
    async runBeforeUserDelete(userId: string): Promise<void> {
      const action = hooks.beforeUserDelete;
      if (action === undefined) {
        throw new Error('Required before-user-delete map purge hook is not registered');
      }
      await action(userId);
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
