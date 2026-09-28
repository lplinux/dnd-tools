/**
 * pages/ManageCampaigns/tabs/PlayersTab.jsx
 *
 * Campaign players: add, delete, reassign user, open/create timelines.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RefreshCw } from 'lucide-react';
import { Button, Modal, FormField } from '@/components/ui';

export default function PlayersTab({ players, allUsers, campaignId, actions }) {
  const navigate = useNavigate();
  const [name,       setName]       = useState('');
  const [userId,     setUserId]     = useState('');
  const [adding,     setAdding]     = useState(false);
  const [reassigns,  setReassigns]  = useState({});     // { [pid]: newUserId }
  const [tlModal,    setTlModal]    = useState(null);   // player object | null
  const [tlName,     setTlName]     = useState('');

  const sorted = [...players].sort((a, b) =>
    (a.player_name || '').localeCompare(b.player_name || ''));

  const userOpts = allUsers.filter(u => u.role !== 'admin');

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    try { await actions.addPlayer(name.trim(), userId || null); setName(''); setUserId(''); }
    finally { setAdding(false); }
  }

  async function handleReassign(pid) {
    const newId = reassigns[pid];
    if (newId === undefined) return;
    await actions.reassignPlayer(pid, newId || null);
  }

  async function handleCreateTl() {
    if (!tlModal) return;
    await actions.createTimeline(tlModal.id, tlName || `${tlModal.player_name} Timeline`);
    setTlModal(null); setTlName('');
  }

  const inputCls = 'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  return (
    <div className="space-y-4">
      {/* Add player */}
      <div className="flex gap-2 flex-wrap">
        <input type="text" placeholder="Character name" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className={inputCls + ' flex-[2] min-w-[140px]'} />
        <select value={userId} onChange={e => setUserId(e.target.value)} className={inputCls + ' flex-[2] min-w-[140px]'}>
          <option value="">— No user —</option>
          {[...userOpts].sort((a, b) => (a.username || '').localeCompare(b.username || '')).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <Button variant="accent" loading={adding} onClick={handleAdd}>Add</Button>
      </div>

      {/* Table */}
      {!sorted.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">No players yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Character', 'User', 'Reassign', 'Timeline', ''].map(h => (
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
                        value={reassigns[p.id] ?? ''}
                        onChange={e => setReassigns(prev => ({ ...prev, [p.id]: e.target.value }))}
                      >
                        <option value="">— None —</option>
                        {userOpts.filter(u => u.id !== p.user_id).map(u => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                      <Button variant="default" onClick={() => handleReassign(p.id)}>
                        <RefreshCw size={11} />
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
