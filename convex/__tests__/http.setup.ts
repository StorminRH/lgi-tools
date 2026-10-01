import { convexTest } from 'convex-test';
import schema from '../schema';
import { modules } from './modules.setup';

export const CONVEX_HTTP_SECRET = 'svc-secret';

export const postConvexHttp = (
  path:
    | '/jump-evidence'
    | '/resolve-jump'
    | '/signature-elimination'
    | '/purge-online'
    | '/leave-sync'
    | '/purge-location-tracking'
    | '/project-map-access'
    | '/purge-map-access'
    | '/purge-map-chain'
    | '/map-tracking-snapshot'
    | '/merge-user-state'
    | '/snapshot-merge-tracking'
    | '/restore-merge-tracking'
    | '/list-expired-tracking-receipts'
    | '/delete-expired-tracking-receipts',
  body: BodyInit | null,
  authorized = true,
) =>
  convexTest(schema, modules).fetch(path, {
    method: 'POST',
    ...(authorized ? { headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` } } : {}),
    body,
  });
