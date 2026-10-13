import { expect, test } from 'vitest';
import { choiceDial, commitStepDial, type StepDial } from './step-dial';

test('commitStepDial clamps into range and snaps to the grid counted from min before writing', () => {
  const written: number[] = [];
  const dial: StepDial<{ readonly level: number }> = {
    label: 'Level',
    ariaLabel: 'Level',
    range: { min: 1, max: 9, step: 2 },
    read: (config) => config.level,
    write: (config, level) => {
      written.push(level);
      return { ...config, level };
    },
  };
  const config = { level: 5 };

  expect(commitStepDial(dial, config, -40)).toEqual({ level: 1 });
  expect(commitStepDial(dial, config, 40)).toEqual({ level: 9 });
  expect(commitStepDial(dial, config, 3.9)).toEqual({ level: 3 });
  expect(commitStepDial(dial, config, 4)).toEqual({ level: 5 });
  expect(commitStepDial(dial, config, 8.2)).toEqual({ level: 9 });
  expect(written).toEqual([1, 9, 3, 5, 9]);
  expect(config).toEqual({ level: 5 });
});

test('choiceDial writes its own options and leaves the config alone for any other value', () => {
  type Tier = 'low' | 'high';
  const dial = choiceDial<{ readonly tier: Tier }, Tier>({
    label: 'Tier',
    control: 'segmented',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' },
    ],
    read: (config) => config.tier,
    write: (config, tier) => ({ ...config, tier }),
  });
  const config = { tier: 'low' as Tier };

  expect(dial.write(config, 'high')).toEqual({ tier: 'high' });
  expect(dial.write(config, 'medium')).toBe(config);
  expect(dial.write(config, '')).toBe(config);
});
