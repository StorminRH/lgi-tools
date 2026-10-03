import {
  computeJobInstallationFee,
  DEFAULT_FEE_RATES,
  effectiveFacilityTaxRate,
  REACTION_SCC_SURCHARGE,
  type AdjustedPriceOf,
} from '@/data/industry-math/fees';
import type { FeeJob } from './build-batch';
import type { ProfilePlan } from './profiles/profile-plan';
import { REACTION_ACTIVITY } from './structure-bonus';
import type { ComponentJobFee, ComponentJobFees } from './types';

/** Where a job is installed, as far as its fee goes. */
export interface JobFeeSite {
  systemId: number | null;
  /** The facility's own tax, or null where the default applies. */
  facilityTaxPct: number | null;
  /** The facility's job cost reduction, in percent. */
  costBonusPct: number;
}

export interface ComponentFeeSources {
  activityOf: (blueprintTypeId: number) => number | undefined;
  siteOf: (blueprintTypeId: number) => JobFeeSite;
  costIndexOf: (systemId: number, reaction: boolean) => number | null;
  adjustedPriceOf: AdjustedPriceOf;
}

/** One job's install fee: the system's cost index and the facility's tax and bonus, each on the job's own inputs. */
function componentJobFee(job: FeeJob, sources: ComponentFeeSources): ComponentJobFee {
  const reaction = sources.activityOf(job.blueprintTypeId) === REACTION_ACTIVITY;
  const site = sources.siteOf(job.blueprintTypeId);
  const systemCostIndex = site.systemId === null ? null : sources.costIndexOf(site.systemId, reaction);
  const facilityTaxRate = effectiveFacilityTaxRate(site.facilityTaxPct);
  const fee = computeJobInstallationFee(
    job.baseMaterials,
    sources.adjustedPriceOf,
    systemCostIndex,
    {
      ...DEFAULT_FEE_RATES,
      facilityTax: facilityTaxRate,
      sccSurcharge: reaction ? REACTION_SCC_SURCHARGE : DEFAULT_FEE_RATES.sccSurcharge,
    },
    site.costBonusPct,
  );
  // Retain the partial EIV diagnostics, but never quote that as a complete job fee.
  if (fee.missingAdjustedPriceTypeIds.length > 0) fee.total = null;
  return {
    typeId: job.typeId,
    blueprintTypeId: job.blueprintTypeId,
    reaction,
    runs: job.runs,
    systemId: site.systemId,
    systemCostIndex,
    facilityTaxRate,
    fee,
  };
}

export function computeComponentJobFees(jobs: readonly FeeJob[], sources: ComponentFeeSources): ComponentJobFees {
  const priced = jobs.filter((job) => job.runs > 0).map((job) => componentJobFee(job, sources));
  let total: number | null = 0;
  for (const { fee } of priced) total = total === null || fee.total === null ? null : total + fee.total;
  return { jobs: priced, total };
}

/**
 * Where a profile installs each job. A job takes its own facility's system,
 * tax and cost bonus; one no facility takes, or whose facility has no
 * system, is priced in the product's system at the default tax.
 */
export function profileFeeSiteOf(plan: Pick<ProfilePlan, 'routeOf' | 'top'>): (blueprintTypeId: number) => JobFeeSite {
  const fallbackSystemId = plan.top.facility?.systemId ?? null;
  return (blueprintTypeId) => {
    const { facility, bonus } = plan.routeOf(blueprintTypeId);
    return {
      systemId: facility?.systemId ?? fallbackSystemId,
      facilityTaxPct: facility?.structure?.taxPct ?? null,
      costBonusPct: bonus?.costBonus ?? 0,
    };
  };
}
