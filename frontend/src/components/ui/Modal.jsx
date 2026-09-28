/**
 * components/ui/Modal.jsx
 *
 * Accessible modal dialog.
 * - Closes on backdrop click and Escape key
 * - Traps focus inside (basic implementation)
 * - Renders via a portal to document.body so z-index always wins
 *
 * @example
 *   <Modal open={open} onClose={() => setOpen(false)} title="New Campaign">
 *     <p>Content here</p>
 *   </Modal>
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, onSubmit, title, children, className = '' }) {
  const dialogRef = useRef(null);

  const focusables = () =>
    Array.from(
      dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => el.offsetParent !== null);

  // Close on Escape + trap Tab focus inside the dialog
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      // Enter triggers the primary action — but not from a multi-line textarea,
      // an IME composition, or when a button/anchor is focused (let it click).
      if (e.key === 'Enter' && onSubmit && !e.isComposing) {
        const el = document.activeElement;
        const tag = el?.tagName;
        if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || el?.isContentEditable) return;
        e.preventDefault();
        onSubmit();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) { e.preventDefault(); dialogRef.current?.focus(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onSubmit]);

  // On open, focus the dialog unless a child already claimed focus (e.g. an
  // input with autoFocus), so the focus trap has a starting point.
  useEffect(() => {
    if (open && !dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={[
          'relative z-10 bg-surface border border-border2 rounded-sm shadow-card',
          'w-full max-w-md max-h-[85vh] flex flex-col outline-none',
          className,
        ].join(' ')}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-display text-gold uppercase tracking-widest text-sm">
              {title}
            </h2>
            <button
              className="text-text-dim hover:text-gold transition-colors text-lg leading-none"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
