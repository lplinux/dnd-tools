/**
 * components/ui/ModalField.jsx
 *
 * Shared form-field styling for modal/dialog inputs. Consolidates the
 * `inputCls`/`labelCls` constants that were otherwise repeated across the
 * journey-map modals and other forms.
 *
 * These are constants rather than a component on purpose: callers need the
 * class strings on their own inputs. A `ModalField` wrapper component existed
 * here and went unused by every one of them.
 */

export const FIELD_INPUT =
  'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

export const FIELD_LABEL =
  'block font-display uppercase tracking-wider text-[0.68rem] text-text-dim mb-1';

