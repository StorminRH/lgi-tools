'use client';

import type { ComponentProps } from 'react';
import { CustomStructureBuilder } from '@/features/custom-structures/components/CustomStructureBuilder';
import { refreshAvailableStructures } from '@/features/industry-planner/use-available-structures';

export function IndustryStructureBuilder(props: Omit<ComponentProps<typeof CustomStructureBuilder>, 'onStructuresChange'>) {
  return <CustomStructureBuilder {...props} onStructuresChange={refreshAvailableStructures} />;
}
