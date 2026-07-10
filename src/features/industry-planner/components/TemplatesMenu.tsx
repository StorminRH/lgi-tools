'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Popover } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import {
  createSavedPlanEndpoint,
  MAX_SAVED_PLAN_NAME_LEN,
  type SavedPlanRow,
} from '../api-contract';
import { captureTemplate } from '../template-manifest';
import { useSavedPlans } from '../use-saved-plans';
import { usePricing } from './PricingProvider';
import { SavedPlanRowItem, savedPlanInputClass } from './SavedPlanRowItem';

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
  const router = useRouter();
  const { plans, listFailed, busyId, refresh, applyEcho, renameRow, favoriteRow, deleteRow } =
    useSavedPlans();
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  // Refresh on every open (keeping the stale list up while the read runs);
  // closing resets the transient row states so a re-open starts clean.
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setEditingId(null);
      setArmedDeleteId(null);
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
        const ok = applyEcho(res, (status) =>
          status === 401
            ? 'Sign in to save build templates'
            : status === 409
              ? 'Template limit reached — delete one first'
              : "Couldn't save the template",
        );
        if (ok) {
          setSaveName('');
          toast.success(`Saved "${name}"`);
        }
      });
  };

  const commitRename = (row: SavedPlanRow, draft: string) => {
    setEditingId(null);
    renameRow(row, draft);
  };

  const onDelete = (row: SavedPlanRow) => {
    if (armedDeleteId !== row.id) {
      setArmedDeleteId(row.id);
      return;
    }
    setArmedDeleteId(null);
    deleteRow(row);
  };

  // The roster settles to [] for an anonymous visitor (null = still loading) —
  // the same signed-out signal the multibuy panel derives, without importing
  // the auth surface.
  const signedOut = ctx.buildCharacters !== null && ctx.buildCharacters.length === 0;
  const emptyLine = listFailed
    ? "Couldn't load your saved templates"
    : signedOut
      ? 'Sign in to save build templates'
      : plans === null
        ? 'Loading…'
        : 'No saved templates yet';

  return (
    <Popover
      label="Saved templates"
      openOnHover={false}
      onOpenChange={onOpenChange}
      className="w-[320px]"
      triggerClassName="group inline-flex cursor-pointer items-baseline gap-2"
      trigger={
        <span className="inline-flex items-baseline gap-2 font-mono text-caption font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-name">
          <span className="tracking-normal text-isk">{'//'}</span>
          Templates
          <span className="inline-block text-[10px] text-muted">▾</span>
        </span>
      }
    >
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-isk">
        Saved templates
      </span>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={saveName}
          maxLength={MAX_SAVED_PLAN_NAME_LEN}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder={`e.g. ${productName} weekly`}
          aria-label="Template name"
          className={`${savedPlanInputClass} h-7 min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={save}
          disabled={saveName.trim() === '' || saving}
          className="rounded-[3px] border border-isk-dim bg-pill-green-bg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-isk transition-colors hover:border-isk disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {plans !== null && plans.length > 0 ? (
        <ul className="flex max-h-[264px] flex-col gap-1.5 overflow-y-auto">
          {plans.map((row) => (
            <SavedPlanRowItem
              key={`${row.id}:${row.name}`}
              row={row}
              busy={busyId === row.id}
              armed={armedDeleteId === row.id}
              editing={editingId === row.id}
              onLoad={() => router.push(`/industry/${row.blueprintTypeId}?plan=${row.id}`)}
              onFavorite={() => favoriteRow(row)}
              onStartRename={() => {
                setArmedDeleteId(null);
                setEditingId(row.id);
              }}
              onCommitRename={(draft) => commitRename(row, draft)}
              onDelete={() => onDelete(row)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[10.5px] leading-snug text-muted">{emptyLine}</p>
      )}
    </Popover>
  );
}
