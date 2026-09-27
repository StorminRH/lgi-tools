'use client';

import { type Ref, ViewTransition } from 'react';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import type { BoardCharacter, SkillCatalogGroup } from '@/composition/board/api-contract';
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
  catalog,
  names,
  now,
  onBack,
  backRef,
}: {
  character: BoardCharacter;
  catalog: readonly SkillCatalogGroup[];
  names: Readonly<Record<string, string>>;
  now: number;
  onBack?: () => void;
  backRef?: Ref<HTMLButtonElement>;
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
        <SheetHeader character={character} now={now} />
      </ViewTransition>
      <ViewTransition {...PANELS_MOTION} default="none">
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
