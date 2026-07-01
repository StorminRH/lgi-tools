import { Fragment } from 'react';
import type { InlineToken } from '../types';

// Inline prose runs → React elements. Everything renders through JSX (auto-escaped);
// external links open in a new tab, internal ones navigate in place.
export function InlineTokens({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case 'bold':
            return <strong key={i}>{t.value}</strong>;
          case 'code':
            return <code key={i}>{t.value}</code>;
          case 'link': {
            const external = /^https?:\/\//.test(t.href);
            return (
              <a
                key={i}
                href={t.href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {t.text}
              </a>
            );
          }
          default:
            return <Fragment key={i}>{t.value}</Fragment>;
        }
      })}
    </>
  );
}
