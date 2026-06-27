import { describe, expect, it } from 'vitest';
import { JOB_STATUSES, parseIndustryJobsBody } from './esi-projection';

// A manufacturing job as the live endpoint shapes it — including the fields
// the tracker deliberately does NOT store (location ids, cost, duration).
const manufacturingJob = {
  activity_id: 1,
  blueprint_id: 1039392583913,
  blueprint_location_id: 60003760,
  blueprint_type_id: 691,
  cost: 118000.5,
  duration: 54000,
  end_date: '2026-06-13T08:00:00Z',
  facility_id: 60003760,
  installer_id: 2114872920,
  job_id: 498338451,
  licensed_runs: 200,
  output_location_id: 60003760,
  product_type_id: 587,
  runs: 10,
  start_date: '2026-06-12T17:00:00Z',
  station_id: 60003760,
  status: 'active',
};

// A material-efficiency research job — no product_type_id on the wire.
const researchJob = {
  activity_id: 4,
  blueprint_id: 1039392583914,
  blueprint_location_id: 60003760,
  blueprint_type_id: 24699,
  duration: 8 * 86400,
  end_date: '2026-06-12T20:00:00Z',
  facility_id: 60003760,
  installer_id: 2114872920,
  job_id: 498338452,
  output_location_id: 60003760,
  runs: 1,
  start_date: '2026-06-04T20:00:00Z',
  station_id: 60003760,
  status: 'active',
};

describe('parseIndustryJobsBody', () => {
  it('projects a realistic body down to the stored fields, soonest-done first', () => {
    const jobs = parseIndustryJobsBody([manufacturingJob, researchJob]);
    expect(jobs).toEqual([
      {
        job_id: 498338452,
        installer_id: 2114872920,
        activity_id: 4,
        blueprint_type_id: 24699,
        runs: 1,
        status: 'active',
        start_date: '2026-06-04T20:00:00Z',
        end_date: '2026-06-12T20:00:00Z',
      },
      {
        job_id: 498338451,
        installer_id: 2114872920,
        activity_id: 1,
        blueprint_type_id: 691,
        product_type_id: 587,
        runs: 10,
        status: 'active',
        start_date: '2026-06-12T17:00:00Z',
        end_date: '2026-06-13T08:00:00Z',
      },
    ]);
  });

  it('retains installer_id for per-job runner attribution', () => {
    const jobs = parseIndustryJobsBody([manufacturingJob]);
    expect(jobs?.[0]?.installer_id).toBe(2114872920);
  });

  it('tie-breaks identical end dates by job id for a stable order', () => {
    const twin = { ...manufacturingJob, job_id: 1, end_date: researchJob.end_date };
    const jobs = parseIndustryJobsBody([researchJob, twin]);
    expect(jobs?.map((job) => job.job_id)).toEqual([1, 498338452]);
  });

  it('accepts every documented status', () => {
    for (const status of JOB_STATUSES) {
      expect(parseIndustryJobsBody([{ ...manufacturingJob, status }])).not.toBeNull();
    }
  });

  it('rejects an unknown status (contract drift)', () => {
    expect(parseIndustryJobsBody([{ ...manufacturingJob, status: 'halted' }])).toBeNull();
  });

  it('rejects a non-array body and a job missing required fields', () => {
    expect(parseIndustryJobsBody({ jobs: [] })).toBeNull();
    const { end_date: _dropped, ...withoutEnd } = manufacturingJob;
    expect(parseIndustryJobsBody([withoutEnd])).toBeNull();
  });

  it('parses an empty board', () => {
    expect(parseIndustryJobsBody([])).toEqual([]);
  });
});
