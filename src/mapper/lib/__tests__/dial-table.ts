import { expect, vi } from 'vitest';
import { commitStepDial, type ChoiceDial, type StepDial } from '../step-dial';

/**
 * Asserts a dial table's contract against `config`. Each step dial reads back
 * its own range bounds when committed past them, lands on the step grid
 * counted from its minimum (rounding to the nearest step), and moves only its
 * own reading. Each choice dial writes every one of its options and moves only
 * its own reading. "Only its own" is measured against every dial in the table,
 * so a write that touches a sibling's field fails. Pick a `config` where a
 * coupled pair does not push its partner at `min + step`.
 */
export const expectDialTable = vi.defineHelper(
  <C>(config: C, steps: readonly StepDial<C>[], choices: readonly ChoiceDial<C>[] = []) => {
    const readAll = (next: C) => [
      ...steps.map((dial) => dial.read(next)),
      ...choices.map((dial) => dial.read(next)),
    ];
    const before = readAll(config);
    const expectOnly = (next: C, at: number, value: number | string, label: string) =>
      expect(readAll(next), label).toEqual(before.map((old, index) => (index === at ? value : old)));

    steps.forEach((dial, at) => {
      const { min, max, step } = dial.range;
      const commit = (next: number) => dial.read(commitStepDial(dial, config, next));
      expect(commit(min - 999), dial.label).toBe(min);
      expect(commit(max + 999), dial.label).toBe(max);
      expect(commit(min + step * 1.4), dial.label).toBe(min + step);
      expect(commit(min + step * 1.6), dial.label).toBe(min + 2 * step);
      expectOnly(commitStepDial(dial, config, min + step), at, min + step, dial.label);
    });
    choices.forEach((dial, offset) => {
      for (const option of dial.options) {
        expectOnly(dial.write(config, option.value), steps.length + offset, option.value, dial.label);
      }
    });
  },
);
