import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { TypeIcon } from '@/components/type-icon';
import { cn } from '@/components/ui/cn';
import { StatusDot } from '@/components/ui/status-dot';
import { eyebrow } from '@/components/ui/type-roles';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';
import { characterAge, characterSecurityClass, placeName } from '../board-view-model';
import { KpiTile, SystemName } from '../board-bits';
import { readoutSurface } from '../SectionBody';
import { EntityLogo } from './EntityLogo';

/**
 * A lone pilot's identity column (portrait, then everything floating, with
 * stat tiles on glass), or, beside the pilot rail, one glass identity card
 * whose portrait the rail already shows.
 */
export function SheetHeader({
  character,
  now,
  layout,
}: {
  character: BoardCharacter;
  now: number;
  layout: 'column' | 'card';
}) {
  const identity = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <h2 className="font-display text-h2 font-bold leading-tight text-name">{character.name}</h2>
      <Affiliation character={character} />
      <IdentityLine character={character} now={now} />
    </div>
  );
  if (layout === 'card') {
    return (
      <header data-leader-target className={cn(readoutSurface, 'flex flex-col gap-4 p-4')}>
        {identity}
        <Whereabouts character={character} columns="sm:grid-cols-2" />
        <Kpis character={character} columns="grid-cols-3" />
      </header>
    );
  }
  return (
    <header data-leader-column className="flex flex-col gap-5">
      <div data-leader-anchor className="flex items-center gap-4 xl:flex-col xl:items-start">
        <CharacterPortrait
          characterId={character.characterId}
          name={character.name}
          size={160}
          src={character.portraitUrl}
          className="shadow-cta-glow max-xl:size-24"
        />
        {identity}
      </div>
      <Whereabouts character={character} columns="sm:grid-cols-2 xl:grid-cols-1" />
      <Kpis character={character} columns="grid-cols-3 xl:grid-cols-1" />
    </header>
  );
}

function Affiliation({ character }: { character: BoardCharacter }) {
  const { corporation, alliance } = character;
  if (corporation === null && alliance === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui text-text">
      {corporation !== null && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <EntityLogo kind="corporation" id={corporation.id} name={corporation.name ?? 'Corporation'} />
          <span className="truncate">{corporation.name ?? 'Unknown corporation'}</span>
        </span>
      )}
      {alliance !== null && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <EntityLogo kind="alliance" id={alliance.id} name={alliance.name ?? 'Alliance'} />
          <span className="truncate">{alliance.name ?? 'Unknown alliance'}</span>
        </span>
      )}
    </div>
  );
}

function IdentityLine({ character, now }: { character: BoardCharacter; now: number }) {
  const profile = character.profile.state === 'ready' ? character.profile.data : null;
  const status = character.status.state === 'ready' ? character.status.data : null;
  const age = profile !== null ? characterAge(profile.birthday, now) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-micro text-muted">
      {profile !== null && (
        <span>
          Sec{' '}
          <span className={characterSecurityClass(profile.securityStatus)}>
            {profile.securityStatus === null ? '—' : profile.securityStatus.toFixed(1)}
          </span>
        </span>
      )}
      {age !== null && <span>{age} old</span>}
      {status !== null && (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot state={status.online ? 'online' : 'offline'} />
          {status.online ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}

function Whereabouts({ character, columns }: { character: BoardCharacter; columns: string }) {
  if (character.status.state !== 'ready') return null;
  const { system, dock, ship } = character.status.data;
  return (
    <dl className={cn('grid gap-3 text-ui', columns)}>
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

function Kpis({ character, columns }: { character: BoardCharacter; columns: string }) {
  const wallet = character.wallet.state === 'ready' ? character.wallet.data : null;
  const skills = character.skills.state === 'ready' ? character.skills.data : null;
  if (wallet === null && skills === null) return null;
  const free = skills?.unallocatedSp ?? 0;
  return (
    <dl className={cn('grid gap-2', columns)}>
      {wallet !== null && (
        <KpiTile label="Wallet" tone="text-isk">
          {formatIsk(wallet.balance)} <span className="text-micro text-muted sm:text-ui">ISK</span>
        </KpiTile>
      )}
      {skills !== null && (
        <>
          <KpiTile label="Skill points" note={free > 0 ? `+${formatCompactQuantity(free)} free` : undefined}>
            {formatCompactQuantity(skills.totalSp)}
          </KpiTile>
          <KpiTile label="Skills" note={`${formatQuantity(skills.atV)} at V`} noteTone="text-muted">
            {formatQuantity(skills.known)}
          </KpiTile>
        </>
      )}
    </dl>
  );
}
