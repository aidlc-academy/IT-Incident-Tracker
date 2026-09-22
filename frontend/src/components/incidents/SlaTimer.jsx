import { useEffect, useState } from 'react';
import { getSlaStatus, formatDateTime } from '../../utils/sla';

/**
 * Renders SLA state derived from the incident's persisted `slaDeadline`.
 * The ticking clock only re-renders the comparison; the deadline itself comes
 * from the backend and is never recomputed here.
 */
export default function SlaTimer({ incident, showDeadline = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (incident?.status === 'RESOLVED') return undefined; // verdict is fixed
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [incident?.status]);

  const sla = getSlaStatus(incident, now);
  const tone = sla.breached ? 'sla--breached' : sla.resolved ? 'sla--ok' : 'sla--active';

  return (
    <span className={`sla ${tone}`}>
      {sla.label}
      {showDeadline && (
        <span className="sla__deadline"> (due {formatDateTime(incident.slaDeadline)})</span>
      )}
    </span>
  );
}
