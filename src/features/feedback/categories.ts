/**
 * Feedback categories shown in the modal and mapped onto Linear labels
 * for triage. Values are the wire/API keys; label ids are the LGI team
 * labels already on the workspace.
 */
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

/** Closed set of feedback category wire values. */
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['value'];

const CATEGORY_BY_VALUE = new Map(
  FEEDBACK_CATEGORIES.map((entry) => [entry.value, entry] as const),
);

/** Select items for the feedback category control (value + visible label). */
export const FEEDBACK_CATEGORY_SELECT_ITEMS = FEEDBACK_CATEGORIES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

/** True when `value` is a known feedback category wire key. */
export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return CATEGORY_BY_VALUE.has(value as FeedbackCategory);
}

/** Category metadata for a wire value, or undefined when unknown. */
export function feedbackCategoryOf(value: string) {
  return CATEGORY_BY_VALUE.get(value as FeedbackCategory);
}

/**
 * Collapses the user-entered title to a single line. The form and route already
 * cap length; this only normalizes whitespace so Linear does not store a
 * multiline subject.
 */
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
