import { expect, test } from 'vitest';
import { DEFAULT_FOG_CONFIG } from '../fog/fog-model';
import { HALO_PINNED_LIMITS } from '../halo/halo-model';
import { DEFAULT_LAYOUT_CONFIG, DIRECTION_PRESETS } from '../layout/layout-contract';
import { expectDialTable } from '../lib/__tests__/dial-table';
import { commitStepDial } from '../lib/step-dial';
import {
  FOG_CHOICE_DIALS,
  FOG_STEP_DIALS,
  HALO_STEP_DIALS,
  LAYOUT_CHOICE_DIALS,
  LAYOUT_STEP_DIALS,
} from './map-controls-model';

function dialNamed<D extends { readonly label: string }>(dials: readonly D[], label: string): D {
  const dial = dials.find((candidate) => candidate.label === label);
  if (!dial) throw new Error(`no dial labelled ${label}`);
  return dial;
}

test('every layout, halo and fog dial clamps, snaps and moves only its own field', () => {
  expectDialTable(DEFAULT_LAYOUT_CONFIG, LAYOUT_STEP_DIALS, LAYOUT_CHOICE_DIALS);
  expectDialTable(HALO_PINNED_LIMITS, HALO_STEP_DIALS);
  expectDialTable(DEFAULT_FOG_CONFIG, FOG_STEP_DIALS, FOG_CHOICE_DIALS);
});

test('ring spacing and separation push each other so spacing stays ≥ separation', () => {
  const ringSpacing = dialNamed(LAYOUT_STEP_DIALS, 'Ring spacing');
  const separation = dialNamed(LAYOUT_STEP_DIALS, 'Separation');

  const shrunk = commitStepDial(
    ringSpacing,
    { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 240, minSeparation: 200 },
    160,
  );
  expect(shrunk).toMatchObject({ ringSpacing: 160, minSeparation: 160 });

  const grown = commitStepDial(
    separation,
    { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 200, minSeparation: 140 },
    220,
  );
  expect(grown).toMatchObject({ ringSpacing: 220, minSeparation: 220 });

  // The partner sees the clamped value, not the raw request.
  const overshot = commitStepDial(
    separation,
    { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 200, minSeparation: 140 },
    999,
  );
  expect(overshot).toMatchObject({ ringSpacing: 240, minSeparation: 240 });
});

test('direction order writes each preset sequence and reads it back, falling back to compass-8', () => {
  const direction = dialNamed(LAYOUT_CHOICE_DIALS, 'Direction order');

  for (const id of Object.keys(DIRECTION_PRESETS) as (keyof typeof DIRECTION_PRESETS)[]) {
    const next = direction.write(DEFAULT_LAYOUT_CONFIG, id);
    expect(next.directionSequence).toBe(DIRECTION_PRESETS[id]);
    expect(direction.read(next)).toBe(id);
  }
  expect(direction.read({ ...DEFAULT_LAYOUT_CONFIG, directionSequence: [90, 0] })).toBe('compass-8');
});

test('fog density is dialled in percent and stored as a fraction', () => {
  const density = dialNamed(FOG_STEP_DIALS, 'Density %');

  expect(commitStepDial(density, DEFAULT_FOG_CONFIG, 85).opacity).toBe(0.85);
  expect(commitStepDial(density, DEFAULT_FOG_CONFIG, 500).opacity).toBe(1);
  expect(density.read({ ...DEFAULT_FOG_CONFIG, opacity: 0.95 })).toBe(95);
});
