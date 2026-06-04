import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

// Presentational chrome shared by the three galleries. No hooks, so it stays
// usable from both the server demo pages and the client demo shells.

// The page header every gallery (and the index) shares — matches the existing
// /dev/sparkline + /preview/cards header treatment.
export function SandboxHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="w-full max-w-[1100px] mb-8 pb-4 border-b border-border-soft">
      <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
        {title}
      </div>
      <div className="text-[10px] text-muted tracking-[0.12em] uppercase">{subtitle}</div>
    </header>
  );
}

// A labelled cell wrapping one variant, so the operator can reference each by
// name ("Tree v3 — connector lines", "Price anim v7 — count-up roll"). `notes`
// is for the "would need hardening if chosen" caveats.
export function VariantFrame({
  tag,
  title,
  notes,
  children,
  className,
}: {
  tag: string;
  title: string;
  notes?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      <div className="flex items-baseline gap-2.5 mb-2.5">
        <span className="font-mono text-[9px] font-semibold tracking-[0.16em] uppercase text-isk whitespace-nowrap">
          {tag}
        </span>
        <span className="font-display text-[13px] text-name tracking-[0.04em]">{title}</span>
      </div>
      <div className="border border-border-soft bg-section rounded-[4px] p-5 flex-1">
        {children}
      </div>
      {notes && (
        <p className="mt-2 text-[10px] leading-[1.5] text-muted">{notes}</p>
      )}
    </section>
  );
}
