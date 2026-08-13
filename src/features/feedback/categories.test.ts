import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_ISSUE_TITLE_MAX_LENGTH,
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  isFeedbackCategory,
} from './categories';

describe('isFeedbackCategory', () => {
  it('accepts known wire values and rejects others', () => {
    expect(isFeedbackCategory('bug')).toBe(true);
    expect(isFeedbackCategory('feature')).toBe(true);
    expect(isFeedbackCategory('nope')).toBe(false);
  });
});

describe('buildFeedbackIssueTitle', () => {
  it('prefixes the category tag and keeps a short message intact', () => {
    expect(buildFeedbackIssueTitle('bug', 'sites filter resets')).toBe(
      '[Bug] sites filter resets',
    );
    expect(buildFeedbackIssueTitle('feature', 'add multibuy export')).toBe(
      '[Feature request] add multibuy export',
    );
  });

  it('collapses whitespace and truncates to the Issues title cap', () => {
    const long = 'word '.repeat(80).trim();
    const title = buildFeedbackIssueTitle('ux', long);
    expect(title.startsWith('[UX] ')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(FEEDBACK_ISSUE_TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('buildFeedbackIssueBody', () => {
  it('includes message, category, page, name, and version — not a character id', () => {
    const body = buildFeedbackIssueBody({
      message: 'The chart flickers',
      path: '/planner?type=123',
      category: 'bug',
      authorName: 'Test Pilot',
      appVersion: '4.0.0',
    });
    expect(body).toContain('The chart flickers');
    expect(body).toContain('**Category:** Bug');
    expect(body).toContain('`/planner?type=123`');
    expect(body).toContain('**Submitted by:** Test Pilot');
    expect(body).toContain('**App version:** 4.0.0');
    expect(body).not.toMatch(/#\d{5,}/);
  });
});
