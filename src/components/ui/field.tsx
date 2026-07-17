'use client';

import { Field as Base } from '@base-ui/react/field';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from './cn';

type FieldControlElement = ReactElement<{
  id?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}>;

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
    <Base.Description id={id} className="font-mono text-label text-faint">
      {children}
    </Base.Description>
  );
}

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <Base.Error id={id} match className="font-mono text-label text-pill-red-text">
      {children}
    </Base.Error>
  );
}

/**
 * Renders the domain-neutral field with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation.
 */
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
      <Base.Label
        htmlFor={controlId}
        className="font-mono text-label tracking-wide uppercase text-muted"
      >
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
