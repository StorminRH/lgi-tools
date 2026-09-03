import type { SavedPlanRow } from './api-contract';

export const TEMPLATE_APPLY_GATE_MS = 8000;

export function templateGateOpen(g: {
  preferencesReady: boolean;
  structuresSettled: boolean;
  rosterSettled: boolean;
  timedOut: boolean;
}): boolean {
  return g.timedOut || (g.preferencesReady && g.structuresSettled && g.rosterSettled);
}

export type TemplateLoadOutcome =
  | { kind: 'fetch-failed' }
  | { kind: 'not-found' }
  | { kind: 'mismatch'; row: SavedPlanRow }
  | { kind: 'applied'; row: SavedPlanRow; notes: string[] };

export async function runTemplateLoad(deps: {
  planId: string;
  blueprintTypeId: number;
  fetchPlans: () => Promise<SavedPlanRow[] | null>;
  apply: (snapshot: Readonly<Record<string, unknown>>) => Promise<string[]>;
}): Promise<TemplateLoadOutcome> {
  const plans = await deps.fetchPlans();
  if (plans === null) return { kind: 'fetch-failed' };
  const row = plans.find((p) => p.id === deps.planId);
  if (row === undefined) return { kind: 'not-found' };
  if (row.blueprintTypeId !== deps.blueprintTypeId) return { kind: 'mismatch', row };
  const notes = await deps.apply(row.snapshot);
  return { kind: 'applied', row, notes };
}

export interface TemplateLoadToast {
  type: 'success' | 'info' | 'error';
  message: string;
  description?: string;

  duration: number;
}

export function loadToastFor(outcome: TemplateLoadOutcome): TemplateLoadToast {
  switch (outcome.kind) {
    case 'fetch-failed':
      return { type: 'error', message: "Couldn't load the saved template", duration: 5000 };
    case 'not-found':
      return {
        type: 'error',
        message: 'Saved template not found — it may have been deleted',
        duration: 5000,
      };
    case 'mismatch':
      return {
        type: 'error',
        message: `"${outcome.row.name}" belongs to a different blueprint`,
        duration: 5000,
      };
    case 'applied': {
      const n = outcome.notes.length;
      if (n === 0) {
        return { type: 'success', message: `Loaded "${outcome.row.name}"`, duration: 4000 };
      }
      return {
        type: 'info',
        message: `Loaded "${outcome.row.name}" — ${n} setting${n === 1 ? '' : 's'} didn't apply`,
        description: outcome.notes.join(' · '),
        duration: 8000,
      };
    }
  }
}

export function urlStillOnPlan(search: string, planId: string): boolean {
  return new URLSearchParams(search).get('plan') === planId;
}

export function stripPlanParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('plan');
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}
