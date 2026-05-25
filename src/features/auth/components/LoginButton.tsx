'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Pill } from '@/components/ui/pill';
import type { Session } from '../types';

export function LoginButton({
  session,
  showAdminLink = false,
}: {
  session: Session | null;
  showAdminLink?: boolean;
}) {
  if (!session) {
    return (
      <a
        href="/api/auth/login"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 border border-[#1e2c3a] hover:border-[#2a3550] text-isk transition-colors"
      >
        Log in with EVE
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {showAdminLink ? (
        <a href="/admin" title="Open the admin dashboard">
          <Chip tone="purple">Admin</Chip>
        </a>
      ) : null}
      <img
        src={session.portraitUrl}
        alt={session.name}
        width={28}
        height={28}
        className="rounded-[2px] border border-[#1e2c3a]"
      />
      <span className="font-mono text-[11px] text-text">{session.name}</span>
      <CharacterIdPill characterId={session.characterId} />
      <form method="POST" action="/api/auth/logout">
        <button
          type="submit"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text px-2 py-1 transition-colors"
        >
          Log out
        </button>
      </form>
    </div>
  );
}

function CharacterIdPill({ characterId }: { characterId: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(characterId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard write failed — pill stays unmarked.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className="cursor-pointer"
    >
      <Pill tone={copied ? 'green' : 'neutral'}>
        ID {characterId}
        <span className="ml-1.5 opacity-60">{copied ? '✓' : '⧉'}</span>
      </Pill>
    </button>
  );
}
