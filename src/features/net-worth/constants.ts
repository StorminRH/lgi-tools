/** The row cap per user: the 365 most recent recorded days, not a calendar window. */
export const NET_WORTH_HISTORY_DAYS = 365;

/** PLEX trades only on the Global PLEX Market, so Jita has no book for it; CCP's average is the only honest price. */
export const PLEX_TYPE_ID = 44992;

export const BLUEPRINT_CATEGORY_ID = 9;
export const SKIN_CATEGORY_ID = 91;

/** Injected skillbooks and wardrobe items are not resaleable wealth. */
export const EXCLUDED_LOCATION_FLAGS: readonly string[] = ['Skill', 'Wardrobe'];

export const IMPLANT_LOCATION_FLAG = 'Implant';
