import { expect } from '@playwright/test';

export default {
  name: 'sites-lazy-detail', route: '/sites', viewports: ['desktop', 'mobile'],
  async setup({ page }) {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('acceptance-sites-ready')) return;
      sessionStorage.setItem('acceptance-sites-ready', 'true');
      localStorage.setItem('lgi:pref:sites.detailMode', '"expand"');
      localStorage.setItem('lgi:pref:sites.view', '"cards"');
    });
  },
  async run({ page, viewport }) {
    const activate = async locator => viewport === 'mobile' ? locator.tap() : locator.click();
    const cards = page.locator('[data-site-card]');
    await expect(cards.first()).toBeVisible();
    const summary = cards.first().locator('details[data-collapsible] > summary').first();
    const identity = (await summary.innerText()).trim();
    expect(identity.length).toBeGreaterThan(0);
    await activate(summary);
    await expect(cards.first().locator('details[data-collapsible]').first()).toHaveAttribute('open', '');
    await expect(cards.first().locator('[data-lazy-details]')).not.toBeEmpty();
    await expect(page.locator('[data-site-card] > details[open]')).toHaveCount(1);
    const view = page.getByRole('group', { name: 'Sites view' });
    await activate(view.getByRole('button', { name: 'Table' }));
    const rows = page.locator('details[data-sites-row]');
    await expect(rows.first()).toBeVisible();
    await activate(rows.first().locator(':scope > summary'));
    await expect(rows.first()).toHaveAttribute('open', '');
    await expect(rows.first().locator('[data-lazy-details]')).not.toBeEmpty();
    await expect(page.locator('details[data-sites-row][open]')).toHaveCount(1);
    await page.reload();
    await expect(view.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows.first()).toBeVisible();
    await page.goto('/sites?sort=name&dir=asc');
    const names = page.locator('details[data-sites-row] summary [data-site-name]');
    await expect(names.first()).toBeVisible();
    const actual = await names.allTextContents();
    expect(actual.length).toBeGreaterThan(1);
    expect(actual).toEqual([...actual].sort((left, right) => left.localeCompare(right)));
    await page.reload();
    await expect(view.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(names).toHaveText(actual);
  },
};
