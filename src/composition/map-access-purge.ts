// Wires the composition-owned map-access projection into the maps data-slice
// purge contributor. The contributor itself stays co-located with the maps tables;
// these hooks are the explicit upward seam Fallow requires (data cannot import
// composition, and re-projection needs resolveMapPrincipals).
import {
  projectMapAccess,
  purgeUserMapAccessProjection,
} from '@/composition/map-access-projection';
import { purgeMapChain } from '@/composition/map-purge';
import { registerMapAccessProjectionPurgeHooks } from '@/data/maps/purge';

registerMapAccessProjectionPurgeHooks({
  projectMap: async (mapId) => {
    await projectMapAccess(mapId);
  },
  purgeMapChain: async (mapId) => {
    await purgeMapChain(mapId);
  },
  purgeUserClaims: async (userId) => {
    await purgeUserMapAccessProjection(userId);
  },
});
