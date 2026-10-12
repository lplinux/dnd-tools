/**
 * components/ui/Badge.jsx
 *
 * Small inline label. Variants: default | gold | danger | dm
 */
export default function Badge({ variant = 'default', children, className = '' }) {
  const base = 'inline-flex items-center px-1.5 py-0.5 rounded-sm text-[0.6rem] font-display uppercase tracking-wider';
  const variants = {
    default: 'bg-surface3 text-text-dim border border-border',
    gold:    'bg-[var(--gold-dim)] text-text',
    danger:  'bg-danger/20 text-danger border border-danger/40',
    dm:      'bg-surface2 text-text-dim border border-dashed border-border2',
  };
  return (
    <span className={`${base} ${variants[variant] ?? variants.default} ${className}`}>
      {children}
    </span>
  );
}
