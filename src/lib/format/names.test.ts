import { describe, expect, it, test } from 'vitest';
import { formatStationName, initials, nameOrUnresolved, unresolvedName } from './names';

describe('initials', () => {
  it('builds a two-letter monogram from words or a single token', () => {
    expect(initials('John Doe')).toBe('JD');
    expect(initials('mary jane watson')).toBe('MJ');
    expect(initials('Cyrus')).toBe('CY');
    expect(initials('  Anne   Bell  ')).toBe('AB');
    expect(initials('x')).toBe('X');
    expect(initials('')).toBe('');
  });

  it('reads each word from its first letter or digit, and keeps a word that has neither', () => {
    expect(initials("'Moreau' Fortizar")).toBe('MF');
    expect(initials("'Augmented' Hammerhead")).toBe('AH');
    expect(initials('"Quoted"')).toBe('QU');
    expect(initials('C3')).toBe('C3');
    expect(initials('→')).toBe('→');
  });
});

test('unresolvedName labels the id with its entity kind, without a # sign', () => {
  expect(unresolvedName('type', 587)).toBe('Type 587');
  expect(unresolvedName('skill', 3396)).toBe('Skill 3396');
  expect(unresolvedName('character', 42)).toBe('Character 42');
  expect(unresolvedName('corporation', 98000001)).toBe('Corporation 98000001');
  expect(unresolvedName('structure', 1035466617946)).toBe('Structure 1035466617946');
  expect(unresolvedName('station', 60003760)).toBe('Station 60003760');
  expect(unresolvedName('character', '2112625428')).toBe('Character 2112625428');
});

test('nameOrUnresolved reads the id-keyed record and falls back by kind on a miss', () => {
  const names = { '42': 'Some Pilot', '98000001': 'Some Corp' };
  expect(nameOrUnresolved(names, 42, 'character')).toBe('Some Pilot');
  expect(nameOrUnresolved(names, 98000001, 'corporation')).toBe('Some Corp');
  expect(nameOrUnresolved(names, 43, 'character')).toBe('Character 43');
  expect(nameOrUnresolved(names, 98000002, 'corporation')).toBe('Corporation 98000002');
  expect(nameOrUnresolved({}, 587, 'type')).toBe('Type 587');
});

test('formatStationName collapses the moon form and typesets the first plain separator', () => {
  expect(formatStationName('Jita IV - Moon 4 - Caldari Navy Assembly Plant')).toBe(
    'Jita IV-4 — Caldari Navy Assembly Plant',
  );
  expect(formatStationName('Dodixie IX - Moon 20 - Federation Navy Assembly Plant')).toBe(
    'Dodixie IX-20 — Federation Navy Assembly Plant',
  );
  expect(formatStationName('Amarr VIII (Oris) - Emperor Family Academy')).toBe(
    'Amarr VIII (Oris) — Emperor Family Academy',
  );
  expect(formatStationName('A - B - C')).toBe('A — B - C');
  expect(formatStationName('Some Station')).toBe('Some Station');
});
