import { z } from 'zod';

export const JOB_STATUSES = [
  'active',
  'paused',
  'ready',
  'delivered',
  'cancelled',
  'reverted',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const industryJobSchema = z.object({
  job_id: z.number().int(),
  installer_id: z.number().int().optional(),
  activity_id: z.number().int(),
  blueprint_type_id: z.number().int(),
  product_type_id: z.number().int().optional(),
  runs: z.number().int(),
  status: z.enum(JOB_STATUSES),
  start_date: z.string(),
  end_date: z.string(),
  pause_date: z.string().optional(),
});
const industryJobsBodySchema = z.array(industryJobSchema);

export type IndustryJob = z.infer<typeof industryJobSchema>;

export function parseIndustryJobsBody(body: unknown): IndustryJob[] | null {
  const parsed = industryJobsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return [...parsed.data].sort(
    (a, b) => Date.parse(a.end_date) - Date.parse(b.end_date) || a.job_id - b.job_id,
  );
}

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
