/** The first character upper-cased and the rest untouched; '' stays ''. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A lower-case letter or digit before an upper-case one ('detail|Mode',
// 'level2|Bonus'), or the last capital of an acronym before a capitalised
// word ('ECM|Range').
const CAMEL_BOUNDARY = /[a-z0-9](?=[A-Z])|[A-Z](?=[A-Z][a-z])/g;
const SEPARATORS = /[\s_-]+/;
const ACRONYM = /^[A-Z0-9]{2,}$/;

/**
 * A sentence-case label for a machine identifier. camelCase, snake_case and
 * kebab-case split into words, every word is lower-cased except all-caps
 * acronyms of two or more characters, and the first word is capitalised:
 * 'droneTrackingBonus' → 'Drone tracking bonus', 'some_new_ccp_thing' →
 * 'Some new ccp thing', 'maxECMRange' → 'Max ECM range'.
 */
export function humanizeIdentifier(id: string): string {
  const words = id
    .replace(CAMEL_BOUNDARY, '$& ')
    .split(SEPARATORS)
    .filter((word) => word.length > 0)
    .map((word) => (ACRONYM.test(word) ? word : word.toLowerCase()));
  return capitalize(words.join(' '));
}
