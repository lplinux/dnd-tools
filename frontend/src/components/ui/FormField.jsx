/**
 * components/ui/FormField.jsx
 *
 * Label + input/textarea wrapper with consistent styling.
 *
 * @example
 *   <FormField label="Campaign Name">
 *     <input type="text" value={name} onChange={e => setName(e.target.value)} />
 *   </FormField>
 */
export default function FormField({ label, error, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="font-display uppercase tracking-wider text-text-dim text-[0.6rem]">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="text-danger text-xs mt-0.5">{error}</p>
      )}
    </div>
  );
}
