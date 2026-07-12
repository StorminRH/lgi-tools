'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { createSavedPlanEndpoint, MAX_SAVED_PLAN_NAME_LEN } from '../api-contract';
import { saveErrorCopy, templatesEmptyLine } from '../saved-plans-view';
import { captureTemplate } from '../template-manifest';
import { useManagedRowMenu } from '../use-managed-row-menu';
import { useSavedPlans } from '../use-saved-plans';
import { usePricing } from './PricingProvider';
import { SavedPlanRows } from './SavedPlanRows';

// Saved build templates (3.7.23): the PlannerHead's click-popover, cloned from
// the multibuy panel idiom. Save captures the planner's full configuration
// (captureTemplate — inputs only); the list spans ALL blueprints (favorites
// first, the server's order); loading navigates to the template's own planner
// page with ?plan=, where TemplateLoader replays it. The list state + row
// mutations live in the shared useSavedPlans hook (3.7.24 — shared with the
// dashboard's Templates section and /industry/templates); every mutating endpoint
// echoes the full updated list, so the panel re-renders without a refetch.

export function TemplatesMenu({
  blueprintTypeId,
  productName,
}: {
  blueprintTypeId: number;
  productName: string;
}) {
  const ctx = usePricing();
  const { plans, listFailed, busyId, refresh, applyEcho, renameRow, favoriteRow, deleteRow } =
    useSavedPlans();
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const menu = useManagedRowMenu({ rename: renameRow, remove: deleteRow });

  // Refresh on every open (keeping the stale list up while the read runs);
  // closing resets the transient row states so a re-open starts clean.
  const onOpenChange = (open: boolean) => {
    if (!open) {
      menu.reset();
      return;
    }
    refresh();
  };

  const save = () => {
    const name = saveName.trim();
    if (name === '' || saving) return;
    setSaving(true);
    apiFetch(createSavedPlanEndpoint, {
      body: { name, snapshot: captureTemplate(ctx, blueprintTypeId) },
    })
      .catch(() => null)
      .then((res) => {
        setSaving(false);
        const ok = applyEcho(res, saveErrorCopy);
        if (ok) {
          setSaveName('');
          toast.success(`Saved "${name}"`);
        }
      });
  };

  const emptyLine = templatesEmptyLine({
    listFailed,
    buildCharacters: ctx.buildCharacters,
    plans,
  });

  return (
    <Popover
      label="Saved templates"
      openOnHover={false}
      onOpenChange={onOpenChange}
      className="w-[320px]"
      triggerClassName="group inline-flex cursor-pointer items-baseline gap-2"
      trigger={
        <span className="inline-flex items-baseline gap-2 font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-name">
          <span className="tracking-normal text-isk">{'//'}</span>
          Templates
          <span className="inline-block text-micro text-muted">▾</span>
        </span>
      }
    >
      <span className="font-mono text-label font-semibold uppercase tracking-[0.16em] text-isk">
        Saved templates
      </span>

      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={saveName}
          maxLength={MAX_SAVED_PLAN_NAME_LEN}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder={`e.g. ${productName} weekly`}
          aria-label="Template name"
          size="sm"
          className="h-7 min-w-0 flex-1"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={saveName.trim() === '' || saving}
        >
          Save
        </Button>
      </div>

      {plans !== null && plans.length > 0 ? (
        <ul className="flex max-h-[264px] flex-col gap-1.5 overflow-y-auto">
          <SavedPlanRows plans={plans} busyId={busyId} menu={menu} favoriteRow={favoriteRow} />
        </ul>
      ) : (
        <p className="text-micro leading-snug text-muted">{emptyLine}</p>
      )}
    </Popover>
  );
}
