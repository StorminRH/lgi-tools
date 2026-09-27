'use client';

import { ViewTransition } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Callout } from '@/components/ui/callout';
import type { BoardCharacter, SkillCatalogGroup } from '@/composition/board/api-contract';
import { CARDS_MOTION, LATE_CARDS_MOTION } from './board-motion';
import { reconnectSentence } from './board-view-model';
import { AttributesSection } from './sections/AttributesSection';
import { ClonesSection } from './sections/ClonesSection';
import { IndustrySection } from './sections/IndustrySection';
import { QueueSection } from './sections/QueueSection';
import { SheetHeader } from './sections/SheetHeader';
import { SkillsSection } from './sections/SkillsSection';
import { WalletSection } from './sections/WalletSection';

// Each part is a direct child of the caller's persistent container: React
// runs enter and exit only on a <ViewTransition> with no new DOM node above
// it, so a wrapper element here would stop the card swap from animating.
export function CharacterDetail({
  character,
  catalog,
  names,
  now,
  identity,
}: {
  character: BoardCharacter;
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
  identity: 'column' | 'card';
}) {
  const sentence = reconnectSentence(character);
  return (
    <>
      {sentence !== null && (
        <ViewTransition {...CARDS_MOTION} default="none">
          <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
            <Callout label="Reconnect" className="min-w-0 flex-1 text-ui">
              {sentence}
            </Callout>
            <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
          </div>
        </ViewTransition>
      )}
      <ViewTransition {...CARDS_MOTION} default="none">
        <SheetHeader character={character} now={now} layout={identity} />
      </ViewTransition>
      <ViewTransition {...LATE_CARDS_MOTION} default="none">
        {/* DOM order is the phone order; the empty 1fr row soaks up the wallet's extra height. */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_auto_auto_auto_1fr_auto]">
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
      </ViewTransition>
    </>
  );
}
