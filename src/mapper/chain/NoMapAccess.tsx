'use client';

import { dataLabel } from '@/components/ui/type-roles';

export function NoMapAccess() {
  return (
    <section
      data-chain-no-access
      className="flex h-full w-full items-center justify-center px-6 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-3">
        <div className={dataLabel({ emphasis: 'strong' })}>
          Atlas · access
        </div>
        <h2 className="font-display text-title font-bold tracking-copy text-name">
          You&rsquo;ve lost access to this map&nbsp;<span className="text-isk">o7</span>
        </h2>
        <p className="text-body leading-relaxed text-text">
          Another map can be opened from the atlas or access can be restored by the
          map&rsquo;s owner.
        </p>
      </div>
    </section>
  );
}
