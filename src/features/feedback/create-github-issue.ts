import 'server-only';

import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { requireEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { FeedbackCategory } from './categories';
import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  feedbackCategoryOf,
} from './categories';

const FEEDBACK_GITHUB_OWNER = 'StorminRH';
const FEEDBACK_GITHUB_REPO = 'lgi-tools';

const GITHUB_API_VERSION = '2022-11-28';

/**
 * Creates one GitHub Issue for a feedback submission. Returns the raw Response
 * so the route can map non-2xx to `github_failed` without swallowing detail.
 * Callers must 503 when `GITHUB_FEEDBACK_TOKEN` is unset before invoking this.
 */
export async function createFeedbackGithubIssue({
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
}): Promise<Response> {
  const token = requireEnv('GITHUB_FEEDBACK_TOKEN');

  const title = buildFeedbackIssueTitle(category, message);
  const body = buildFeedbackIssueBody({
    message,
    path,
    category,
    authorName,
    appVersion,
  });
  const labels = [...(feedbackCategoryOf(category)?.githubLabels ?? [])];

  return fetchWithTimeout(
    `https://api.github.com/repos/${FEEDBACK_GITHUB_OWNER}/${FEEDBACK_GITHUB_REPO}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Content-Type': 'application/json',
        'User-Agent': OUTBOUND_USER_AGENT,
      },
      body: JSON.stringify({
        title,
        body,
        ...(labels.length > 0 ? { labels } : {}),
      }),
    },
  );
}
