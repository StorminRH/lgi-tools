'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { shouldToastRightsTransition } from './rights-transition';

export interface RightsTransitionToastProps {
  readonly canEdit: boolean | undefined;
}

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
