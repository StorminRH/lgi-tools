'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { coveringParent, toggleCategory } from '@/features/industry-planner/profiles/assignments';
import {
  ALL_MANUFACTURING,
  CATEGORY_GROUPS,
  type CategoryGroup,
  type CategoryKey,
  categoryName,
} from '@/features/industry-planner/profiles/production-categories';
import { MANUFACTURING_ACTIVITY, type StructureBonus } from '@/features/industry-planner/structure-bonus';
import { formatPct } from '@/lib/format/number';

interface ChecklistProps {
  categories: readonly CategoryKey[];
  onChange: (next: CategoryKey[]) => void;
  unavailable: ReadonlySet<CategoryKey>;
  bonuses: ReadonlyMap<CategoryKey, StructureBonus>;
}

const NONE: ReadonlySet<CategoryKey> = new Set();
const NO_BONUSES: ReadonlyMap<CategoryKey, StructureBonus> = new Map();

function bonusText(bonus: StructureBonus): string {
  return [bonus.me > 0 ? `ME ${formatPct(bonus.me)}` : null, bonus.te > 0 ? `TE ${formatPct(bonus.te)}` : null]
    .filter(Boolean)
    .join(' · ');
}

function Option({ id, text, props }: { id: CategoryKey; text: string; props: ChecklistProps }) {
  const { categories, onChange, unavailable, bonuses } = props;
  const parent = coveringParent(categories, id);
  const off = unavailable.has(id);
  const bonus = bonuses.get(id);
  return (
    <label
      className={cn(
        'flex min-w-0 items-center gap-2.5 py-0.5 text-ui',
        off ? 'cursor-not-allowed text-faint opacity-50' : parent !== null ? 'text-muted' : 'cursor-pointer text-name',
      )}
    >
      <Checkbox
        checked={!off && (parent !== null || categories.includes(id))}
        disabled={off || parent !== null}
        onCheckedChange={(on) => onChange(toggleCategory(categories, id, on))}
        label={categoryName(id)}
      />
      <span className="shrink-0">{text}</span>
      {bonus && !off ? (
        <span className="min-w-0 truncate pl-1 font-data text-micro text-isk">{bonusText(bonus)}</span>
      ) : null}
    </label>
  );
}

const branch = 'ml-2.5 flex flex-col gap-1 border-l border-border-soft pl-5';
// Wider classes when rig figures sit beside them.
const leafGrid = (withBonuses: boolean) =>
  cn(
    'grid gap-x-6 gap-y-1',
    withBonuses ? 'grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]',
  );

function Group({ group, props }: { group: CategoryGroup; props: ChecklistProps }) {
  return (
    <div className="flex flex-col gap-1">
      <Option id={group.key} text={group.name} props={props} />
      {group.leaves.length > 0 ? (
        <div className={cn(branch, leafGrid(group.leaves.some((leaf) => props.bonuses.has(leaf.key))))}>
          {group.leaves.map((leaf) => (
            <Option key={leaf.key} id={leaf.key} text={leaf.label} props={props} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The production categories as a tree: all manufacturing over its groups,
 * each group over its classes, and reactions on their own. A ticked parent
 * covers everything under it, so its children read as ticked and stay put.
 */
export function CategoryChecklist({
  label,
  categories,
  onChange,
  unavailable = NONE,
  bonuses = NO_BONUSES,
}: {
  label: string;
  categories: readonly CategoryKey[];
  onChange: (next: CategoryKey[]) => void;
  unavailable?: ReadonlySet<CategoryKey>;
  bonuses?: ReadonlyMap<CategoryKey, StructureBonus>;
}) {
  const props: ChecklistProps = { categories, onChange, unavailable, bonuses };
  const manufacturing = CATEGORY_GROUPS.filter((g) => g.activity === MANUFACTURING_ACTIVITY);
  const reactions = CATEGORY_GROUPS.filter((g) => g.activity !== MANUFACTURING_ACTIVITY);
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-col gap-1">
        <Option id={ALL_MANUFACTURING} text={categoryName(ALL_MANUFACTURING)} props={props} />
        <div className={branch}>
          {manufacturing.map((group) => (
            <Group key={group.key} group={group} props={props} />
          ))}
        </div>
      </div>
      {reactions.map((group) => (
        <Group key={group.key} group={group} props={props} />
      ))}
    </fieldset>
  );
}
