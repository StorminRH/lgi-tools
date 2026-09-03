import { z } from 'zod';
import { getPreferenceDef, type PreferenceDef } from '@/lib/preferences';
import type { FeatureControlId } from './feature-controls';
import type { PageSettingsSpec, SettingsControlRef } from './types';

export type EnumMenuControlModel = {
  kind: 'preference-enum';
  key: string;
  label: string;
  options: readonly string[];
  def: PreferenceDef<string>;
};

export type BooleanMenuControlModel = {
  kind: 'preference-boolean';
  key: string;
  label: string;
  def: PreferenceDef<boolean>;
};

export type MenuControlModel = EnumMenuControlModel | BooleanMenuControlModel;

export type FeatureControlModel = {
  kind: 'feature';
  id: FeatureControlId;
};

export type PageControlModel = MenuControlModel | FeatureControlModel;

function placedControls(
  spec: PageSettingsSpec,
  placement: SettingsControlRef['placement'],
): SettingsControlRef[] {
  return (spec.controls ?? [])
    .filter((ref) => ref.placement === placement)
    .map((ref, index) => ({ ref, index }))
    .sort(
      (a, b) =>
        (a.ref.order ?? Number.MAX_SAFE_INTEGER) - (b.ref.order ?? Number.MAX_SAFE_INTEGER) ||
        a.index - b.index,
    )
    .map((entry) => entry.ref);
}

function labelFromKey(key: string): string {
  const segment = key.slice(key.lastIndexOf('.') + 1);
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function preferenceModel(ref: { key: string }): MenuControlModel | null {
  const def = getPreferenceDef(ref.key);
  if (def === undefined) return null;
  const label = labelFromKey(ref.key);
  if (def.schema instanceof z.ZodEnum) {
    return {
      kind: 'preference-enum',
      key: ref.key,
      label,
      options: def.schema.options as readonly string[],
      def: def as PreferenceDef<string>,
    };
  }
  if (def.schema instanceof z.ZodBoolean) {
    return {
      kind: 'preference-boolean',
      key: ref.key,
      label,
      def: def as PreferenceDef<boolean>,
    };
  }
  return null;
}

export function resolveMenuControls(spec: PageSettingsSpec | null): MenuControlModel[] {
  if (spec === null) return [];
  const models: MenuControlModel[] = [];
  for (const ref of placedControls(spec, 'section')) {
    if (ref.kind === 'feature') continue;
    const model = preferenceModel(ref);
    if (model !== null) models.push(model);
  }
  return models;
}

export function resolvePageControls(spec: PageSettingsSpec | null): PageControlModel[] {
  if (spec === null) return [];
  const models: PageControlModel[] = [];
  for (const ref of placedControls(spec, 'inline')) {
    if (ref.kind === 'feature') {
      models.push({ kind: 'feature', id: ref.id });
      continue;
    }
    const model = preferenceModel(ref);
    if (model !== null) models.push(model);
  }
  return models;
}
