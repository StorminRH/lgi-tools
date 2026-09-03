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

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const FEEDBACK_LINEAR_TEAM_ID = 'd6e910f7-a117-4358-896a-6ef20b13e117';

const ISSUE_CREATE_MUTATION = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id title }
  }
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLinearIssueCreateSuccess(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const errors = payload.errors;
  if (Array.isArray(errors) && errors.length > 0) return false;
  if (!isRecord(payload.data)) return false;
  if (!isRecord(payload.data.issueCreate)) return false;
  return payload.data.issueCreate.success === true;
}

export async function createFeedbackLinearIssue({
  title,
  message,
  path,
  category,
  authorName,
  appVersion,
}: {
  title: string;
  message: string;
  path: string;
  category: FeedbackCategory;
  authorName: string;
  appVersion: string;
}): Promise<Response> {
  const token = requireEnv('LINEAR_API_KEY');
  const labelIds = [...(feedbackCategoryOf(category)?.linearLabelIds ?? [])];

  const response = await fetchWithTimeout(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'User-Agent': OUTBOUND_USER_AGENT,
    },
    body: JSON.stringify({
      query: ISSUE_CREATE_MUTATION,
      variables: {
        input: {
          title: buildFeedbackIssueTitle(title),
          description: buildFeedbackIssueBody({
            message,
            path,
            category,
            authorName,
            appVersion,
          }),
          teamId: FEEDBACK_LINEAR_TEAM_ID,
          ...(labelIds.length > 0 ? { labelIds } : {}),
        },
      },
    }),
  });

  if (!response.ok) return response;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!isLinearIssueCreateSuccess(payload)) {
    return new Response(null, { status: 502 });
  }
  return response;
}
