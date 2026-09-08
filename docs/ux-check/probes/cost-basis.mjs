import { expect } from '@playwright/test';
import { installPlannerPrices } from '../lib/planner-fixture.mjs';

export default {
  name: 'cost-basis', route: '/industry/691', viewports: ['desktop'],
  async setup({ page }) { await installPlannerPrices(page); },
  async run({ page }) {
    const me = page.getByRole('textbox', { name: 'main blueprint material efficiency' }).first();
    await me.fill('0');
    await me.press('Enter');
    const tile = page.locator('div.rounded-md.border', { hasText: 'Input cost' }).first();
    const basis = page.getByRole('group', { name: 'Input cost basis' });
    await basis.getByRole('button', { name: 'Raw', exact: true }).click();
    await expect(basis.getByRole('button', { name: 'Raw', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(tile).toContainText('410K');
    await basis.getByRole('button', { name: 'Item', exact: true }).click();
    await expect(basis.getByRole('button', { name: 'Item', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(tile).toContainText('410K');
  },
};
