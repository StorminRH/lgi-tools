import { expect, test } from 'vitest';
import { siteDetail, siteNpc, siteWave } from './__tests__/site-fixtures';
import { activeEwarKeys, npcEwar, siteEwarTotals, waveEwar, waveEwarCounts } from './ewar';

test('waveEwar sums each field over the rows, once per row, skipping rows without stats', () => {
  const wave = waveEwar([
    siteNpc({ quantity: 3, scram: 2, web: 1, neut: -3, rrep: 0 }),
    siteNpc({ quantity: 2, scram: 1, web: 0, neut: -0, rrep: 4 }),
    siteNpc({ quantity: 4, web: 1, neut: -2 }),
    siteNpc({ quantity: 5 }),
  ]);

  expect(wave).toEqual({ ewScram: 3, ewWeb: 2, ewNeut: -5, ewRrep: 4 });
});

test('waveEwar stores null for a field no row fields, -0 neut and empty waves included', () => {
  expect(
    waveEwar([siteNpc({ scram: 0, web: 0, neut: -0, rrep: 0 }), siteNpc()]),
  ).toEqual({ ewScram: null, ewWeb: null, ewNeut: null, ewRrep: null });
  expect(waveEwar([])).toEqual({ ewScram: null, ewWeb: null, ewNeut: null, ewRrep: null });
});

test('activeEwarKeys keeps pill order and drops zero and null counts', () => {
  expect(activeEwarKeys({ rr: 2, neut: -1, scram: 0, web: null })).toEqual(['neut', 'rr']);
  expect(activeEwarKeys({ rr: 1, neut: -1, scram: 1, web: 1 })).toEqual(['web', 'scram', 'neut', 'rr']);
  expect(activeEwarKeys({ web: 0, scram: null, neut: -0, rr: null })).toEqual([]);

  expect(activeEwarKeys(npcEwar(siteNpc({ rrep: 3, neut: -1 })))).toEqual(['neut', 'rr']);
  expect(activeEwarKeys(waveEwarCounts(siteWave({ ewRrep: 4, ewWeb: 1 })))).toEqual(['web', 'rr']);
});

test('siteEwarTotals sums every wave, a null field counting as zero', () => {
  const site = siteDetail({
    waves: [
      siteWave({ ewScram: 3, ewNeut: -2 }),
      siteWave({ ewScram: 2, ewRrep: 1 }),
      siteWave(),
    ],
  });

  expect(siteEwarTotals(site)).toEqual({ web: 0, scram: 5, neut: -2, rr: 1 });
  expect(siteEwarTotals(siteDetail())).toEqual({ web: 0, scram: 0, neut: 0, rr: 0 });
});
