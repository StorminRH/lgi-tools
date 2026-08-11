import { describe, expect, it } from 'vitest';
import {
  systemClassificationReadout,
  systemClassText,
  systemDestinationClassReadout,
  systemIdentityReadout,
} from './system-identity';

describe('system class text', () => {
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

  it('has no class text for a k-space system', () => {
    expect(systemClassText(null)).toBeNull();
  });

  it('has no class text for an id the SDE does not assign', () => {
    // 99 is synthetic — no real system carries it. The set assertion above is what guards real ids.
    expect(systemClassText(99)).toBeNull();
  });
});

describe('k-space identity readouts (D-E)', () => {
  it.each([
    // In-game display rounding: half-up to 0.1; ≥0.45 shows (and tones) as 0.5.
    ['Jita', 0.946, 'Jita - 0.9', 'text-sec-09'],
    ['Uedama', 0.45, 'Uedama - 0.5', 'text-sec-05'],
    // Any positive value below 0.05 displays as 0.1, never 0.0.
    ['Ouelletta', 0.02, 'Ouelletta - 0.1', 'text-sec-01'],
    ['Old Man Star', 0.34, 'Old Man Star - 0.3', 'text-sec-03'],
    ['Ahbazon', 0.0, 'Ahbazon - 0.0', 'text-sec-null'],
    ['1DQ1-A', -0.24, '1DQ1-A - -0.2', 'text-sec-null'],
  ])('%s at %d reads "%s" in %s', (name, security, label, tone) => {
    expect(systemIdentityReadout({ name, security, whClassId: null })).toEqual({
      label,
      tone,
    });
  });

  it('renders the security form for the k-space class ids too', () => {
    expect(
      systemIdentityReadout({ name: 'Amarr', security: 1.0, whClassId: 7 }),
    ).toEqual({ label: 'Amarr - 1.0', tone: 'text-sec-10' });
    expect(
      systemIdentityReadout({ name: 'Rancer', security: 0.4, whClassId: 8 }),
    ).toEqual({ label: 'Rancer - 0.4', tone: 'text-sec-04' });
    expect(
      systemIdentityReadout({ name: 'HED-GP', security: -0.1, whClassId: 9 }),
    ).toEqual({ label: 'HED-GP - -0.1', tone: 'text-sec-null' });
  });

  it('keeps a plain neutral name when neither class nor security is known', () => {
    // An unresolved directory entry is a plainer label, not a loading state.
    expect(
      systemIdentityReadout({ name: '30000142', security: null, whClassId: null }),
    ).toEqual({ label: '30000142', tone: 'text-name' });
    // The SDE's handful of untagged hi-sec rows carry a class id but no value.
    expect(
      systemIdentityReadout({ name: 'Bastion', security: null, whClassId: 7 }),
    ).toEqual({ label: 'Bastion', tone: 'text-name' });
  });
});

describe('J-space identity readouts (D-E)', () => {
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

  it('puts shattered C13 on the dangerous end of the ramp', () => {
    expect(
      systemIdentityReadout({ name: 'J005160', security: -1, whClassId: 13 }),
    ).toEqual({ label: 'J005160 - C13', tone: 'text-wh-c6' });
  });

  it.each([
    ['Thera', 12, 'Thera - Thera', 'text-tone-teal'],
    ['Vidette', 16, 'Vidette - Drifter', 'text-tone-purple'],
    ['Raravoss', 25, 'Raravoss - Pochven', 'text-tone-red'],
  ])('%s keeps its distinct tone', (name, whClassId, label, tone) => {
    expect(systemIdentityReadout({ name, security: -0.5, whClassId })).toEqual({
      label,
      tone,
    });
  });

  it('lets the class win over security, even a missing one', () => {
    expect(
      systemIdentityReadout({ name: 'J170552', security: null, whClassId: 2 }),
    ).toEqual({ label: 'J170552 - C2', tone: 'text-wh-c2' });
  });
});

describe('independently placeable classification readouts', () => {
  it('returns only the colored J-space class', () => {
    expect(systemClassificationReadout({ security: -1, whClassId: 4 })).toEqual({
      label: 'C4',
      tone: 'text-wh-c4',
    });
  });

  it('returns only rounded, colored k-space security', () => {
    expect(
      systemClassificationReadout({ security: 0.946, whClassId: null }),
    ).toEqual({ label: '0.9', tone: 'text-sec-09' });
  });

  it('returns no indicator when classification facts are unresolved', () => {
    expect(
      systemClassificationReadout({ security: null, whClassId: null }),
    ).toBeNull();
  });
});

describe('codex destination-class readouts', () => {
  it.each([
    [3, 'C3', 'text-wh-c3'],
    [7, 'HS', 'text-sec-05'],
    [8, 'LS', 'text-sec-04'],
    [9, 'NS', 'text-sec-null'],
  ])('renders class id %i as %s in %s', (whClassId, label, tone) => {
    expect(systemDestinationClassReadout(whClassId)).toEqual({ label, tone });
  });

  it('does not fabricate a destination class for an unknown id', () => {
    expect(systemDestinationClassReadout(null)).toBeNull();
    expect(systemDestinationClassReadout(99)).toBeNull();
  });
});
