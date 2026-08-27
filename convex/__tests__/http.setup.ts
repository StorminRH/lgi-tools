import { convexTest } from 'convex-test';
import schema from '../schema';
import { modules } from './modules.setup';

export const CONVEX_HTTP_SECRET = 'svc-secret';

type ConvexHttpPath =
  | '/sweep'
  | '/jump-evidence'
  | '/resolve-jump'
  | '/signature-elimination'
  | '/purge-online'
  | '/leave-sync'
  | '/purge-location-tracking'
  | '/project-map-access'
  | '/purge-map-access'
  | '/purge-map-chain';

export const postConvexHttp = (
  path: ConvexHttpPath,
  body: BodyInit | null,
  authorized = true,
) =>
  convexTest(schema, modules).fetch(path, {
    method: 'POST',
    ...(authorized ? { headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` } } : {}),
    body,
  });
