'use client';

import type { ComponentProps } from 'react';
import { ActionForm } from './action-form';

/**
 * An ActionForm that asks `confirm` before it posts and stays put on Cancel.
 * It is the client boundary, so the forms that use it stay server components
 * and pass only the message string.
 */
export function ConfirmActionForm({
  confirm,
  ...props
}: Omit<ComponentProps<typeof ActionForm>, 'onSubmit'> & { confirm: string }) {
  return (
    <ActionForm
      {...props}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    />
  );
}
