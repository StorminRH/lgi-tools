export type CronBatchStepStatus = 'ok' | 'failed' | 'skipped';

export type CronBatchResponse = {
  steps: { name: string; status: CronBatchStepStatus }[];
};
