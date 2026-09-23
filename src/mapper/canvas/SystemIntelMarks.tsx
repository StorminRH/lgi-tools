'use client';

import { useGlanceMarks } from '../signatures/use-glance-mark-index';
import { IntelIcon } from '../windows/IntelIcon';
import { INTEL_CATEGORY_LABEL } from '../windows/intel-model';

export function SystemIntelMarks({ systemId }: { readonly systemId: number }) {
  const marks = useGlanceMarks(systemId);
  return (
    <div className="absolute -right-8 top-0 flex flex-col gap-1 text-muted" data-chain-node-sites>
      {marks.map((kind) => (
        <span key={kind} role="img" aria-label={INTEL_CATEGORY_LABEL[kind]} className="inline-flex">
          <IntelIcon kind={kind} />
        </span>
      ))}
    </div>
  );
}
