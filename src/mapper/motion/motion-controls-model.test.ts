import { expect, test } from 'vitest';
import { expectDialTable } from '../lib/__tests__/dial-table';
import { commitStepDial } from '../lib/step-dial';
import { DEFAULT_MOTION_CONFIG } from './motion-contract';
import { MOTION_CHOICE_DIALS, MOTION_STEP_DIALS } from './motion-controls-model';

test('every motion dial clamps, snaps and moves only its own field', () => {
  expectDialTable(DEFAULT_MOTION_CONFIG, MOTION_STEP_DIALS, MOTION_CHOICE_DIALS);
});

test('every motion dial keeps its tuned range', () => {
  expect(MOTION_STEP_DIALS.map((dial) => [dial.label, dial.range])).toEqual([
    ['Fast', { min: 50, max: 500, step: 25 }],
    ['Mid', { min: 200, max: 1200, step: 50 }],
    ['Slow', { min: 400, max: 2000, step: 100 }],
    ['Overshoot', { min: 0, max: 40, step: 2 }],
  ]);
});

test('overshoot commits land on whole percents', () => {
  const overshoot = MOTION_STEP_DIALS.find((dial) => dial.label === 'Overshoot');
  if (!overshoot) throw new Error('no Overshoot dial');

  expect(
    [-3, 0, 7, 13.5, 39, 41].map((value) => commitStepDial(overshoot, DEFAULT_MOTION_CONFIG, value).overshootPct),
  ).toEqual([0, 0, 8, 14, 40, 40]);
});

test('the choice dials offer exactly the two edge flavors and two collapse weights', () => {
  expect(MOTION_CHOICE_DIALS.map((dial) => [dial.label, dial.options.map((option) => option.value)])).toEqual([
    ['Edge flavor', ['fade-with-child', 'grow-from-parent']],
    ['Collapse exit', ['ordinary', 'heavy']],
  ]);
});
