/** components/ui/Spinner.jsx — Simple animated loading indicator */
export default function Spinner({ className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block w-4 h-4 border-2 border-border2 border-t-gold rounded-full animate-spin ${className}`}
    />
  );
}
