import './load-env';

import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { codexPages, codexRevisions } from '@/features/codex/schema';
import { resolveE2eStorageStatePath } from './identity';

test.use({ storageState: resolveE2eStorageStatePath() });

const stamp = Date.now();
const key = `alt-text-check-${stamp}`;
const longKey = `alt-text-long-${stamp}`;
const pageIds: string[] = [];

const paragraph = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });

async function seedGuide(subjectKey: string, content: unknown[]) {
  const pageId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  pageIds.push(pageId);
  await db.insert(codexPages).values({ id: pageId, subjectKind: 'guides', subjectKey, title: 'Alt text check' });
  await db.insert(codexRevisions).values({
    id: revisionId,
    pageId,
    doc: { type: 'doc', attrs: { schemaVersion: 1 }, content },
    schemaVersion: 1,
    origin: 'admin',
  });
  await db.update(codexPages).set({ currentRevisionId: revisionId }).where(eq(codexPages.id, pageId));
}

test.beforeAll(async () => {
  await seedGuide(key, [paragraph('p1', 'Warp in at 40 km.')]);
  await seedGuide(longKey, [
    paragraph('p1', 'Warp in at 40 km.'),
    ...Array.from({ length: 60 }, (_, index) => paragraph(`p${index + 2}`, `Step ${index + 1}: hold range and watch the overview.`)),
  ]);
});

test.afterAll(async () => {
  for (const pageId of pageIds) await db.delete(codexPages).where(eq(codexPages.id, pageId));
});

async function pasteImage(page: Page, subjectKey = key) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, { scrollCalls: calls });
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function record(this: Element, options?: boolean | ScrollIntoViewOptions) {
      calls.push(this.tagName);
      scroll.call(this, options);
    };
  });
  await page.goto(`/codex/guides/${subjectKey}/edit?edit=lead`);
  await page.locator('form[data-codex-editor] .ProseMirror p').first().click();
  const surface = page.locator('form[data-codex-editor] .ProseMirror');
  await page.keyboard.press('End');
  await surface.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<figure data-codex-image="" data-asset-id="aaaaaaaa-0000-4000-8000-000000000001"></figure><p>After.</p>',
    );
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const figure = surface.locator('figure[data-codex-image]');
  await expect(figure).toHaveCount(1);
  return { surface, figure, alt: page.getByLabel('Alt text (required)') };
}

const hitAtCenter = (locator: Locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && element.contains(hit);
  });

const figureScrolls = (page: Page) =>
  page.evaluate(() => (window as unknown as { scrollCalls: string[] }).scrollCalls.filter((tag) => tag === 'FIGURE').length);

async function blockedSave(page: Page) {
  await page.locator('form[data-codex-editor] button[type="submit"]').click();
  await expect(page.getByText('Add alt text to every image before saving').first()).toBeVisible();
}

test('a save blocked for missing alt text moves focus to the open alt text field', async ({ page }) => {
  const { figure, alt } = await pasteImage(page);
  await figure.click();
  await expect(alt).toHaveCount(1);
  await page.locator('input[name="summary"]').fill('Add a screenshot');
  await expect(alt).not.toBeFocused();

  await blockedSave(page);

  await expect(alt).toBeFocused();
  await expect(alt).toBeInViewport();
});

test('a save blocked for missing alt text moves focus to the alt text field of a deselected image', async ({ page }) => {
  const { surface, alt } = await pasteImage(page);
  await surface.getByText('After.').click();
  await expect(alt).toHaveCount(0);
  await page.locator('input[name="summary"]').fill('Add a screenshot');

  await blockedSave(page);

  await expect(alt).toBeFocused();
  await expect(alt).toBeInViewport();
});

test('reselecting an image after a blocked save does not scroll to it again', async ({ page }) => {
  const { surface, figure, alt } = await pasteImage(page);
  await page.locator('input[name="summary"]').fill('Add a screenshot');
  await blockedSave(page);
  await expect(alt).toBeFocused();
  const scrolls = await figureScrolls(page);
  expect(scrolls).toBeGreaterThan(0);

  await surface.getByText('After.').click();
  await page.keyboard.press('ArrowDown');
  await expect(alt).toHaveCount(0);
  await figure.click();
  await expect(alt).toHaveCount(1);

  expect(await figureScrolls(page)).toBe(scrolls);
});

test('in a long guide a blocked save shows the alt text problem under the focused field with the image in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { surface, figure, alt } = await pasteImage(page, longKey);
  await surface.getByText('Step 60:').click();
  await expect(alt).toHaveCount(0);
  await page.locator('input[name="summary"]').fill('Add a screenshot');
  await expect(figure).not.toBeInViewport();

  await blockedSave(page);

  const describedBy = await alt.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const message = page.locator(`[id="${describedBy}"]`);
  await expect(message).toHaveText('Add alt text to every image before saving');
  await expect(message).toBeVisible();
  await expect(message).toBeInViewport();
  await expect(alt).toHaveAttribute('aria-invalid', 'true');
  await expect(alt).toBeFocused();
  await expect(alt).toBeInViewport();
  await expect(figure).toBeInViewport();
  expect(await hitAtCenter(figure)).toBe(true);
  expect(await hitAtCenter(page.locator('header.app-header'))).toBe(true);
});
