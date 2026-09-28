/**
 * components/ui/Button.jsx
 *
 * Standard header/action button with four variants:
 *   default | accent | danger | ghost
 *
 * Variants map directly to the `.hdr-btn*` classes from globals.css.
 *
 * @example
 *   <Button onClick={save}>Save</Button>
 *   <Button variant="accent" onClick={create}>+ New</Button>
 *   <Button variant="danger" onClick={del}>🗑</Button>
 *   <Button loading>Saving…</Button>
 */

const VARIANTS = {
  default: 'hdr-btn',
  accent:  'hdr-btn-accent',
  danger:  'hdr-btn-danger',
  ghost: [
    'px-3 py-1 rounded-sm text-text-dim font-display uppercase tracking-wider text-label',
    'bg-transparent border border-transparent cursor-pointer transition-colors duration-150',
    'hover:text-gold hover:border-border',
  ].join(' '),
};

export default function Button({
  variant = 'default',
  loading = false,
  disabled = false,
  // Default to "button" so a Button placed inside a <form> never submits it by
  // accident (the native default is "submit"). Pass type="submit" explicitly on
  // a form's primary action.
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`${VARIANTS[variant] ?? VARIANTS.default} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? '⏳' : children}
    </button>
  );
}
