import type { SavedPlanRow } from './api-contract';

// The pure core of the ?plan= template loader: the readiness gate, the
// fetch→resolve→apply run, the one-toast summarization, and the URL-param
// strip. The TemplateLoader component is a thin effect shell over these —
// every decision that branches lives here, unit-tested against the shared
// mock-planner harness (the Humble Component split).

/**
 * How long the loader waits for the planner's async surfaces (preferences,
 * structures, roster) before applying with whatever settled — a template load
 * should never hang on a slow read; applyTemplate's per-field fail-open
 * degrades the unsettled-dependent fields with notes instead.
 */
export const TEMPLATE_APPLY_GATE_MS = 8000;

/**
 * The apply-what-settled gate: wait for all three readiness signals, but the
 * deadline overrides — after it, apply with whatever is there.
 */
export function templateGateOpen(g: {
  preferencesReady: boolean;
  structuresSettled: boolean;
  rosterSettled: boolean;
  timedOut: boolean;
}): boolean {
  return g.timedOut || (g.preferencesReady && g.structuresSettled && g.rosterSettled);
}

/**
 * Closed template application result covering success, incompatible version, missing blueprint,
 * and invalid snapshot.
 */
export type TemplateLoadOutcome =
  | { kind: 'fetch-failed' }
  | { kind: 'not-found' }
  | { kind: 'mismatch'; row: SavedPlanRow }
  | { kind: 'applied'; row: SavedPlanRow; notes: string[] };

/**
 * One load request, deps injected: fetch the caller's saved plans (null =
 * couldn't read — non-OK or network), resolve the row, guard that it belongs
 * to the blueprint in view, then replay it. `apply` is applyTemplate pre-bound
 * to the live ApplyCtx; its degrade notes pass through untouched. Never throws.
 */
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

/** User-facing template application feedback with semantic tone and concise detail. */
export interface TemplateLoadToast {
  type: 'success' | 'info' | 'error';
  message: string;
  description?: string;
  // Always finite: the loader's toast is keyed (update-in-place), and a keyed
  // update would otherwise inherit a prior Infinity duration.
  duration: number;
}

/**
 * The ONE keyed toast per load, summarizing what fell away. `info` is the
 * partial-apply arm: the load succeeded, so it isn't an error — the notes ride
 * the description slot.
 */
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

/**
 * Whether the live URL still points at the load this run handled. A stale
 * completion — the user navigated to another template (or away) while the
 * load was in flight — must not toast over the newer load or strip a plan
 * param that load hasn't consumed yet.
 */
export function urlStillOnPlan(search: string, planId: string): boolean {
  return new URLSearchParams(search).get('plan') === planId;
}

/**
 * Remove the plan param from a location.search string, preserving every other
 * param (and their order). Returns '' when nothing remains so the caller can
 * append it to the pathname directly.
 */
export function stripPlanParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('plan');
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}
