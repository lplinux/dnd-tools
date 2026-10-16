/**
 * pages/ManageCampaigns/tabs/PlayersTab.jsx
 *
 * Campaign players: add, delete, reassign user, open/create timelines.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Save, Upload } from 'lucide-react';
import { Button, Modal, FormField } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import InvitePanel from './InvitePanel';

export default function PlayersTab({ players, allUsers, campaignId, actions }) {
  const navigate = useNavigate();
  const [name,       setName]       = useState('');
  const [userId,     setUserId]     = useState('');
  const [adding,     setAdding]     = useState(false);
  const [reassigns,  setReassigns]  = useState({});     // { [pid]: newUserId }
  const [tlModal,    setTlModal]    = useState(null);   // player object | null
  const [tlName,     setTlName]     = useState('');

  // Per-player PC-sheet import. One shared file input, retargeted per row, the
  // same pattern the sidebar hub uses — a hidden input per row would be dozens
  // of identical nodes. `pendingPlayer` is the row the picker was opened from.
  const fileRef = useRef(null);
  const [pendingPlayer, setPendingPlayer] = useState(null); // player object | null
  const [importModal,   setImportModal]   = useState(null); // { player, bundle } | null
  const { toast } = useToast();

  const sorted = [...players].sort((a, b) =>
    (a.player_name || '').localeCompare(b.player_name || ''));

  // Players only. It used to be `role !== 'admin'`, which left every DM in the
  // list — and a DM already has a seat in their own campaign through
  // is_dm_player, so offering them one here only ever produced a mistake.
  const userOpts = [...allUsers]
    .filter(u => u.role === 'player')
    .sort((a, b) => (a.username || '').localeCompare(b.username || ''));

  /** The select's current value for a row: a pending edit, else what is saved. */
  const currentUser = (p) => String(p.user_id ?? '');
  const chosen = (p) => reassigns[p.id] ?? currentUser(p);

  /**
   * Options for one row.
   *
   * Whoever holds the seat is always included, even when they are not a
   * player — an assignment made before DMs were filtered out would otherwise
   * be invisible, and the select would silently show someone else's name as
   * though it were saved.
   */
  function optionsFor(p) {
    const held = currentUser(p);
    if (held && !userOpts.some(u => String(u.id) === held)) {
      return [{ id: p.user_id, username: `${p.username ?? `User ${p.user_id}`} (not a player)` }, ...userOpts];
    }
    return userOpts;
  }

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    try { await actions.addPlayer(name.trim(), userId || null); setName(''); setUserId(''); }
    finally { setAdding(false); }
  }

  async function handleReassign(pid) {
    const p = players.find(x => String(x.id) === String(pid));
    if (!p) return;
    const next = chosen(p);
    if (next === currentUser(p)) return;        // nothing to save
    // '' is "— None —", which the server reads as unassign. This is the whole
    // bug: the select used to sit on '' whatever was saved, so choosing
    // "— None —" fired no change event and Save had nothing to send. There
    // was no way to free a seat once it was taken.
    await actions.reassignPlayer(pid, next || null);
    // Drop the local override so the row shows what came back from the server.
    setReassigns(prev => {
      const copy = { ...prev };
      delete copy[pid];
      return copy;
    });
  }

  function openImportFor(player) {
    setPendingPlayer(player);
    fileRef.current?.click();
  }

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = '';
    const player = pendingPlayer;
    setPendingPlayer(null);
    if (!file || !player) return;

    let bundle;
    try { bundle = JSON.parse(await file.text()); }
    catch { toast('That file is not valid JSON.', 'error'); return; }

    if (bundle?.type !== 'pc-sheet') {
      toast('Unrecognized file — expected a pc-sheet export.', 'error');
      return;
    }
    // Import replaces the sheet outright, and a row button is far easier to
    // mis-click than the sidebar flow, so confirm before writing.
    setImportModal({ player, bundle });
  }

  async function confirmImport() {
    if (!importModal) return;
    const { player, bundle } = importModal;
    setImportModal(null);
    await actions.importPcSheetInto(player.id, bundle);
  }

  async function handleCreateTl() {
    if (!tlModal) return;
    await actions.createTimeline(tlModal.id, tlName || `${tlModal.player_name} Timeline`);
    setTlModal(null); setTlName('');
  }

  const inputCls = 'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  return (
    <div className="space-y-4">
      {/* Two ways to add someone, side by side: build the seat yourself, or
          send a link and let them. They were stacked, which gave two ways of
          doing one thing a third of the screen before the table that is the
          actual content of this tab.

          md: is the breakpoint rather than lg: because each column is a short
          row of controls; below it they stack, which is the only thing that
          fits a phone. */}
      <div className="border border-border rounded-sm bg-surface2/40
                      grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <section className="p-3 flex flex-col gap-2">
          <p className="font-display uppercase tracking-wider text-[0.6rem] text-text-dim">
            Create a character
          </p>
          <div className="flex gap-2 flex-wrap">
            <input type="text" placeholder="Character name" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className={inputCls + ' flex-[2] min-w-[120px]'} />
            <select value={userId} onChange={e => setUserId(e.target.value)} className={inputCls + ' flex-1 min-w-[110px]'}>
              <option value="">— No user —</option>
              {[...userOpts].sort((a, b) => (a.username || '').localeCompare(b.username || '')).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <Button variant="accent" loading={adding} onClick={handleAdd}>Add</Button>
          </div>
          <p className="text-[0.7rem] text-text-muted font-body italic">
            For a player who already has an account, or a seat to fill later.
          </p>
        </section>

        <InvitePanel campaignId={campaignId} players={players} />
      </div>

      {/* Table */}
      {!sorted.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">No players yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Character', 'User', 'Reassign', 'Timeline', 'Sheet', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-display text-[0.6rem] uppercase tracking-wider text-text-dim">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} className="border-b border-border hover:bg-surface2 transition-colors">
                  <td className="px-3 py-2 font-semibold text-text">{p.player_name}</td>
                  <td className="px-3 py-2 text-text-dim">{p.username || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <select
                        className={inputCls + ' text-xs py-1'}
                        /* Shows who HOLDS the seat, not a blank. The current
                           holder therefore stays in the option list — filtering
                           them out left the select unable to display its own
                           value. */
                        value={chosen(p)}
                        onChange={e => setReassigns(prev => ({ ...prev, [p.id]: e.target.value }))}
                        aria-label={`User assigned to ${p.player_name}`}
                      >
                        <option value="">— None —</option>
                        {optionsFor(p).map(u => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                      <Button
                        variant="default"
                        onClick={() => handleReassign(p.id)}
                        disabled={chosen(p) === currentUser(p)}
                        title={chosen(p) === currentUser(p)
                          ? 'Pick a different user first'
                          : (chosen(p)
                            ? `Assign this user to ${p.player_name}`
                            : `Leave ${p.player_name} unassigned`)}
                      >
                        <Save size={11} className="inline mr-1" /> Save
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button variant="default" onClick={() => navigate(`/timeline?campaign=${campaignId}&player=${p.id}&mode=private`)}>
                        📜 View
                      </Button>
                      <Button variant="default" onClick={() => { setTlModal(p); setTlName(''); }}>
                        + New
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="default" onClick={() => openImportFor(p)}
                      title={`Import a PC sheet onto ${p.player_name}`}>
                      <Upload size={11} className="inline mr-1" /> Import
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="danger" onClick={() => actions.deletePlayer(p.id)} title="Delete player">
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shared, retargeted per row by openImportFor(). */}
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFilePicked} />

      {/* Import confirmation */}
      <Modal
        open={!!importModal}
        onClose={() => setImportModal(null)}
        onSubmit={confirmImport}
        title={`Import PC Sheet — ${importModal?.player?.player_name ?? ''}`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-dim">
            Import <strong className="text-text">{importModal?.bundle?.character?.name || 'this character'}</strong>
            {' '}onto <strong className="text-text">{importModal?.player?.player_name}</strong>?
          </p>
          <p className="text-[0.7rem] text-text-muted">
            Replaces that player's current sheet, stats and relationships.
            {importModal?.bundle?.scope === 'full'
              ? ' This is a DM export, so private info and DM notes are replaced too.'
              : ' This is a player export, so private info, DM notes and DM-only relationships are left untouched.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setImportModal(null)}>Cancel</Button>
            <Button variant="accent" onClick={confirmImport}>Import</Button>
          </div>
        </div>
      </Modal>

      {/* New timeline modal */}
      <Modal open={!!tlModal} onClose={() => setTlModal(null)} onSubmit={handleCreateTl} title={`New Timeline — ${tlModal?.player_name}`}>
        <div className="flex flex-col gap-3">
          <FormField label="Timeline name">
            <input type="text" value={tlName}
              onChange={e => setTlName(e.target.value)}
              placeholder={`${tlModal?.player_name ?? ''} Timeline`}
              className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
              autoFocus />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setTlModal(null)}>Cancel</Button>
            <Button variant="accent" onClick={handleCreateTl}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
