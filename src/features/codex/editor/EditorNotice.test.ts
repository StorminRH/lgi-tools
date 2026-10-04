import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { EditorNotice } from './EditorNotice';

const subject = { kind: 'guides', key: 'rolling-a-c3' } as const;
const render = (sectionId: string | null) =>
  renderToStaticMarkup(createElement(EditorNotice, { notice: 'conflict', subject, sectionId }));
const latestLink = (html: string) => /<a [^>]*>See the latest version<\/a>/.exec(html)?.[0];

test('a conflict links to the newer page in a new tab and says saving replaces it', () => {
  const html = render('ships');
  expect(html).toContain('Saving again replaces their newer text with yours.');
  expect(latestLink(html)).toContain('href="/codex/guides/rolling-a-c3#ships"');
  expect(latestLink(html)).toContain('target="_blank"');
  expect(latestLink(render('lead'))).toContain('href="/codex/guides/rolling-a-c3"');
  expect(latestLink(render(null))).toContain('href="/codex/guides/rolling-a-c3"');
});

test('a rejected save keeps the text and offers no link', () => {
  const html = renderToStaticMarkup(createElement(EditorNotice, { notice: 'invalid', subject, sectionId: 'ships' }));
  expect(html).toContain('did not pass the page checks. Your text is kept below.');
  expect(latestLink(html)).toBeUndefined();
});

test('a conflict on a removed section says nothing was saved and the text sits at the end of the page', () => {
  const html = renderToStaticMarkup(
    createElement(EditorNotice, { notice: 'conflict', subject, sectionId: null, goneSectionId: 'ships' }),
  );
  expect(html).toContain(
    'A newer edit removed the section you were editing, so nothing was saved. Your text is kept at the end of the page below, ready to move where it belongs and publish.',
  );
  expect(html).not.toContain('replaces their newer text');
});
