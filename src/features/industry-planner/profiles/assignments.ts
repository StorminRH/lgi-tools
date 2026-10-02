import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import { ALL_MANUFACTURING, CATEGORY_GROUPS, type CategoryKey } from './production-categories';
import { facilityKey, type ProfileDocument, type ProfileFacility, type ProfileMember } from './profile-document';

/**
 * Edits to a profile's team and facilities. Categories nest: all
 * manufacturing holds its groups, a group holds its leaves. Ticking a parent
 * covers everything under it, so its children are not stored beside it.
 */

const CHILDREN = new Map<CategoryKey, CategoryKey[]>([
  [ALL_MANUFACTURING, CATEGORY_GROUPS.filter((g) => g.activity === MANUFACTURING_ACTIVITY).map((g) => g.key)],
  ...CATEGORY_GROUPS.map((g): [CategoryKey, CategoryKey[]] => [g.key, g.leaves.map((l) => l.key)]),
]);

const PARENT = new Map<CategoryKey, CategoryKey>(
  [...CHILDREN].flatMap(([parent, children]) => children.map((child): [CategoryKey, CategoryKey] => [child, parent])),
);

function descendants(key: CategoryKey): CategoryKey[] {
  return (CHILDREN.get(key) ?? []).flatMap((child) => [child, ...descendants(child)]);
}

/** The ticked parent that already covers a category, if any. */
export function coveringParent(categories: readonly CategoryKey[], key: CategoryKey): CategoryKey | null {
  for (let parent = PARENT.get(key); parent !== undefined; parent = PARENT.get(parent)) {
    if (categories.includes(parent)) return parent;
  }
  return null;
}

export function toggleCategory(categories: readonly CategoryKey[], key: CategoryKey, on: boolean): CategoryKey[] {
  const others = categories.filter((c) => c !== key);
  if (!on) return others;
  if (coveringParent(categories, key) !== null) return [...categories];
  const covered = new Set(descendants(key));
  return [...others.filter((c) => !covered.has(c)), key];
}

export function addMember(doc: ProfileDocument, member: Omit<ProfileMember, 'categories'>): ProfileDocument {
  if (doc.members.some((m) => m.characterId === member.characterId)) return doc;
  return { ...doc, members: [...doc.members, { ...member, categories: [] }] };
}

export function removeMember(doc: ProfileDocument, characterId: number): ProfileDocument {
  return { ...doc, members: doc.members.filter((m) => m.characterId !== characterId) };
}

export function setMemberCategories(
  doc: ProfileDocument,
  characterId: number,
  categories: CategoryKey[],
): ProfileDocument {
  return {
    ...doc,
    members: doc.members.map((m) => (m.characterId === characterId ? { ...m, categories } : m)),
  };
}

export function addFacility(doc: ProfileDocument, facility: ProfileFacility): ProfileDocument {
  const key = facilityKey(facility);
  if (doc.facilities.some((f) => facilityKey(f) === key)) return doc;
  return { ...doc, facilities: [...doc.facilities, facility] };
}

export function removeFacility(doc: ProfileDocument, key: string): ProfileDocument {
  return { ...doc, facilities: doc.facilities.filter((f) => facilityKey(f) !== key) };
}

export function setFacilityCategories(doc: ProfileDocument, key: string, categories: CategoryKey[]): ProfileDocument {
  return {
    ...doc,
    facilities: doc.facilities.map((f) => (facilityKey(f) === key ? { ...f, categories } : f)),
  };
}
