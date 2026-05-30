import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ResourceRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { formatQuantity } from '@/lib/format';
import { toneDotClass } from '../industry-styles';
import type { BomInput, BlueprintStructure } from '../types';

// The build plan — a condensed bill of materials. Every buildable appears once
// at its gross demand (total units the whole build needs), grouped by
// construction category (Reactions, Components, Fuel, Final Product) with a
// colour-coded header. Each row expands to the direct inputs that produce that
// quantity, so fuel/gas nest under the reaction that burns them rather than
// sitting beside it. No price dependency, so it paints in the static shell.

// name + right-aligned quantity.
const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto]';

function InputRow({ input }: { input: BomInput }) {
  return (
    <ResourceRow
      colsClass={ROW_COLS}
      name={
        <span className="flex items-center gap-2 min-w-0">
          <span className={cn('inline-block w-[6px] h-[6px] rounded-full shrink-0', toneDotClass(input.tone))} />
          <span className="truncate">{input.name}</span>
        </span>
      }
      meta={`× ${formatQuantity(input.quantity)}`}
    />
  );
}

export function MaterialTree({ structure }: { structure: BlueprintStructure }) {
  const { buildGroups } = structure;
  return (
    <Card>
      <SectionHeader
        label="Build Plan"
        hint={buildGroups.length > 0 ? 'gross demand · tap a step for its recipe' : undefined}
      />
      {buildGroups.length === 0 ? (
        <EmptyState>No build breakdown — this blueprint has no resolved inputs yet.</EmptyState>
      ) : (
        buildGroups.map((group) => (
          <div key={group.label}>
            <SectionHeader
              label={<Pill tone={group.tone}>{group.label}</Pill>}
              hint={`${group.items.length} item${group.items.length === 1 ? '' : 's'}`}
            />
            {group.items.map((item) => (
              <Collapsible
                key={item.typeId}
                header={
                  <>
                    <span className="flex items-center gap-[6px] text-name text-[12px] min-w-0">
                      <span data-chevron className="text-[8px] text-muted leading-none">
                        ▾
                      </span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="text-[10px] text-muted whitespace-nowrap">
                      {`× ${formatQuantity(item.quantity)}`}
                    </span>
                  </>
                }
              >
                <div className="ml-3.5 border-l border-border-soft">
                  {item.inputs.map((input) => (
                    <InputRow key={input.typeId} input={input} />
                  ))}
                </div>
              </Collapsible>
            ))}
          </div>
        ))
      )}
    </Card>
  );
}
