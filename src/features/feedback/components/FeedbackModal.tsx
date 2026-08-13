'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Session } from '@/platform/auth/types';
import { apiFetch } from '@/transport/api-client';
import { feedbackEndpoint } from '../api-contract';
import {
  FEEDBACK_CATEGORY_SELECT_ITEMS,
  type FeedbackCategory,
} from '../categories';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '../constants';
import {
  FEEDBACK_NETWORK_ERROR_MESSAGE,
  feedbackErrorMessage,
  feedbackSubmitGate,
  type SubmitState,
} from './feedback-view';

// Fire the feedback request and map the outcome to the next state — the friendly
// error copy per status lives in {@link feedbackErrorMessage}.
async function submitFeedback(
  message: string,
  path: string,
  category: FeedbackCategory,
): Promise<SubmitState> {
  try {
    const result = await apiFetch(feedbackEndpoint, {
      body: { message, path, category },
    });
    if (!result.ok) return { kind: 'error', message: feedbackErrorMessage(result) };
    return { kind: 'success' };
  } catch {
    return { kind: 'error', message: FEEDBACK_NETWORK_ERROR_MESSAGE };
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
    <div className="flex flex-col gap-1 text-label tracking-label uppercase text-muted">
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
          <span className="font-data text-text normal-case tracking-normal">{path}</span>
        </div>
      )}
    </div>
  );
}

// Category select — caption + Select (not Field/label: Select is self-labelled
// via ariaLabel; a wrapping label would steal clicks onto the trigger).
function FeedbackCategoryField({
  category,
  disabled,
  onCategoryChange,
}: {
  category: string;
  disabled: boolean;
  onCategoryChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label uppercase tracking-wide text-muted">Category</span>
      <Select
        value={category}
        onValueChange={onCategoryChange}
        items={FEEDBACK_CATEGORY_SELECT_ITEMS}
        ariaLabel="Category"
        disabled={disabled}
      />
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
      <Banner tone="info" className="my-4">
        Thanks — your feedback was sent.
      </Banner>
    );
  }
  return (
    <Field
      label="Feedback"
      hint={`${charsLeft} chars left`}
      error={state.kind === 'error' ? state.message : undefined}
    >
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={onMessageChange}
        disabled={disabled}
        maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
        placeholder="What's broken, missing, or weird? The more specific the better."
        rows={6}
        className="resize-none disabled:opacity-50"
      />
    </Field>
  );
}

// The footer buttons: a single Close after success, else Cancel + Send.
function FeedbackFooter({
  state,
  disabled,
  canSend,
  onClose,
}: {
  state: SubmitState;
  disabled: boolean;
  canSend: boolean;
  onClose: () => void;
}) {
  if (state.kind === 'success') {
    return (
      <Button variant="secondary" size="sm" onClick={onClose}>
        Close
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={onClose} disabled={disabled}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" size="sm" disabled={disabled || !canSend}>
        {state.kind === 'submitting' ? 'Sending…' : 'Send'}
      </Button>
    </>
  );
}

/**
 * Feedback modal. Captures the URL the user was viewing when the modal
 * opened (not at submit time — feedback is reactive, so the page they
 * were reacting to is the relevant one even if they navigate after).
 * Server reads the session itself; client doesn't pass character info.
 */
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
  const [category, setCategory] = useState<FeedbackCategory>('bug');
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
    setCategory('bug');
    setState({ kind: 'idle' });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gate = feedbackSubmitGate(message, category, state);
    if (gate !== 'ok') {
      if (gate === 'empty') {
        setState({ kind: 'error', message: 'Please enter a message before sending.' });
      } else if (gate === 'no_category') {
        setState({ kind: 'error', message: 'Please choose a category before sending.' });
      }
      return;
    }
    setState({ kind: 'submitting' });
    setState(await submitFeedback(message, path, category));
  }

  const charsLeft = FEEDBACK_MESSAGE_MAX_LENGTH - message.length;
  const disabled = state.kind === 'submitting';
  const canSend = message.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      labelledBy={titleId}
      initialFocus={textareaRef}
      className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-[min(560px,calc(100vw-2rem))] flex-col"
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id={titleId}
            className="font-display font-bold text-h3 tracking-copy uppercase text-name"
          >
            Send feedback
          </h2>
          <Button
            variant="bare"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-text text-ui leading-none px-2 py-1"
          >
            ×
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
          <FeedbackMeta loading={loading} session={session} path={path} />
          {state.kind !== 'success' && (
            <FeedbackCategoryField
              category={category}
              disabled={disabled}
              onCategoryChange={(value) => setCategory(value as FeedbackCategory)}
            />
          )}
          <FeedbackBody
            state={state}
            message={message}
            disabled={disabled}
            charsLeft={charsLeft}
            textareaRef={textareaRef}
            onMessageChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-4 py-3">
          <FeedbackFooter
            state={state}
            disabled={disabled}
            canSend={canSend}
            onClose={onClose}
          />
        </footer>
      </form>
    </Dialog>
  );
}
