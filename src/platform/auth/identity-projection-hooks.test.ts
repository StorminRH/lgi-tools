import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerIdentityProjectionHooks,
  runAfterCharacterLinkChanged,
  runBeforeUserDelete,
} from './identity-projection-hooks';

describe('identity-projection-hooks', () => {
  beforeEach(() => {
    registerIdentityProjectionHooks({});
  });

  it('logs a breadcrumb and no-ops when hooks are unregistered', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runBeforeUserDelete('user-1')).resolves.toBeUndefined();
    await expect(runAfterCharacterLinkChanged(100)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[identity-projection] beforeUserDelete skipped for user-1: action unregistered',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[identity-projection] afterCharacterLinkChanged skipped for 100: action unregistered',
    );
    errorSpy.mockRestore();
  });

  it('invokes registered hooks', async () => {
    const beforeUserDelete = vi.fn().mockResolvedValue(undefined);
    const afterCharacterLinkChanged = vi.fn().mockResolvedValue(undefined);
    registerIdentityProjectionHooks({ beforeUserDelete, afterCharacterLinkChanged });

    await runBeforeUserDelete('user-1');
    await runAfterCharacterLinkChanged(200);

    expect(beforeUserDelete).toHaveBeenCalledWith('user-1');
    expect(afterCharacterLinkChanged).toHaveBeenCalledWith(200);
  });

  it('swallows hook failures so identity deletes still proceed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerIdentityProjectionHooks({
      beforeUserDelete: async () => {
        throw new Error('convex down');
      },
      afterCharacterLinkChanged: async () => {
        throw new Error('convex down');
      },
    });

    await expect(runBeforeUserDelete('user-1')).resolves.toBeUndefined();
    await expect(runAfterCharacterLinkChanged(100)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
