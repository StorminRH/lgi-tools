import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_ISSUE_TITLE_MAX_LENGTH,
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  isFeedbackCategory,
} from './categories';

describe('feedback issue triage copy', () => {
  it('gates categories and builds titled bodies without character ids', () => {
    expect(isFeedbackCategory('bug')).toBe(true);
    expect(isFeedbackCategory('feature')).toBe(true);
    expect(isFeedbackCategory('nope')).toBe(false);

    expect(buildFeedbackIssueTitle('bug', 'sites filter resets')).toBe(
      '[Bug] sites filter resets',
    );
    expect(buildFeedbackIssueTitle('feature', 'add multibuy export')).toBe(
      '[Feature request] add multibuy export',
    );

    const long = 'word '.repeat(80).trim();
    const title = buildFeedbackIssueTitle('ux', long);
    expect(title.startsWith('[UX] ')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(FEEDBACK_ISSUE_TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);

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
