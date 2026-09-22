import { STATUS_LABELS } from '../../utils/constants';

export function StatusBadge({ status }) {
  return <span className={`badge badge--status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge badge--priority-${priority}`}>{priority}</span>;
}

export function SeverityBadge({ severity }) {
  return <span className={`badge badge--severity-${severity}`}>{severity}</span>;
}
