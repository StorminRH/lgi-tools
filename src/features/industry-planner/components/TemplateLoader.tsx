'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePreferencesReady } from '@/components/PreferencesProvider';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { savedPlansEndpoint } from '../api-contract';
import {
  loadToastFor,
  runTemplateLoad,
  stripPlanParam,
  TEMPLATE_APPLY_GATE_MS,
  templateGateOpen,
  urlStillOnPlan,
} from '../template-load';
import { applyTemplate, type TemplateStructureView } from '../template-manifest';
import { useTemplatePlanner } from './planner-contexts';

// The ?plan= replay slot — a null-rendering effect leaf mounted inside
// PricingProvider (the RecordRecentBlueprint pattern, but under the provider
// because the replay drives its public setters). It reads the param under the
// page's existing Suspense boundary, waits for the planner's async surfaces
// behind the apply-what-settled gate, replays the saved template through
// applyTemplate, reports in ONE keyed toast, and strips the param so a reload
// doesn't re-apply. Every branching decision lives in template-load.ts; this
// shell only sequences them.

const LOAD_TOAST_ID = 'plan-template-load';

/** Applies a saved snapshot to the live planner and renders its success or incompatibility feedback. */
export function TemplateLoader({ structure }: { structure: TemplateStructureView }) {
  const ctx = useTemplatePlanner();
  const preferencesReady = usePreferencesReady();
  const planId = useSearchParams().get('plan');
  // The 8s deadline is keyed to the load ATTEMPT, not the plan id — a deadline
  // that fired for an earlier load of the same template must not open a later
  // load's gate before its own fresh window elapses. The counter advances each
  // time a plan param arrives; only a match between the fired attempt and the
  // current one counts as timed out. Set only inside the timeout callback
  // (async — never a synchronous set inside the effect).
  const [timedOutAttempt, setTimedOutAttempt] = useState(0);
  const attemptRef = useRef(0);
  // One apply per load request; re-armed when the param strips, so loading the
  // same template again from the menu replays it.
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (planId === null) {
      startedRef.current = null;
      return;
    }
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const timer = setTimeout(() => setTimedOutAttempt(attempt), TEMPLATE_APPLY_GATE_MS);
    return () => clearTimeout(timer);
  }, [planId]);

  const structuresSettled = ctx.availableStructures !== null;
  const rosterSettled = ctx.buildCharacters !== null;

  useEffect(() => {
    if (planId === null) return;
    if (startedRef.current === planId) return;
    const open = templateGateOpen({
      preferencesReady,
      structuresSettled,
      rosterSettled,
      timedOut: timedOutAttempt === attemptRef.current,
    });
    if (!open) return;
    // Claim the load BEFORE the async work — re-renders (and StrictMode's
    // double-invoke) must not start a second apply.
    startedRef.current = planId;
    void runTemplateLoad({
      planId,
      blueprintTypeId: structure.blueprintTypeId,
      fetchPlans: async () => {
        try {
          const res = await apiFetch(savedPlansEndpoint, { cache: 'no-store' });
          return res.ok ? res.data.plans : null;
        } catch {
          return null;
        }
      },
      apply: (snapshot) => applyTemplate({ ctx, structure, fetchedStations: null }, snapshot),
    }).then((outcome) => {
      // A stale completion — the user navigated to another template (or away)
      // while this load was in flight — must not toast over the newer load or
      // strip a plan param that load hasn't consumed yet.
      if (!urlStillOnPlan(window.location.search, planId)) return;
      const view = loadToastFor(outcome);
      const show =
        view.type === 'success' ? toast.success : view.type === 'error' ? toast.error : toast;
      show(view.message, {
        id: LOAD_TOAST_ID,
        description: view.description,
        duration: view.duration,
      });
      // Strip the param so a reload/share of the URL doesn't re-apply.
      window.history.replaceState(
        null,
        '',
        window.location.pathname + stripPlanParam(window.location.search) + window.location.hash,
      );
    });
  }, [planId, preferencesReady, structuresSettled, rosterSettled, timedOutAttempt, ctx, structure]);

  return null;
}
