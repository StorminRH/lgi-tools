import { ACTIVITY_NAME_TO_ID } from './constants';

/**
 * Closed rendition vocabulary served by CCP's type-image endpoint. Owned here so every
 * rendition decision has one home; render plumbing (TypeIcon) consumes it, and call
 * sites only ever receive it inside a resolved EveImageDescriptor.
 */
export type TypeIconVariant = 'icon' | 'render' | 'bp' | 'bpc';

/**
 * A fully resolved EVE type-image choice — which id to show and which rendition to
 * request. Produced only by this module's intent resolvers; hand it to TypeIcon as-is.
 */
export type EveImageDescriptor = { typeId: number; variant: TypeIconVariant };

// SDE categories whose products serve the `render` rendition (a 3D model).
// Verified renderable: Ship (587, 3764), Drone (2454), Structure (35832).
// Any other category degrades to `icon` — graceful, and never issues a
// `/render` request that would 400.
const RENDERABLE_CATEGORIES = new Set(['Ship', 'Drone', 'Structure']);

/**
 * Show-the-item intent: raw ledgers, node leaf defaults, and non-blueprint typed search
 * rows show the item's own inventory `icon`. 404s stay TypeIcon's monogram fallback,
 * so callers never pre-check existence.
 */
export function itemImage(typeId: number): EveImageDescriptor {
  return { typeId, variant: 'icon' };
}

/**
 * A row that is a blueprint or saved plan shows the blueprint scroll. Blueprint types
 * serve no `icon` rendition, so `bp` is the only valid rendition for them.
 */
export function blueprintImage(blueprintTypeId: number): EveImageDescriptor {
  return { typeId: blueprintTypeId, variant: 'bp' };
}

/**
 * Hero intent: the large planner hero shows the blueprint scroll for the blueprint
 * being configured. This is the operator-reviewed alternative to the product render.
 */
export function heroImage(blueprintTypeId: number): EveImageDescriptor {
  return blueprintImage(blueprintTypeId);
}

/**
 * Show-what-you-run intent (the promoted nodeIcon): a buildable/reaction node shows
 * the producing blueprint/formula `bp`; a raw leaf with no producing type keeps its
 * own `icon`. `bpc` stays deliberately unused: ownership is conveyed by frame tone.
 */
export function nodeImage(
  producingBlueprintTypeId: number | undefined,
  typeId: number,
): EveImageDescriptor {
  return producingBlueprintTypeId !== undefined
    ? blueprintImage(producingBlueprintTypeId)
    : itemImage(typeId);
}

/**
 * Industry-job intent: research, copying, and invention outputs are blueprints even
 * when ESI supplies product_type_id, so they use `bp`; manufacturing and reactions
 * show their product inventory icon. A missing product falls back to the input blueprint.
 */
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

/**
 * Returns whether an EVE category's products serve the large `render` rendition
 * (verified: Ship, Drone, Structure). Every other category degrades to `icon`.
 */
export function isRenderableCategory(categoryName: string): boolean {
  return RENDERABLE_CATEGORIES.has(categoryName);
}
