// Max length of a feedback message. Single source shared by the modal
// (textarea cap) and the /api/feedback route (Zod + sanitise cap) so the two
// can't drift. 2000 matches Discord's webhook content limit, so a single
// report always fits in one Discord message.
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
