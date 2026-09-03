import { describe, expect, it } from 'vitest';
import { compassKernel } from './compass';
import { DETERMINISM_DIGESTS } from './__tests__/determinism-fixture';
import { DEFAULT_LAYOUT_CONFIG } from './layout-contract';
import { generateChain, positionDigest, PROOF_CORPUS } from './proof-kit';

describe('compass kernel determinism', () => {
  it('produces byte-identical position maps across two independent in-process runs, for every corpus seed', async () => {
    for (const entry of PROOF_CORPUS) {
      const facts = generateChain(entry);
      const first = await compassKernel(facts, DEFAULT_LAYOUT_CONFIG);
      const second = await compassKernel(facts, DEFAULT_LAYOUT_CONFIG);
      expect(
        positionDigest(second),
        `seed ${entry.seed} n=${entry.size} diverged between runs`,
      ).toBe(positionDigest(first));
      expect(second.size).toBe(facts.systems.length);
    }
  });

  it('matches the committed cross-process digest fixture for every corpus seed', async () => {
    for (const entry of PROOF_CORPUS) {
      const key = `seed${entry.seed}-n${entry.size}`;
      const digest = positionDigest(
        await compassKernel(generateChain(entry), DEFAULT_LAYOUT_CONFIG),
      );
      expect(
        digest,
        `${key} drifted from the committed fixture — the layout moved; regenerate deliberately`,
      ).toBe(DETERMINISM_DIGESTS[key]);
    }
  });
});
