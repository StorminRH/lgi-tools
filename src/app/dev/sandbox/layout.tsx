import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Sandbox-only animation + depth styles. Importing here scopes the stylesheet
// to /dev/sandbox/* and keeps production globals.css untouched.
import './sandbox.css';
// React Flow's base stylesheet for the OOB.4.1 mapper spike. Imported in the
// nested sandbox layout (not globals.css) so it stays scoped to /dev/sandbox/*
// AND loads after Tailwind — the root layout's globals.css (which holds
// `@import "tailwindcss"`) resolves first, satisfying React Flow's Tailwind-v4
// "import after Tailwind" requirement without an @layer wrapper.
import '@xyflow/react/dist/style.css';

// Unlinked dev surface — noindex cascades to every sandbox sub-page so none of
// the mockups can be indexed even on the canonical host.
export const metadata: Metadata = {
  title: 'UX Sandbox (dev)',
  robots: { index: false, follow: false },
};

export default function SandboxLayout({ children }: { children: ReactNode }) {
  return children;
}
