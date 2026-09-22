export default function ErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;

  return (
    <div className="banner banner--error" role="alert">
      <div className="banner__body">
        <strong>Something went wrong.</strong>
        <span>{message}</span>
      </div>
      <div className="banner__actions">
        {onRetry && (
          <button type="button" className="btn btn--sm" onClick={onRetry}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
