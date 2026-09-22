import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getIncident, updateIncident, deleteIncident } from '../api/incidents';
import { ENGINEERS, ALLOWED_TRANSITIONS, STATUS_LABELS } from '../utils/constants';
import { validateResolutionNote } from '../utils/validators';
import { StatusBadge, PriorityBadge, SeverityBadge } from '../components/incidents/Badges';
import SlaTimer from '../components/incidents/SlaTimer';
import IncidentForm from '../components/incidents/IncidentForm';
import ErrorBanner from '../components/shared/ErrorBanner';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { formatDateTime } from '../utils/sla';
import { useToast } from '../context/ToastContext';

/**
 * Every control here issues a real API call and then replaces local state with
 * the incident the backend returned, so what is displayed is always what was
 * persisted. Only transitions the backend allows from the current status are
 * rendered — the backend rejects the rest with 409 regardless.
 */
export default function IncidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const editing = params.get('edit') === '1';
  const [saving, setSaving] = useState(false);

  const [engineer, setEngineer] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [targetStatus, setTargetStatus] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIncident(id);
      setIncident(data);
      setEngineer(data.assignedEngineer || '');
    } catch (err) {
      setError(err);
      setIncident(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setEditing = (on) => {
    const next = new URLSearchParams(params);
    if (on) next.set('edit', '1');
    else next.delete('edit');
    setParams(next, { replace: true });
  };

  const applyPatch = async (patch, successMessage) => {
    const updated = await updateIncident(id, patch);
    setIncident(updated);
    setEngineer(updated.assignedEngineer || '');
    if (successMessage) toast(successMessage);
    return updated;
  };

  const handleSave = async (data) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await applyPatch(data, 'Incident updated.');
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (assigning) return;
    setAssigning(true);
    setError(null);
    try {
      // An empty selection means "unassign", which the backend accepts as null.
      await applyPatch(
        { assignedEngineer: engineer || null },
        engineer ? `Assigned to ${engineer}.` : 'Engineer unassigned.'
      );
    } catch (err) {
      setError(err);
    } finally {
      setAssigning(false);
    }
  };

  const beginTransition = (status) => {
    setError(null);
    setNoteError(null);
    if (status === 'RESOLVED') {
      setResolutionNote('');
      setTargetStatus('RESOLVED'); // opens the resolution form
      return;
    }
    runTransition(status);
  };

  const runTransition = async (status, note) => {
    if (transitioning) return;
    setTransitioning(true);
    setError(null);
    try {
      const patch = { status };
      if (note) patch.resolutionNote = note;
      await applyPatch(patch, `Status changed to ${STATUS_LABELS[status]}.`);
      setTargetStatus(null);
      setResolutionNote('');
    } catch (err) {
      if (err.field === 'resolutionNote') setNoteError(err.message);
      else setError(err);
    } finally {
      setTransitioning(false);
    }
  };

  const submitResolution = (e) => {
    e.preventDefault();
    const problem = validateResolutionNote(resolutionNote);
    setNoteError(problem);
    if (problem) return;
    runTransition('RESOLVED', resolutionNote.trim());
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteIncident(id);
      toast(`Incident ${id} deleted.`);
      navigate('/incidents', { replace: true });
    } catch (err) {
      setError(err);
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingSpinner label="Loading incident…" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="page page--narrow">
        <ErrorBanner error={error} onRetry={load} />
        <p>
          <Link to="/incidents" className="btn">Back to incidents</Link>
        </p>
      </div>
    );
  }

  const nextStatuses = ALLOWED_TRANSITIONS[incident.status] || [];
  const canAssign = incident.status !== 'RESOLVED';
  const busy = saving || assigning || transitioning || deleting;

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <p className="crumb">
            <Link to="/incidents" className="link">Incidents</Link> / <span className="mono">{incident.id}</span>
          </p>
          <h1 className="page__title">{incident.title}</h1>
          <div className="badge-row">
            <StatusBadge status={incident.status} />
            <PriorityBadge priority={incident.priority} />
            <SeverityBadge severity={incident.severity} />
            <SlaTimer incident={incident} showDeadline />
          </div>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--ghost" onClick={load} disabled={busy}>
            Refresh
          </button>
          {!editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
          )}
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="detail-layout">
        <div className="detail-main">
          {editing ? (
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Edit incident</h2>
              </div>
              <IncidentForm
                initial={{
                  title: incident.title,
                  description: incident.description,
                  service: incident.service,
                  businessImpact: incident.businessImpact,
                }}
                submitLabel="Save changes"
                submitting={saving}
                serverFieldError={error?.field ? error : null}
                onSubmit={handleSave}
                onCancel={() => setEditing(false)}
              />
            </section>
          ) : (
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Details</h2>
              </div>
              <dl className="detail-grid">
                <div className="detail-grid__wide">
                  <dt>Description</dt>
                  <dd className="prewrap">{incident.description}</dd>
                </div>
                <div className="detail-grid__wide">
                  <dt>Business impact</dt>
                  <dd className="prewrap">{incident.businessImpact}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{incident.service}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{incident.category}</dd>
                </div>
                <div>
                  <dt>Assigned engineer</dt>
                  <dd>{incident.assignedEngineer || <span className="muted">Unassigned</span>}</dd>
                </div>
                <div>
                  <dt>Reported by</dt>
                  <dd>{incident.createdBy}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(incident.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(incident.updatedAt)}</dd>
                </div>
                <div>
                  <dt>SLA deadline</dt>
                  <dd>{formatDateTime(incident.slaDeadline)} ({incident.slaDuration}h target)</dd>
                </div>
                <div>
                  <dt>Resolved at</dt>
                  <dd>{incident.resolvedAt ? formatDateTime(incident.resolvedAt) : <span className="muted">—</span>}</dd>
                </div>
              </dl>
            </section>
          )}

          {incident.resolutionNote && (
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Resolution</h2>
              </div>
              <p className="prewrap">{incident.resolutionNote}</p>
            </section>
          )}
        </div>

        <aside className="detail-side">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Status</h2>
            </div>
            <p className="side-note">
              Current status: <strong>{STATUS_LABELS[incident.status]}</strong>
            </p>

            {targetStatus === 'RESOLVED' ? (
              <form className="form" onSubmit={submitResolution}>
                <div className="field">
                  <label htmlFor="note">Resolution note <span className="req">*</span></label>
                  <textarea
                    id="note"
                    rows={5}
                    value={resolutionNote}
                    onChange={(e) => {
                      setResolutionNote(e.target.value);
                      if (noteError) setNoteError(null);
                    }}
                    placeholder="What fixed it, and how was it verified?"
                    maxLength={2000}
                  />
                  <div className="field__foot">
                    <span className="field__error">{noteError}</span>
                    <span className="field__count">{resolutionNote.length}/2000</span>
                  </div>
                </div>
                <div className="form__actions">
                  <button type="submit" className="btn btn--primary" disabled={transitioning}>
                    {transitioning ? 'Resolving…' : 'Resolve incident'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => { setTargetStatus(null); setNoteError(null); }}
                    disabled={transitioning}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : nextStatuses.length === 0 ? (
              <p className="muted">No status changes available.</p>
            ) : (
              <div className="btn-stack">
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={s === 'RESOLVED' ? 'btn btn--primary' : 'btn'}
                    onClick={() => beginTransition(s)}
                    disabled={busy}
                  >
                    {s === 'IN_PROGRESS' && incident.status === 'OPEN' && 'Start work (In Progress)'}
                    {s === 'RESOLVED' && 'Resolve…'}
                    {s === 'OPEN' && incident.status === 'IN_PROGRESS' && 'Pause (back to Open)'}
                    {s === 'OPEN' && incident.status === 'RESOLVED' && 'Reopen'}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Assignment</h2>
            </div>
            {canAssign ? (
              <>
                <div className="field">
                  <label htmlFor="engineer">Engineer</label>
                  <select
                    id="engineer"
                    value={engineer}
                    onChange={(e) => setEngineer(e.target.value)}
                    disabled={assigning}
                  >
                    <option value="">Unassigned</option>
                    {ENGINEERS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={handleAssign}
                  disabled={assigning || engineer === (incident.assignedEngineer || '')}
                >
                  {assigning ? 'Saving…' : engineer ? 'Assign' : 'Unassign'}
                </button>
              </>
            ) : (
              <p className="muted">
                Resolved incidents cannot be reassigned. Reopen it first.
              </p>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        busy={deleting}
        title="Delete incident"
        message={`Delete ${incident.id} — "${incident.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
