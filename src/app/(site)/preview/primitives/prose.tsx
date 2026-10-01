import Link from 'next/link';
import { Prose } from '@/components/ui/prose';
import { ReferenceGroup, Specimen } from './specimen';

export function ProseGroup() {
  return (
    <ReferenceGroup
      id="prose"
      title="Prose"
      intro="Long-form reading copy for legal pages and written explanations."
    >
      <Specimen
        name="Prose"
        source="prose"
        note="Descendant styles for paragraphs, emphasis, and links, held to a readable measure."
        wide
      >
        <Prose className="mx-0">
          <p>
            LGI.tools stores only the account and ESI data needed to provide the tools you use. <strong>We never
            sell or share it</strong>, and you can unlink a character at any time from settings.
          </p>
          <p>
            Prices come from public market snapshots refreshed through the day. Read more in the{' '}
            <Link href="/changelog">changelog</Link> or ask in the corporation channel.
          </p>
        </Prose>
      </Specimen>
    </ReferenceGroup>
  );
}
