/**
 * pages/JourneyMap/modals/NamingModal.jsx
 *
 * After drawing/extending a path, name the path (new paths only) and any
 * waypoints that were auto-created on empty space.
 *
 * @param {object|null} data  { path, newLocs } — path is null when extending.
 */

import { useEffect, useState } from 'react';
import { Modal, Button, FIELD_INPUT as inputCls, FIELD_LABEL as labelCls } from '@/components/ui';

export default function NamingModal({ data, onClose, onSave }) {
  const open = !!data;
  const path = data?.path || null;
  const newLocs = data?.newLocs || [];

  const [pathName, setPathName] = useState('');
  const [locNames, setLocNames] = useState([]);

  useEffect(() => {
    if (!data) return;
    setPathName(path?.name || '');
    setLocNames(newLocs.map((l) => ({ name: l.placeholder, desc: '' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function update(i, field, value) {
    setLocNames((prev) => prev.map((n, idx) => (idx === i ? { ...n, [field]: value } : n)));
  }

  async function save() {
    await onSave({ path, locs: newLocs, pathName, locNames });
    onClose();
  }

  return (
    // Enter-to-save comes from the Modal's onSubmit alone. Both inputs used to
    // carry their own Enter handler too, so one keypress saved twice.
    <Modal open={open} onClose={onClose} onSubmit={save} title="✏️ Name Path & Locations">
      <p className="text-[12px] text-text-dim mb-3 leading-relaxed">
        Give the path a name. Any waypoints placed on empty space also need a location name.
      </p>

      {path && (
        <div className="mb-3">
          <label className={labelCls}>Path Name</label>
          <input
            className={inputCls}
            value={pathName}
            autoFocus
            onChange={(e) => setPathName(e.target.value)}
          />
        </div>
      )}

      {newLocs.map((loc, i) => (
        <div key={loc.mapLocId} className="mb-3 pt-3 border-t border-border first:border-t-0 first:pt-0">
          <label className={labelCls}>New Location {i + 1} — Name</label>
          <input
            className={`${inputCls} mb-1.5`}
            value={locNames[i]?.name ?? ''}
            autoFocus={!path && i === 0}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <label className={labelCls}>Description (optional)</label>
          <input
            className={inputCls}
            value={locNames[i]?.desc ?? ''}
            placeholder="e.g. A ruined tower at the crossroads…"
            onChange={(e) => update(i, 'desc', e.target.value)}
          />
        </div>
      ))}

      <div className="flex justify-end mt-4">
        <Button variant="accent" onClick={save}>Save Names</Button>
      </div>
    </Modal>
  );
}
