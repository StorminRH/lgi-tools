import type { Ref } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Callout } from '@/components/ui/callout';
import type { BoardCharacter, SkillCatalogGroup } from '@/composition/board/api-contract';
import { reconnectSentence } from './board-view-model';
import { AttributesSection } from './sections/AttributesSection';
import { ClonesSection } from './sections/ClonesSection';
import { IndustrySection } from './sections/IndustrySection';
import { QueueSection } from './sections/QueueSection';
import { SheetHeader } from './sections/SheetHeader';
import { SkillsSection } from './sections/SkillsSection';
import { WalletSection } from './sections/WalletSection';

// DOM order is the phone order (queue, wallet, attributes, …); the desktop
// grid places the same sections into two columns.
export function CharacterDetail({
  ref,
  character,
  catalog,
  names,
  now,
}: {
  ref?: Ref<HTMLElement>;
  character: BoardCharacter;
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
}) {
  const sentence = reconnectSentence(character);
  return (
    <article
      ref={ref}
      aria-label={`${character.name} character sheet`}
      className="scroll-mt-24 border-t border-border-soft pt-5"
    >
      {sentence !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Callout label="Reconnect" className="min-w-0 flex-1 text-ui">
            {sentence}
          </Callout>
          <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
        </div>
      )}
      <SheetHeader character={character} now={now} />
      {/* The empty 1fr row soaks up the wallet's extra height so the left column stays packed. */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_auto_auto_auto_1fr_auto]">
        <QueueSection section={character.skills} names={names} now={now} className="lg:col-start-1 lg:row-start-1" />
        <WalletSection
          wallet={character.wallet}
          journal={character.journal}
          now={now}
          className="lg:col-start-2 lg:row-span-5 lg:row-start-1"
        />
        <AttributesSection
          attributes={character.attributes}
          implants={character.implants}
          now={now}
          className="lg:col-start-1 lg:row-start-2"
        />
        <ClonesSection section={character.clones} now={now} className="lg:col-start-1 lg:row-start-3" />
        <IndustrySection section={character.industry} now={now} className="lg:col-start-1 lg:row-start-4" />
        <SkillsSection section={character.skills} catalog={catalog} className="lg:col-span-2 lg:row-start-6" />
      </div>
    </article>
  );
}
