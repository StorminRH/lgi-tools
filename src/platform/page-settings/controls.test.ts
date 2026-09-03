import { describe, expect, it } from 'vitest';
import { resolveMenuControls, resolvePageControls } from './controls';
import type { PageSettingsSpec, SettingsControlRef } from './types';

function spec(controls: PageSettingsSpec['controls']): PageSettingsSpec {
  return { route: '/sites', controls };
}

describe('resolveMenuControls', () => {
  it('resolves section enum and boolean prefs with labels, order, and drop rules', () => {
    expect(resolveMenuControls(null)).toEqual([]);
    expect(resolveMenuControls({ route: '/jobs' })).toEqual([]);

    const enums = resolveMenuControls(
      spec([
        { key: 'sites.view', placement: 'section' },
        { key: 'sites.detailMode', placement: 'section' },
      ]),
    );
    expect(enums.map((m) => m.key)).toEqual(['sites.view', 'sites.detailMode']);
    expect(enums[0]).toMatchObject({
      kind: 'preference-enum',
      options: ['cards', 'table'],
    });
    expect(enums[1]).toMatchObject({
      kind: 'preference-enum',
      options: ['lightbox', 'expand'],
    });
    expect(enums[0]!.def.key).toBe('sites.view');
    expect(enums.map((m) => m.label)).toEqual(['view', 'detail mode']);

    expect(
      resolveMenuControls(
        spec([
          { key: 'sites.view', placement: 'inline' },
          { key: 'sites.detailMode', placement: 'section' },
        ]),
      ).map((m) => m.key),
    ).toEqual(['sites.detailMode']);

    expect(
      resolveMenuControls(
        spec([
          { key: 'sites.unregistered', placement: 'section' },
          { key: 'planner.buildLocation', placement: 'section' },
          { key: 'sites.view', placement: 'section' },
        ]),
      ).map((m) => m.key),
    ).toEqual(['sites.view']);

    const booleans = resolveMenuControls(
      spec([
        { key: 'atlas.autoLayout', placement: 'section' },
        { key: 'atlas.cameraFollow', placement: 'section' },
        { key: 'atlas.clickFocus', placement: 'section' },
      ]),
    );
    expect(booleans.map((m) => m.kind)).toEqual([
      'preference-boolean',
      'preference-boolean',
      'preference-boolean',
    ]);
    expect(booleans.map((m) => m.key)).toEqual([
      'atlas.autoLayout',
      'atlas.cameraFollow',
      'atlas.clickFocus',
    ]);
    expect(booleans.map((m) => m.label)).toEqual([
      'auto layout',
      'camera follow',
      'click focus',
    ]);
    expect(
      resolveMenuControls(
        spec([
          { key: 'sites.view', placement: 'section' },
          { key: 'sites.detailMode', placement: 'section', order: 1 },
        ]),
      ).map((m) => m.key),
    ).toEqual(['sites.detailMode', 'sites.view']);
    expect(
      resolveMenuControls(
        spec([
          { key: 'sites.view', placement: 'section', order: 1 },
          { key: 'sites.detailMode', placement: 'section', order: 1 },
        ]),
      ).map((m) => m.key),
    ).toEqual(['sites.view', 'sites.detailMode']);

    const featureAtSection = {
      kind: 'feature',
      id: 'corp-structure-sharing',
      placement: 'section',
    } as unknown as SettingsControlRef;
    expect(
      resolveMenuControls(
        spec([featureAtSection, { key: 'sites.view', placement: 'section' }]),
      ).map((m) => m.key),
    ).toEqual(['sites.view']);
  });
});

describe('resolvePageControls', () => {
  it('resolves inline prefs and features with order and drop rules', () => {
    expect(resolvePageControls(null)).toEqual([]);

    const models = resolvePageControls(spec([{ key: 'sites.view', placement: 'inline' }]));
    expect(models).toHaveLength(1);
    const model = models[0]!;
    expect(model.kind).toBe('preference-enum');
    if (model.kind === 'preference-enum') {
      expect(model.options).toEqual(['cards', 'table']);
      expect(model.label).toBe('view');
      expect(model.def.key).toBe('sites.view');
    }

    expect(
      resolvePageControls(
        spec([{ kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' }]),
      ),
    ).toEqual([{ kind: 'feature', id: 'corp-structure-sharing' }]);

    expect(
      resolvePageControls(
        spec([
          { key: 'sites.view', placement: 'section' },
          { kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' },
        ]),
      ),
    ).toEqual([{ kind: 'feature', id: 'corp-structure-sharing' }]);

    expect(
      resolvePageControls(
        spec([
          { key: 'sites.unregistered', placement: 'inline' },
          { key: 'planner.buildLocation', placement: 'inline' },
          { key: 'sites.view', placement: 'inline' },
        ]),
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'preference-enum', key: 'sites.view' }),
    ]);

    expect(
      resolvePageControls(
        spec([
          { key: 'sites.view', placement: 'inline' },
          {
            kind: 'feature',
            id: 'corp-structure-sharing',
            placement: 'inline',
            order: 1,
          },
        ]),
      ).map((m) => (m.kind === 'feature' ? m.id : m.key)),
    ).toEqual(['corp-structure-sharing', 'sites.view']);
  });
});
