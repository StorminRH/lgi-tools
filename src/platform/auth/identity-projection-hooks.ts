import { bestEffort } from '@/lib/best-effort';

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
