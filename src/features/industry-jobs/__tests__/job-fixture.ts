import type { IndustryJob } from '../esi-projection';

/**
 * An active manufacturing job: 10 runs of blueprint 691 making type 587,
 * started 2026-06-12T00:00Z and due a day later. Pass every field a test reads
 * that differs from these defaults.
 */
export function industryJob(over: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 691,
    product_type_id: 587,
    runs: 10,
    status: 'active',
    start_date: '2026-06-12T00:00:00Z',
    end_date: '2026-06-13T00:00:00Z',
    ...over,
  };
}
