import { describe, expect, it } from 'vitest';
import {
  findMissingSignatures,
  isConfidentMissingRemoval,
  signatureKind,
} from './signature-lifecycle';

describe('signature lifecycle decisions', () => {
  it('scopes missing rows to paste-represented kinds and requires a finite ceiling', () => {
    const existing = [
      { signatureId: 'SIG-001', kind: 'signature' as const },
      { signatureId: 'SIG-002' },
      { signatureId: 'ANO-001', kind: 'anomaly' as const },
    ];

    expect(findMissingSignatures(existing, [
      { signatureId: 'SIG-001', kind: 'signature' },
    ])).toEqual([{ signatureId: 'SIG-002' }]);
    expect(signatureKind(existing[1]!)).toBe('signature');

    expect(findMissingSignatures(
      [{ signatureId: 'ANO-001', kind: 'anomaly' }],
      [{ signatureId: 'SIG-001', kind: 'signature' }],
    )).toEqual([]);

    const now = 1_800_000_000_000;
    expect(isConfidentMissingRemoval({ signatureId: 'A', deathLatestAt: now }, now)).toBe(true);
    expect(isConfidentMissingRemoval({ signatureId: 'B', deathLatestAt: now + 1 }, now)).toBe(false);
    expect(isConfidentMissingRemoval({ signatureId: 'C', deathLatestAt: null }, now)).toBe(false);
  });
});
