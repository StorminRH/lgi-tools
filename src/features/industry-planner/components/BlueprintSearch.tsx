'use client';

import { useRouter } from 'next/navigation';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { eyebrow } from '@/components/ui/type-roles';
import type { RecentBlueprint } from '../recent-blueprints';
import { type BlueprintErr, type BlueprintParams, useBlueprintSearch } from '../use-blueprint-search';

export interface BlueprintSearchProps {
  placeholder?: string;
  hint?: string;
  onPick?: (blueprint: RecentBlueprint) => void;
}

/** The search on glass under a label, for a sheet's context column. */
export function BlueprintSearchPanel({ label, ...search }: BlueprintSearchProps & { label: string }) {
  return (
    <div className={cn(cardSurface, 'flex flex-col gap-2 p-3.5')}>
      <span className={eyebrow({ size: 'micro' })}>{label}</span>
      <BlueprintSearch {...search} />
    </div>
  );
}

/** Find a blueprint or reaction by name; picking one opens its plan unless told otherwise. */
export function BlueprintSearch({
  placeholder = 'Find a blueprint or reaction',
  hint,
  onPick,
}: BlueprintSearchProps) {
  const router = useRouter();
  const { parse, suggest } = useBlueprintSearch();
  return (
    <TerminalSearch<BlueprintParams, BlueprintErr>
      initialValue=""
      placeholder={placeholder}
      hint={hint}
      parse={parse}
      suggest={suggest}
      errorMessage={() => 'Pick a blueprint from the suggestions.'}
      errorLabel="Blueprint"
      onSubmit={({ blueprint }) => {
        if (onPick) onPick(blueprint);
        else router.push(`/industry/${blueprint.typeId}`);
      }}
      onClear={() => undefined}
    />
  );
}
