import { describe, expect, it } from 'vitest';
import { resolveMenuControls, resolvePageControls } from './controls';
import type { PageSettingsSpec, SettingsControlRef } from './types';

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
    // The preceding equality assertion guarantees both indexed models exist.
    expect(models[0]).toMatchObject({
      kind: 'preference-enum',
      options: ['cards', 'table'],
    });
    expect(models[1]).toMatchObject({
      kind: 'preference-enum',
      options: ['lightbox', 'expand'],
    });
    expect(models[0]!.def.key).toBe('sites.view');
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

  it('drops non-enum, non-boolean preferences (no generic control shape for objects)', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'planner.buildLocation', placement: 'section' },
        { key: 'sites.view', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view']);
  });

  it('resolves boolean preference keys to switch models', () => {
    const models = resolveMenuControls(
      spec([
        { key: 'atlas.autoLayout', placement: 'section', description: 're-enabling restores the computed layout' },
        { key: 'atlas.cameraFollow', placement: 'section' },
        { key: 'atlas.clickFocus', placement: 'section' },
      ]),
    );
    expect(models.map((m) => m.kind)).toEqual([
      'preference-boolean',
      'preference-boolean',
      'preference-boolean',
    ]);
    expect(models.map((m) => m.key)).toEqual([
      'atlas.autoLayout',
      'atlas.cameraFollow',
      'atlas.clickFocus',
    ]);
    expect(models.map((m) => m.label)).toEqual([
      'auto layout',
      'camera follow',
      'click focus',
    ]);
    expect(models.map((m) => m.description)).toEqual([
      're-enabling restores the computed layout',
      undefined,
      undefined,
    ]);
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

  it('drops a feature ref even at section placement (D-3: the menu hosts no feature control)', () => {
    // The type already pins feature refs to 'inline'; the cast exercises the
    // runtime skip that backstops it.
    const featureAtSection = {
      kind: 'feature',
      id: 'corp-structure-sharing',
      placement: 'section',
    } as unknown as SettingsControlRef;
    const models = resolveMenuControls(
      spec([featureAtSection, { key: 'sites.view', placement: 'section' }]),
    );
    expect(models.map((m) => m.key)).toEqual(['sites.view']);
  });
});

describe('resolvePageControls', () => {
  it('returns nothing for a null spec', () => {
    expect(resolvePageControls(null)).toEqual([]);
  });

  it('resolves an enum preference key at inline placement (D-8: one registry entry lights a page setting)', () => {
    const models = resolvePageControls(spec([{ key: 'sites.view', placement: 'inline' }]));
    expect(models).toHaveLength(1);
    // The preceding length assertion guarantees the first indexed model exists.
    const model = models[0]!;
    expect(model.kind).toBe('preference-enum');
    if (model.kind === 'preference-enum') {
      expect(model.options).toEqual(['cards', 'table']);
      expect(model.label).toBe('view');
      expect(model.def.key).toBe('sites.view');
    }
  });

  it('resolves a feature ref to its id model', () => {
    const models = resolvePageControls(
      spec([{ kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' }]),
    );
    expect(models).toEqual([{ kind: 'feature', id: 'corp-structure-sharing' }]);
  });

  it('renders only inline-placed refs (section and global are not the page’s)', () => {
    const models = resolvePageControls(
      spec([
        { key: 'sites.view', placement: 'section' },
        { kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' },
      ]),
    );
    expect(models).toEqual([{ kind: 'feature', id: 'corp-structure-sharing' }]);
  });

  it('drops unknown and non-renderable preference keys at inline placement', () => {
    const models = resolvePageControls(
      spec([
        { key: 'sites.unregistered', placement: 'inline' },
        { key: 'planner.buildLocation', placement: 'inline' },
        { key: 'sites.view', placement: 'inline' },
      ]),
    );
    expect(models).toEqual([
      expect.objectContaining({ kind: 'preference-enum', key: 'sites.view' }),
    ]);
  });

  it('orders across kinds: explicit order first, then declaration order', () => {
    const models = resolvePageControls(
      spec([
        { key: 'sites.view', placement: 'inline' },
        { kind: 'feature', id: 'corp-structure-sharing', placement: 'inline', order: 1 },
      ]),
    );
    expect(models.map((m) => (m.kind === 'feature' ? m.id : m.key))).toEqual([
      'corp-structure-sharing',
      'sites.view',
    ]);
  });
});
