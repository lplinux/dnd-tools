/**
 * pages/ManageCampaigns/tabs/NpcsTab.jsx
 *
 * NPCs, managed the way locations are: a table with a visibility toggle, an
 * edit modal, and delete. It replaces the chip list that could only add and
 * remove a name.
 *
 * The three text fields have different audiences, and the modal says so
 * rather than leaving the DM to guess:
 *   Description  — who they are. Players see it once the NPC is revealed.
 *   Public info  — what the party has learned. Same terms.
 *   Private info — never leaves the server for a player.
 *
 * Bulk add stays, because naming six NPCs before a session is still the
 * common case and a modal per name would be worse. Everything else is filled
 * in later, when they turn out to matter.
 */

import { useMemo, useState } from 'react';
import { Eye, EyeOff, MapPin, Pencil, Trash2 } from 'lucide-react';

import { Button, Modal, FormField } from '@/components/ui';
import CrossLinkPopover from '@/components/CrossLinkPopover';
import { useConfirm } from '@/contexts/ConfirmContext';

const INPUT_CLS = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

export default function NpcsTab({ npcs, locations = [], campaignId, actions }) {
  const confirm = useConfirm();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(null);     // null = modal shut
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  // The read-only card, opened by clicking a row. Reading an NPC and editing
  // one are different intents, and the edit modal is a poor reader: it is a
  // stack of textareas. The pencil still opens that.
  const [card, setCard] = useState(null);   // { target, at } | null

  const sorted = useMemo(
    () => [...npcs].sort((a, b) => a.name.localeCompare(b.name)),
    [npcs],
  );

  // Matches on everything the DM can see, private notes included — this is
  // the DM's own tab, and "which one was the innkeeper" is the question.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => [n.name, n.description, n.public_info, n.private_info,
      n.location_name].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [sorted, query]);

  const locationOpts = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );

  async function handleAdd() {
    const names = input.split(',').map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    setAdding(true);
    try { await actions.addNpcs(names); setInput(''); }
    finally { setAdding(false); }
  }

  function openEdit(n) {
    setError(null);
    setForm({
      id: n.id,
      name: n.name ?? '',
      description: n.description ?? '',
      public_info: n.public_info ?? '',
      private_info: n.private_info ?? '',
      current_location_id: n.current_location_id ?? '',
    });
  }

  async function save() {
    if (!form.name.trim()) { setError('Name required'); return; }
    setSaving(true);
    setError(null);
    try {
      await actions.editNpc(form.id, {
        name: form.name.trim(),
        description: form.description,
        public_info: form.public_info,
        private_info: form.private_info,
        current_location_id: form.current_location_id || null,
      });
      setForm(null);
    } catch (e) {
      // A duplicate name is the one failure worth keeping the modal open for.
      setError(e?.message || 'Could not save');
    } finally { setSaving(false); }
  }

  async function remove(n) {
    if (await confirm(`Delete "${n.name}"?`, { title: 'Delete NPC', confirmLabel: 'Delete' })) {
      actions.deleteNpc(n.id);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Name, Name… (comma-separated)"
          className={INPUT_CLS + ' flex-[2] min-w-[160px]'}
        />
        <Button variant="accent" loading={adding} onClick={handleAdd}>Add</Button>
      </div>

      <p className="text-text-muted text-xs italic">
        New NPCs start <strong>hidden</strong>. Click the eye to reveal one once the party has
        met them — they then appear in <code>[[cross-links]]</code> and on the players&apos;
        Campaign Links tab, with their description and public info.
      </p>

      {sorted.length > 3 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search NPCs…"
          aria-label="Search NPCs"
          className={INPUT_CLS}
        />
      )}

      {!shown.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">
          {sorted.length ? `Nothing matches “${query.trim()}”.` : 'No NPCs yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Name', 'Description', 'Currently at', 'Seen', ''].map((h) => (
                  <th key={h} className="text-left px-2 py-2 font-display text-[0.7rem] uppercase tracking-wider text-text-dim">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((n) => (
                <tr
                  key={n.id}
                  className={`border-b border-border hover:bg-surface2 transition-colors ${n.is_public ? '' : 'opacity-60'}`}
                >
                  {/* The name and description open the card; the controls to
                      their right keep their own handlers and are not nested
                      inside this one. */}
                  <td
                    className="px-2 py-2 cursor-pointer"
                    onClick={(e) => setCard({ target: { ...n, kind: 'npc' }, at: { x: e.clientX, y: e.clientY } })}
                    title={`Read ${n.name}`}
                  >
                    <strong className="text-text">{n.name}</strong>
                  </td>
                  <td
                    className="px-2 py-2 text-text-dim text-xs max-w-[220px] truncate cursor-pointer"
                    onClick={(e) => setCard({ target: { ...n, kind: 'npc' }, at: { x: e.clientX, y: e.clientY } })}
                  >
                    {n.description || ''}
                  </td>
                  <td className="px-2 py-2 text-text-dim text-xs whitespace-nowrap">
                    {n.location_name
                      ? <span className="inline-flex items-center gap-1"><MapPin size={10} />{n.location_name}</span>
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => actions.toggleNpcVisibility(n.id)}
                      title={n.is_public
                        ? 'The party has met them — click to hide again'
                        : 'Not met yet — click to reveal'}
                      aria-label={n.is_public ? `Hide ${n.name}` : `Reveal ${n.name}`}
                      className={`text-xs px-2 py-0.5 rounded-sm border transition-colors ${
                        n.is_public
                          ? 'bg-[var(--gold-dim)] border-border2 text-text'
                          : 'bg-surface2 border-border text-text-muted'
                      }`}
                    >
                      {n.is_public ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button variant="default" onClick={() => openEdit(n)} title={`Edit ${n.name}`}>
                        <Pencil size={11} />
                      </Button>
                      <Button variant="danger" onClick={() => remove(n)} title={`Delete ${n.name}`}>
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Buttons inside the body, and onSubmit for Enter — this Modal takes
          no footer slot, and LocationsTab does the same. */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        onSubmit={save}
        title={form?.name ? `Edit ${form.name}` : 'Edit NPC'}
        /* Three textareas — description, public and private — do not fit
           in the 448px default. */
        className="max-w-2xl"
      >
        {form && (
          <div className="flex flex-col gap-3">
            <FormField label="Name">
              <input type="text" value={form.name} onChange={set('name')} className={INPUT_CLS} maxLength={255} />
            </FormField>

            <FormField label="Currently at">
              <select
                value={form.current_location_id ?? ''}
                onChange={set('current_location_id')}
                className={INPUT_CLS}
              >
                <option value="">— Nowhere in particular —</option>
                {locationOpts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.is_public ? '' : ' (hidden)'}
                  </option>
                ))}
              </select>
              <p className="text-text-muted text-[0.7rem] mt-1">
                Change it as they move. Their journey over time comes from timeline events
                tagged with them, and is drawn on the journey map.
              </p>
            </FormField>

            <FormField label="Description">
              <textarea value={form.description} onChange={set('description')} rows={5} className={INPUT_CLS} />
              <p className="text-text-muted text-[0.7rem] mt-1">
                Who they are. Players see this once the NPC is revealed.
              </p>
            </FormField>

            <FormField label="Public info">
              <textarea value={form.public_info} onChange={set('public_info')} rows={5} className={INPUT_CLS} />
              <p className="text-text-muted text-[0.7rem] mt-1">
                What the party has learned. Players see this too.
              </p>
            </FormField>

            <FormField label="Private info">
              <textarea value={form.private_info} onChange={set('private_info')} rows={6} className={INPUT_CLS} />
              <p className="text-text-muted text-[0.7rem] mt-1">
                Yours alone. Never sent to a player, revealed or not.
              </p>
            </FormField>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="accent" loading={saving} onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <CrossLinkPopover
        target={card?.target ?? null}
        at={card?.at}
        campaignId={campaignId}
        onClose={() => setCard(null)}
      />
    </div>
  );
}
