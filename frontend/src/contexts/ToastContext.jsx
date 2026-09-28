/**
 * ToastContext
 *
 * Provides a `toast(message, type?)` function that displays a short-lived
 * notification at the bottom of the screen.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast('Saved!');
 *   toast('Something went wrong', 'error');
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(null);

let _nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Safety net: surface otherwise-uncaught API/promise errors as a toast so the
  // user sees *why* something failed (e.g. "Location is in use…") instead of it
  // only landing in the console. Errors already handled with their own toast are
  // caught locally and never reach here, so this won't double-notify.
  useEffect(() => {
    const onRejection = (e) => {
      const reason = e?.reason;
      const msg = reason instanceof Error ? reason.message : (typeof reason === 'string' ? reason : null);
      if (msg) toast(msg, 'error');
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'px-4 py-2 rounded text-sm font-body shadow-card transition-all',
              t.type === 'error'
                ? 'bg-danger text-text'
                : 'bg-surface3 border border-border2 text-text',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
