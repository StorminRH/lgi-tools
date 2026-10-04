'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PencilIcon } from './icons';
import { Input } from '@/components/ui/input';
import { CODEX_SUBJECTS, codexPageHref, slugify } from '../subjects';

export function NewGuideForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const address = slug ?? slugify(title);
  const key = CODEX_SUBJECTS.guides.parseKey(address);
  const ready = title.trim() !== '' && key !== null;

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || key === null) return;
    router.push(codexPageHref({ kind: 'guides', key }, { title: title.trim() }));
  };

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <PencilIcon size={14} />
        New guide
      </Button>
    );
  }
  return (
    <form onSubmit={start} className="flex w-full flex-col gap-3 border-t border-border-soft px-3.5 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input size="sm" value={title} maxLength={120} autoFocus onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field
          label="Address"
          hint={`/codex/guides/${address || '…'}`}
          error={address !== '' && key === null ? 'Use lowercase letters, numbers, and single dashes.' : undefined}
        >
          <Input size="sm" value={address} maxLength={80} onChange={(event) => setSlug(event.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!ready}>
          Start writing
        </Button>
      </div>
    </form>
  );
}
