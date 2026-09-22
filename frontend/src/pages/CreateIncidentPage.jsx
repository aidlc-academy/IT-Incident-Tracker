import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createIncident } from '../api/incidents';
import IncidentForm from '../components/incidents/IncidentForm';
import ErrorBanner from '../components/shared/ErrorBanner';
import SlaTimer from '../components/incidents/SlaTimer';
import { StatusBadge, PriorityBadge, SeverityBadge } from '../components/incidents/Badges';
import { formatDateTime } from '../utils/sla';
import { useToast } from '../context/ToastContext';

/**
 * After a successful POST the page shows the incident exactly as the backend
 * persisted it — including the ID, the triage result and the SLA deadline the
 * server computed. None of those values are guessed client-side.
 */
export default function CreateIncidentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const handleSubmit = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const incident = await createIncident(data);
      setCreated(incident);
      toast(`Incident ${incident.id} created.`);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="page page--narrow">
        <div className="page__head">
          <div>
            <h1 className="page__title">Incident created</h1>
            <p className="page__sub">Triage and SLA were assigned automatically by the backend.</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title mono">{created.id}</h2>
            <StatusBadge status={created.status} />
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Title</dt>
              <dd>{created.title}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{created.service}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{created.category}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd><PriorityBadge priority={created.priority} /></dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd><SeverityBadge severity={created.severity} /></dd>
            </div>
            <div>
              <dt>SLA</dt>
              <dd>
                <SlaTimer incident={created} showDeadline />
              </dd>
            </div>
            <div>
              <dt>SLA deadline</dt>
              <dd>{formatDateTime(created.slaDeadline)} ({created.slaDuration}h)</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(created.createdAt)} by {created.createdBy}</dd>
            </div>
          </dl>

          <div className="form__actions">
            <Link to={`/incidents/${created.id}`} className="btn btn--primary">Open incident</Link>
            <Link to="/incidents" className="btn">Back to list</Link>
            <button type="button" className="btn btn--ghost" onClick={() => setCreated(null)}>
              Create another
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <div>
          <h1 className="page__title">New incident</h1>
          <p className="page__sub">
            Priority, severity, category and SLA deadline are determined by the backend on submit.
          </p>
        </div>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="panel">
        <IncidentForm
          submitLabel="Create incident"
          submitting={submitting}
          serverFieldError={error?.field ? error : null}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/incidents')}
        />
      </section>
    </div>
  );
}
