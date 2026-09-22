/**
 * SLA presentation helpers.
 *
 * The deadline itself is always the `slaDeadline` persisted by the backend at
 * creation time. Nothing here invents or recomputes a deadline — these
 * functions only compare that stored timestamp against the current clock.
 */

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * @returns {{ label: string, breached: boolean, resolved: boolean }}
 */
export function getSlaStatus(incident, now = Date.now()) {
  if (!incident?.slaDeadline) {
    return { label: 'No SLA', breached: false, resolved: false };
  }

  const deadline = new Date(incident.slaDeadline).getTime();
  const diffMs = deadline - now;

  if (incident.status === 'RESOLVED') {
    // Judge a resolved incident against when it was actually resolved, so the
    // historical verdict does not drift as time passes.
    const resolvedAtMs = incident.resolvedAt
      ? new Date(incident.resolvedAt).getTime()
      : now;
    const wasBreached = resolvedAtMs > deadline;
    return {
      label: wasBreached ? 'Resolved (SLA breached)' : 'Resolved within SLA',
      breached: wasBreached,
      resolved: true,
    };
  }

  if (diffMs < 0) {
    return {
      label: `SLA breached: ${formatDuration(-diffMs)} ago`,
      breached: true,
      resolved: false,
    };
  }

  return {
    label: `${formatDuration(diffMs)} remaining`,
    breached: false,
    resolved: false,
  };
}

/** Format an ISO timestamp for display, in the viewer's local timezone. */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
