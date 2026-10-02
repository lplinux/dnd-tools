/**
 * components/ui/Select.jsx
 *
 * Styled `<select>` wrapper matching the `.hdr-sel` style.
 *
 * @example
 *   <Select value={val} onChange={e => setVal(e.target.value)}>
 *     <option value="">-- Pick one --</option>
 *     {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
 *   </Select>
 */
export default function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`hdr-sel ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
