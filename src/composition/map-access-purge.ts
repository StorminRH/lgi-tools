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
