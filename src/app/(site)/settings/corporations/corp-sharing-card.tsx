'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SectionHeader } from '@/components/ui/section-header';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { setCorpDataSharingEndpoint } from '@/platform/auth/api-contract';
import { apiFetch } from '@/transport/api-client';
import type { SharingCorpView } from './corporations-view';

export function CorpSharingCard({
  directorCorps,
  memberCorps,
}: {
  directorCorps: SharingCorpView[];
  memberCorps: SharingCorpView[];
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Share corporation data" />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        {directorCorps.map((corp) => (
          <SharingSwitchRow key={corp.corporationId} corp={corp} />
        ))}
        {memberCorps.map((corp) => (
          <p key={corp.corporationId} className="text-body text-muted">
            <span className="text-text">{corp.corporationName}</span>: Sharing is{' '}
            {corp.sharingEnabled ? 'on' : 'off'}.
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

  async function stopSharing() {
    await applySharing(false);
    setConfirmOpen(false);
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
      <p className="text-body text-muted">Share corporation data with members based on their in-game role access.</p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Stop sharing ${corp.corporationName}’s data?`}
        consequence="Members lose access to shared corporation data. Directors keep it. Nothing is deleted."
        confirmLabel="Stop sharing"
        cancelLabel="Keep sharing"
        busy={busy}
        onConfirm={() => void stopSharing()}
        className="w-[min(360px,calc(100vw-2rem))]"
      />
    </div>
  );
}
