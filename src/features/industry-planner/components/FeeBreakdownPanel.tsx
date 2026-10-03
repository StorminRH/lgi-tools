import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { PopoverHeading } from '@/components/ui/popover';
import { scrollArea } from '@/components/ui/scroll-area';
import { formatIsk } from '@/lib/format/isk';
import { buildFeeBreakdown, type FeeLine } from '../fee-breakdown';
import type { NetMarginView } from '../types';

const isk = (v: number | null) => (v === null ? '—' : formatIsk(v));

function FeeRow({ line }: { line: FeeLine }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="truncate text-muted">{line.label}</span>
      <span className="shrink-0 tabular-nums text-text">{isk(line.value)}</span>
    </div>
  );
}

/** One kind of fee as its total; opening it lists what makes the total. */
function FeeSection({ label, total, children }: { label: ReactNode; total: number | null; children: ReactNode }) {
  return (
    <Collapsible
      headerClassName="-mx-1.5 w-auto rounded-ctl px-1.5 py-1.5"
      header={
        <>
          <span className="flex min-w-0 items-center gap-1.5 text-text">
            <span data-chevron aria-hidden className="inline-block w-3 shrink-0 text-center text-micro text-muted transition-transform">
              ▾
            </span>
            {label}
          </span>
          <span className="shrink-0 tabular-nums text-name">{isk(total)}</span>
        </>
      }
    >
      <div className="flex flex-col gap-1 pb-2 pl-[1.125rem]">{children}</div>
    </Collapsible>
  );
}

/** The build's fees: the product's own job, the jobs that make its inputs, and selling it. */
export function FeeBreakdownPanel({
  net,
  systemName,
  nameOf,
}: {
  net: NetMarginView;
  /** Where the product's own job runs. */
  systemName: string | undefined;
  nameOf: (typeId: number) => string;
}) {
  const fees = buildFeeBreakdown(net, nameOf);
  const site = systemName && <span className="truncate text-muted">· {systemName}</span>;
  return (
    <>
      <PopoverHeading>Fees</PopoverHeading>
      <div className="flex flex-col text-ui leading-snug">
        <FeeSection
          label={
            <>
              <span className="shrink-0">{fees.components ? 'Final job' : 'Install fee'}</span>
              {site}
            </>
          }
          total={fees.finalJobTotal}
        >
          {fees.install.map((line) => (
            <FeeRow key={line.label} line={line} />
          ))}
        </FeeSection>
        {fees.components && (
          <FeeSection
            label={
              <>
                Component jobs <span className="text-muted">· {fees.components.jobs.length}</span>
              </>
            }
            total={fees.components.total}
          >
            {/* The scrollbar hangs into the popover's padding, so the list's figures line up with the totals. */}
            <div className={cn(scrollArea, '-mr-3.5 flex max-h-[180px] flex-col gap-1 overflow-y-auto pr-1')}>
              {fees.components.jobs.map((line, i) => (
                <FeeRow key={i} line={line} />
              ))}
            </div>
          </FeeSection>
        )}
        <FeeSection label="Sell fees" total={fees.sellTotal}>
          {fees.sell.map((line) => (
            <FeeRow key={line.label} line={line} />
          ))}
        </FeeSection>
      </div>
    </>
  );
}
