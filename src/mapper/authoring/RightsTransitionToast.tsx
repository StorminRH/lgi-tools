'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { shouldToastRightsTransition } from './rights-transition';

/** Props for the quiet rights-transition toast host. */
export interface RightsTransitionToastProps {
  readonly canEdit: boolean | undefined;
}

/**
 * Fires one quiet toast when live edit rights flip. Mount answer is ignored;
 * rejected in-flight mutations rely on Convex optimistic rollback alone.
 */
export function RightsTransitionToast({ canEdit }: RightsTransitionToastProps) {
  const previousRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = canEdit;
    if (!shouldToastRightsTransition(previous, canEdit)) return;
    toast.message(
      canEdit === true
        ? 'Edit access restored'
        : 'Edit access removed — viewing only',
    );
  }, [canEdit]);

  return null;
}
