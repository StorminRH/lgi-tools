import { ACTIVITY_NAME_TO_ID } from './constants';

export type TypeIconVariant = 'icon' | 'render' | 'bp' | 'bpc';

export type EveImageDescriptor = { typeId: number; variant: TypeIconVariant };

const RENDERABLE_CATEGORIES = new Set(['Ship', 'Drone', 'Structure']);

export function itemImage(typeId: number): EveImageDescriptor {
  return { typeId, variant: 'icon' };
}

export function blueprintImage(blueprintTypeId: number): EveImageDescriptor {
  return { typeId: blueprintTypeId, variant: 'bp' };
}

export function heroImage(blueprintTypeId: number): EveImageDescriptor {
  return blueprintImage(blueprintTypeId);
}

export function nodeImage(
  producingBlueprintTypeId: number | undefined,
  typeId: number,
): EveImageDescriptor {
  return producingBlueprintTypeId !== undefined
    ? blueprintImage(producingBlueprintTypeId)
    : itemImage(typeId);
}

export function jobImage(
  activityId: number,
  productTypeId: number | undefined,
  blueprintTypeId: number,
): EveImageDescriptor {
  const blueprintOutput =
    activityId === ACTIVITY_NAME_TO_ID.research_time ||
    activityId === ACTIVITY_NAME_TO_ID.research_material ||
    activityId === ACTIVITY_NAME_TO_ID.copying ||
    activityId === ACTIVITY_NAME_TO_ID.invention;
  if (blueprintOutput) {
    return blueprintImage(productTypeId ?? blueprintTypeId);
  }
  return productTypeId !== undefined
    ? itemImage(productTypeId)
    : blueprintImage(blueprintTypeId);
}

export function isRenderableCategory(categoryName: string): boolean {
  return RENDERABLE_CATEGORIES.has(categoryName);
}
