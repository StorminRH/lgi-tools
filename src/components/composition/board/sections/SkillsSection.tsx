import { Collapsible } from '@/components/ui/collapsible';
import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import type { BoardSection, BoardSkillsData, SkillCatalogGroup } from '@/composition/board/api-contract';
import { formatQuantity } from '@/lib/format/number';
import { groupSkills, type SkillGroupModel } from '../board-view-model';
import { SectionBody, SectionPanel } from '../SectionBody';

const PIPS = [1, 2, 3, 4, 5] as const;

export function SkillsSection({
  section,
  catalog,
  className,
}: {
  section: BoardSection<BoardSkillsData>;
  catalog: readonly SkillCatalogGroup[];
  className?: string;
}) {
  return (
    <SectionPanel
      title="Skills"
      meta={
        section.state === 'ready'
          ? `${formatQuantity(section.data.known)} known · ${formatQuantity(section.data.atV)} at V`
          : undefined
      }
      className={className}
    >
      <SectionBody section={section}>
        {(skills) => (
          <div className="grid md:grid-cols-2 md:gap-x-px">
            {groupSkills(skills.levels, catalog).map((group) => (
              <SkillGroup key={group.groupId} group={group} />
            ))}
          </div>
        )}
      </SectionBody>
    </SectionPanel>
  );
}

function SkillGroup({ group }: { group: SkillGroupModel }) {
  return (
    <Collapsible
      className="md:border-b"
      header={
        <span className="flex w-full items-center justify-between gap-2 text-ui">
          <span className="flex items-center gap-2 text-name">
            <span aria-hidden className="inline-block text-faint transition-transform group-open:rotate-90">
              ›
            </span>
            {group.name}
          </span>
          <span className="font-data text-micro text-muted">
            {group.trained}/{group.total}
            {group.atV > 0 && <span className="ml-2 text-evb-bright">{group.atV} at V</span>}
          </span>
        </span>
      }
    >
      <ul className="pb-1.5">
        {group.skills.map((skill) => (
          <li key={skill.typeId} className="flex items-center justify-between gap-3 px-3.5 py-[3px] pl-8 text-ui">
            <span className="truncate text-text">{skill.name}</span>
            <LevelPips level={skill.level} />
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

function LevelPips({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Level ${level}`} className="flex shrink-0 items-center gap-[3px]">
      {PIPS.map((pip) => (
        <Dot
          key={pip}
          tone={pip <= level ? 'blue' : 'neutral'}
          size="md"
          className={cn(pip > level && 'opacity-25')}
        />
      ))}
    </span>
  );
}
