import { expect, test } from 'vitest';
import { labelOr, leadsToReadout, optionalFieldItems } from './connection-labels';

test('leads readout prefers the destination, then the hint label, then the unset text', () => {
  const destination = { label: 'J123456 - C4' };
  expect(leadsToReadout('dangerous', destination)).toBe('J123456 - C4');
  expect(leadsToReadout(null, destination, '')).toBe('J123456 - C4');

  expect(leadsToReadout('dangerous', null)).toBe('Dangerous (C4–C5)');
  expect(leadsToReadout('hisec', null, '')).toBe('High-sec');

  expect(leadsToReadout(null, null)).toBe('Unset');
  expect(leadsToReadout(null, null, '')).toBe('');
});

test('labelOr reads the label for a set value and the caller empty text for unset', () => {
  const labels = { stable: 'More than 50%', critical: 'Less than 10%' };
  expect(labelOr('critical', labels, 'Unset')).toBe('Less than 10%');
  expect(labelOr<keyof typeof labels>(null, labels, 'Unset')).toBe('Unset');
  expect(labelOr<keyof typeof labels>(null, labels, '—')).toBe('—');
});

test('optional field items put the unset item first and carry trigger text only when asked', () => {
  const sizes = ['S', 'M'] as const;
  expect(optionalFieldItems(sizes, (size) => `Size ${size}`, 'Unset')).toStrictEqual([
    { value: '', label: 'Unset' },
    { value: 'S', label: 'Size S' },
    { value: 'M', label: 'Size M' },
  ]);
  expect(
    optionalFieldItems(sizes, (size) => `Size ${size}`, '—', (size) => size.toLowerCase()),
  ).toStrictEqual([
    { value: '', label: '—' },
    { value: 'S', label: 'Size S', triggerLabel: 's' },
    { value: 'M', label: 'Size M', triggerLabel: 'm' },
  ]);
});
