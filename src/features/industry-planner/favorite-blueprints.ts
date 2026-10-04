'use client';

import { useCallback } from 'react';
import { usePreference, usePreferencesReady } from '@/components/PreferencesProvider';
import { industryFavoriteBlueprints, MAX_FAVORITE_BLUEPRINTS } from '@/lib/preferences';

export type FavoriteBlueprint = (typeof industryFavoriteBlueprints)['fallback'][number];

/**
 * The starred blueprints, newest first, and a star that adds or removes one.
 * Null until read, so the landing page never shows them as empty first.
 */
export function useFavoriteBlueprints(): {
  favorites: FavoriteBlueprint[] | null;
  toggle: (blueprint: FavoriteBlueprint) => void;
} {
  const ready = usePreferencesReady();
  const [favorites, setFavorites] = usePreference(industryFavoriteBlueprints);
  const toggle = useCallback(
    (blueprint: FavoriteBlueprint) => {
      // Before the saved list is read, a star would replace it.
      if (!ready) return;
      const others = favorites.filter((f) => f.typeId !== blueprint.typeId);
      // Past the cap the oldest star drops, rather than the list failing to save.
      setFavorites(others.length < favorites.length ? others : [blueprint, ...others].slice(0, MAX_FAVORITE_BLUEPRINTS));
    },
    [ready, favorites, setFavorites],
  );
  return { favorites: ready ? favorites : null, toggle };
}
