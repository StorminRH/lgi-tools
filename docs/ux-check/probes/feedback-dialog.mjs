import { expect } from '@playwright/test';

export default {
  name: 'feedback-dialog', route: '/', viewports: ['desktop', 'mobile'],
  async run({ page, viewport, diagnostics }) {
    diagnostics.expectHttp({ pathname: '/api/feedback', method: 'POST', status: 502 });
    const requests = [];
    await page.route('**/api/feedback', async route => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) await route.fulfill({ status: 502, contentType: 'application/problem+json', body: JSON.stringify({ type: 'linear_failed', title: 'Unavailable', status: 502, detail: 'Controlled failure' }) });
      else await route.fulfill({ status: 204, body: '' });
    });
    const trigger = page.getByRole('button', { name: 'Feedback', exact: true });
    if (viewport === 'mobile') await trigger.tap();
    else { await trigger.focus(); await trigger.press('Enter'); }
    const dialog = page.getByRole('dialog', { name: 'Send feedback' });
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole('textbox', { name: 'Title' });
    await expect(title).toBeFocused();
    const category = dialog.getByRole('combobox', { name: 'Category' });
    await expect(category).toContainText('Bug');
    await category.click();
    await page.getByRole('option', { name: 'Feature request' }).click();
    await expect(category).toContainText('Feature request');
    await title.fill('Acceptance feedback');
    await dialog.getByRole('textbox', { name: 'Feedback' }).fill('Controlled browser submission.');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(dialog).toContainText('Something went wrong sending your feedback. Try again.');
    await expect(title).toHaveValue('Acceptance feedback');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(dialog).toContainText('Thanks — your feedback was sent.');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0]).toMatchObject({ title: 'Acceptance feedback', message: 'Controlled browser submission.', path: '/', category: 'feature' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  },
};
