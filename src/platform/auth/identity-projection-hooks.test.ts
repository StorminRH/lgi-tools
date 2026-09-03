import { describe, expect, it, vi } from 'vitest';
import { createIdentityProjectionRunners } from './identity-projection-hooks';

describe('createIdentityProjectionRunners', () => {
  it('skips character reprojection when that hook is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runners = createIdentityProjectionRunners({
      beforeUserDelete: vi.fn(),
    });

    await expect(
      runners.runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 100 }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[identity-projection] afterCharacterLinkChanged skipped for user-1:100: action unregistered',
    );
    errorSpy.mockRestore();
  });

  it('invokes the hooks it was created with', async () => {
    const beforeUserDelete = vi.fn().mockResolvedValue(undefined);
    const afterCharacterLinkChanged = vi.fn().mockResolvedValue(undefined);
    const runners = createIdentityProjectionRunners({
      beforeUserDelete,
      afterCharacterLinkChanged,
    });

    await runners.runBeforeUserDelete('user-1');
    await runners.runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 200 });

    expect(beforeUserDelete).toHaveBeenCalledWith('user-1');
    expect(afterCharacterLinkChanged).toHaveBeenCalledWith({ userId: 'user-1', characterId: 200 });
  });

  it('propagates delete-hook failures but keeps character reprojection best effort', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runners = createIdentityProjectionRunners({
      beforeUserDelete: async () => {
        throw new Error('convex down');
      },
      afterCharacterLinkChanged: async () => {
        throw new Error('convex down');
      },
    });

    await expect(runners.runBeforeUserDelete('user-1')).rejects.toThrow('convex down');
    await expect(
      runners.runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 100 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
