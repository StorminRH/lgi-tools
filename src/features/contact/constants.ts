// Max length of a contact-form message. Single source shared by the form
// (textarea cap) and the /api/contact route (Zod + sanitise cap) so the two
// can't drift — lowering it in one place would otherwise silently truncate
// messages the other still accepts.
export const CONTACT_MESSAGE_MAX_LENGTH = 4000;
