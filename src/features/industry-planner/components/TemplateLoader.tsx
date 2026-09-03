'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePreferencesReady } from '@/components/PreferencesProvider';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/transport/api-client';
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

const LOAD_TOAST_ID = 'plan-template-load';

export function TemplateLoader({ structure }: { structure: TemplateStructureView }) {
  const ctx = useTemplatePlanner();
  const preferencesReady = usePreferencesReady();
  const planId = useSearchParams().get('plan');
  const [timedOutAttempt, setTimedOutAttempt] = useState(0);
  const attemptRef = useRef(0);
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
      if (!urlStillOnPlan(window.location.search, planId)) return;
      const view = loadToastFor(outcome);
      const show =
        view.type === 'success' ? toast.success : view.type === 'error' ? toast.error : toast;
      show(view.message, {
        id: LOAD_TOAST_ID,
        description: view.description,
        duration: view.duration,
      });
      window.history.replaceState(
        null,
        '',
        window.location.pathname + stripPlanParam(window.location.search) + window.location.hash,
      );
    });
  }, [planId, preferencesReady, structuresSettled, rosterSettled, timedOutAttempt, ctx, structure]);

  return null;
}
