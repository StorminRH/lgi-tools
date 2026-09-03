export type CharacterOwnerReconciler = (
  characterId: number,
  jwtOwnerHash: string | null | undefined,
) => Promise<void>;

let characterOwnerReconciler: CharacterOwnerReconciler | undefined;

export function registerCharacterOwnerReconciler(reconciler: CharacterOwnerReconciler): void {
  characterOwnerReconciler = reconciler;
}

export function getCharacterOwnerReconciler(): CharacterOwnerReconciler {
  if (!characterOwnerReconciler) {
    throw new Error('Character owner reconciler is not registered');
  }
  return characterOwnerReconciler;
}
