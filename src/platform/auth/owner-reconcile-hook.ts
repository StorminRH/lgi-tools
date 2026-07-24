type CharacterOwnerReconciler = (
  characterId: number,
  jwtOwnerHash: string | null | undefined,
) => Promise<void>;

let characterOwnerReconciler: CharacterOwnerReconciler | undefined;

/** Registers the composition-owned character-owner reconciliation implementation. */
export function registerCharacterOwnerReconciler(reconciler: CharacterOwnerReconciler): void {
  characterOwnerReconciler = reconciler;
}

/** Returns the registered character-owner reconciler after route composition has initialized it. */
export function getCharacterOwnerReconciler(): CharacterOwnerReconciler {
  if (!characterOwnerReconciler) {
    throw new Error('Character owner reconciler is not registered');
  }
  return characterOwnerReconciler;
}
