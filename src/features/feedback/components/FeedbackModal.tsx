'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Pill } from '@/components/ui/pill';
import type { Session } from '@/features/auth/types';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '../constants';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

// Feedback modal. Captures the URL the user was viewing when the modal
// opened (not at submit time — feedback is reactive, so the page they
// were reacting to is the relevant one even if they navigate after).
// Server reads the session itself; client doesn't pass character info.
export function FeedbackModal({
  open,
  onClose,
  session,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  loading: boolean;
}) {
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [path, setPath] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  // Capture the URL at the moment the modal opens. Stays stable for the
  // life of the open modal even if the user navigates underneath (rare
  // but possible via keyboard shortcuts on routes that handle them).
  // The React-blessed alternative to setState-in-effect for "reset state
  // when a prop flips" is a `key` remount in the parent, but that would
  // require coordinating with FeedbackButton and adds more surface area
  // than this single open-flip handler is worth.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPath(window.location.pathname + window.location.search);
    setMessage('');
    setState({ kind: 'idle' });
    /* eslint-enable react-hooks/set-state-in-effect */
    // Focus the textarea once the dialog has opened.
    queueMicrotask(() => textareaRef.current?.focus());
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === 'submitting') return;
    if (message.trim().length === 0) {
      setState({ kind: 'error', message: 'Please enter a message before sending.' });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, path }),
      });
      if (!response.ok) {
        // Gate on status so users never see a raw error body. 400 carries a
        // human-readable validation detail; 429/5xx get a friendly line each
        // (the rate-limit/server bodies are JSON, not display copy).
        let message: string;
        if (response.status === 400) {
          message = (await response.text()) || 'Please check your message and try again.';
        } else if (response.status === 429) {
          message = 'Too much feedback too fast — please wait a minute and try again.';
        } else {
          message = 'Something went wrong sending your feedback. Try again.';
        }
        setState({ kind: 'error', message });
        return;
      }
      setState({ kind: 'success' });
    } catch {
      setState({
        kind: 'error',
        message: 'Network error — your feedback did not send. Try again.',
      });
    }
  }

  const charsLeft = FEEDBACK_MESSAGE_MAX_LENGTH - message.length;
  const disabled = state.kind === 'submitting';

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className="font-display font-bold text-[16px] tracking-[0.06em] uppercase text-name"
          >
            Send feedback
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-text text-[14px] leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-[10px] tracking-[0.08em] uppercase text-muted">
            {loading ? (
              <div>Submitting…</div>
            ) : session ? (
              <div>
                <span>Submitting as</span>{' '}
                <span className="text-text normal-case tracking-normal">{session.name}</span>
              </div>
            ) : (
              <div>Submitting anonymously</div>
            )}
            {path && (
              <div className="truncate">
                <span>From</span>{' '}
                <span className="text-text font-mono normal-case tracking-normal">{path}</span>
              </div>
            )}
          </div>

          {state.kind === 'success' ? (
            <div className="py-6 text-center text-[12px] text-isk">
              Thanks — your feedback was sent.
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={disabled}
                maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                placeholder="What's broken, missing, or weird? The more specific the better."
                rows={6}
                className="bg-section border border-border text-text font-mono text-[12px] px-2.5 py-2 resize-none focus:outline-none focus:border-[#2a3550] disabled:opacity-50"
              />
              <div className="flex items-center justify-between text-[9px] tracking-[0.08em] uppercase text-muted">
                <span>{charsLeft} chars left</span>
                {state.kind === 'error' && (
                  <span className="text-[#dd4444] normal-case tracking-normal">
                    {state.message}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-3">
          {state.kind === 'success' ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex"
            >
              <Pill tone="neutral">Close</Pill>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={disabled}
                className="inline-flex disabled:opacity-50"
              >
                <Pill tone="neutral">Cancel</Pill>
              </button>
              <button
                type="submit"
                disabled={disabled || message.trim().length === 0}
                className="inline-flex disabled:opacity-50"
              >
                <Pill tone="green">{state.kind === 'submitting' ? 'Sending…' : 'Send'}</Pill>
              </button>
            </>
          )}
        </footer>
      </form>
    </Modal>
  );
}
