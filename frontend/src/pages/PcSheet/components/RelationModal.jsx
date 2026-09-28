/**
 * pages/PcSheet/components/RelationModal.jsx
 *
 * Add / Edit relationship modal.
 */

import { useEffect, useState } from 'react';
import { Modal, Button, FormField } from '@/components/ui';

const RELATION_TYPES = [
  'Grandparent','Parent','Sibling','Friend','Ally',
  'Mentor','Child','Grandchild','Rival','Enemy','Other',
];

const STATUS_OPTIONS = ['Alive','Dead','Deceased','Missing','Unknown'];

export default function RelationModal({ open, onClose, onSave, editData, allRelations, isDM }) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    name: '', relationType: 'Friend', status: '',
    link: '', parentId: '', dmOnly: false,
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setForm({
        name:         editData.name         ?? '',
        relationType: editData.relation_type ?? 'Friend',
        status:       editData.status_label  ?? '',
        link:         editData.link          ?? '',
        parentId:     editData.parent_id     ?? '',
        dmOnly:       !!editData.is_dm_only,
      });
    } else {
      setForm({ name: '', relationType: 'Friend', status: '', link: '', parentId: '', dmOnly: false });
    }
  }, [open, isEdit, editData]);

  const ff = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const inputCls = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  const topLevelRels = (allRelations ?? []).filter(r =>
    (!r.parent_id) && (!isEdit || r.id !== editData?.id)
  );

  return (
    <Modal open={open} onClose={onClose} onSubmit={() => { if (form.name.trim()) onSave(form); }} title={isEdit ? 'Edit Relation' : 'Add Relation'}>
      <div className="flex flex-col gap-3">
        <FormField label="Name">
          <input type="text" value={form.name} onChange={ff('name')}
            placeholder="e.g., Elara Moonwhisper" className={inputCls} autoFocus />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Relation Type">
            <select value={form.relationType} onChange={ff('relationType')} className={inputCls}>
              {RELATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Status (optional)">
            <input type="text" value={form.status} onChange={ff('status')}
              list="statusList" placeholder="Alive, Dead…" className={inputCls} />
            <datalist id="statusList">
              {STATUS_OPTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </FormField>
        </div>

        <FormField label="Link / Reference (optional)">
          <input type="text" value={form.link} onChange={ff('link')}
            placeholder="URL or note" className={inputCls} />
        </FormField>

        <FormField label="Child of (optional)">
          <select value={form.parentId} onChange={ff('parentId')} className={inputCls}>
            <option value="">— Top-level (no parent) —</option>
            {topLevelRels.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.relation_type})</option>
            ))}
          </select>
        </FormField>

        {isDM && (
          <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
            <input type="checkbox" checked={form.dmOnly}
              onChange={e => setForm(p => ({ ...p, dmOnly: e.target.checked }))}
              className="w-4 h-4 accent-[var(--gold)]" />
            <span>
              🔒 Hidden from player
              <span className="text-text-muted text-xs ml-1">(DM only — won't appear on player's sheet)</span>
            </span>
          </label>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost"  onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={() => onSave(form)} disabled={!form.name.trim()}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
