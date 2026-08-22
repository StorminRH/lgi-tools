/**
 * Max length of a feedback title. Single source shared by the modal
 * (input cap) and the /api/feedback route (Zod + sanitise cap) so the two
 * can't drift. 120 stays a subject line, well under Linear's title cap.
 */
export const FEEDBACK_TITLE_MAX_LENGTH = 120;

/**
 * Max length of a feedback message. Single source shared by the modal
 * (textarea cap) and the /api/feedback route (Zod + sanitise cap) so the two
 * can't drift. 2000 stays a thoughtful free-text ceiling.
 */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
