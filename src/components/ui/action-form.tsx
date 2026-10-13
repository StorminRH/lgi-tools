import { useId, type FormEventHandler, type ReactNode } from 'react';
import { Button, type StyledButtonProps } from './button';

/**
 * A one-button POST form: one hidden input per defined field, in key order
 * (undefined fields are left out), then the submit Button.
 *
 * A disabled button explains itself through `disabledReason`: the hover title
 * and an sr-only line its aria-describedby points at, because a screen reader
 * does not announce a disabled button's title and touch never shows it.
 * useId is legal in Server Components, so this needs no directive; only a
 * client wrapper such as ConfirmActionForm passes `onSubmit`.
 */
export function ActionForm({
  action,
  fields = {},
  children,
  variant = 'secondary',
  size = 'sm',
  className,
  disabled = false,
  disabledReason,
  ariaLabel,
  onSubmit,
}: {
  action: string;
  fields?: Readonly<Record<string, string | number | undefined>>;
  children: ReactNode;
  variant?: StyledButtonProps['variant'];
  size?: StyledButtonProps['size'];
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  ariaLabel?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const reasonId = useId();
  const reason = disabled ? disabledReason : undefined;
  return (
    <form method="post" action={action} onSubmit={onSubmit}>
      {Object.entries(fields).map(([name, value]) =>
        value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      <Button
        type="submit"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={reason ? reasonId : undefined}
        title={reason}
      >
        {children}
      </Button>
      {reason ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
    </form>
  );
}
