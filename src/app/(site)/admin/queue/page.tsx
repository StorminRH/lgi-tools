import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import { DeadLettersCard, QueueSummaryCard } from './QueueCards';

export default function AdminQueuePage() {
  return (
    <AdminPageFrame
      title="Refresh queue"
      description="Deferred ESI refreshes for pilot and corporation data. Retry dead-lettered jobs here once the cause is fixed."
      fallbackLabel="Queue"
    >
      <AdminSlot label="Queue" rows={2} reveal={1}>
        <QueueSummaryCard />
      </AdminSlot>
      <AdminSlot label="Dead letters" rows={4} reveal={2}>
        <DeadLettersCard />
      </AdminSlot>
    </AdminPageFrame>
  );
}
