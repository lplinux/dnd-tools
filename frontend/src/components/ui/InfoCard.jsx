/**
 * components/ui/InfoCard.jsx
 *
 * Small titled card + label/value row used by detail panels (journey-map
 * location/path details, public map view, etc.). `InfoRow` optionally accepts
 * `onClick` (clickable row) and `dim` (faded, e.g. an unset value).
 */

export function InfoCard({ title, children }) {
  return (
    <div className="bg-surface2 border border-border rounded-sm p-2.5 mb-2.5">
      {title && <h3 className="font-display text-[0.7rem] text-gold mb-[7px] tracking-[.04em]">{title}</h3>}
      {children}
    </div>
  );
}

export function InfoRow({ label, children, onClick, dim = false }) {
  return (
    <div
      onClick={onClick}
      className={[
        'flex justify-between items-center py-[3px] border-b border-border last:border-b-0 gap-2 text-[12px]',
        onClick ? 'cursor-pointer' : '',
        dim ? 'opacity-55' : '',
      ].join(' ')}
    >
      <span className="text-text-dim">{label}</span>
      <span className="text-text font-semibold text-right">{children}</span>
    </div>
  );
}
