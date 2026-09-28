import { internalMutation } from './_generated/server';
import { walkDueSubjects } from './lib/engineCore';

export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    await walkDueSubjects(ctx, Date.now(), {
      allowDelete: false,
      capScope: 'engine:scan',
      capNote: 'scan_batch_capped',
    });
  },
});
