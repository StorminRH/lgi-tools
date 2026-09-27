'use client';

import { type Ref, ViewTransition } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import type { BoardCharacter, BoardHistoryDay, SkillCatalogGroup } from '@/composition/board/api-contract';
import { AddCharacter } from './AddCharacter';
import { PANELS_MOTION, SHEET_MOTION } from './board-motion';
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
// it, so a wrapper element here would stop the sheet from animating.
export function CharacterDetail({
  character,
  history,
  catalog,
  names,
  now,
  onBack,
  backRef,
  addCharacter = false,
}: {
  character: BoardCharacter;
  history: readonly BoardHistoryDay[];
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
  onBack?: () => void;
  backRef?: Ref<HTMLButtonElement>;
  addCharacter?: boolean;
}) {
  const sentence = reconnectSentence(character);
  return (
    <>
      {onBack !== undefined && (
        <ViewTransition {...SHEET_MOTION} default="none">
          <div className="xl:col-span-2">
            <Button
              ref={backRef}
              variant="bare"
              onClick={onBack}
              className="gap-2 rounded-ctl py-1 font-data text-ui text-muted hover:text-isk"
            >
              <span aria-hidden>←</span> All characters
            </Button>
          </div>
        </ViewTransition>
      )}
      {sentence !== null && (
        <ViewTransition {...SHEET_MOTION} default="none">
          <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
            <Callout label="Reconnect" className="min-w-0 flex-1 text-ui">
              {sentence}
            </Callout>
            <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
          </div>
        </ViewTransition>
      )}
      <ViewTransition {...SHEET_MOTION} default="none">
        <SheetHeader character={character} now={now}>
          {addCharacter && <AddCharacter placement="column" />}
        </SheetHeader>
      </ViewTransition>
      <ViewTransition {...PANELS_MOTION} default="none">
        {/* Two independent column stacks, so a tall card never opens a hole beside
            it. On phones the columns dissolve and `order` sets the phone order:
            queue, wallet, attributes, clones, industry, skills. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <QueueSection
              section={character.skills}
              names={names}
              now={now}
              pilotName={character.name}
              className="order-1 lg:order-none"
            />
            <AttributesSection
              attributes={character.attributes}
              implants={character.implants}
              now={now}
              className="order-3 lg:order-none"
            />
            <ClonesSection section={character.clones} now={now} className="order-4 lg:order-none" />
            <IndustrySection section={character.industry} now={now} className="order-5 lg:order-none" />
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <WalletSection
              character={character}
              history={history}
              now={now}
              className="order-2 lg:order-none"
            />
          </div>
          <SkillsSection section={character.skills} catalog={catalog} now={now} className="order-6 lg:col-span-2" />
        </div>
      </ViewTransition>
    </>
  );
}
