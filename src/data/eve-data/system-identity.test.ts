import { expect, it } from 'vitest';
import {
  systemClassificationReadout,
  systemClassText,
  systemDestinationClassReadout,
  systemDestinationHintReadout,
  systemIdentityReadout,
} from './system-identity';

it.each([
  [1, 'C1'],
  [2, 'C2'],
  [3, 'C3'],
  [4, 'C4'],
  [5, 'C5'],
  [6, 'C6'],
  [7, 'HS'],
  [8, 'LS'],
  [9, 'NS'],
  [12, 'Thera'],
  [13, 'C13'],
  [14, 'Drifter'],
  [15, 'Drifter'],
  [16, 'Drifter'],
  [17, 'Drifter'],
  [18, 'Drifter'],
  [25, 'Pochven'],
])('labels class id %i as %s', (classId, label) => {
  expect(systemClassText(classId)).toBe(label);
});

it('has no class text for k-space null or an id the SDE does not assign', () => {
  expect(systemClassText(null)).toBeNull();
  expect(systemClassText(99)).toBeNull();
});

it.each([
  ['Jita', 0.946, 'Jita - 0.9', 'text-sec-09'],
  ['Uedama', 0.45, 'Uedama - 0.5', 'text-sec-05'],
  ['Ouelletta', 0.02, 'Ouelletta - 0.1', 'text-sec-01'],
  ['Old Man Star', 0.34, 'Old Man Star - 0.3', 'text-sec-03'],
  ['Ahbazon', 0.0, 'Ahbazon - 0.0', 'text-sec-null'],
  ['1DQ1-A', -0.24, '1DQ1-A - -0.2', 'text-sec-null'],
])('k-space %s at %d reads "%s" in %s', (name, security, label, tone) => {
  expect(systemIdentityReadout({ name, security, whClassId: null })).toEqual({
    label,
    tone,
  });
});

it('keeps k-space security form for HS/LS/NS class ids and plain names when facts are missing', () => {
  expect(
    systemIdentityReadout({ name: 'Amarr', security: 1.0, whClassId: 7 }),
  ).toEqual({ label: 'Amarr - 1.0', tone: 'text-sec-10' });
  expect(
    systemIdentityReadout({ name: 'Rancer', security: 0.4, whClassId: 8 }),
  ).toEqual({ label: 'Rancer - 0.4', tone: 'text-sec-04' });
  expect(
    systemIdentityReadout({ name: 'HED-GP', security: -0.1, whClassId: 9 }),
  ).toEqual({ label: 'HED-GP - -0.1', tone: 'text-sec-null' });
  expect(
    systemIdentityReadout({ name: '30000142', security: null, whClassId: null }),
  ).toEqual({ label: '30000142', tone: 'text-name' });
  expect(
    systemIdentityReadout({ name: 'Bastion', security: null, whClassId: 7 }),
  ).toEqual({ label: 'Bastion', tone: 'text-name' });
});

it.each([
  [1, 'text-wh-c1'],
  [2, 'text-wh-c2'],
  [3, 'text-wh-c3'],
  [4, 'text-wh-c4'],
  [5, 'text-wh-c5'],
  [6, 'text-wh-c6'],
])('C%i rides the ramp tone %s', (whClassId, tone) => {
  expect(
    systemIdentityReadout({ name: 'J123456', security: -1, whClassId }),
  ).toEqual({ label: `J123456 - C${whClassId}`, tone });
});

it('keeps distinct J-space tones and lets class win over security', () => {
  expect(
    systemIdentityReadout({ name: 'J005160', security: -1, whClassId: 13 }),
  ).toEqual({ label: 'J005160 - C13', tone: 'text-wh-c6' });
  expect(
    systemIdentityReadout({ name: 'Thera', security: -0.5, whClassId: 12 }),
  ).toEqual({ label: 'Thera - Thera', tone: 'text-tone-teal' });
  expect(
    systemIdentityReadout({ name: 'Vidette', security: -0.5, whClassId: 16 }),
  ).toEqual({ label: 'Vidette - Drifter', tone: 'text-tone-purple' });
  expect(
    systemIdentityReadout({ name: 'Raravoss', security: -0.5, whClassId: 25 }),
  ).toEqual({ label: 'Raravoss - Pochven', tone: 'text-tone-red' });
  expect(
    systemIdentityReadout({ name: 'J170552', security: null, whClassId: 2 }),
  ).toEqual({ label: 'J170552 - C2', tone: 'text-wh-c2' });
});

it('renders independently placeable classification chips and omits unresolved facts', () => {
  expect(systemClassificationReadout({ security: -1, whClassId: 4 })).toEqual({
    label: 'C4',
    tone: 'text-wh-c4',
  });
  expect(
    systemClassificationReadout({ security: 0.946, whClassId: null }),
  ).toEqual({ label: '0.9', tone: 'text-sec-09' });
  expect(
    systemClassificationReadout({ security: null, whClassId: null }),
  ).toBeNull();
});

it.each([
  [3, 'C3', 'text-wh-c3'],
  [7, 'HS', 'text-sec-10'],
  [8, 'LS', 'text-sec-04'],
  [9, 'NS', 'text-sec-null'],
])('destination class id %i reads %s in %s', (whClassId, label, tone) => {
  expect(systemDestinationClassReadout(whClassId)).toEqual({ label, tone });
});

it('does not fabricate a destination class for an unknown id', () => {
  expect(systemDestinationClassReadout(null)).toBeNull();
  expect(systemDestinationClassReadout(99)).toBeNull();
});

it.each([
  ['unknown', 'C1–C3', 'text-wh-c2'],
  ['dangerous', 'C4–C5', 'text-wh-c4'],
  ['deadly', 'C6', 'text-wh-c6'],
  ['hisec', 'HS', 'text-sec-10'],
  ['lowsec', 'LS', 'text-sec-04'],
  ['nullsec', 'NS', 'text-sec-null'],
  ['thera', 'Thera', 'text-tone-teal'],
  ['pochven', 'Pochven', 'text-tone-red'],
  ['drifter', 'Drifter', 'text-tone-purple'],
] as const)('destination hint %s reads %s in %s', (hint, label, tone) => {
  expect(systemDestinationHintReadout(hint)).toEqual({ label, tone });
});

it('keeps the unknown chip as C1–C3 even though the bucket also admits shattered C13', () => {
  expect(systemDestinationHintReadout('unknown')).toEqual({
    label: 'C1–C3',
    tone: 'text-wh-c2',
  });
});

it('omits a destination-hint chip when the field is unset', () => {
  expect(systemDestinationHintReadout(null)).toBeNull();
});
