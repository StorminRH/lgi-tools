'use client';

import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';

export const UNSET_FIELD = '';

const READOUT_CLASS =
  'block w-full rounded-ctl border border-border-soft px-2 py-1.5 text-center font-data text-ui text-name';

export function encodeOptionalField(value: string | null): string {
  return value ?? UNSET_FIELD;
}

export function decodeOptionalField(value: string): string | null {
  return value === UNSET_FIELD ? null : value;
}

export function ConnectionFieldGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (

    <div className="flex w-full flex-col items-center gap-1 text-center [&_input]:text-center">
      <span className="font-data text-label uppercase tracking-label text-isk">
        {label}
      </span>

      {}
      <div className="flex w-full flex-col gap-1">{children}</div>

    </div>

  );
}

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

export interface OptionalSelectFieldProps {
  readonly label: string;
  readonly ariaLabel: string;

  readonly items: readonly { readonly value: string; readonly label: string }[];
  readonly value: string | null;

  readonly readOnly: boolean;
  readonly readoutAttr: string;
  readonly readoutText: string;
  readonly onChange: (value: string | null) => void;
}

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
