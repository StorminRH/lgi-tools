import { describe, expect, it } from 'vitest';
import { resolveMenuControls } from './controls';
import type { PageSettingsSpec } from './types';

// Spec literals + the REAL lib defs (sitesView / sitesDetailMode /
// plannerBuildLocation) — no feature import; the resolver's contract is
// key-based, so the literals stand in for any feature's spec.

function spec(controls: PageSettingsSpec['controls']): PageSettingsSpec {
  return { route: '/sites', controls };
}

describe('resolveMenuControls', () => {
  it('returns nothing for a null spec (spec-less route)', () => {
    expect(resolveMenuControls(null)).toEqual([]);
  });

  it('returns nothing for a spec with no controls (structure-first, D-8)', () => {
    expect(resolveMenuControls({ route: '/jobs' })).toEqual([]);
  });

  it('resolves enum preference keys to models with schema-derived options', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'section' },
        { key: 'sites.detailMode', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view', 'sites.detailMode']);
    expect(models[0].options).toEqual(['cards', 'table']);
    expect(models[1].options).toEqual(['lightbox', 'expand']);
    expect(models[0].def.key).toBe('sites.view');
  });

  it('derives display labels from the key, spacing camelCase', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'section' },
        { key: 'sites.detailMode', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.label)).toEqual(['view', 'detail mode']);
  });

  it('renders only section-placed refs (inline and global are not the menu’s)', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'inline' },
        { key: 'sites.detailMode', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.detailMode']);
  });

  it('drops keys with no registered preference def', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.unregistered', placement: 'section' },
        { key: 'sites.view', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view']);
  });

  it('drops non-enum preferences (no generic control shape for them pre-ACCOUNT.6)', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'planner.buildLocation', placement: 'section' },
        { key: 'sites.view', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view']);
  });

  it('sorts explicit order first, unordered refs following in declaration order', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'section' },
        { key: 'sites.detailMode', placement: 'section', order: 1 },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.detailMode', 'sites.view']);
  });

  it('breaks order ties by declaration position', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'section', order: 1 },
        { key: 'sites.detailMode', placement: 'section', order: 1 },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view', 'sites.detailMode']);
  });
});
