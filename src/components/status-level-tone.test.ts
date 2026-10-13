import { expect, test } from 'vitest';
import { levelReadout, levelValueClass } from './status-level-tone';

test('levelReadout pairs each level’s dot with a spoken verdict and keeps healthy values plain', () => {
  expect(levelReadout('green')).toEqual({ tone: 'green', status: 'Healthy', valueTone: 'default' });
  expect(levelReadout('amber')).toEqual({ tone: 'orange', status: 'Warning', valueTone: 'orange' });
  expect(levelReadout('red')).toEqual({ tone: 'red', status: 'Critical', valueTone: 'red' });
  expect(levelReadout('neutral')).toEqual({ tone: 'neutral', status: 'No verdict', valueTone: 'muted' });
});

test('levelValueClass gives a healthy value the surface’s plain colour and every problem its own', () => {
  // The EVE status popover passes no plain colour, so a healthy value inherits its row's.
  expect(levelValueClass('green')).toBeUndefined();
  // Admin values have no colour to inherit and name theirs.
  expect(levelValueClass('green', 'text-name')).toBe('text-name');

  for (const plain of [undefined, 'text-name']) {
    expect(levelValueClass('amber', plain)).toBe('text-tone-orange');
    expect(levelValueClass('red', plain)).toBe('text-tone-red');
    expect(levelValueClass('neutral', plain)).toBe('text-muted');
  }
});
