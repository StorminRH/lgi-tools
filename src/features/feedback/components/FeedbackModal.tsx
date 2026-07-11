'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Modal } from '@/components/ui/modal';
import { Pill } from '@/components/ui/pill';
import type { Session } from '@/features/auth/types';
import { apiFetch } from '@/lib/api-client';
import { feedbackEndpoint } from '../api-contract';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '../constants';
import { feedbackErrorMessage, feedbackSubmitGate, type SubmitState } from './feedback-view';

// Fire the feedback request and map the outcome to the next state — the friendly
// error copy per status lives in {@link feedbackErrorMessage}.
async function submitFeedback(message: string, path: string): Promise<SubmitState> {
  try {
    const result = await apiFetch(feedbackEndpoint, { body: { message, path } });
    if (!result.ok) return { kind: 'error', message: await feedbackErrorMessage(result) };
    return { kind: 'success' };
  } catch {
    return { kind: 'error', message: 'Network error — your feedback did not send. Try again.' };
  }
}

// Who the feedback submits as (loading / signed-in name / anonymous) and the
// captured page it's about.
function FeedbackMeta({
  loading,
  session,
  path,
}: {
  loading: boolean;
  session: Session | null;
  path: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-label tracking-[0.08em] uppercase text-muted">
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
  );
}

// The success confirmation, or the message textarea + chars-left / inline error.
function FeedbackBody({
  state,
  message,
  disabled,
  charsLeft,
  textareaRef,
  onMessageChange,
}: {
  state: SubmitState;
  message: string;
  disabled: boolean;
  charsLeft: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  if (state.kind === 'success') {
    return (
      <div role="status" aria-live="polite" className="py-6 text-center text-ui text-isk">
        Thanks — your feedback was sent.
      </div>
    );
  }
  return (
    <>
      <textarea
        ref={textareaRef}
        value={message}
        onChange={onMessageChange}
        disabled={disabled}
        maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
        placeholder="What's broken, missing, or weird? The more specific the better."
        rows={6}
        className="bg-section border border-border text-text font-mono text-ui px-2.5 py-2 resize-none focus:outline-none focus:border-border-active disabled:opacity-50"
      />
      <div className="flex items-center justify-between text-label tracking-[0.08em] uppercase text-muted">
        <span>{charsLeft} chars left</span>
        {state.kind === 'error' && (
          <span role="alert" className="text-pill-red-text normal-case tracking-normal">
            {state.message}
          </span>
        )}
      </div>
    </>
  );
}

// The footer buttons: a single Close after success, else Cancel + Send.
function FeedbackFooter({
  state,
  disabled,
  message,
  onClose,
}: {
  state: SubmitState;
  disabled: boolean;
  message: string;
  onClose: () => void;
}) {
  if (state.kind === 'success') {
    return (
      <button type="button" onClick={onClose} className="inline-flex">
        <Pill tone="neutral">Close</Pill>
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={onClose} disabled={disabled} className="inline-flex disabled:opacity-50">
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
  );
}

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
    const gate = feedbackSubmitGate(message, state);
    if (gate !== 'ok') {
      if (gate === 'empty') {
        setState({ kind: 'error', message: 'Please enter a message before sending.' });
      }
      return;
    }
    setState({ kind: 'submitting' });
    setState(await submitFeedback(message, path));
  }

  const charsLeft = FEEDBACK_MESSAGE_MAX_LENGTH - message.length;
  const disabled = state.kind === 'submitting';

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className="font-display font-bold text-h3 tracking-[0.06em] uppercase text-name"
          >
            Send feedback
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-text text-ui leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        <div className="px-4 py-3 flex flex-col gap-3">
          <FeedbackMeta loading={loading} session={session} path={path} />
          <FeedbackBody
            state={state}
            message={message}
            disabled={disabled}
            charsLeft={charsLeft}
            textareaRef={textareaRef}
            onMessageChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-3">
          <FeedbackFooter state={state} disabled={disabled} message={message} onClose={onClose} />
        </footer>
      </form>
    </Modal>
  );
}
