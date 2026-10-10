import { componentJob, type BatchLedger } from './build-batch';
import { typeNamer } from './type-name';
import type { BlueprintStructure, ComponentJobFee } from './types';

export interface ComponentInputRow {
  typeId: number;
  name: string;
  label: string;
  /** Units this job draws. */
  quantity: number;
  unitPrice: number | null;
  value: number | null;
  /** Built in this plan, so its own job can be opened. */
  buildable: boolean;
}

/** One built item's job in the plan, as the component drawer shows it. */
export interface ComponentSheet {
  typeId: number;
  name: string;
  label: string;
  blueprintTypeId: number;
  activityId: number | null;
  runs: number;
  /** Units one run makes. */
  batch: number;
  /** Units the plan needs. */
  required: number;
  /** Units the job's whole runs make. */
  makes: number;
  inputs: ComponentInputRow[];
  /** The job's inputs at market; null until every input is priced. */
  buildCost: number | null;
  /** The job's install fee where the profile runs it; null where no fee is charged. */
  installFee: {
    value: number | null;
    systemId: number | null;
    /** Inputs the fee counts as nothing, having no CCP adjusted price. */
    unpriced: string[];
  } | null;
  /** One unit built: the job's inputs and fee over the units its runs make. */
  buildPerUnit: number | null;
  /** One unit bought at market instead. */
  buyPerUnit: number | null;
}

const sumOrNull = (values: (number | null)[]): number | null =>
  values.some((v) => v === null) ? null : values.reduce<number>((sum, v) => sum + (v ?? 0), 0);

/**
 * The fee for the job's whole runs. The planner may have charged a share of
 * a run instead; a fee is linear in runs, so it scales exactly.
 */
function installFeeFor(
  fee: ComponentJobFee | undefined,
  runs: number,
  nameOf: (typeId: number) => string,
): ComponentSheet['installFee'] {
  if (!fee || fee.runs <= 0) return null;
  return {
    value: fee.fee.total === null ? null : (fee.fee.total * runs) / fee.runs,
    systemId: fee.systemId,
    unpriced: fee.fee.missingAdjustedPriceTypeIds.map(nameOf),
  };
}

export function componentSheet(
  structure: BlueprintStructure,
  typeId: number,
  ledger: BatchLedger,
  opts: {
    unitPriceOf: ReadonlyMap<number, number | null>;
    structureMeFactorOf?: (blueprintTypeId: number) => number;
    /** This job's install fee as the planner charged it. */
    jobFee?: ComponentJobFee;
  },
): ComponentSheet | null {
  const { unitPriceOf } = opts;
  const job = componentJob(structure.tree, typeId, ledger, opts.structureMeFactorOf);
  if (!job) return null;
  const nameOf = typeNamer(structure);
  const inputs = job.inputs.map((input): ComponentInputRow => {
    const unitPrice = unitPriceOf.get(input.typeId) ?? null;
    return {
      typeId: input.typeId,
      name: nameOf(input.typeId),
      label: structure.buildNodeDisplay[input.typeId]?.label ?? '',
      quantity: input.quantity,
      unitPrice,
      value: unitPrice === null ? null : unitPrice * input.quantity,
      buildable: ledger.builds.has(input.typeId),
    };
  });
  const buildCost = sumOrNull(inputs.map((input) => input.value));
  const installFee = installFeeFor(opts.jobFee, job.runs, nameOf);
  const jobCost = installFee === null ? buildCost : sumOrNull([buildCost, installFee.value]);
  const makes = job.runs * job.batch;
  return {
    typeId,
    name: nameOf(typeId),
    label: structure.buildNodeDisplay[typeId]?.label ?? '',
    blueprintTypeId: job.blueprintTypeId,
    activityId: structure.nodeActivityByBlueprint[job.blueprintTypeId] ?? null,
    runs: job.runs,
    batch: job.batch,
    required: job.required,
    makes,
    inputs,
    buildCost,
    installFee,
    buildPerUnit: jobCost === null || makes === 0 ? null : jobCost / makes,
    buyPerUnit: unitPriceOf.get(typeId) ?? null,
  };
}
