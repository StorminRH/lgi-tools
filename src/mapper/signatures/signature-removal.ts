import { toast } from '@/components/ui/toast';
import { invalidateSignatureElimination } from './signature-elimination-client';

/** The signature remove and restore pair; each resolves undefined on failure (swallowMutationRejection). */
export interface SignatureSelectionMutations {
  readonly removeSignatures: (args: {
    mapId: string;
    systemId: number;
    signatureIds: string[];
  }) => Promise<unknown>;
  readonly restoreSignatures: SignatureSelectionMutations['removeSignatures'];
}

function selectionKey(systemId: number, signatureIds: readonly string[]): string {
  return `${systemId}:${signatureIds.join(',')}`;
}

function announceSignatureRemoval(input: {
  readonly systemId: number;
  readonly signatureIds: readonly string[];
  readonly onUndo: () => void;
}): void {
  const count = input.signatureIds.length;
  toast.success(
    count === 1 ? 'Signature removed' : 'Signatures removed',
    {
      id: `signature-remove:${selectionKey(input.systemId, input.signatureIds)}`,
      duration: 5_000,
      action: { label: 'Undo', onClick: input.onUndo },
    },
  );
}

interface SignatureSelection {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureIds: readonly string[];
}

/** Runs one selection mutation and drops the system's elimination digest; a failure toasts and returns false. */
async function changeSelection(
  mutation: SignatureSelectionMutations['removeSignatures'],
  selection: SignatureSelection,
  failure: { readonly message: string; readonly idPrefix: string },
): Promise<boolean> {
  const { mapId, systemId, signatureIds } = selection;
  const result = await mutation({ mapId, systemId, signatureIds: [...signatureIds] });
  if (result === undefined) {
    toast.error(failure.message, {
      id: `${failure.idPrefix}:${selectionKey(systemId, signatureIds)}`,
    });
    return false;
  }
  invalidateSignatureElimination(mapId, systemId);
  return true;
}

/** Restores the signatures and drops the system's elimination digest; a failure toasts and returns false. */
export function restoreSignaturesAndInvalidate(input: {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureIds: readonly string[];
  readonly restore: SignatureSelectionMutations['restoreSignatures'];
}): Promise<boolean> {
  return changeSelection(input.restore, input, {
    message: 'Restore failed',
    idPrefix: 'signature-restore',
  });
}

/**
 * Removes the signatures, drops the system's elimination digest and offers an
 * Undo that restores them the same way. A failure toasts and returns false.
 */
export async function removeSignaturesWithUndo(input: {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureIds: readonly string[];
  readonly mutations: SignatureSelectionMutations;
  readonly onRemoved?: () => void;
}): Promise<boolean> {
  const { mapId, systemId, signatureIds, mutations } = input;
  if (signatureIds.length === 0) return false;
  const removed = await changeSelection(mutations.removeSignatures, input, {
    message: 'Remove failed',
    idPrefix: 'signature-remove',
  });
  if (!removed) return false;
  input.onRemoved?.();
  announceSignatureRemoval({
    systemId,
    signatureIds,
    onUndo: () => {
      void restoreSignaturesAndInvalidate({
        mapId,
        systemId,
        signatureIds,
        restore: mutations.restoreSignatures,
      });
    },
  });
  return true;
}
