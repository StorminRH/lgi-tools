'use client';

import { insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  type DialogFocusTarget,
} from '@/components/ui/dialog';
import { useConfirmGate } from '@/components/ui/use-confirm-gate';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import { formatCount } from '@/lib/format/number';
import {
  mapLifecycleFailureMessage,
  requestMapPurge,
  restoreMap,
} from './map-lifecycle-client';

export function selectedCreatorMapIds(
  maps: readonly DeletedRestorableMapRow[],
  selected: ReadonlySet<string>,
): string[] {
  return maps
    .filter((map) => selected.has(map.id) && map.provenance.kind === 'created')
    .map((map) => map.id);
}

export async function runMapLifecycleBatch(
  mapIds: Iterable<string>,
  action: (input: { readonly mapId: string }) => Promise<{ readonly ok: boolean }>,
): Promise<{ readonly succeeded: readonly string[]; readonly complete: boolean }> {
  const succeeded: string[] = [];
  for (const mapId of mapIds) {
    if (!(await action({ mapId })).ok) return { succeeded, complete: false };
    succeeded.push(mapId);
  }
  return { succeeded, complete: true };
}

export function pruneTrashSelection(
  selected: ReadonlySet<string>,
  removeIds: Iterable<string>,
): Set<string> {
  const next = new Set(selected);
  for (const mapId of removeIds) next.delete(mapId);
  return next;
}

function TrashMapRows({
  maps,
  selected,
  disabled,
  onCheckedChange,
}: {
  readonly maps: readonly DeletedRestorableMapRow[];
  readonly selected: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onCheckedChange: (mapId: string, checked: boolean) => void;
}) {
  if (maps.length === 0) {
    return <p className="font-ui text-ui text-muted">Trash is empty.</p>;
  }
  return maps.map((map) => (
    <Checkbox
      key={map.id}
      checked={selected.has(map.id)}
      onCheckedChange={(checked) => onCheckedChange(map.id, checked)}
      label={map.name}
      disabled={disabled}
      rowClassName={cn(insetSurface, 'gap-3 px-3 py-2')}
    >
      <span className="min-w-0 flex-1 truncate text-name">{map.name}</span>
      <span className="font-data text-micro text-muted">
        {map.provenance.kind === 'created' ? 'Created by you' : 'Admin access'}
      </span>
    </Checkbox>
  ));
}

export function TrashWindow({
  open,
  onOpenChange,
  maps,
  finalFocus,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly maps: readonly DeletedRestorableMapRow[];
  readonly finalFocus?: DialogFocusTarget;
}) {
  const router = useRouter();
  const titleId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<'restore' | 'purge' | null>(null);
  // The creator maps chosen when the purge was asked for, kept while the confirmation fades out.
  const purge = useConfirmGate<readonly string[]>();
  const [error, setError] = useState<string | null>(null);
  const visibleSelected = useMemo(() => {
    const visible = new Set(maps.map((map) => map.id));
    return new Set([...selected].filter((mapId) => visible.has(mapId)));
  }, [maps, selected]);
  const creatorIds = useMemo(
    () => selectedCreatorMapIds(maps, visibleSelected),
    [maps, visibleSelected],
  );
  const permanentEligible =
    visibleSelected.size > 0 && creatorIds.length === visibleSelected.size;

  function setChecked(mapId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(mapId);
      else next.delete(mapId);
      return next;
    });
    setError(null);
  }

  async function restoreSelected() {
    setBusy('restore');
    setError(null);
    const result = await runMapLifecycleBatch(visibleSelected, restoreMap);
    setBusy(null);
    setSelected((current) => pruneTrashSelection(current, result.succeeded));
    if (result.complete) setSelected(new Set());
    else setError(mapLifecycleFailureMessage('restore'));
    router.refresh();
  }

  async function purgeSelected(mapIds: readonly string[]) {
    setBusy('purge');
    setError(null);
    const result = await runMapLifecycleBatch(mapIds, requestMapPurge);
    setBusy(null);
    setSelected((current) => pruneTrashSelection(current, result.succeeded));
    if (result.complete) {
      purge.reset();
      setSelected(new Set());
    } else {
      purge.request(mapIds.filter((mapId) => !result.succeeded.includes(mapId)));
      setError(mapLifecycleFailureMessage('purge'));
    }
    router.refresh();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy === null && !purge.open) onOpenChange(next);
        }}
        labelledBy={titleId}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DialogHeader
          titleId={titleId}
          title="Deleted maps"
          description="Restore maps during their 30-day undo window."
          closeLabel="Close trash"
          closeDisabled={busy !== null || purge.open}
        />

        <DialogBody className="gap-2">
          <TrashMapRows
            maps={maps}
            selected={visibleSelected}
            disabled={busy !== null}
            onCheckedChange={setChecked}
          />
          {error !== null ? <Banner tone="warn">{error}</Banner> : null}
        </DialogBody>

        <DialogFooter align="between">
          <Button
            variant="danger"
            size="sm"
            disabled={!permanentEligible || busy !== null}
            onClick={() => purge.request(creatorIds)}
          >
            Permanently delete
          </Button>
          <div className="flex items-center gap-2.5">
            <DialogClose render={<Button variant="secondary" size="sm" />} disabled={busy !== null}>
              Done
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              disabled={visibleSelected.size === 0 || busy !== null}
              onClick={() => void restoreSelected()}
            >
              {busy === 'restore' ? 'Restoring…' : 'Restore'}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={purge.open}
        onOpenChange={(next) => {
          if (!next) purge.cancel();
        }}
        title="Permanently delete selected maps?"
        consequence={`${formatCount(purge.target?.length ?? 0, 'selected map')} will enter the next scheduled purge. This cannot be undone after the sweep completes.`}
        busy={busy === 'purge'}
        error={error}
        confirmLabel="Permanently delete"
        confirmDisabled={!permanentEligible}
        onConfirm={() => void purgeSelected(purge.target ?? [])}
      />
    </>
  );
}
