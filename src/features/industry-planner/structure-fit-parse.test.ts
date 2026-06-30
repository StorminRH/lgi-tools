import { describe, expect, it } from 'vitest';
import { parseStructureFit, type ResolveTypeId } from './structure-fit-parse';

// Verified real typeIDs (everef). The resolver intentionally also knows the two
// service modules, to prove they're excluded by the parser, not by an absent name.
const TYPES = new Map<string, number>([
  ['Azbel', 35826],
  ['Sotiyo', 35827],
  ['Standup L-Set Structure Manufacturing Efficiency I', 43720],
  ['Standup L-Set Equipment Manufacturing Efficiency I', 43721],
  ['Standup Manufacturing Plant I', 35878], // service module — must be excluded
  ['Standup Research Lab I', 35891], // service module — must be excluded
]);
const resolve: ResolveTypeId = (name) => TYPES.get(name);

// Grammar-faithful Azbel fit (CCP fitting spec): high slots, a rig, two service
// modules, then a fighter after the double blank line.
const AZBEL_FIT = `[Azbel, Cap Production]
Standup Multirole Missile Launcher I
Standup Multirole Missile Launcher I

Standup Cap Battery I

Standup L-Set Structure Manufacturing Efficiency I

Standup Manufacturing Plant I
Standup Research Lab I


Standup Equite II x6`;

describe('parseStructureFit', () => {
  it('extracts the structure and only the rig from a full fit', () => {
    // Launchers/cap battery ("Standup …" without "-Set "), service modules, and the
    // fighter ("… x6") are all excluded; only the L-Set rig survives.
    expect(parseStructureFit(AZBEL_FIT, resolve)).toEqual({
      structureTypeId: 35826,
      rigTypeIds: [43720],
    });
  });

  it('collects multiple rigs in order', () => {
    const fit = `[Sotiyo, Cap Yard]
Standup L-Set Structure Manufacturing Efficiency I
Standup L-Set Equipment Manufacturing Efficiency I`;
    expect(parseStructureFit(fit, resolve)).toEqual({
      structureTypeId: 35827,
      rigTypeIds: [43720, 43721],
    });
  });

  it('tolerates missing whitespace after the header comma', () => {
    expect(parseStructureFit('[Azbel,Cap Production]', resolve)?.structureTypeId).toBe(35826);
  });

  it('parses CRLF line endings', () => {
    const fit = '[Azbel, X]\r\nStandup L-Set Structure Manufacturing Efficiency I\r\n';
    expect(parseStructureFit(fit, resolve)).toEqual({ structureTypeId: 35826, rigTypeIds: [43720] });
  });

  it('skips [Empty rig slot] placeholders without depending on them', () => {
    const fit = `[Azbel, Half-Fit]
[Empty rig slot]
Standup L-Set Structure Manufacturing Efficiency I
[Empty rig slot]`;
    expect(parseStructureFit(fit, resolve)?.rigTypeIds).toEqual([43720]);
  });

  it('strips a trailing /offline marker before resolving a rig', () => {
    const fit = `[Azbel, X]
Standup L-Set Structure Manufacturing Efficiency I/offline`;
    expect(parseStructureFit(fit, resolve)?.rigTypeIds).toEqual([43720]);
  });

  it('drops an unresolved rig name but still returns the structure', () => {
    const fit = `[Azbel, X]
Standup XL-Set Phantom Efficiency II
Standup L-Set Structure Manufacturing Efficiency I`;
    expect(parseStructureFit(fit, resolve)).toEqual({ structureTypeId: 35826, rigTypeIds: [43720] });
  });

  it('returns a structure with no rigs when none are fitted', () => {
    expect(parseStructureFit('[Azbel, Empty]', resolve)).toEqual({
      structureTypeId: 35826,
      rigTypeIds: [],
    });
  });

  it('returns null when the structure name does not resolve', () => {
    expect(parseStructureFit('[Keepstar, Home]', resolve)).toBeNull();
  });

  it('returns null on an empty or header-less string', () => {
    expect(parseStructureFit('', resolve)).toBeNull();
    expect(parseStructureFit('   \n  ', resolve)).toBeNull();
    expect(parseStructureFit('Standup L-Set Structure Manufacturing Efficiency I', resolve)).toBeNull();
  });
});
