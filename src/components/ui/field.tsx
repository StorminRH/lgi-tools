'use client';

import { Field as Base } from '@base-ui/react/field';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from './cn';
import { InfoIcon } from './icons';

export type FieldControlElement = ReactElement<{
  id?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}>;

export const fieldLabel = 'font-ui text-ui font-medium text-text';

function controlIdFor(element: FieldControlElement, generatedId: string) {
  return element.props.id ?? `${generatedId}-control`;
}

function fieldInvalid(invalid: boolean | undefined, error: ReactNode) {
  return invalid ?? Boolean(error);
}

function controlDisabled(disabled: boolean | undefined, element: FieldControlElement) {
  return disabled ?? element.props.disabled;
}

function describedId(content: ReactNode, id: string) {
  return content ? id : undefined;
}

function FieldDescription({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <Base.Description id={id} className="font-ui text-label text-muted">
      {children}
    </Base.Description>
  );
}

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <Base.Error
      id={id}
      match
      className="inline-flex items-center gap-1.5 font-ui text-label text-chip-red"
    >
      <InfoIcon size={13} />
      {children}
    </Base.Error>
  );
}

export function Field({
  label,
  hint,
  error,
  invalid,
  disabled,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  children: FieldControlElement;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = controlIdFor(children, generatedId);
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const describedBy = [
    children.props['aria-describedby'],
    describedId(hint, hintId),
    describedId(error, errorId),
  ]
    .filter(Boolean)
    .join(' ');
  const isInvalid = fieldInvalid(invalid, error);

  return (
    <Base.Root
      invalid={isInvalid}
      disabled={disabled}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
    >
      <Base.Label htmlFor={controlId} className={fieldLabel}>
        {label}
      </Base.Label>
      {cloneElement(children, {
        id: controlId,
        disabled: controlDisabled(disabled, children),
        'aria-describedby': describedBy,
        'aria-invalid': isInvalid,
      })}
      <FieldDescription id={hintId}>{hint}</FieldDescription>
      <FieldError id={errorId}>{error}</FieldError>
    </Base.Root>
  );
}
