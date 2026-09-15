import { expect, test } from 'vitest';
import type { SystemPresence } from '../tracking/presence-model';
import { visibleTrackOccupants } from './node-chrome';

const presenceWithPilots: SystemPresence = {
  pilots: [
    {
      characterId: 1,
      shipTypeId: null,
      docked: false,
      lastMovementAt: 0,
    },
  ],
};

test('visible occupants follow glance order then one presence seat', () => {
  expect(
    visibleTrackOccupants(['harvestables', 'combat'], presenceWithPilots),
  ).toEqual([
    {
      token: { glyph: 'gas-cloud', tone: 'teal', info: { kind: 'bare' } },
      probe: { kind: 'glance', bucket: 'harvestables' },
    },
    {
      token: { glyph: 'combat-reticle', tone: 'red', info: { kind: 'bare' } },
      probe: { kind: 'glance', bucket: 'combat' },
    },
    {
      token: { glyph: 'pilot', tone: 'green', info: { kind: 'bare' } },
      probe: { kind: 'presence' },
    },
  ]);
  expect(visibleTrackOccupants([], null)).toEqual([]);
  expect(visibleTrackOccupants([], { pilots: [] })).toEqual([]);
});

test('presence counts only when more than one pilot is in system', () => {
  expect(
    visibleTrackOccupants([], {
      pilots: [
        ...presenceWithPilots.pilots,
        { characterId: 2, shipTypeId: null, docked: false, lastMovementAt: 0 },
      ],
    }),
  ).toEqual([
    {
      token: {
        glyph: 'pilot',
        tone: 'green',
        info: { kind: 'count', value: 2, dataKey: 'data-pilot-presence-count' },
      },
      probe: { kind: 'presence' },
    },
  ]);
});

test('hacking uses the analyzer chip face', () => {
  expect(visibleTrackOccupants(['hacking'], null)).toEqual([
    {
      token: { glyph: 'hacking-chip', tone: 'blue', info: { kind: 'bare' } },
      probe: { kind: 'glance', bucket: 'hacking' },
    },
  ]);
});
