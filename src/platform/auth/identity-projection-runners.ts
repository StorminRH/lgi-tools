export interface IdentityProjectionRunners {
  readonly runBeforeUserDelete: (userId: string) => Promise<void>;
  readonly runBeforeCharacterUnlink: (args: {
    userId: string;
    characterId: number;
  }) => Promise<string[]>;
  readonly runAfterFailedCharacterUnlink: (characterId: number) => Promise<void>;
  readonly runAfterCharacterUnlink: (args: {
    userId: string;
    characterId: number;
    mapIds: string[];
  }) => Promise<void>;
  readonly runAfterCharacterLinkChanged: (args: {
    userId: string;
    characterId: number;
  }) => Promise<void>;
}

/** Fence the old claims before mutation, restore on failure, then project the new identity. */
export async function runCharacterUnlink<T>({
  userId,
  characterId,
  runners,
  mutate,
  changed,
  afterMutation,
}: {
  userId: string;
  characterId: number;
  runners: IdentityProjectionRunners;
  mutate: () => Promise<T>;
  changed: (result: T) => boolean;
  afterMutation?: (result: T) => Promise<void>;
}): Promise<T> {
  const subject = { userId, characterId };
  const mapIds = await runners.runBeforeCharacterUnlink(subject);
  let result: T;
  try {
    result = await mutate();
  } catch (error) {
    await runners.runAfterFailedCharacterUnlink(characterId);
    throw error;
  }
  const didChange = changed(result);
  const stages = [
    () => didChange
      ? runners.runAfterCharacterUnlink({ ...subject, mapIds })
      : runners.runAfterFailedCharacterUnlink(characterId),
    () => afterMutation?.(result),
    () => didChange ? runners.runAfterCharacterLinkChanged(subject) : undefined,
  ];
  // The mutation committed: a failed teardown must not prevent identity cleanup
  // or the final reprojection. Preserve the first failure for the caller.
  const failures: unknown[] = [];
  for (const stage of stages) {
    try {
      await stage();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
  return result;
}
