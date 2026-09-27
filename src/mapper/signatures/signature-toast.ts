import { toast } from '@/components/ui/toast';

export function announceSignatureRemoval(input: {
  readonly systemId: number;
  readonly signatureIds: readonly string[];
  readonly onUndo: () => void;
}): void {
  const count = input.signatureIds.length;
  toast.success(
    count === 1 ? 'Signature removed' : 'Signatures removed',
    {
      id: `signature-remove:${input.systemId}:${input.signatureIds.join(',')}`,
      duration: 5_000,
      action: { label: 'Undo', onClick: input.onUndo },
    },
  );
}
