import { describe, expect, it } from 'vitest';
import { classifyProof, pickSurvivor, type ProofFacts } from './owner-reconcile';

const H1 = 'owner-hash-one';
const H2 = 'owner-hash-two';

const facts = (over: Partial<ProofFacts>): ProofFacts => ({
  jwtOwnerHash: H1,
  columnOwnerHash: H1,
  tokenOwnerHash: null,
  accountUserId: 'owner',
  linkingUserId: null,
  ...over,
});

describe('classifyProof', () => {
  it('on sign-in keeps the reconcile semantics: noop, backfill, or transfer', () => {
    expect(classifyProof(facts({}))).toEqual({ kind: 'noop' });
    expect(classifyProof(facts({ columnOwnerHash: null }))).toEqual({ kind: 'backfill' });
    expect(classifyProof(facts({ columnOwnerHash: '' }))).toEqual({ kind: 'backfill' });
    expect(classifyProof(facts({ columnOwnerHash: H2 }))).toEqual({ kind: 'transfer' });
  });

  it('on a same-user relink behaves like sign-in', () => {
    expect(classifyProof(facts({ linkingUserId: 'owner' }))).toEqual({ kind: 'noop' });
    expect(classifyProof(facts({ linkingUserId: 'owner', columnOwnerHash: H2 }))).toEqual({
      kind: 'transfer',
    });
  });

  it('merges a cross-user link only when the stored owner equals the JWT owner', () => {
    expect(classifyProof(facts({ linkingUserId: 'linker' }))).toEqual({
      kind: 'merge',
      linkingUserId: 'linker',
      otherUserId: 'owner',
      backfill: false,
    });
    expect(classifyProof(facts({ linkingUserId: 'linker', columnOwnerHash: H2 }))).toEqual({
      kind: 'transfer',
    });
  });

  it('derives a null column from the stored token: match merges and backfills, mismatch purges, nothing refuses', () => {
    expect(
      classifyProof(facts({ linkingUserId: 'linker', columnOwnerHash: null, tokenOwnerHash: H1 })),
    ).toEqual({ kind: 'merge', linkingUserId: 'linker', otherUserId: 'owner', backfill: true });
    expect(
      classifyProof(facts({ linkingUserId: 'linker', columnOwnerHash: null, tokenOwnerHash: H2 })),
    ).toEqual({ kind: 'transfer' });
    expect(classifyProof(facts({ linkingUserId: 'linker', columnOwnerHash: null }))).toEqual({
      kind: 'refuse-unverified',
    });
    expect(classifyProof(facts({ columnOwnerHash: null, tokenOwnerHash: H2 }))).toEqual({
      kind: 'transfer',
    });
    expect(classifyProof(facts({ columnOwnerHash: null, tokenOwnerHash: H1 }))).toEqual({
      kind: 'backfill',
    });
  });
});

describe('pickSurvivor', () => {
  const older = { id: 'zed', createdAt: new Date('2026-01-01T00:00:00Z'), role: 'USER' as const };
  const newer = { id: 'amy', createdAt: new Date('2026-06-01T00:00:00Z'), role: 'ADMIN' as const };

  it('keeps the older user whichever side it is passed on', () => {
    expect(pickSurvivor(older, newer)).toEqual({ survivor: older, source: newer });
    expect(pickSurvivor(newer, older)).toEqual({ survivor: older, source: newer });
  });

  it('breaks a timestamp tie by the smaller id', () => {
    const twin = { ...older, id: 'aaa' };
    expect(pickSurvivor(older, twin)).toEqual({ survivor: twin, source: older });
    expect(pickSurvivor(twin, older)).toEqual({ survivor: twin, source: older });
  });
});
