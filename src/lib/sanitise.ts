// Single source for the "clean untrusted free text" idiom used at input
// boundaries (admin search queries, contact/feedback messages): strip Unicode
// control + format characters, trim, then truncate to a per-caller cap. Only
// the cleaning is shared — the max-length stays a per-call-site constant.
const CONTROL_CHARS = /\p{C}/gu;

export function sanitiseUserText(raw: string, maxLength: number): string {
  return raw.replace(CONTROL_CHARS, '').trim().slice(0, maxLength);
}
