import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIdentityProjectionRunners,
  registerIdentityProjectionHooks,
  runAfterCharacterLinkChanged,
  runBeforeUserDelete,
} from './identity-projection-hooks';

describe('createIdentityProjectionRunners', () => {
  it('runs the injected hooks without shared registration state', async () => {
    const beforeUserDelete = vi.fn().mockResolvedValue(undefined);
    const afterCharacterLinkChanged = vi.fn().mockResolvedValue(undefined);
    const runners = createIdentityProjectionRunners({
      beforeUserDelete,
      afterCharacterLinkChanged,
    });

    await runners.runBeforeUserDelete('user-1');
    await runners.runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 200 });

    expect(beforeUserDelete).toHaveBeenCalledWith('user-1');
    expect(afterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      characterId: 200,
    });
  });

  it('keeps the optional character projection best effort', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runners = createIdentityProjectionRunners({
      beforeUserDelete: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      runners.runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 100 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[identity-projection] afterCharacterLinkChanged skipped for user-1:100: action unregistered',
    );
    errorSpy.mockRestore();
  });
});

describe('identity-projection-hooks', () => {
  beforeEach(() => {
    registerIdentityProjectionHooks({});
  });

  it('fails closed before user deletion when the required hook is unregistered', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runBeforeUserDelete('user-1')).rejects.toThrow(
      'Required before-user-delete map purge hook is not registered',
    );
    await expect(runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 100 })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[identity-projection] afterCharacterLinkChanged skipped for user-1:100: action unregistered',
    );
    errorSpy.mockRestore();
  });

  it('invokes registered hooks', async () => {
    const beforeUserDelete = vi.fn().mockResolvedValue(undefined);
    const afterCharacterLinkChanged = vi.fn().mockResolvedValue(undefined);
    registerIdentityProjectionHooks({ beforeUserDelete, afterCharacterLinkChanged });

    await runBeforeUserDelete('user-1');
    await runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 200 });

    expect(beforeUserDelete).toHaveBeenCalledWith('user-1');
    expect(afterCharacterLinkChanged).toHaveBeenCalledWith({ userId: 'user-1', characterId: 200 });
  });

  it('propagates delete-hook failures but keeps character reprojection best effort', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerIdentityProjectionHooks({
      beforeUserDelete: async () => {
        throw new Error('convex down');
      },
      afterCharacterLinkChanged: async () => {
        throw new Error('convex down');
      },
    });

    await expect(runBeforeUserDelete('user-1')).rejects.toThrow('convex down');
    await expect(runAfterCharacterLinkChanged({ userId: 'user-1', characterId: 100 })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
