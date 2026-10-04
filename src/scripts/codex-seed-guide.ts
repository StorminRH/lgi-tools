import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { codexPages, codexRevisions } from '@/composition/drizzle-schema';
import { PG_CONNECT_TIMEOUT_SECONDS, resolveLockConnectionUrl } from '@/db';
import { readEnv } from '@/lib/env';
import { assertLocalDatabaseUrl } from '@/lib/url-safety';
import { runScript } from './script-runtime';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

const slug = process.argv[2] ?? 'codex-field-test';

const text = (value: string, marks: object[] = []) => ({ type: 'text', text: value, marks });
const paragraph = (id: string | undefined, ...content: object[]) => ({
  type: 'paragraph',
  attrs: { id },
  content,
});
const cell = (type: string, value: string) => ({
  type,
  content: [paragraph(undefined, text(value))],
});
const item = (value: string) => ({ type: 'listItem', content: [paragraph(undefined, text(value))] });

const doc = {
  type: 'doc',
  attrs: { schemaVersion: 1 },
  content: [
    paragraph(
      'intro',
      text('A sample guide with every Codex node. Written at '),
      text(new Date().toISOString(), [{ type: 'code' }]),
      text('.'),
    ),
    { type: 'heading', attrs: { id: 'rolling', level: 2 }, content: [text('Rolling')] },
    paragraph(
      'rolling-text',
      text('Roll with a '),
      text('heavy', [{ type: 'bold' }]),
      text(' ship and keep the '),
      text('return hole', [{ type: 'italic' }]),
      text(' in mind. Track mass on '),
      text('Atlas', [{ type: 'link', attrs: { href: '/atlas' } }]),
      text(' or look up kills on '),
      text('zKillboard', [{ type: 'link', attrs: { href: 'https://zkillboard.com/' } }]),
      text('.'),
    ),
    { type: 'heading', attrs: { id: 'steps', level: 3 }, content: [text('Steps')] },
    { type: 'orderedList', attrs: { id: 'steps-list' }, content: [item('Jump in cold.'), item('Jump back hot.')] },
    { type: 'bulletList', attrs: { id: 'kit' }, content: [item('Higgs anchor'), item('Prop mod')] },
    { type: 'heading', attrs: { id: 'mass-detail', level: 4 }, content: [text('Mass detail')] },
    {
      type: 'blockquote',
      attrs: { id: 'quote' },
      content: [paragraph(undefined, text('Never roll alone.'))],
    },
    {
      type: 'callout',
      attrs: { id: 'tip', tone: 'tip' },
      content: [paragraph(undefined, text('Scout the far side before the last jump.'))],
    },
    { type: 'heading', attrs: { id: 'mass', level: 2 }, content: [text('Mass table')] },
    {
      type: 'table',
      attrs: { id: 'mass-table' },
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Ship'), cell('tableHeader', 'Cold'), cell('tableHeader', 'Hot')] },
        { type: 'tableRow', content: [cell('tableCell', 'Megathron'), cell('tableCell', '200,000 t'), cell('tableCell', '300,000 t')] },
        { type: 'tableRow', content: [cell('tableCell', 'Higgs Megathron'), cell('tableCell', '400,000 t'), cell('tableCell', '500,000 t')] },
      ],
    },
    { type: 'horizontalRule', attrs: { id: 'rule' } },
    paragraph('outro', text('End of the sample guide.')),
  ],
};

const databaseUrl = resolveLockConnectionUrl();
assertLocalDatabaseUrl(databaseUrl, 'codex:seed-guide');

const client = postgres(databaseUrl, {
  max: 1,
  connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
});

async function main() {
  const revisionId = await drizzle(client).transaction(async (tx) => {
    const [page] = await tx
      .insert(codexPages)
      .values({ subjectKind: 'guides', subjectKey: slug, title: 'Codex field test' })
      .onConflictDoUpdate({
        target: [codexPages.subjectKind, codexPages.subjectKey],
        set: { updatedAt: new Date() },
      })
      .returning();
    const [revision] = await tx
      .insert(codexRevisions)
      .values({
        pageId: page!.id,
        parentRevisionId: page!.currentRevisionId,
        doc,
        schemaVersion: 1,
        origin: 'admin',
        summary: 'Seeded by codex-seed-guide',
      })
      .returning({ id: codexRevisions.id });
    await tx
      .update(codexPages)
      .set({ currentRevisionId: revision!.id })
      .where(eq(codexPages.id, page!.id));
    return revision!.id;
  });
  console.log(`Seeded /codex/guides/${slug} at revision ${revisionId}`);
}

runScript(main, { client });
