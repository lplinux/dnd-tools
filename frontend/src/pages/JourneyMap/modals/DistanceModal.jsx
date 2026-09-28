/**
 * pages/JourneyMap/modals/DistanceModal.jsx
 *
 * Set the (bidirectional) distance in miles between two placed locations.
 *
 * @param {object|null} edit  { fromId, toId, fromName, toName, existing } | null
 */

import { useEffect, useState } from 'react';
import { Modal, Button, FIELD_INPUT, FIELD_LABEL } from '@/components/ui';
import { useToast } from '@/hooks/useToast';

export default function DistanceModal({ edit, onClose, onSave }) {
  const { toast } = useToast();
  const [miles, setMiles] = useState('');

  useEffect(() => {
    if (edit) setMiles(edit.existing != null ? String(edit.existing) : '');
  }, [edit]);

  async function save() {
    const v = parseFloat(miles);
    if (Number.isNaN(v) || v < 0) { toast('Enter a valid distance', 'error'); return; }
    await onSave(edit.fromId, edit.toId, v);
    onClose();
  }

  return (
    <Modal open={!!edit} onClose={onClose} onSubmit={save} title={edit ? `Distance: ${edit.fromName} ↔ ${edit.toName}` : 'Set Distance'}>
      <label className={FIELD_LABEL}>
        Distance (miles)
      </label>
      <input
        type="number"
        min="0"
        step="0.1"
        value={miles}
        autoFocus
        placeholder="e.g., 42.5"
        onChange={(e) => setMiles(e.target.value)}
        className={FIELD_INPUT}
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
