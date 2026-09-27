import type { ReactNode } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Dot } from '@/components/ui/dot';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';

export function BoardFrame({ demo = false, children }: { demo?: boolean; children: ReactNode }) {
  return (
    <section aria-label="Your characters" className="reveal mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionLabel className="whitespace-nowrap">Your characters</SectionLabel>
          {demo ? (
            <Pill tone="yellow" className="whitespace-nowrap">Sample data</Pill>
          ) : (
            <span className="inline-flex items-center gap-2 font-data text-micro uppercase tracking-copy text-isk">
              <Dot tone="green" size="sm" className="live-ping text-isk" />
              live
            </span>
          )}
        </div>
        <LinkCharacterButton label="Add character" callbackURL="/" />
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
