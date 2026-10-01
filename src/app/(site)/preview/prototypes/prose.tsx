import { Prose } from '@/components/ui/prose';
import { PrototypeGroup, VariantCard } from './gallery';

/*
 * Prose is the reading box plus descendant styles for paragraphs, bold text,
 * and links. Every card wraps the same two privacy-page paragraphs; only the
 * box and those styles change.
 */

function Copy() {
  return (
    <>
      <p>
        LGI.tools keeps a limited set of data points about how the site is used: which pages and options get used, and
        what brought you here. That data is held in our <a href="#prose">Neon</a> database on a{' '}
        <strong>180-day retention schedule</strong>.
      </p>
      <p>
        We store a random visitor ID in your browser&apos;s local storage. Clearing this site&apos;s stored data removes
        it, and the site treats that browser as a <strong>first-time visitor</strong> again.
      </p>
    </>
  );
}

export function ProseGroup() {
  return (
    <PrototypeGroup
      id="prose"
      title="Prose"
      today="Every card wraps the same two privacy paragraphs. Only the reading box and its paragraph, bold, and link styles change."
    >
      <VariantCard letter="Now" name="Paragraph styles" pitch="The shipping Prose: 16px Geist paragraphs, white bold, and green links with a dim green underline.">
        <Prose className="mx-0">
          <Copy />
        </Prose>
      </VariantCard>
      <VariantCard letter="A" name="Editorial" pitch="Looser 1.8 leading, softer paragraph colour, and links that underline in the brand gradient and fill on hover.">
        <div className="pt-prose pt-prose-a"><Copy /></div>
      </VariantCard>
      <VariantCard letter="B" name="Glass reading card" pitch="The text sits in its own frosted panel with generous padding; aurora links with an offset underline.">
        <div className="pt-prose pt-prose-b"><Copy /></div>
      </VariantCard>
      <VariantCard letter="C" name="Compact" pitch="14px with tighter leading for dense help and policy text; links are plain green until hovered.">
        <div className="pt-prose pt-prose-c"><Copy /></div>
      </VariantCard>
      <VariantCard letter="D" name="Highlighted emphasis" pitch="Bold text gets a soft aurora highlighter stroke; links are white with a dotted underline that turns aurora.">
        <div className="pt-prose pt-prose-d"><Copy /></div>
      </VariantCard>
      <VariantCard letter="E" name="Reading mode" pitch="Larger 17px text on a narrow 60-character measure, with the first paragraph set slightly brighter as a lead.">
        <div className="pt-prose pt-prose-e"><Copy /></div>
      </VariantCard>
    </PrototypeGroup>
  );
}
