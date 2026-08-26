// Public gated chain read. Convex publishes every public function in this
// directory, so import-graph reasoning must never declare one dead.
// requireMapAccess is the first call. Production watches live on mapChain.
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';

export const MAP_FIXTURE_PAGE_SIZE = 25;

const collectionValidator = v.union(
  v.literal('systems'),
  v.literal('connections'),
  v.literal('signatures'),
  v.literal('notes'),
);

const cursorValidator = v.union(v.string(), v.null());

export const readMapCollection = query({
  args: {
    mapId: v.string(),
    collection: collectionValidator,
    cursor: cursorValidator,
  },
  handler: async (ctx, { mapId, collection, cursor }) => {
    await requireMapAccess(ctx, mapId, 'view');

    const paginationOpts = { cursor, numItems: MAP_FIXTURE_PAGE_SIZE };
    const byMap = (table: 'mapSystems' | 'mapConnections' | 'mapSignatures' | 'mapNotes') =>
      ctx.db.query(table).withIndex('by_map', (q) => q.eq('mapId', mapId));

    switch (collection) {
      case 'systems':
        return await byMap('mapSystems').paginate(paginationOpts);
      case 'connections':
        return await byMap('mapConnections').paginate(paginationOpts);
      case 'signatures':
        return await byMap('mapSignatures').paginate(paginationOpts);
      case 'notes':
        return await byMap('mapNotes').paginate(paginationOpts);
    }
  },
});
