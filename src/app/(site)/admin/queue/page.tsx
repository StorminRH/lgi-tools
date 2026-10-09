import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import { getEsiRefreshQueueStatsShared } from '../shared-reads';
import { DeadLetterList, loadDeadLetters, QueueSummary } from './QueueCards';

export default function AdminQueuePage() {
  return (
    <AdminPageFrame
      title="Refresh queue"
      fallbackLabel="Queue"
    >
      <AdminSection title="Queue" name="queue" rows={2} reveal={1} load={getEsiRefreshQueueStatsShared}>
        {(stats) => <QueueSummary stats={stats} now={new Date()} />}
      </AdminSection>
      <AdminSection
        title="Dead letters"
        name="dead-letters"
        anchor="dead-letters"
        rows={4}
        reveal={2}
        hint={(deadLetters) => deadLetters.hint}
        load={loadDeadLetters}
      >
        {(deadLetters) => <DeadLetterList rows={deadLetters.rows} />}
      </AdminSection>
    </AdminPageFrame>
  );
}
