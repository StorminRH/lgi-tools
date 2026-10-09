export const CODEX_LICENSE_LABEL = 'I license my contribution under CC BY-SA 4.0.';

export const CODEX_EDIT_MODES = {
  publish: {
    action: '/api/admin/codex/revisions',
    pencil: 'Edit section',
    pencilLead: 'Edit introduction',
    empty: 'Write section',
    save: { page: 'Publish page', section: 'Save section' },
    summaryRequired: false,
    license: false,
    pageActions: true,
  },
  suggest: {
    action: '/api/codex/proposals',
    pencil: 'Suggest edit',
    pencilLead: 'Suggest edit',
    empty: 'Suggest the first one',
    save: { page: 'Submit for review', section: 'Submit for review' },
    summaryRequired: true,
    license: true,
    pageActions: false,
  },
} as const;

export type CodexEditMode = keyof typeof CODEX_EDIT_MODES;
