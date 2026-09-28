/**
 * pages/ManageCampaigns/tabs/LocationsTab.jsx
 *
 * Nested location tree: add, edit (modal), delete, toggle visibility.
 */

import { useMemo, useRef, useState } from 'react';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import { Button, Modal, FormField } from '@/components/ui';
import { LOCATION_SIZE_TYPES } from '../constants';

const INPUT_CLS = 'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

/** Recursively build flat indented <option> list for parent selector */
function buildParentOptions(locs, excludeId = null, parentId = null, depth = 0) {
  return locs
    .filter(l => (l.parent_id ?? null) === parentId && l.id !== excludeId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(l => [
      <option key={l.id} value={l.id}>
        {'  '.repeat(depth)}{depth > 0 ? '└ ' : ''}{l.name}
      </option>,
      ...buildParentOptions(locs, excludeId, l.id, depth + 1),
    ]);
}

/** Recursive row renderer */
function LocationRow({ loc, childrenOf, depth, actions, onEdit }) {
  const children = childrenOf[loc.id] ?? [];
  return (
    <>
      <tr className={`border-b border-border hover:bg-surface2 transition-colors ${!loc.is_public ? 'opacity-50' : ''}`}>
        <td className="px-2 py-2" style={{ paddingLeft: `${8 + depth * 20}px` }}>
          {depth > 0 && <span className="text-text-muted text-xs mr-1">└</span>}
          <strong className="text-text">{loc.name}</strong>
          {children.length > 0 && (
            <span className="text-text-muted text-[10px] ml-1">({children.length})</span>
          )}
        </td>
        <td className="px-2 py-2 text-text-dim text-xs">{loc.size_type ?? '—'}</td>
        <td className="px-2 py-2 text-text-dim text-xs max-w-[180px] truncate">{loc.description ?? ''}</td>
        <td className="px-2 py-2 text-center">
          <button
            onClick={() => actions.toggleLocVisibility(loc.id)}
            title={loc.is_public ? 'Public — click to hide' : 'Hidden — click to show'}
            className={`text-xs px-2 py-0.5 rounded-sm border transition-colors ${
              loc.is_public
                ? 'bg-[var(--gold-dim)] border-border2 text-text'
                : 'bg-surface2 border-border text-text-muted'
            }`}
          >
            {loc.is_public ? <Globe size={12} /> : <Lock size={12} />}
          </button>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <div className="flex gap-1">
            <Button variant="default" onClick={() => onEdit(loc)} title="Edit">
              <Pencil size={11} />
            </Button>
            <Button variant="danger" onClick={() => actions.deleteLocation(loc.id)} title="Delete">
              <Trash2 size={11} />
            </Button>
          </div>
        </td>
      </tr>
      {children.map(c => (
        <LocationRow key={c.id} loc={c} childrenOf={childrenOf} depth={depth + 1} actions={actions} onEdit={onEdit} />
      ))}
    </>
  );
}

export default function LocationsTab({ locations, actions }) {
  const [search, setSearch]   = useState('');
  const [form,   setForm]     = useState({ name: '', parentId: '', sizeType: '', description: '' });
  const [adding, setAdding]   = useState(false);
  const [editLoc, setEditLoc] = useState(null);   // location object being edited
  const [editForm, setEditForm] = useState({});
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef(null);

  // Build tree structure
  const { roots, childrenOf } = useMemo(() => {
    const childrenOf = {};
    locations.forEach(l => {
      const pid = l.parent_id ?? null;
      if (!childrenOf[pid]) childrenOf[pid] = [];
      childrenOf[pid].push(l);
    });
    Object.values(childrenOf).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return { roots: (childrenOf[null] ?? []), childrenOf };
  }, [locations]);

  // Filtered flat list for search
  const filtered = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    return locations.filter(l => (l.name || '').toLowerCase().includes(q));
  }, [locations, search]);

  async function handleAdd() {
    if (!form.name.trim()) return;
    setAdding(true);
    try {
      await actions.addLocation({
        name:        form.name.trim(),
        parent_id:   form.parentId  || null,
        size_type:   form.sizeType  || null,
        description: form.description || null,
      });
      setForm({ name: '', parentId: '', sizeType: '', description: '' });
    } finally { setAdding(false); }
  }

  function openEdit(loc) {
    setEditLoc(loc);
    setEditForm({
      name:        loc.name ?? '',
      parentId:    loc.parent_id ?? '',
      sizeType:    loc.size_type ?? '',
      description: loc.description ?? '',
      image_data:  loc.image_data ?? null,
    });
  }

  // The pin image uploads immediately (dedicated endpoint), independent of Save.
  async function handleImageFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !editLoc) return;
    setImgBusy(true);
    try {
      const data = await actions.uploadLocationImage(editLoc.id, f);
      if (data) setEditForm(p => ({ ...p, image_data: data }));
    } finally { setImgBusy(false); }
  }

  async function handleClearImage() {
    if (!editLoc) return;
    setImgBusy(true);
    try {
      await actions.clearLocationImage(editLoc.id);
      setEditForm(p => ({ ...p, image_data: null }));
    } finally { setImgBusy(false); }
  }

  async function handleSaveEdit() {
    if (!editLoc) return;
    await actions.editLocation(editLoc.id, {
      name:        editForm.name,
      parent_id:   editForm.parentId  || null,
      size_type:   editForm.sizeType  || null,
      description: editForm.description || null,
    });
    setEditLoc(null);
  }

  const ef = (key) => (e) => setEditForm(p => ({ ...p, [key]: e.target.value }));
  const ff = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const displayRows = filtered ?? roots;

  return (
    <div className="space-y-3">
      {/* Add row */}
      <div className="flex gap-2 flex-wrap">
        <input placeholder="Location name" value={form.name} onChange={ff('name')}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className={INPUT_CLS + ' flex-[2] min-w-[120px]'} />
        <select value={form.parentId} onChange={ff('parentId')} className={INPUT_CLS + ' flex-[2] min-w-[140px]'}>
          <option value="">— Top-level —</option>
          {buildParentOptions(locations)}
        </select>
        <select value={form.sizeType} onChange={ff('sizeType')} className={INPUT_CLS}>
          <option value="">— type —</option>
          {LOCATION_SIZE_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
        </select>
        <input placeholder="Description" value={form.description} onChange={ff('description')}
          className={INPUT_CLS + ' flex-[3] min-w-[120px]'} />
        <Button variant="accent" loading={adding} onClick={handleAdd}>Add</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">🔍</span>
        <input placeholder="Search locations…" value={search}
          onChange={e => setSearch(e.target.value)}
          className={INPUT_CLS + ' w-full pl-6'} />
      </div>

      {/* Table */}
      {!locations.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">No locations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Name','Type','Description','Visible',''].map(h => (
                  <th key={h} className="text-left px-2 py-2 font-display text-[0.6rem] uppercase tracking-wider text-text-dim">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered
                ? filtered.map(l => (
                    <tr key={l.id} className="border-b border-border hover:bg-surface2">
                      <td className="px-2 py-2 text-text">{l.name}</td>
                      <td className="px-2 py-2 text-text-dim text-xs">{l.size_type ?? '—'}</td>
                      <td className="px-2 py-2 text-text-dim text-xs truncate max-w-[180px]">{l.description ?? ''}</td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => actions.toggleLocVisibility(l.id)}
                          className="text-xs px-2 py-0.5 rounded-sm border bg-surface2 border-border text-text-muted">
                          {l.is_public ? <Globe size={12} /> : <Lock size={12} />}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <Button variant="default" onClick={() => openEdit(l)}><Pencil size={11} /></Button>
                          <Button variant="danger"  onClick={() => actions.deleteLocation(l.id)}><Trash2 size={11} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                : roots.map(l => (
                    <LocationRow key={l.id} loc={l} childrenOf={childrenOf} depth={0} actions={actions} onEdit={openEdit} />
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editLoc} onClose={() => setEditLoc(null)} onSubmit={handleSaveEdit} title="Edit Location">
        <div className="flex flex-col gap-3">
          <FormField label="Name">
            <input value={editForm.name} onChange={ef('name')} className={'w-full ' + INPUT_CLS} />
          </FormField>
          <FormField label="Parent">
            <select value={editForm.parentId} onChange={ef('parentId')} className={'w-full ' + INPUT_CLS}>
              <option value="">— Top-level —</option>
              {buildParentOptions(locations, editLoc?.id)}
            </select>
          </FormField>
          <FormField label="Type">
            <select value={editForm.sizeType} onChange={ef('sizeType')} className={'w-full ' + INPUT_CLS}>
              <option value="">— None —</option>
              {LOCATION_SIZE_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Description">
            <textarea value={editForm.description} onChange={ef('description')} rows={2}
              className={'w-full resize-none ' + INPUT_CLS} />
          </FormField>
          <FormField label="Pin image">
            <div className="flex items-center gap-3">
              <div className="w-[56px] h-[56px] rounded-full border border-border2 bg-surface3 flex items-center justify-center overflow-hidden flex-shrink-0">
                {editForm.image_data
                  ? <img src={editForm.image_data} alt="pin" className="w-full h-full object-cover" />
                  : <span className="text-text-muted text-[10px] text-center leading-tight">size/type<br />icon</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Button variant="default" loading={imgBusy} onClick={() => fileRef.current?.click()}>📁 Upload</Button>
                {editForm.image_data && (
                  <Button variant="danger" onClick={handleClearImage}>✕ Clear</Button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
              </div>
              <p className="text-[0.7rem] text-text-muted flex-1">
                Shown as this location's map pin (shrunk to a thumbnail). Leave empty to use the size/type icon.
              </p>
            </div>
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost"  onClick={() => setEditLoc(null)}>Cancel</Button>
            <Button variant="accent" onClick={handleSaveEdit}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
