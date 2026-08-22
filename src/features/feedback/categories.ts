export const FEEDBACK_CATEGORIES = [
  {
    value: 'bug',
    label: 'Bug',
    linearLabelIds: ['a567bd23-7df3-46aa-aad9-0ba7c908e918'] as const,
  },
  {
    value: 'feature',
    label: 'Feature request',
    linearLabelIds: ['2f9442ba-c519-4c1c-9b9b-202335d2de73'] as const,
  },
  {
    value: 'ux',
    label: 'UX / confusing',
    linearLabelIds: ['ac151ccc-229d-40ca-b40a-483484bd3dc9'] as const,
  },
  {
    value: 'other',
    label: 'Other',
    linearLabelIds: [] as const,
  },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['value'];

const CATEGORY_BY_VALUE = new Map(
  FEEDBACK_CATEGORIES.map((entry) => [entry.value, entry] as const),
);

export const FEEDBACK_CATEGORY_SELECT_ITEMS = FEEDBACK_CATEGORIES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return CATEGORY_BY_VALUE.has(value as FeedbackCategory);
}

export function feedbackCategoryOf(value: string) {
  return CATEGORY_BY_VALUE.get(value as FeedbackCategory);
}

export function buildFeedbackIssueTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Markdown body for a feedback Linear issue. Character name only (no id);
 * page path and app version for context.
 */
export function buildFeedbackIssueBody({
  message,
  path,
  category,
  authorName,
  appVersion,
}: {
  message: string;
  path: string;
  category: FeedbackCategory;
  authorName: string;
  appVersion: string;
}): string {
  const label = feedbackCategoryOf(category)?.label ?? category;
  return [
    '## Feedback',
    '',
    message,
    '',
    '## Context',
    '',
    `- **Category:** ${label}`,
    `- **Page:** \`${path}\``,
    `- **Submitted by:** ${authorName}`,
    `- **App version:** ${appVersion}`,
  ].join('\n');
}
