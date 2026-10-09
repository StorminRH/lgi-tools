import { Button } from '@/components/ui/button';

/** `jobLabel` names the job in the button's accessible name, so a list of retries is not all "Retry". */
export function RetryJobForm({ jobId, jobLabel }: { jobId: number; jobLabel: string }) {
  return (
    <form action="/api/admin/esi-jobs/retry" method="post">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" variant="secondary" size="sm" className="text-isk" aria-label={`Retry ${jobLabel}`}>
        Retry
      </Button>
    </form>
  );
}
