'use client';

import { useId, useState } from 'react';
import { Pill } from '@/components/ui/pill';

const MAX_MESSAGE_LENGTH = 4000;

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

// Public contact form. Posts to /api/contact, which emails the maintainer
// and keeps the destination address server-side. The visitor supplies their
// own email as the reply address. `website` is a honeypot field hidden from
// real users; the server treats any value in it as a bot and silently drops.
export function ContactForm() {
  const emailId = useId();
  const messageId = useId();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === 'submitting') return;
    if (email.trim().length === 0 || message.trim().length === 0) {
      setState({ kind: 'error', message: 'Enter your email and a message.' });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message, website }),
      });
      if (!response.ok) {
        const text = await response.text();
        setState({
          kind: 'error',
          message: text || 'Something went wrong sending your message. Try again.',
        });
        return;
      }
      setState({ kind: 'success' });
      setEmail('');
      setMessage('');
    } catch {
      setState({
        kind: 'error',
        message: 'Network error — your message did not send. Try again.',
      });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="py-8 text-center text-[12px] text-isk">
        Thanks — your message was sent.
      </div>
    );
  }

  const disabled = state.kind === 'submitting';
  const canSend = email.trim().length > 0 && message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={emailId}
          className="text-[10px] tracking-[0.08em] uppercase text-muted"
        >
          Email
        </label>
        <input
          id={emailId}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          className="bg-section border border-border text-text font-mono text-[12px] px-2.5 py-2 focus:outline-none focus:border-[#2a3550] disabled:opacity-50"
        />
        <p className="text-[10px] leading-relaxed text-muted">
          Used only to reply — your email isn&apos;t stored or shared.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={messageId}
          className="text-[10px] tracking-[0.08em] uppercase text-muted"
        >
          Message
        </label>
        <textarea
          id={messageId}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={disabled}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={8}
          placeholder="Your message"
          className="bg-section border border-border text-text font-mono text-[12px] px-2.5 py-2 resize-none focus:outline-none focus:border-[#2a3550] disabled:opacity-50"
        />
        {state.kind === 'error' && (
          <span className="text-[10px] text-[#dd4444]">{state.message}</span>
        )}
      </div>

      {/* Honeypot: hidden from people, filled by naive bots. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="lgi-contact-website">Website</label>
        <input
          id="lgi-contact-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={disabled || !canSend}
          className="inline-flex disabled:opacity-50"
        >
          <Pill tone="green">
            {state.kind === 'submitting' ? 'Sending…' : 'Send message'}
          </Pill>
        </button>
      </div>
    </form>
  );
}
