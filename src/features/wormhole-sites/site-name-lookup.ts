const SITE_NAME_ALIASES: readonly (readonly [string, string])[] = [
  ['Ordinary Permiter Deposit', 'Ordinary Perimeter Deposit'],
];

export function siteNameIndexKeys(name: string): readonly string[] {
  const keys = [name];
  for (const [typo, eve] of SITE_NAME_ALIASES) {
    if (name === typo) keys.push(eve);
    else if (name === eve) keys.push(typo);
  }
  return keys;
}

export type SiteLiveRecipe = {
  readonly typeId: number;
  readonly units: number;

  readonly seedIsk: number | null;
};

type SiteNameRecord = {
  readonly id: number;
  readonly estIsk: number | null;
  readonly liveRecipes: readonly SiteLiveRecipe[];
};

let BY_NAME: ReadonlyMap<string, SiteNameRecord> = new Map();

export type SiteNameIndexEntry = {
  readonly id: number;
  readonly name: string;

  readonly estIsk?: number | null;

  readonly liveRecipes?: readonly SiteLiveRecipe[];
};

export function setSiteNameIndex(entries: readonly SiteNameIndexEntry[]): void {
  const byName = new Map<string, SiteNameRecord>();
  for (const entry of entries) {
    const record = {
      id: entry.id,
      estIsk: entry.estIsk ?? null,
      liveRecipes: entry.liveRecipes ?? [],
    };
    for (const key of siteNameIndexKeys(entry.name)) {
      byName.set(key, record);
    }
  }
  BY_NAME = byName;
}

export function siteIdForSiteName(name: string): number | null {
  return BY_NAME.get(name)?.id ?? null;
}

export function siteEstIskForSiteName(name: string): number | null {
  return BY_NAME.get(name)?.estIsk ?? null;
}

export function siteLiveRecipesForSiteName(name: string): readonly SiteLiveRecipe[] {
  return BY_NAME.get(name)?.liveRecipes ?? [];
}
