const CONTROL_CHARS = /\p{C}/gu;

export function sanitiseUserText(raw: string, maxLength: number): string {
  return raw.replace(CONTROL_CHARS, '').trim().slice(0, maxLength);
}
