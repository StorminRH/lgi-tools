import { expect, test } from 'vitest';
import { parseCodexDoc, type CodexBlockNode, type CodexDoc } from './doc';
import { codexSections, isBlankSection, leadInfobox, sectionBounds } from './sections';

const paragraph = (id: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: id }],
});
const heading = (id: string, level: 2 | 3) => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text: id }],
});

function fixture(): CodexDoc {
  const parsed = parseCodexDoc({
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [
      paragraph('intro'),
      paragraph('intro-2'),
      heading('waves', 2),
      paragraph('waves-1'),
      heading('strategy', 2),
      paragraph('strategy-1'),
      heading('tank', 3),
      paragraph('tank-1'),
      heading('loot', 2),
    ],
  });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return parsed.doc;
}

const ids = (blocks: readonly CodexBlockNode[]) => blocks.map((block) => ('id' in block.attrs ? block.attrs.id : null));

test('splits a document into a lead and one section per level-2 heading', () => {
  expect(
    codexSections(fixture()).map((section) => ({
      id: section.id,
      heading: section.heading?.attrs.id ?? null,
      blocks: ids(section.blocks),
    })),
  ).toEqual([
    { id: 'lead', heading: null, blocks: ['intro', 'intro-2'] },
    { id: 'waves', heading: 'waves', blocks: ['waves-1'] },
    { id: 'strategy', heading: 'strategy', blocks: ['strategy-1', 'tank', 'tank-1'] },
    { id: 'loot', heading: 'loot', blocks: [] },
  ]);
});

test('drops an empty lead', () => {
  const parsed = parseCodexDoc({
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [heading('only', 2), paragraph('body')],
  });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  expect(codexSections(parsed.doc).map((section) => section.id)).toEqual(['only']);
});

test('splits the blocks around a section body', () => {
  const doc = fixture();
  const around = (sectionId: string) => {
    const bounds = sectionBounds(doc.content, sectionId);
    return bounds && { before: ids(doc.content.slice(0, bounds.start)), after: ids(doc.content.slice(bounds.end)) };
  };

  expect(around('lead')).toEqual({
    before: [],
    after: ['waves', 'waves-1', 'strategy', 'strategy-1', 'tank', 'tank-1', 'loot'],
  });
  expect(around('strategy')).toEqual({
    before: ['intro', 'intro-2', 'waves', 'waves-1', 'strategy'],
    after: ['loot'],
  });
  expect(around('loot')).toEqual({
    before: ['intro', 'intro-2', 'waves', 'waves-1', 'strategy', 'strategy-1', 'tank', 'tank-1', 'loot'],
    after: [],
  });
  expect(around('tank')).toBeNull();
  expect(around('missing')).toBeNull();
});

function parsed(content: unknown[]): CodexDoc {
  const result = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.doc;
}

const dataBlock = (layout: 'infobox' | 'card') => ({
  type: 'dataBlock',
  attrs: { id: 'data', source: 'wormholeType', key: 'C247', fields: layout === 'card' ? [] : ['totalMass'], layout },
});

test('lifts only an infobox that opens the page', () => {
  expect(leadInfobox(parsed([dataBlock('infobox'), heading('overview', 2)]))?.attrs.id).toBe('data');
  expect(leadInfobox(parsed([dataBlock('card'), heading('waves', 2)]))).toBeNull();
  expect(leadInfobox(parsed([paragraph('intro'), dataBlock('infobox')]))).toBeNull();
});

test('a section is blank when it holds nothing but empty paragraphs', () => {
  const blank = (text: string) => parsed([{ type: 'paragraph', attrs: { id: 'p' }, content: text ? [{ type: 'text', text }] : [] }]).content;
  expect(isBlankSection([])).toBe(true);
  expect(isBlankSection(blank(''))).toBe(true);
  expect(isBlankSection(blank('  '))).toBe(true);
  expect(isBlankSection(blank('x'))).toBe(false);
  expect(isBlankSection(parsed([dataBlock('infobox')]).content)).toBe(false);
});
