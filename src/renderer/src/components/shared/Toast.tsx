// Toast.tsx — renders useToastStore's current message. Reuses the existing
// .toast/.toast-error/.toast-action-btn classes from style.css unchanged
// (same visual, only who renders the DOM changes) — see the "hidden vs
// author CSS" rule in CLAUDE.md: this uses conditional rendering (unmounts
// entirely when there's no message) rather than the [hidden] attribute,
// which is fine here since there's no sub-section toggle to preserve.
import { useToastStore } from '../../store/useToastStore';

export function Toast() {
  const { message, type, actionLabel, actionFn, hide } = useToastStore();

  if (!message) return null;

  return (
    <div className={'toast' + (type === 'error' ? ' toast-error' : '')}>
      <span>{message}</span>
      {actionLabel && actionFn && (
        <button
          type="button"
          className="toast-action-btn"
          onClick={() => {
            hide();
            actionFn();
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
