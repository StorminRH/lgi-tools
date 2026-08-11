/**
 * Feedback categories shown in the modal and encoded into GitHub issue titles
 * for triage. Values are the wire/API keys; title tags are human-readable.
 */
export const FEEDBACK_CATEGORIES = [
  {
    value: 'bug',
    label: 'Bug',
    titleTag: 'Bug',
    /** Existing repo labels only — unknown names 422 the Issues API. */
    githubLabels: ['bug'] as const,
  },
  {
    value: 'feature',
    label: 'Feature request',
    titleTag: 'Feature request',
    githubLabels: ['enhancement'] as const,
  },
  {
    value: 'ux',
    label: 'UX / confusing',
    titleTag: 'UX',
    githubLabels: [] as const,
  },
  {
    value: 'other',
    label: 'Other',
    titleTag: 'Other',
    githubLabels: [] as const,
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

/** GitHub issue title hard cap (API-enforced). */
export const FEEDBACK_ISSUE_TITLE_MAX_LENGTH = 256;

/**
 * Builds `[Tag] <first line of message>` truncated to the Issues title cap so
 * triage can filter by the bracketed category without opening the body.
 */
export function buildFeedbackIssueTitle(
  category: FeedbackCategory,
  message: string,
): string {
  const tag = feedbackCategoryOf(category)?.titleTag ?? 'Other';
  const prefix = `[${tag}] `;
  const summary = message.replace(/\s+/g, ' ').trim();
  const budget = FEEDBACK_ISSUE_TITLE_MAX_LENGTH - prefix.length;
  if (summary.length <= budget) return `${prefix}${summary}`;
  const sliced = summary.slice(0, Math.max(0, budget - 1)).trimEnd();
  return `${prefix}${sliced}…`;
}

/**
 * Markdown body for a feedback GitHub issue. Character name only (no id);
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
