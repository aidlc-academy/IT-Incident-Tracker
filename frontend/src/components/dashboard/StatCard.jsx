import { Link } from 'react-router-dom';

export default function StatCard({ label, value, tone = 'default', to }) {
  const body = (
    <>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`stat stat--${tone} stat--link`}>
        {body}
      </Link>
    );
  }
  return <div className={`stat stat--${tone}`}>{body}</div>;
}
