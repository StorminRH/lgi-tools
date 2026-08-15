'use client';

// The reusable connection-card field-group primitive: one labeled block whose
// control is either the house Select over a closed vocabulary with an unset
// sentinel, or a read-only readout in restore/locked modes. Extracted so every
// card field states only its vocabulary and wiring, never the block chrome.
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';

/** Select sentinel for null / unset field values. */
export const UNSET_FIELD = '';

const READOUT_CLASS =
  'block w-full rounded-ctl border border-border-soft px-2 py-1.5 text-center font-data text-ui text-name';

/** Encodes a nullable field for the house Select (empty string = unset). */
export function encodeOptionalField(value: string | null): string {
  return value ?? UNSET_FIELD;
}

/** Decodes a Select value back to null when the unset sentinel is chosen. */
export function decodeOptionalField(value: string): string | null {
  return value === UNSET_FIELD ? null : value;
}

/** One labeled connection-card field block wrapping a single control. */
export function ConnectionFieldGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    // A plain <div>: wrapping a <label> around a Base UI Select forwards
    // caption clicks to the trigger button and springs the dropdown open
    // (the CustomStructureBuilder gotcha); the controls carry ariaLabel.
    <div className="flex w-full flex-col items-center gap-1 text-center [&_input]:text-center">
      <span className="font-data text-label uppercase tracking-label text-isk">
        {label}
      </span>
      {/* Column, not a bare block: a field group may carry its control plus
          one derived estimate line (Mass, Reliable Lifetime — ruling D-G). */}
      <div className="flex w-full flex-col gap-1">{children}</div>
    </div>
  );
}

/** Read-only field readout carrying the probe attribute for its field. */
export function FieldReadout({
  attr,
  text,
}: {
  readonly attr: string;
  readonly text: string;
}) {
  return (
    <span {...{ [attr]: '' }} className={READOUT_CLASS}>
      {text}
    </span>
  );
}

/** Props for one optional closed-vocabulary select field. */
export interface OptionalSelectFieldProps {
  readonly label: string;
  readonly ariaLabel: string;
  /** Items including the unset sentinel row the caller's vocabulary defines. */
  readonly items: readonly { readonly value: string; readonly label: string }[];
  readonly value: string | null;
  /** Readout mode replaces the select (restore mode or a codex lock). */
  readonly readOnly: boolean;
  readonly readoutAttr: string;
  readonly readoutText: string;
  readonly onChange: (value: string | null) => void;
}

/** One labeled optional select over a closed vocabulary, or its readout. */
export function OptionalSelectField({
  label,
  ariaLabel,
  items,
  value,
  readOnly,
  readoutAttr,
  readoutText,
  onChange,
}: OptionalSelectFieldProps) {
  return (
    <ConnectionFieldGroup label={label}>
      {readOnly ? (
        <FieldReadout attr={readoutAttr} text={readoutText} />
      ) : (
        <Select
          ariaLabel={ariaLabel}
          align="center"
          value={encodeOptionalField(value)}
          items={items}
          onValueChange={(next) => onChange(decodeOptionalField(next))}
        />
      )}
    </ConnectionFieldGroup>
  );
}
