'use client';

import { useId, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { SectionHeader } from '@/components/ui/section-header';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/transport/api-client';
import { setCorpStructureSharingEndpoint } from '../api-contract';

// The corp structure-sharing consent control (3.7.9), relocated from /structures
// to the account settings page (ACCOUNT.6) — the toggle's ONE home. The contract
// is unchanged: default off; only a Station_Manager sees it (the page's server
// fetch filters to manager corps, so this island renders for no one else);
// enabling lets the next on-view refresh pull the corp's structures; disabling
// wipes them (rows + sync state + authored rigs), so it confirms first. The
// island takes server-resolved corps in and fires the same mutation out — the
// gate/wipe live in the data layer behind the same endpoint.

/**
 * Display-ready sharing corp state for owned structures; consumers can render it without
 * reconstructing storage or domain policy.
 */
export type SharingCorpView = {
  corporationId: number;
  corporationName: string;
  sharingEnabled: boolean;
};

/**
 * Renders corporation structure-sharing controls and forwards optimistic sharing updates to the
 * owning settings action.
 */
export function CorpSharingSettings({ corps }: { corps: SharingCorpView[] }) {
  return (
    <Card>
      <SectionHeader size="md" label="Structure sharing" hint="Station Manager" />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        <p className="text-body text-muted">
          Share a corporation’s structures as build locations for every member. Turning sharing
          off removes the corporation’s structures and any recorded rig fits and facility taxes.
        </p>
        {corps.map((corp) => (
          <SharingRow key={corp.corporationId} corp={corp} />
        ))}
      </div>
    </Card>
  );
}

function SharingRow({ corp }: { corp: SharingCorpView }) {
  const [enabled, setEnabled] = useState(corp.sharingEnabled);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmLabelId = useId();

  async function applySharing(next: boolean) {
    setBusy(true);
    const res = await apiFetch(setCorpStructureSharingEndpoint, {
      body: { corporationId: corp.corporationId, enabled: next },
      cache: 'no-store',
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('Could not change sharing');
      return;
    }
    setEnabled(next);
    if (next) {
      toast.success('Sharing on — structures appear after the next refresh');
    } else {
      toast.success('Sharing off — this corp’s structures were removed');
    }
  }

  // Enabling is one click; disabling wipes the catalogue, so it confirms first.
  function onToggle(next: boolean) {
    if (next) void applySharing(true);
    else setConfirmOpen(true);
  }

  return (
    <>
      <label className="flex items-center gap-2.5">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={busy}
          label={`Share ${corp.corporationName}'s structures`}
        />
        <span className="text-ui text-text">{corp.corporationName}</span>
        <span className="text-label uppercase tracking-wide text-muted">
          {enabled ? 'sharing on' : 'sharing off'}
        </span>
      </label>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} labelledBy={confirmLabelId}>
        <div className="flex flex-col gap-3 p-4 max-w-[360px]">
          <p id={confirmLabelId} className="text-body text-text">
            Stop sharing {corp.corporationName}’s structures? This removes the corporation’s
            structures and any recorded rig fits and facility taxes. Turning sharing back on
            re-fetches them.
          </p>
          <div className="flex items-center justify-end gap-3">
            <DialogClose className="text-label uppercase tracking-wide text-muted hover:text-text">
              Keep sharing
            </DialogClose>
            <DialogClose
              onClick={() => void applySharing(false)}
              className="text-label uppercase tracking-wide text-tone-red hover:underline"
            >
              Stop sharing
            </DialogClose>
          </div>
        </div>
      </Dialog>
    </>
  );
}
