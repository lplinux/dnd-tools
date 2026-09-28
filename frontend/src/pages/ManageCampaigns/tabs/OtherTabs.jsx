/**
 * pages/ManageCampaigns/tabs/OtherTabs.jsx
 *
 * Three tab components that share one file to keep the directory tidy:
 *   NpcsTab       — bulk-add NPCs, chip delete
 *   TimelinesTab  — summary cards + navigate to timeline
 *   SettingsTab   — calendar info, today-marker date picker, danger-zone delete
 */

import { useState } from 'react';
import { Download } from 'lucide-react';

import { Button, Modal, FormField } from '@/components/ui';
import { useConfirm } from '@/contexts/ConfirmContext';
import { HARPTOS, absDay, doyFromForm, formatAbsDay } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// NpcsTab
// ─────────────────────────────────────────────────────────────────────────────
export function NpcsTab({ npcs, actions }) {
  const [input,  setInput]  = useState('');
  const [adding, setAdding] = useState(false);

  const sorted = [...npcs].sort((a, b) => a.name.localeCompare(b.name));

  async function handleAdd() {
    const names = input.split(',').map(n => n.trim()).filter(Boolean);
    if (!names.length) return;
    setAdding(true);
    try { await actions.addNpcs(names); setInput(''); }
    finally { setAdding(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Name, Name… (comma-separated)"
          className="flex-1 bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
        />
        <Button variant="accent" loading={adding} onClick={handleAdd}>Add</Button>
      </div>

      <p className="text-text-muted text-xs italic">
        NPCs are DM-only and can be used as actors in the DM Timeline.
      </p>

      {!sorted.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">No NPCs yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {sorted.map(n => (
            <span key={n.id} className="inline-flex items-center gap-1 bg-surface3 border border-border2 text-text text-xs font-body px-2 py-1 rounded-sm">
              {n.name}
              <button
                onClick={() => actions.deleteNpc(n.id)}
                className="text-text-muted hover:text-danger transition-colors leading-none"
                aria-label={`Remove ${n.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelinesTab
// ─────────────────────────────────────────────────────────────────────────────
export function TimelinesTab({ timelines, campaignId }) {
  function go(url) { window.location.href = url; }

  return (
    <div className="space-y-3">
      <button
        onClick={() => go(`/timeline?campaign=${campaignId}&mode=private`)}
        className="text-sm font-display text-gold border border-border2 px-3 py-1.5 rounded-sm hover:bg-surface2 transition-colors"
      >
        📜 Open Combined Timeline →
      </button>

      {!timelines.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">No timeline entries yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...timelines].sort((a, b) => (a.player_name || '').localeCompare(b.player_name || '')).map(t => (
            <div key={t.player_id} className="flex items-center justify-between bg-surface2 border border-border rounded-sm px-4 py-3">
              <div>
                <div className="font-display text-gold text-sm uppercase tracking-wider">
                  {t.player_name}
                </div>
                {t.username && <div className="text-text-muted text-xs">{t.username}</div>}
                <div className="text-text-dim text-xs mt-0.5">
                  {t.entry_count} entr{t.entry_count === 1 ? 'y' : 'ies'}
                  {t.first_year ? ` · Years ${t.first_year}–${t.last_year}` : ''}
                </div>
              </div>
              <button
                onClick={() => go(`/timeline?campaign=${campaignId}&player=${t.player_id}&mode=private`)}
                className="text-xs font-display text-gold border border-border2 px-3 py-1.5 rounded-sm hover:bg-surface2 transition-colors"
              >
                Open →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsTab
// ─────────────────────────────────────────────────────────────────────────────
export function SettingsTab({ campaign, meta, actions }) {
  const confirm      = useConfirm();
  const calType      = campaign?.calendar_type ?? 'harptos';
  const todayMarker  = meta?.today_marker ? parseInt(meta.today_marker) : null;
  const todayDisplay = formatAbsDay(todayMarker, calType);

  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [pickerYear,  setPickerYear]  = useState(1);
  const [pickerMonth, setPickerMonth] = useState(0);
  const [pickerDay,   setPickerDay]   = useState(1);
  const [deleting,    setDeleting]    = useState(false);

  const months = calType === 'harptos'
    ? HARPTOS
    : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        .map((name, i) => ({ name, days: [31,28,31,30,31,30,31,31,30,31,30,31][i], sp: false }));

  const maxDay = months[pickerMonth]?.days ?? 30;

  function openPicker() {
    if (todayMarker) {
      const year = Math.floor((todayMarker - 1) / 365) + 1;
      const doy  = ((todayMarker - 1) % 365) + 1;
      for (let i = 0; i < months.length; i++) {
        if (months[i].sd !== undefined && doy >= months[i].sd && doy < months[i].sd + months[i].days) {
          setPickerMonth(i);
          setPickerDay(doy - months[i].sd + 1);
          break;
        }
      }
      setPickerYear(year);
    }
    setPickerOpen(true);
  }

  async function applyPicker() {
    const doy = doyFromForm(pickerMonth, pickerDay, calType);
    const ad  = absDay(pickerYear, doy);
    await actions.saveTodayMarker(ad);
    setPickerOpen(false);
  }

  async function handleDelete() {
    if (!await confirm('Permanently delete this campaign and ALL its data?', { title: 'Delete campaign', confirmLabel: 'Delete' })) return;
    setDeleting(true);
    try { await actions.deleteCampaign(); }
    finally { setDeleting(false); }
  }

  const inputCls = 'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  return (
    <div className="space-y-6 max-w-lg">

      {/* Calendar */}
      <section className="bg-surface2 border border-border rounded-sm p-4">
        <h3 className="font-display text-gold uppercase tracking-wider text-xs mb-3">📅 Calendar</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-text-dim text-xs">Type:</span>
          <span className="font-display text-gold text-sm">
            {calType === 'harptos' ? 'Harptos (D&D / Faerûn)' : 'Gregorian'}
          </span>
          <span className="text-text-muted text-[10px] italic">(set at creation — cannot change)</span>
        </div>
      </section>

      {/* Today marker */}
      <section className="bg-surface2 border border-border rounded-sm p-4">
        <h3 className="font-display text-gold uppercase tracking-wider text-xs mb-3">📍 Today Marker</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display text-gold text-sm flex-1">{todayDisplay}</span>
          <Button variant="default" onClick={openPicker}>📅 Set Date</Button>
        </div>
      </section>

      {/* Export / backup */}
      <section className="bg-surface2 border border-border rounded-sm p-4">
        <h3 className="font-display text-gold uppercase tracking-wider text-xs mb-3">💾 Export / Backup</h3>
        <p className="text-text-dim text-xs mb-3">
          Download the full campaign (players, locations, timelines, PC sheets, journey maps) as a JSON file.
        </p>
        <Button variant="default" onClick={() => actions.exportCampaign?.()} title="Export campaign as JSON">
          <Download size={12} className="inline mr-1" /> Export Campaign
        </Button>
      </section>

      {/* Danger zone */}
      <section className="bg-surface2 border border-danger/30 rounded-sm p-4">
        <h3 className="font-display text-danger uppercase tracking-wider text-xs mb-3">⚠️ Danger Zone</h3>
        <p className="text-text-dim text-xs mb-3">
          Deleting a campaign permanently removes all players, locations, timelines, paths and maps.
        </p>
        <Button variant="danger" loading={deleting} onClick={handleDelete}>
          🗑 Delete Campaign
        </Button>
      </section>

      {/* Date picker modal */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} onSubmit={applyPicker} title="Set Today Marker">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <FormField label="Year">
              <input type="number" min={1} value={pickerYear}
                onChange={e => setPickerYear(parseInt(e.target.value) || 1)}
                className={inputCls} />
            </FormField>
            <FormField label="Month">
              <select value={pickerMonth}
                onChange={e => { setPickerMonth(parseInt(e.target.value)); setPickerDay(1); }}
                className={inputCls}>
                {months.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
              </select>
            </FormField>
            <FormField label="Day">
              <input type="number" min={1} max={maxDay} value={pickerDay}
                onChange={e => setPickerDay(Math.min(maxDay, Math.max(1, parseInt(e.target.value) || 1)))}
                className={inputCls} />
            </FormField>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost"  onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { actions.saveTodayMarker(null); setPickerOpen(false); }}>Clear</Button>
            <Button variant="accent" onClick={applyPicker}>Apply</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
