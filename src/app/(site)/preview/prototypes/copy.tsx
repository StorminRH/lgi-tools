'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { CheckIcon, CopyIcon } from './icons';
import { PrototypeGroup, StateCell, StateGrid, VariantCard } from './gallery';

/** Clipboard write with a timed "copied" flag; `forced` pins it on for the static comparison state. */
function useCopied(value: string, forced = false) {
  const [copied, setCopied] = useState(forced);
  useEffect(() => {
    if (!copied || forced) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied, forced]);
  const copy = () => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
  };
  return { copied, copy };
}

type CopyProps = { value: string; forced?: boolean };

function IconMorph({ value, forced }: CopyProps) {
  const { copied, copy } = useCopied(value, forced);
  return (
    <span className="pt-copy-a pt-glass">
      <span className="pt-value">{value}</span>
      <button type="button" className="pt-icon-btn" data-copied={copied || undefined} onClick={copy} aria-label={`Copy ${value}`}>
        <CopyIcon size={15} className="pt-off" />
        <CheckIcon size={15} className="pt-on" />
        {copied ? <span className="pt-bubble pt-glass-dense">Copied</span> : null}
      </button>
    </span>
  );
}

function PillSweep({ value, forced }: CopyProps) {
  const { copied, copy } = useCopied(value, forced);
  return (
    <span className="pt-copy-b pt-glass" data-copied={copied || undefined}>
      <span className="pt-value">{value}</span>
      <button type="button" onClick={copy}>
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function InlineGhost({ value, forced }: CopyProps) {
  const { copied, copy } = useCopied(value, forced);
  return (
    <span className="pt-copy-c" data-copied={copied || undefined}>
      <span className="pt-value">{value}</span>
      <button type="button" className="pt-ghost" onClick={copy} aria-label={`Copy ${value}`}>
        {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      </button>
    </span>
  );
}

function AttachedField({ value, forced }: CopyProps) {
  const { copied, copy } = useCopied(value, forced);
  return (
    <span className="pt-copy-d pt-glass" data-copied={copied || undefined}>
      <span className="pt-value">{value}</span>
      <button type="button" onClick={copy}>
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function CheckDraw({ value, forced }: CopyProps) {
  const { copied, copy } = useCopied(value, forced);
  return (
    <span className="pt-copy-e">
      <span className="pt-value">{value}</span>
      <button type="button" className="pt-round-btn pt-glass" onClick={copy} aria-label={`Copy ${value}`}>
        <CopyIcon size={15} />
      </button>
      {copied ? (
        <span className="pt-confirm pt-glass-dense" role="status">
          <span className="pt-confirm-check">
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          Copied to clipboard
        </span>
      ) : null}
    </span>
  );
}

const ISK = '312,400,000 ISK';
const SYSTEM = 'J115405';

function Pair({ render }: { render: (props: CopyProps) => ReactNode }) {
  return (
    <StateGrid>
      <StateCell label="idle · click to copy">{render({ value: ISK })}</StateCell>
      <StateCell label="copied">{render({ value: SYSTEM, forced: true })}</StateCell>
    </StateGrid>
  );
}

export function CopyGroup() {
  return (
    <PrototypeGroup
      id="copy"
      title="Copy buttons"
      today="Every card copies the same two values (idle and copied states). Only the look and feedback motion change."
    >
      <VariantCard letter="Now" name="Inset well + COPY key" pitch="The shipping CopyButton.">
        <div className="flex flex-wrap gap-3">
          <CopyButton value={ISK} />
          <CopyButton value={SYSTEM} />
        </div>
      </VariantCard>
      <VariantCard letter="A" name="Icon morph" pitch="A glass value chip with a square icon button; the copy glyph spins into a check and a “Copied” bubble floats up.">
        <Pair render={(props) => <IconMorph {...props} />} />
      </VariantCard>
      <VariantCard letter="B" name="Pill sweep" pitch="A rounded pill split into value and action. Copying sweeps the brand gradient across the pill.">
        <Pair render={(props) => <PillSweep {...props} />} />
      </VariantCard>
      <VariantCard letter="C" name="Inline ghost" pitch="No box around the value: a ghost copy icon appears on hover (always on touch), and the value flashes green on copy.">
        <Pair render={(props) => <InlineGhost {...props} />} />
      </VariantCard>
      <VariantCard letter="D" name="Attached action" pitch="A read-only glass field with an attached action segment and a fade-out mask, so long values truncate gracefully.">
        <Pair render={(props) => <AttachedField {...props} />} />
      </VariantCard>
      <VariantCard letter="E" name="Check-draw confirm" pitch="A round icon button; a small confirmation capsule slides out and draws its check.">
        <Pair render={(props) => <CheckDraw {...props} />} />
      </VariantCard>
    </PrototypeGroup>
  );
}
