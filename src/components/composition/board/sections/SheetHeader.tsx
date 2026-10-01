import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';
import { effectiveSkills, placeName } from '../board-view-model';
import { KpiTile, SystemName } from '../board-bits';
import { CharacterIdentity } from './CharacterIdentity';
import { IndustrySection } from './IndustrySection';

/** The identity column: portrait, affiliation and whereabouts float; only the stat readouts sit on glass. */
export function SheetHeader({
  character,
  now,
  children,
}: {
  character: BoardCharacter;
  now: number;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5">
      <CharacterIdentity character={character} now={now} />
      <Whereabouts character={character} />
      <Kpis character={character} now={now} />
      {children}
    </header>
  );
}

function Whereabouts({ character }: { character: BoardCharacter }) {
  if (character.status.state !== 'ready') return null;
  const { system, dock, ship } = character.status.data;
  return (
    <dl className="grid gap-3 text-ui sm:grid-cols-2 xl:grid-cols-1">
      <Fact label={dock !== null ? 'Docked' : 'In space'}>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {dock !== null && <span className="truncate text-name">{placeName(dock)}</span>}
          <SystemName system={system} />
        </span>
      </Fact>
      <Fact label="Ship">
        <span className="flex min-w-0 items-center gap-2">
          <TypeIcon typeId={ship.typeId} size={22} alt={ship.typeName} />
          <span className="text-name">{ship.typeName}</span>
          <span className="truncate text-muted">“{ship.name}”</span>
        </span>
      </Fact>
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={eyebrow({ size: 'micro' })}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Kpis({ character, now }: { character: BoardCharacter; now: number }) {
  const wallet = character.wallet.state === 'ready' ? character.wallet.data : null;
  const skills = character.skills.state === 'ready' ? character.skills.data : null;
  const counts = skills === null ? null : effectiveSkills(skills, now);
  const free = skills?.unallocatedSp ?? 0;
  return (
    <div className="flex flex-col gap-2">
      {wallet !== null && (
        <dl>
          <KpiTile label="Wallet" tone="text-isk">
            {formatIsk(wallet.balance)} <span className="text-micro text-muted sm:text-ui">ISK</span>
          </KpiTile>
        </dl>
      )}
      <IndustrySection section={character.industry} />
      {skills !== null && (
        <dl className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          <KpiTile label="Skill points" note={free > 0 ? `+${formatCompactQuantity(free)} free` : undefined}>
            {formatCompactQuantity(skills.totalSp)}
          </KpiTile>
          <KpiTile label="Skills" note={`${formatQuantity(counts?.atV ?? 0)} at V`} noteTone="text-muted">
            {formatQuantity(counts?.known ?? 0)}
          </KpiTile>
        </dl>
      )}
    </div>
  );
}
