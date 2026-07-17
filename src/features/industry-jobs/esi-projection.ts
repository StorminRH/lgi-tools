// Boundary schema + projection for the one ESI read the industry-jobs tracker
// syncs (3.4.8). ESI is an external API, so its body is Zod-validated here
// before anything is written to Convex; the projected shape is exactly what
// the `industryJobsSync` doc stores. Runtime-light by design — zod only —
// because the Convex action (convex/industryJobsSync.ts) imports this module
// and runs on the default Convex runtime.
//
// Wire shape verified against the live ESI OpenAPI spec
// (esi.evetech.net/meta/openapi.json), 2026-06-12. Job keys stay snake_case:
// they are ESI's truth, stored verbatim — except `status`, which the Convex
// layer derives (see convex/schema.ts).
import { z } from 'zod';

/**
 * Closed industry jobs vocabulary and canonical order for job statuses; consumers derive
 * validation and iteration from this one list.
 */
export const JOB_STATUSES = [
  'active',
  'paused',
  'ready',
  'delivered',
  'cancelled',
  'reverted',
] as const;

/**
 * Closed set of externally meaningful industry jobs states; callers must handle every member
 * instead of inferring state from incidental fields.
 */
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * GET /characters/\{id\}/industry/jobs — one element per job. The endpoint
 * returns more fields than the tracker stores (location/facility ids, cost,
 * invention detail); Zod strips the rest so the doc carries only what the UI
 * renders. Without `include_completed` only active/paused/ready jobs appear —
 * a delivered job simply vanishes from the next fresh body.
 */
export const industryJobSchema = z.object({
  job_id: z.number().int(),
  // The character who installed the job — on the corp endpoint it identifies the
  // corp member running each job, which the merged active-jobs board reads for
  // per-job runner attribution (3.7.3.4). ESI always sends it; optional here only
  // to keep the projected shape identical to the stored doc, whose validator is
  // optional so pre-3.7.3.4 docs stay valid until their next resync.
  installer_id: z.number().int().optional(),
  activity_id: z.number().int(),
  blueprint_type_id: z.number().int(),
  // Absent on copying/research jobs — the blueprint is the headline there.
  product_type_id: z.number().int().optional(),
  runs: z.number().int(),
  status: z.enum(JOB_STATUSES),
  start_date: z.string(),
  end_date: z.string(),
  // Present while the installing facility is offline; freezes progress.
  pause_date: z.string().optional(),
});
const industryJobsBodySchema = z.array(industryJobSchema);

/**
 * Normalized personal or corporation industry job with absolute timing, activity, product,
 * installer, and status.
 */
export type IndustryJob = z.infer<typeof industryJobSchema>;

/**
 * Returns null on a shape mismatch — the syncing action records a contract
 * error for that character rather than retrying (a shape change won't fix
 * itself) or crashing the whole run.
 */
export function parseIndustryJobsBody(body: unknown): IndustryJob[] | null {
  const parsed = industryJobsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  // ESI documents no ordering guarantee; the board renders soonest-done
  // first. job_id tie-breaks for a stable order.
  return [...parsed.data].sort(
    (a, b) => Date.parse(a.end_date) - Date.parse(b.end_date) || a.job_id - b.job_id,
  );
}

/**
 * The type ids a set of job boards reference — each job's blueprint plus its
 * product where one exists — so a consumer can resolve them to names in one
 * batch. Reads only the `data.jobs` each entry carries, so the per-character
 * (personal) and per-corporation (corp) live shapes both satisfy it. Lives here
 * in the runtime-light projection (not the 'use client' panel) so the Neon
 * server wrapper (src/db/industry-jobs-sync.ts) can resolve names server-side and
 * the corp board can still resolve them client-side — one shared extraction.
 */
export function jobTypeIds(entries: { data: { jobs: IndustryJob[] } | null }[]): number[] {
  const ids: number[] = [];
  for (const entry of entries) {
    for (const job of entry.data?.jobs ?? []) {
      ids.push(job.blueprint_type_id);
      if (job.product_type_id !== undefined) ids.push(job.product_type_id);
    }
  }
  return ids;
}
