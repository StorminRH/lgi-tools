/**
 * Max length of a feedback message. Single source shared by the modal
 * (textarea cap) and the /api/feedback route (Zod + sanitise cap) so the two
 * can't drift. 2000 stays a thoughtful free-text ceiling (well under GitHub's
 * 65_536-char issue body limit).
 */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
