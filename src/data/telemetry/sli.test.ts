import { describe, expect, it } from 'vitest';
import { SLI_DEFINITIONS, SLI_IDS } from './sli';

describe('SLI definitions', () => {
  // SLI_IDS is the SliId type source; the admin ops panel keys values by these
  // ids. Owner/unit membership is compile-enforced — the falsifiable contract
  // is that every declared id has exactly one definition.
  it('defines each declared indicator exactly once', () => {
    expect(SLI_DEFINITIONS.map((sli) => sli.id).toSorted()).toEqual([...SLI_IDS].toSorted());
  });
});
