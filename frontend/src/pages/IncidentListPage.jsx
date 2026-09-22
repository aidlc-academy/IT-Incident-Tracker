import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listIncidents, deleteIncident } from '../api/incidents';
import { STATUSES, PRIORITIES, SEVERITIES, STATUS_LABELS } from '../utils/constants';
import { StatusBadge, PriorityBadge, SeverityBadge } from '../components/incidents/Badges';
import SlaTimer from '../components/incidents/SlaTimer';
import ErrorBanner from '../components/shared/ErrorBanner';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import { formatDateShort } from '../utils/sla';

/**
 * Search and filters are held in the URL and sent to the backend as query
 * parameters, so the list is always a fresh read of persisted data rather
 * than a locally filtered snapshot. The search box is debounced so typing
 * does not issue a request per keystroke.
 */
export default function IncidentListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const search = params.get('search') || '';
  const status = params.get('status') || '';
  const priority = params.get('priority') || '';
  const severity = params.get('severity') || '';

  // Local mirror of the search box so typing stays responsive while the
  // request that the URL drives is debounced behind it.
  const [searchDraft, setSearchDraft] = useState(search);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const setParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Push the debounced search term into the URL, which triggers the fetch.
  useEffect(() => {
    if (searchDraft === search) return undefined;
    const t = setTimeout(() => setParam('search', searchDraft), 300);
    return () => clearTimeout(t);
  }, [searchDraft, search, setParam]);

  // Bumped on every request; a response is applied only if it is still the
  // newest one, so a slow reply from an earlier filter cannot overwrite the
  // results of the filter the user has since selected.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listIncidents({ search, status, priority, severity });
      if (seq !== requestSeq.current) return;
      setIncidents(data || []);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err);
      setIncidents([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [search, status, priority, severity]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteIncident(pendingDelete.id);
      toast(`Incident ${pendingDelete.id} deleted.`);
      setPendingDelete(null);
      await load(); // re-read from the backend rather than trusting local state
    } catch (err) {
      setError(err);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = !!(search || status || priority || severity);

  const clearAll = () => {
    setSearchDraft('');
    setParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Incidents</h1>
          <p className="page__sub">
            {loading ? 'Loading…' : `${incidents.length} incident${incidents.length === 1 ? '' : 's'}`}
            {hasFilters && !loading ? ' matching the current filters' : ''}
          </p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--ghost" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link to="/incidents/new" className="btn btn--primary">New incident</Link>
        </div>
      </div>

      <section className="filters">
        <div className="filters__search">
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by ID, title, description or service"
            aria-label="Search incidents"
          />
        </div>

        <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select value={priority} onChange={(e) => setParam('priority', e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select value={severity} onChange={(e) => setParam('severity', e.target.value)} aria-label="Filter by severity">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button type="button" className="btn btn--ghost" onClick={clearAll} disabled={!hasFilters}>
          Clear
        </button>
      </section>

      <ErrorBanner error={error} onRetry={load} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingSpinner label="Loading incidents…" />
      ) : incidents.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No incidents match these filters' : 'No incidents yet'}
          hint={
            hasFilters
              ? 'Try a different search term or clear the filters.'
              : 'Create the first incident to see it triaged automatically.'
          }
          action={
            hasFilters ? (
              <button type="button" className="btn btn--sm" onClick={clearAll}>Clear filters</button>
            ) : (
              <Link to="/incidents/new" className="btn btn--primary btn--sm">Create incident</Link>
            )
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Service</th>
                <th>Priority</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>SLA</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr
                  key={i.id}
                  className="row--clickable"
                  onClick={() => navigate(`/incidents/${i.id}`)}
                >
                  <td className="mono" data-label="ID">
                    {/* Keeps the ID a real link (middle-click, copy address)
                        without firing the row handler as well. */}
                    <Link
                      to={`/incidents/${i.id}`}
                      className="link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {i.id}
                    </Link>
                  </td>
                  <td className="cell--title" data-label="Title">{i.title}</td>
                  <td data-label="Service">{i.service}</td>
                  <td data-label="Priority"><PriorityBadge priority={i.priority} /></td>
                  <td data-label="Severity"><SeverityBadge severity={i.severity} /></td>
                  <td data-label="Status"><StatusBadge status={i.status} /></td>
                  <td data-label="Assigned">{i.assignedEngineer || <span className="muted">Unassigned</span>}</td>
                  <td data-label="SLA"><SlaTimer incident={i} /></td>
                  <td className="nowrap muted" data-label="Created">{formatDateShort(i.createdAt)}</td>
                  {/* The row is clickable, so the action buttons must not let
                      their clicks bubble up into a navigation. */}
                  <td className="cell--actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn--sm" onClick={() => navigate(`/incidents/${i.id}`)}>
                      View
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => navigate(`/incidents/${i.id}?edit=1`)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => setPendingDelete(i)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title="Delete incident"
        message={`Delete ${pendingDelete?.id} — "${pendingDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
