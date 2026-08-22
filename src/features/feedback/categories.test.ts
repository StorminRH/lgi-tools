import { describe, expect, it } from 'vitest';
import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  feedbackCategoryOf,
  isFeedbackCategory,
} from './categories';

describe('feedback issue triage copy', () => {
  it('gates categories and builds titled bodies without character ids', () => {
    expect(isFeedbackCategory('bug')).toBe(true);
    expect(isFeedbackCategory('feature')).toBe(true);
    expect(isFeedbackCategory('nope')).toBe(false);
    expect(feedbackCategoryOf('bug')?.linearLabelIds).toEqual([
      'a567bd23-7df3-46aa-aad9-0ba7c908e918',
    ]);
    expect(feedbackCategoryOf('feature')?.linearLabelIds).toEqual([
      '2f9442ba-c519-4c1c-9b9b-202335d2de73',
    ]);
    expect(feedbackCategoryOf('ux')?.linearLabelIds).toEqual([
      'ac151ccc-229d-40ca-b40a-483484bd3dc9',
    ]);
    expect(feedbackCategoryOf('other')?.linearLabelIds).toEqual([]);

    expect(buildFeedbackIssueTitle('sites filter resets')).toBe('sites filter resets');
    expect(buildFeedbackIssueTitle('  add   multibuy\nexport  ')).toBe(
      'add multibuy export',
    );

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
