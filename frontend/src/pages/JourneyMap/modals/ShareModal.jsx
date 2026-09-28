/**
 * pages/JourneyMap/modals/ShareModal.jsx
 *
 * Shows the read-only public share URL for the current map with a copy button.
 */

import { Modal, Button } from '@/components/ui';
import { useToast } from '@/hooks/useToast';

export default function ShareModal({ open, onClose, url }) {
  const { toast } = useToast();

  function copy() {
    navigator.clipboard.writeText(url).then(() => toast('URL copied!')).catch(() => {});
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Map (Read-Only)">
      <label className="block font-display uppercase tracking-wider text-[0.68rem] text-text-dim mb-1">
        Public URL
      </label>
      <input
        readOnly
        value={url || ''}
        onFocus={(e) => e.target.select()}
        className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-[11px] focus:outline-none focus:border-[var(--gold-dim)]"
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="accent" onClick={copy}>Copy URL</Button>
      </div>
    </Modal>
  );
}
