/**
 * pages/JourneyMap/modals/NewMapModal.jsx
 *
 * Create a journey map: name, description, and scope (continent = all
 * locations, or city = locations inside a chosen parent location).
 */

import { useMemo, useState } from 'react';
import { Modal, Button, FIELD_INPUT, FIELD_LABEL } from '@/components/ui';
import { MAP_SCOPES } from '../constants';

export default function NewMapModal({ open, onClose, onCreate, campaignLocs }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeType, setScopeType] = useState('continent');
  const [scopeLocId, setScopeLocId] = useState('');
  const [saving, setSaving] = useState(false);

  // Locations that can scope a city map: those with children, plus childless
  // top-level locations. (Mirrors the legacy openNewMap population.)
  const scopeOptions = useMemo(() => {
    const childParentIds = new Set(campaignLocs.filter((l) => l.parent_id).map((l) => l.parent_id));
    const withChildren = campaignLocs.filter((l) => childParentIds.has(l.id));
    const topLevelLeaves = campaignLocs.filter((l) => !l.parent_id && !childParentIds.has(l.id));
    return [...withChildren, ...topLevelLeaves].sort((a, b) => a.name.localeCompare(b.name));
  }, [campaignLocs]);

  function reset() {
    setName(''); setDescription(''); setScopeType('continent'); setScopeLocId('');
  }

  async function handleCreate() {
    if (!name.trim()) return;
    if (scopeType === 'city' && !scopeLocId) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), description, scopeType, scopeLocId: scopeLocId || null });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const labelCls = FIELD_LABEL;
  const inputCls = FIELD_INPUT;

  return (
    <Modal open={open} onClose={onClose} onSubmit={handleCreate} title="New Journey Map">
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Name</label>
          <input
            className={inputCls}
            value={name}
            autoFocus
            placeholder="e.g., Road to Baldur's Gate"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label className={labelCls}>Description (optional)</label>
          <textarea
            className={`${inputCls} resize-y`}
            rows={2}
            value={description}
            placeholder="Notes about this journey…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Map Scope</label>
          <select className={inputCls} value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
            {MAP_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {scopeType === 'city' && (
          <div>
            <label className={labelCls}>Parent Location</label>
            <select className={inputCls} value={scopeLocId} onChange={(e) => setScopeLocId(e.target.value)}>
              <option value="">— Pick a location —</option>
              {scopeOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" loading={saving} onClick={handleCreate}>Create</Button>
      </div>
    </Modal>
  );
}
