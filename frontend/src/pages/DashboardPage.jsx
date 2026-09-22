import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api/stats';
import { listIncidents } from '../api/incidents';
import StatCard from '../components/dashboard/StatCard';
import SlaTimer from '../components/incidents/SlaTimer';
import { StatusBadge, PriorityBadge } from '../components/incidents/Badges';
import ErrorBanner from '../components/shared/ErrorBanner';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';

/**
 * Every number on this page comes from the backend: the counters from
 * /api/stats (computed over persisted DynamoDB items) and the per-engineer
 * workload from the same incident list the table renders. Nothing is seeded
 * with a constant.
 */
export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([getStats(), listIncidents()]);
      setStats(s);
      setIncidents(list || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unresolved = incidents.filter((i) => i.status !== 'RESOLVED');
  const workload = unresolved.reduce((acc, i) => {
    const key = i.assignedEngineer || 'Unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const workloadRows = Object.entries(workload).sort((a, b) => b[1] - a[1]);

  const recent = incidents.slice(0, 5);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__sub">Live counts from persisted incident data</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <ErrorBanner error={error} onRetry={load} />

      {loading && !stats ? (
        <LoadingSpinner label="Loading dashboard…" />
      ) : (
        <>
          <section className="stats">
            <StatCard label="Total incidents" value={stats?.total ?? 0} to="/incidents" />
            <StatCard label="Open" value={stats?.open ?? 0} tone="open" to="/incidents?status=OPEN" />
            <StatCard
              label="In progress"
              value={stats?.inProgress ?? 0}
              tone="progress"
              to="/incidents?status=IN_PROGRESS"
            />
            <StatCard
              label="Resolved"
              value={stats?.resolved ?? 0}
              tone="resolved"
              to="/incidents?status=RESOLVED"
            />
            <StatCard
              label="P1 / Critical"
              value={stats?.p1Critical ?? 0}
              tone="critical"
              to="/incidents?priority=P1"
            />
            <StatCard
              label="SLA breached"
              value={stats?.slaBreached ?? 0}
              tone={stats?.slaBreached > 0 ? 'breach' : 'default'}
            />
          </section>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Recent incidents</h2>
                <Link to="/incidents" className="link">View all</Link>
              </div>

              {recent.length === 0 ? (
                <EmptyState
                  title="No incidents yet"
                  hint="Create the first incident to see it triaged automatically."
                  action={
                    <Link to="/incidents/new" className="btn btn--primary btn--sm">
                      Create incident
                    </Link>
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((i) => (
                        <tr key={i.id}>
                          <td className="mono">
                            <Link to={`/incidents/${i.id}`} className="link">{i.id}</Link>
                          </td>
                          <td className="cell--title">{i.title}</td>
                          <td><PriorityBadge priority={i.priority} /></td>
                          <td><StatusBadge status={i.status} /></td>
                          <td><SlaTimer incident={i} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Open workload by engineer</h2>
              </div>
              {workloadRows.length === 0 ? (
                <EmptyState title="Nothing in flight" hint="No unresolved incidents right now." />
              ) : (
                <ul className="workload">
                  {workloadRows.map(([name, count]) => (
                    <li key={name} className="workload__row">
                      <span
                        className={
                          name === 'Unassigned'
                            ? 'workload__name workload__name--none'
                            : 'workload__name'
                        }
                      >
                        {name}
                      </span>
                      <span className="workload__count">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
