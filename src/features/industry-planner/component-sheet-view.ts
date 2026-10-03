import { componentJob, type BatchLedger } from './build-batch';
import type { BlueprintStructure } from './types';

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
  /** One unit built: the job's inputs over the units its runs make. */
  buildPerUnit: number | null;
  /** One unit bought at market instead. */
  buyPerUnit: number | null;
}

const sumOrNull = (values: (number | null)[]): number | null =>
  values.some((v) => v === null) ? null : values.reduce<number>((sum, v) => sum + (v ?? 0), 0);

export function componentSheet(
  structure: BlueprintStructure,
  typeId: number,
  ledger: BatchLedger,
  unitPriceOf: ReadonlyMap<number, number | null>,
  structureMeFactorOf?: (blueprintTypeId: number) => number,
): ComponentSheet | null {
  const job = componentJob(structure.tree, typeId, ledger, structureMeFactorOf);
  if (!job) return null;
  const nameOf = (id: number) =>
    structure.buildNodeDisplay[id]?.name ?? structure.materialNames[id] ?? `Type ${id}`;
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
    buildPerUnit: buildCost === null || makes === 0 ? null : buildCost / makes,
    buyPerUnit: unitPriceOf.get(typeId) ?? null,
  };
}
