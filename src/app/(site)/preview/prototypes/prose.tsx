import { Prose } from '@/components/ui/prose';
import { InfoIcon } from './icons';
import { PrototypeGroup, VariantCard } from './gallery';

function Editorial() {
  return (
    <article className="pt-prose pt-prose-a">
      <h2>How prices are chosen</h2>
      <p>
        Every value on LGI.tools starts from a <strong>Jita sell snapshot</strong> refreshed through the day. When a
        market is thin, the planner falls back to the five-day average and <a href="#prose">marks the price as lower confidence</a>.
      </p>
      <ul>
        <li>Snapshots older than an hour show a pending pulse.</li>
        <li>Thin markets fall back to the five-day average.</li>
        <li>You can pin a hub per plan with <code>?hub=amarr</code>.</li>
      </ul>
      <blockquote>“The planner saved me 40M ISK on a Praxis batch.”</blockquote>
    </article>
  );
}

function ArticleCard() {
  return (
    <article className="pt-prose pt-prose-b">
      <p className="pt-lead">LGI.tools stores only the account and ESI data needed to run the tools you use.</p>
      <h2>What we keep</h2>
      <p>
        Linked characters, their ESI tokens (encrypted at rest), and the plans you save. We never sell or share it, and
        you can <a href="#prose">unlink a character</a> at any time.
      </p>
      <aside>
        <InfoIcon size={18} className="mt-0.5 shrink-0 text-aurora" />
        <span>Deleting your account removes every linked character and saved plan within 24 hours.</span>
      </aside>
    </article>
  );
}

function CompactDocs() {
  return (
    <article className="pt-prose pt-prose-c">
      <h3><a href="#prose" aria-label="Link to this section">#</a>Add a build location</h3>
      <ol>
        <li>Open <a href="#prose">Industry → Planner</a> and choose a blueprint.</li>
        <li>Press <kbd>⌘</kbd> <kbd>K</kbd> and search for your structure.</li>
        <li>Set the rig bonuses, then save the location to reuse it.</li>
      </ol>
      <h3><a href="#prose" aria-label="Link to this section">#</a>Share it with your corporation</h3>
      <p>Station managers can share locations under <strong>Settings → Corporations</strong>.</p>
    </article>
  );
}

function ReleaseNotes() {
  return (
    <article className="pt-prose pt-prose-d">
      <h2>v4.1</h2>
      <p className="text-muted">October 2026 · the glass release</p>
      <hr />
      <ul>
        <li><span className="pt-kind" data-tone="green">Added</span>Primitive reference listing every shared component.</li>
        <li><span className="pt-kind" data-tone="blue">Changed</span>Fields, menus, and pills move to the frosted look.</li>
        <li><span className="pt-kind" data-tone="orange">Fixed</span>Live prices no longer flash twice after a refresh.</li>
      </ul>
    </article>
  );
}

function ReadingMode() {
  return (
    <article className="pt-prose pt-prose-e">
      <p>
        Wormhole space rewards patience. Gas sites in a C3 can be worth <mark>more than a week of ratting</mark> if you
        read the signatures right, and the scanner shows you which ones are still fresh.
      </p>
      <p>
        Read the <a href="#prose">site guide</a> before your first run; it covers sleeper spawns, gas yields, and the
        timers that decide when to warp out.
      </p>
      <figcaption>Yields assume a Venture with two Gas Cloud Scoops II.</figcaption>
    </article>
  );
}

export function ProseGroup() {
  return (
    <PrototypeGroup
      id="prose"
      title="Prose"
      today="Today: paragraphs, bold, and a green underlined link. No heading, list, quote, or code styles."
    >
      <VariantCard letter="Now" name="Paragraph styles" pitch="The shipping Prose.">
        <Prose className="mx-0">
          <p>
            LGI.tools stores only the account and ESI data needed to provide the requested tools. <strong>We never sell
            or share it.</strong> Read the <a href="#prose">privacy notes</a>.
          </p>
        </Prose>
      </VariantCard>
      <VariantCard letter="A" name="Editorial" pitch="Full vocabulary: sentence-case headings, gradient-dot lists, a glass pull quote, code pills, and links that fill on hover.">
        <Editorial />
      </VariantCard>
      <VariantCard letter="B" name="Article card" pitch="A larger lead line, headings marked by a gradient dash, and an aurora info aside for policy pages.">
        <ArticleCard />
      </VariantCard>
      <VariantCard letter="C" name="Compact docs" pitch="Dense 14px help text with numbered step discs, hover anchors, and glass keycaps.">
        <CompactDocs />
      </VariantCard>
      <VariantCard letter="D" name="Release notes" pitch="Barlow display headings kept for brand, with tone-coded change kinds. Built for the changelog.">
        <ReleaseNotes />
      </VariantCard>
      <VariantCard letter="E" name="Reading mode" pitch="Larger, airier long-form text with a gradient drop cap, highlighter marks, and dotted links.">
        <ReadingMode />
      </VariantCard>
    </PrototypeGroup>
  );
}
