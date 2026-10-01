'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { CheckIcon, CloseIcon, InfoIcon, SearchIcon, StructureIcon } from './icons';
import { PrototypeGroup, StateCell, StateGrid, VariantCard } from './gallery';

const FEEDBACK = 'The industry planner saved me 40M ISK on a Praxis batch.';

function FieldError({ children }: { children: string }) {
  return (
    <span className="pt-field-error">
      <InfoIcon size={13} />
      {children}
    </span>
  );
}

function CurrentFields() {
  return (
    <StateGrid>
      <Field label="Structure name" hint="Shown in the build-location picker">
        <Input defaultValue="Sotiyo — Deklein" />
      </Field>
      <Field label="ESI callback URL" error="Must start with https://">
        <Input defaultValue="htp://lgi.tools/api" />
      </Field>
      <Field label="Feedback" hint="500 characters max" className="sm:col-span-2">
        <Textarea rows={2} defaultValue={FEEDBACK} />
      </Field>
    </StateGrid>
  );
}

function FrostedFields() {
  return (
    <StateGrid>
      <StateCell label="default">
        <span className="pt-field-label">Structure name</span>
        <div className="pt-field-a">
          <input className="pt-input" defaultValue="Sotiyo — Deklein" aria-label="Structure name" />
        </div>
        <span className="pt-field-hint">Shown in the build-location picker</span>
      </StateCell>
      <StateCell label="focused">
        <span className="pt-field-label">Structure name</span>
        <div className="pt-field-a" data-focus>
          <input className="pt-input" defaultValue="Azbel — 1DQ" aria-label="Structure name, focused" />
        </div>
        <span className="pt-field-hint">Shown in the build-location picker</span>
      </StateCell>
      <StateCell label="error">
        <span className="pt-field-label">ESI callback URL</span>
        <div className="pt-field-a" data-invalid>
          <input className="pt-input" defaultValue="htp://lgi.tools/api" aria-label="ESI callback URL" aria-invalid />
        </div>
        <FieldError>Must start with https://</FieldError>
      </StateCell>
      <StateCell label="textarea">
        <span className="pt-field-label">Feedback</span>
        <div className="pt-field-a items-start">
          <textarea className="pt-input" rows={2} defaultValue={FEEDBACK} aria-label="Feedback" />
        </div>
      </StateCell>
    </StateGrid>
  );
}

function FloatingFields() {
  return (
    <StateGrid>
      <StateCell label="empty">
        <div className="pt-field-b">
          <input id="pt-b-empty" className="pt-input" placeholder=" " />
          <label htmlFor="pt-b-empty">Structure name</label>
        </div>
      </StateCell>
      <StateCell label="focused · filled">
        <div className="pt-field-b" data-focus>
          <input id="pt-b-focus" className="pt-input" placeholder=" " defaultValue="Sotiyo — Deklein" />
          <label htmlFor="pt-b-focus">Structure name</label>
        </div>
      </StateCell>
      <StateCell label="error">
        <div className="pt-field-b" data-invalid>
          <input id="pt-b-error" className="pt-input" placeholder=" " defaultValue="htp://lgi.tools/api" aria-invalid />
          <label htmlFor="pt-b-error">ESI callback URL</label>
        </div>
        <FieldError>Must start with https://</FieldError>
      </StateCell>
      <StateCell label="textarea">
        <div className="pt-field-b">
          <textarea id="pt-b-area" className="pt-input" rows={2} placeholder=" " defaultValue={FEEDBACK} />
          <label htmlFor="pt-b-area">Feedback</label>
        </div>
      </StateCell>
    </StateGrid>
  );
}

function PillFields() {
  const [value, setValue] = useState('Sotiyo — Deklein');
  return (
    <StateGrid>
      <StateCell label="default · clearable">
        <span className="pt-field-label">Structure name</span>
        <div className="pt-field-c">
          <StructureIcon />
          <input className="pt-input" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Structure name" />
          {value ? (
            <button type="button" className="pt-clear" aria-label="Clear" onClick={() => setValue('')}>
              <CloseIcon size={12} />
            </button>
          ) : null}
        </div>
      </StateCell>
      <StateCell label="focused · search">
        <span className="pt-field-label">Find a system</span>
        <div className="pt-field-c" data-focus>
          <SearchIcon />
          <input className="pt-input" defaultValue="J115405" aria-label="Find a system" />
        </div>
      </StateCell>
      <StateCell label="error">
        <span className="pt-field-label">ESI callback URL</span>
        <div className="pt-field-c" data-invalid>
          <InfoIcon className="pt-error-icon" />
          <input className="pt-input" defaultValue="htp://lgi.tools/api" aria-label="ESI callback URL" aria-invalid />
        </div>
        <FieldError>Must start with https://</FieldError>
      </StateCell>
      <StateCell label="textarea">
        <span className="pt-field-label">Feedback</span>
        <div className="pt-field-c pt-field-c-area">
          <textarea className="pt-input" rows={2} defaultValue={FEEDBACK} aria-label="Feedback" />
        </div>
      </StateCell>
    </StateGrid>
  );
}

function UnderlineFields() {
  return (
    <StateGrid>
      <StateCell label="default">
        <span className="pt-field-hint">Structure name</span>
        <div className="pt-field-d">
          <input className="pt-input" defaultValue="Sotiyo — Deklein" aria-label="Structure name" />
        </div>
      </StateCell>
      <StateCell label="focused">
        <span className="pt-field-hint">Structure name</span>
        <div className="pt-field-d" data-focus>
          <input className="pt-input" defaultValue="Azbel — 1DQ" aria-label="Structure name, focused" />
        </div>
      </StateCell>
      <StateCell label="error">
        <span className="pt-field-hint">ESI callback URL</span>
        <div className="pt-field-d" data-invalid>
          <input className="pt-input" defaultValue="htp://lgi.tools/api" aria-label="ESI callback URL" aria-invalid />
        </div>
        <FieldError>Must start with https://</FieldError>
      </StateCell>
      <StateCell label="textarea">
        <span className="pt-field-hint">Feedback</span>
        <div className="pt-field-d">
          <textarea className="pt-input" rows={2} defaultValue={FEEDBACK} aria-label="Feedback" />
        </div>
      </StateCell>
    </StateGrid>
  );
}

function GradientRingFields() {
  const [feedback, setFeedback] = useState(FEEDBACK);
  return (
    <StateGrid>
      <StateCell label="valid">
        <span className="pt-field-label">Structure name</span>
        <div className="pt-field-e" data-valid>
          <input className="pt-input" defaultValue="Sotiyo — Deklein" aria-label="Structure name" />
          <CheckIcon className="pt-valid-mark" size={16} />
        </div>
      </StateCell>
      <StateCell label="focused">
        <span className="pt-field-label">Structure name</span>
        <div className="pt-field-e" data-focus>
          <input className="pt-input" defaultValue="Azbel — 1DQ" aria-label="Structure name, focused" />
        </div>
      </StateCell>
      <StateCell label="error">
        <span className="pt-field-label">ESI callback URL</span>
        <div className="pt-field-e" data-invalid>
          <input className="pt-input" defaultValue="htp://lgi.tools/api" aria-label="ESI callback URL" aria-invalid />
        </div>
        <FieldError>Must start with https://</FieldError>
      </StateCell>
      <StateCell label="textarea · counter">
        <span className="pt-field-label">Feedback</span>
        <div className="pt-field-e flex-col items-stretch">
          <textarea
            className="pt-input"
            rows={2}
            maxLength={500}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            aria-label="Feedback"
          />
          <span className="pt-counter self-end">{feedback.length} / 500</span>
        </div>
      </StateCell>
    </StateGrid>
  );
}

export function FieldsGroup() {
  return (
    <PrototypeGroup
      id="fields"
      title="Fields + text"
      today="Today: an engraved dark well, JetBrains Mono values, and uppercase tracked labels."
    >
      <VariantCard letter="Now" name="Engraved well" pitch="The shipping Field + Input + Textarea.">
        <CurrentFields />
      </VariantCard>
      <VariantCard letter="A" name="Frosted well" pitch="The same layout on frosted glass: Geist text, sentence-case labels, a 12px radius, and a soft aurora focus halo.">
        <FrostedFields />
      </VariantCard>
      <VariantCard letter="B" name="Floating label" pitch="The label lives inside the field and lifts on focus or fill. Compact forms with less chrome.">
        <FloatingFields />
      </VariantCard>
      <VariantCard letter="C" name="Pill field" pitch="Fully rounded capsules with a leading icon and a clear button. Matches the header search and pills.">
        <PillFields />
      </VariantCard>
      <VariantCard letter="D" name="Underline glass" pitch="No box: a hairline underline that draws a brand-gradient line on focus. Lightest touch for settings pages.">
        <UnderlineFields />
      </VariantCard>
      <VariantCard letter="E" name="Gradient ring" pitch="A glass field whose border becomes the brand gradient on focus, with valid and counter states.">
        <GradientRingFields />
      </VariantCard>
    </PrototypeGroup>
  );
}
