'use client';

import { useId, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { SectionHeader } from '@/components/ui/section-header';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { setCorpDataSharingEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import type { SharingCorpView } from './corporations-view';

const SHARING_OFF_COPY =
  'Only Directors see this corporation’s assets and blueprints here. Station Managers still see structures and Factory Managers still see industry jobs.';
const SHARING_ON_COPY =
  'Members see what their in-game roles allow: the hangar divisions they can view, deliveries, all blueprints for Factory Managers, all assets for Accountants, and the corporation’s structures in the planner.';

export function CorpSharingCard({
  directorCorps,
  memberCorps,
}: {
  directorCorps: SharingCorpView[];
  memberCorps: SharingCorpView[];
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Share corporation data" hint="Director" />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        {directorCorps.map((corp) => (
          <SharingSwitchRow key={corp.corporationId} corp={corp} />
        ))}
        {memberCorps.map((corp) => (
          <p key={corp.corporationId} className="text-body text-muted">
            <span className="text-text">{corp.corporationName}</span>: Sharing is{' '}
            {corp.sharingEnabled ? 'on' : 'off'}. A Director controls this.
          </p>
        ))}
      </div>
    </Card>
  );
}

function SharingSwitchRow({ corp }: { corp: SharingCorpView }) {
  const [enabled, setEnabled] = useState(corp.sharingEnabled);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmLabelId = useId();

  async function applySharing(next: boolean) {
    setBusy(true);
    const res = await apiFetch(setCorpDataSharingEndpoint, {
      body: { corporationId: corp.corporationId, enabled: next },
      cache: 'no-store',
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('Sharing not changed');
      return;
    }
    setEnabled(next);
    toast.success(next ? 'Sharing on' : 'Sharing off');
  }

  function onToggle(next: boolean) {
    if (next) void applySharing(true);
    else setConfirmOpen(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2.5">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={busy}
          label={`Share ${corp.corporationName}'s data`}
        />
        <span className="text-ui text-text">{corp.corporationName}</span>
        <span className="text-label uppercase tracking-wide text-muted">
          {enabled ? 'sharing on' : 'sharing off'}
        </span>
      </label>
      <p className="text-body text-muted">{enabled ? SHARING_ON_COPY : SHARING_OFF_COPY}</p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} labelledBy={confirmLabelId}>
        <div className="flex flex-col gap-3 p-4 max-w-[360px]">
          <p id={confirmLabelId} className="text-body text-text">
            Stop sharing {corp.corporationName}’s data? Members lose access to shared corporation
            data. Directors keep it. Nothing is deleted.
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
    </div>
  );
}
