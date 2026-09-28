/**
 * ConfirmContext
 *
 * A themed replacement for `window.confirm`. The provider renders a single
 * shared <Modal>; `useConfirm()` returns an async `confirm()` that resolves to
 * true/false when the user chooses.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm('Delete this path?')) { ... }
 *   // with options:
 *   await confirm('Delete user?', { title: 'Delete user', confirmLabel: 'Delete', danger: true });
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Button } from '@/components/ui';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, title, confirmLabel, cancelLabel, danger }
  const resolverRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    setState({
      message,
      title: opts.title ?? 'Please confirm',
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? true,
    });
    return new Promise((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal open={!!state} onClose={() => settle(false)} onSubmit={() => settle(true)} title={state?.title}>
        {state && (
          <>
            <p className="text-sm text-text leading-relaxed">{state.message}</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => settle(false)}>{state.cancelLabel}</Button>
              <Button variant={state.danger ? 'danger' : 'accent'} onClick={() => settle(true)}>
                {state.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
