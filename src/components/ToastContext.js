import { createContext, useContext, useCallback, useRef, useState } from 'react';
import './ToastContext.css';

const ToastContext = createContext(null);

// How long a toast stays on screen before it dismisses itself. Long
// enough to register without needing a click, short enough that a
// string of quick actions (liking your way down a row) doesn't leave a
// pile of stale confirmations behind.
const TOAST_DURATION_MS = 3200;

// Caps how many toasts can be stacked at once. Rapid-fire My List/Like
// clicks could otherwise queue up a wall of them; past this many the
// oldest is dropped to make room for the newest instead of growing the
// stack without bound.
const MAX_VISIBLE_TOASTS = 4;

// Small icon per toast "type" so the stack is skimmable at a glance
// without reading every line — same spirit as the NEW/KIDS badges used
// elsewhere in the app.
const TOAST_ICONS = {
  success: '✓',
  info: 'ⓘ',
  like: '👍',
  dislike: '👎',
};

// Module-scoped rather than state so a toast's id is stable and unique
// for the life of the page, regardless of how many times ToastProvider
// itself re-renders.
let nextToastId = 0;

/**
 * App-level toast stack (see App.js/index.js) for quick confirmation of
 * actions that used to change state silently — adding/removing a title
 * from My List, liking/disliking a title — mirroring Netflix's own
 * small bottom-corner confirmations instead of relying on the visitor
 * to notice an icon change on the card itself.
 *
 * `showToast` is the single entry point every context/component calls.
 * It is deliberately called OUTSIDE any setState functional updater in
 * this app (see MyListContext.toggleInList / RatingsContext.toggleLike)
 * — React 18 Strict Mode double-invokes updater functions in
 * development, which would fire a call made *inside* one twice and show
 * a duplicate toast for a single real action.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // Tracks each toast's auto-dismiss timer by id so it can be cleared on
  // manual dismiss or when the toast is dropped early for exceeding
  // MAX_VISIBLE_TOASTS — otherwise a stale timeout could fire a dismiss
  // for a toast id that's already gone (harmless, but wasted work).
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = 'success') => {
      if (!message) return;
      const id = ++nextToastId;

      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        if (next.length > MAX_VISIBLE_TOASTS) {
          const dropped = next.shift();
          const droppedTimer = timersRef.current.get(dropped.id);
          if (droppedTimer) {
            clearTimeout(droppedTimer);
            timersRef.current.delete(dropped.id);
          }
        }
        return next;
      });

      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-item--${toast.type}`}>
            <span className="toast-item__icon" aria-hidden="true">
              {TOAST_ICONS[toast.type] || TOAST_ICONS.success}
            </span>
            <span className="toast-item__message">{toast.message}</span>
            <button
              type="button"
              className="toast-item__dismiss"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}