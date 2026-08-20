import React from 'react';
import { useSession } from '../lib/useSession';
import '../styles/pages/admin.css';

const QueueManagement = () => {
  const session = useSession();
  const bullBoardUrl = `/admin/queues?token=${encodeURIComponent(session?.token || '')}`;

  return (
    <div className="page page--admin queue-management queue-management--standalone">
      <div className="section-card queue-board-card queue-board-card--standalone">
        <iframe
          src={bullBoardUrl}
          title="BullMQ Dashboard"
          className="queue-board-iframe queue-board-iframe--standalone"
        />
      </div>
    </div>
  );
};

export default QueueManagement;
