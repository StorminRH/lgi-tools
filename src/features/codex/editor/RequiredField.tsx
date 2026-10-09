'use client';

import type { Editor } from '@tiptap/react';
import { useEffect, useId, useRef, type RefObject } from 'react';
import { Input } from '@/components/ui/input';
import type { DescribedBlock } from './block-select';

export interface RequiredFocus {
  readonly request: number;
  readonly blocked: DescribedBlock | null;
  readonly onHandled: () => void;
}

export const NO_FOCUS: RequiredFocus = { request: 0, blocked: null, onHandled: () => {} };

export function useRequiredFieldFocus(editor: Editor, { request, onHandled }: RequiredFocus) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (request === 0) return;
    const block = editor.view.nodeDOM(editor.state.selection.from);
    if (block instanceof HTMLElement) block.scrollIntoView({ block: 'center' });
    input.current?.focus({ preventScroll: true });
    onHandled();
  }, [request, editor, onHandled]);
  return input;
}

export function RequiredField({
  inputRef,
  label,
  placeholder,
  value,
  maxLength,
  problem,
  autoFocus,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  value: string;
  maxLength: number;
  problem: string | null;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  const problemId = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        ref={inputRef}
        size="sm"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={problem ? problemId : undefined}
        aria-invalid={problem ? true : undefined}
        autoFocus={autoFocus}
      />
      {problem ? (
        <p id={problemId} className="font-ui text-ui text-dps-mid">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
