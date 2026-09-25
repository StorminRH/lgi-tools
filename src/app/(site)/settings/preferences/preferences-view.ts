import {
  type MenuControlModel,
  resolveMenuControls,
  resolvePageControls,
} from '@/platform/page-settings/controls';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

export type PreferenceGroupView = {
  id: string;
  title: string;
  route: string;
  models: MenuControlModel[];
};

function titleForSpec(spec: PageSettingsSpec): string {
  if (spec.title !== undefined) return spec.title.replace(/\s+settings$/i, '');
  const segment = spec.route.split('/').filter(Boolean).pop() ?? spec.route;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function preferenceModels(spec: PageSettingsSpec): MenuControlModel[] {
  const seen = new Set<string>();
  const models: MenuControlModel[] = [];
  const candidates = [
    ...resolveMenuControls(spec),
    ...resolvePageControls(spec).filter(
      (model): model is MenuControlModel => model.kind !== 'feature',
    ),
  ];
  for (const model of candidates) {
    if (seen.has(model.key)) continue;
    seen.add(model.key);
    models.push(model);
  }
  return models;
}

export function derivePreferenceGroups(
  specs: readonly PageSettingsSpec[],
): PreferenceGroupView[] {
  return specs
    .map((spec) => ({
      id: spec.route,
      title: titleForSpec(spec),
      route: spec.route,
      models: preferenceModels(spec),
    }))
    .filter((group) => group.models.length > 0);
}
