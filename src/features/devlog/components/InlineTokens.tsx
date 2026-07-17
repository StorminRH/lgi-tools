import { Fragment, type ReactNode } from 'react';
import type { InlineToken } from '../types';

type TokenRenderer = (token: InlineToken, key: number) => ReactNode;

// One renderer per inline-token type — a config-map in place of a switch, so the
// mapping shell stays branch-free. Everything renders through JSX (auto-escaped);
// external links open in a new tab, internal ones navigate in place.
const TOKEN_RENDERERS: {
  [K in InlineToken['type']]: (token: Extract<InlineToken, { type: K }>, key: number) => ReactNode;
} = {
  bold: (token, key) => <strong key={key}>{token.value}</strong>,
  code: (token, key) => <code key={key}>{token.value}</code>,
  link: (token, key) => {
    const external = /^https?:\/\//.test(token.href);
    return (
      <a
        key={key}
        href={token.href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {token.text}
      </a>
    );
  },
  text: (token, key) => <Fragment key={key}>{token.value}</Fragment>,
};

/** Renders one inline token by dispatching to its type's renderer. */
export function renderToken(token: InlineToken, key: number): ReactNode {
  return (TOKEN_RENDERERS[token.type] as TokenRenderer)(token, key);
}

/** Inline prose runs → React elements, in source order. */
export function InlineTokens({ tokens }: { tokens: InlineToken[] }) {
  return <>{tokens.map((token, i) => renderToken(token, i))}</>;
}
