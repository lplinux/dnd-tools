/**
 * pages/Timeline/Modals.jsx
 *
 * Simple personal-mode modals: new timeline (profile), add player, add
 * location, set "today" marker. (Event view/edit + share modals arrive later.)
 * Uses the shared Modal/Button + field styles so they're themed like the app.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, FIELD_INPUT, FIELD_LABEL } from '@/components/ui';
import {
  monthOptions, doyFromForm, absDay, fromAbsDay, formMidxFromDoy, HARPTOS, PALETTE,
  formatDate, formatDuration, parseDuration,
} from '@/data/calendar';

const SPECIAL = (cal, midx) => cal === 'harptos' && HARPTOS[midx]?.sp;

function MonthDayYear({ cal, year, midx, day, setYear, setMidx, setDay }) {
  const months = monthOptions(cal);
  const special = SPECIAL(cal, midx);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className={FIELD_LABEL}>Year</label>
          <input className={FIELD_INPUT} type="number" min={1} value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Day</label>
          <input className={FIELD_INPUT} type="number" min={1} max={30} value={special ? 1 : day} disabled={special} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        <label className={FIELD_LABEL}>{cal === 'harptos' ? 'Month / Festival' : 'Month'}</label>
        <select className={FIELD_INPUT} value={midx} onChange={(e) => setMidx(+e.target.value)}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
    </>
  );
}

function NewProfileModal({ open, onClose, tl }) {
  const [name, setName] = useState('');
  const [cal, setCal] = useState('harptos');
  const [players, setPlayers] = useState('');
  const [locs, setLocs] = useState('');
  const [useToday, setUseToday] = useState(false);
  const [year, setYear] = useState(1492);
  const [midx, setMidx] = useState(0);
  const [day, setDay] = useState(1);

  useEffect(() => {
    if (open) { setName(''); setCal('harptos'); setPlayers(''); setLocs(''); setUseToday(false); setYear(1492); setMidx(0); setDay(1); }
  }, [open]);

  function create() {
    if (!name.trim()) { window.alert('Please enter a name.'); return; }
    let todayAbs = null;
    if (useToday) {
      const doy = doyFromForm(midx, +day, +year, cal);
      todayAbs = absDay(+year, doy, cal);
    }
    tl.createProfile(name.trim(), cal, players, locs, todayAbs);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={create} title="New Timeline">
      <div className="flex flex-col gap-3">
        <div><label className={FIELD_LABEL}>Name</label><input className={FIELD_INPUT} autoFocus value={name} placeholder="My Campaign…" onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={FIELD_LABEL}>Calendar</label>
          <select className={FIELD_INPUT} value={cal} onChange={(e) => setCal(e.target.value)}>
            <option value="harptos">Harptos (D&amp;D Faerûn)</option>
            <option value="gregorian">Gregorian</option>
          </select>
        </div>
        <div><label className={FIELD_LABEL}>Players (comma-separated, optional)</label><input className={FIELD_INPUT} value={players} placeholder="Alice, Bob, Carol" onChange={(e) => setPlayers(e.target.value)} /></div>
        <div><label className={FIELD_LABEL}>Locations (comma-separated, optional)</label><input className={FIELD_INPUT} value={locs} placeholder="Waterdeep, Neverwinter" onChange={(e) => setLocs(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-text-dim">
          <input type="checkbox" checked={useToday} onChange={(e) => setUseToday(e.target.checked)} /> Set a “today” marker
        </label>
        {useToday && <MonthDayYear cal={cal} year={year} midx={midx} day={day} setYear={setYear} setMidx={setMidx} setDay={setDay} />}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={create}>Create</Button>
      </div>
    </Modal>
  );
}

function AddPlayerModal({ open, onClose, tl }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  useEffect(() => {
    if (open) { setName(''); setColor(PALETTE[tl.db.players.length % PALETTE.length]); }
  }, [open, tl.db.players.length]);

  function add() {
    if (!name.trim()) return;
    tl.addPlayer(name.trim(), color);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={add} title="Add Player">
      <div><label className={FIELD_LABEL}>Name</label>
        <input className={FIELD_INPUT} autoFocus value={name} placeholder="Player name…" onChange={(e) => setName(e.target.value)} /></div>
      <div className="mt-3"><label className={FIELD_LABEL}>Colour</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}

function AddLocationModal({ open, onClose, tl }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);

  function add() {
    if (!name.trim()) return;
    tl.addLocation(name.trim());
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={add} title="Add Location">
      <div><label className={FIELD_LABEL}>Name</label>
        <input className={FIELD_INPUT} autoFocus value={name} placeholder="e.g. Waterdeep…" onChange={(e) => setName(e.target.value)} /></div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}

function SetTodayModal({ open, onClose, tl }) {
  const { calType, db } = tl;
  const [year, setYear] = useState(1492);
  const [midx, setMidx] = useState(0);
  const [day, setDay] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (db.todayAbs != null) {
      const cur = fromAbsDay(db.todayAbs, calType);
      const f = formMidxFromDoy(cur.dayOfYear, cur.year, calType);
      setYear(cur.year); setMidx(f.midx); setDay(f.day);
    } else { setYear(1492); setMidx(0); setDay(1); }
  }, [open, db.todayAbs, calType]);

  function set() {
    tl.setToday(+year, midx, +day);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={set} title="📅 Set “Today” Marker">
      <p className="text-sm text-text-muted mb-3">A white line will mark this date on the timeline, separating past from future.</p>
      <MonthDayYear cal={calType} year={year} midx={midx} day={day} setYear={setYear} setMidx={setMidx} setDay={setDay} />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="danger" onClick={() => { tl.clearToday(); onClose(); }}>Clear marker</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={set}>Set</Button>
      </div>
    </Modal>
  );
}

function ViewEventModal({ open, ev, onClose, onOpen, tl }) {
  if (!ev) return null;
  const { calType } = tl;
  const pls = (ev.playerIds || []).map((id) => tl.db.players.find((p) => p.id === id)).filter(Boolean);
  let endLabel = null;
  if (ev.durationDays > 1) {
    const e = fromAbsDay(absDay(ev.year, ev.dayOfYear, calType) + ev.durationDays - 1, calType);
    endLabel = `${formatDuration(ev.durationDays)} → ends ${formatDate(e.year, e.dayOfYear, calType)}`;
  }
  return (
    <Modal open={open} onClose={onClose} onSubmit={onClose} title={ev.title}>
      <div className="text-sm leading-7 text-text-dim">
        <div>📅 <span className="text-text">{formatDate(ev.year, ev.dayOfYear, calType)}</span></div>
        {endLabel && <div>⏱ <span className="text-text">{endLabel}</span></div>}
        <div>📍 <span className="text-text">{ev.location}</span></div>
        <div>👤 {pls.length ? pls.map((p, i) => <span key={p.id} style={{ color: p.color }}>{i ? ', ' : ''}{p.name}</span>) : <span className="text-text-muted">—</span>}</div>
        {ev.description && <div className="mt-2 italic text-text">&quot;{ev.description}&quot;</div>}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="danger" onClick={() => { tl.deleteEvent(ev.id); onClose(); }}>Delete</Button>
        <Button variant="ghost" onClick={() => onOpen('edit-event', ev)}>Edit</Button>
        <Button variant="accent" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function EditEventModal({ open, ev, onClose, tl }) {
  const { calType, sortedPlayers, sortedEvents } = tl;
  const sortedLocs = useMemo(() => [...tl.db.locations].sort((a, b) => a.localeCompare(b)), [tl.db.locations]);
  const months = monthOptions(calType);

  const [form, setForm] = useState(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');

  useEffect(() => {
    if (!open || !ev) return;
    const f = formMidxFromDoy(ev.dayOfYear, ev.year, calType);
    setForm({
      title: ev.title, playerIds: [...(ev.playerIds || [])], location: ev.location,
      year: ev.year, midx: f.midx, day: f.day,
      description: ev.description || '',
      // The EXACT day count, not the display format. This used to pre-fill with
      // formatDuration(...).replace('~',''), which is approximate above 30 days
      // — a 45-day event showed as "2m" and saved back as 60, so merely opening
      // this modal and pressing save changed the duration. Typing "3m" or "2y"
      // still converts on save; only the pre-fill is exact.
      dur: ev.durationDays > 1 ? `${ev.durationDays}d` : '1d',
      manualLinks: [...(ev.manualLinks || [])],
    });
    setLinkQuery('');
    setPlayerQuery('');
  }, [open, ev, calType]);

  if (!open || !ev || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const special = calType === 'harptos' && HARPTOS[form.midx]?.sp;
  const toggle = (key, id) => set({ [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id] });
  const otherEvents = sortedEvents.filter((e) => e.id !== ev.id && (formatDate(e.year, e.dayOfYear, calType) + e.title).toLowerCase().includes(linkQuery.toLowerCase()));

  function save() {
    tl.updateEvent(ev.id, {
      title: form.title.trim() || ev.title,
      playerIds: form.playerIds.length ? form.playerIds : ev.playerIds,
      location: form.location,
      year: +form.year || ev.year,
      dayOfYear: doyFromForm(form.midx, +form.day, +form.year || ev.year, calType),
      description: form.description.trim(),
      durationDays: parseDuration(form.dur),
      manualLinks: form.manualLinks,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={save} title="Edit Event">
      <div className="flex flex-col gap-3">
        <div><label className={FIELD_LABEL}>Title</label><input className={FIELD_INPUT} value={form.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div>
          <label className={FIELD_LABEL}>Players</label>
          {sortedPlayers.length > 3 && (
            <input className={`${FIELD_INPUT} mb-1`} placeholder="Filter players…" value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} />
          )}
          <div className="pchks" style={{ maxHeight: 120 }}>
            {sortedPlayers.filter((p) => p.name.toLowerCase().includes(playerQuery.trim().toLowerCase())).map((p) => (
              <label key={p.id} className="pcl">
                <input type="checkbox" checked={form.playerIds.includes(p.id)} onChange={() => toggle('playerIds', p.id)} />
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block' }} />{p.name}
              </label>
            ))}
          </div>
        </div>
        <div><label className={FIELD_LABEL}>Location</label>
          <select className={FIELD_INPUT} value={form.location} onChange={(e) => set({ location: e.target.value })}>
            {sortedLocs.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label className={FIELD_LABEL}>Year</label><input className={FIELD_INPUT} type="number" min={1} value={form.year} onChange={(e) => set({ year: e.target.value })} /></div>
          <div><label className={FIELD_LABEL}>Day</label><input className={FIELD_INPUT} type="number" min={1} max={30} value={special ? 1 : form.day} disabled={special} onChange={(e) => set({ day: e.target.value })} /></div>
        </div>
        <div><label className={FIELD_LABEL}>{calType === 'harptos' ? 'Month / Festival' : 'Month'}</label>
          <select className={FIELD_INPUT} value={form.midx} onChange={(e) => set({ midx: +e.target.value })}>{months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </div>
        <div><label className={FIELD_LABEL}>Duration <span className="text-text-muted text-[0.65rem]">(1d, 3m, 2y)</span></label><input className={FIELD_INPUT} value={form.dur} onChange={(e) => set({ dur: e.target.value })} /></div>
        <div><label className={FIELD_LABEL}>Description</label><textarea className={`${FIELD_INPUT} resize-y`} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div>
          <label className={FIELD_LABEL}>Manual connections <span className="text-text-muted text-[0.65rem]">(dashed lines)</span></label>
          {otherEvents.length === 0 && !linkQuery
            ? <div className="text-text-muted italic text-[.82rem] p-1">No other events.</div>
            : (
              <>
                <input className={`${FIELD_INPUT} mb-1`} placeholder="Filter events…" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} />
                <div className="pchks" style={{ maxHeight: 120 }}>
                  {otherEvents.map((e) => {
                    const p0 = (e.playerIds || []).map((id) => tl.db.players.find((x) => x.id === id)).filter(Boolean)[0];
                    return (
                      <label key={e.id} className="pcl">
                        <input type="checkbox" checked={form.manualLinks.includes(e.id)} onChange={() => toggle('manualLinks', e.id)} />
                        {p0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: p0.color, display: 'inline-block' }} />}
                        <span style={{ fontSize: '.78rem' }}>{formatDate(e.year, e.dayOfYear, calType)} – {e.title}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

/**
 * Date-range filter. Both bounds are inclusive, and an event is kept when its
 * span *overlaps* the window rather than starting inside it — a 45-day journey
 * that began before the window is still happening during it, and dropping it
 * would misrepresent the timeframe.
 *
 * Either bound may be left off: From alone means "everything after", To alone
 * means "everything before".
 */
function DateRangeModal({ open, onClose, tl, range, onApply }) {
  const { calType } = tl;
  const [useFrom, setUseFrom] = useState(false);
  const [useTo, setUseTo] = useState(false);
  const [fy, setFy] = useState(1492); const [fm, setFm] = useState(0); const [fd, setFd] = useState(1);
  const [ty, setTy] = useState(1492); const [tm, setTm] = useState(0); const [td, setTd] = useState(1);

  // Seed from the current filter, or from the span of the events themselves so
  // the pickers open somewhere meaningful rather than on year 1492 day 1.
  useEffect(() => {
    if (!open) return;
    const evs = tl.db.events;
    const starts = evs.map((e) => absDay(e.year, e.dayOfYear, calType));
    const lo = starts.length ? Math.min(...starts) : absDay(1492, 1, calType);
    const hi = starts.length
      ? Math.max(...evs.map((e) => absDay(e.year, e.dayOfYear, calType) + Math.max(1, e.durationDays || 1) - 1))
      : lo;
    const seed = (abs, setY, setM, setD) => {
      const p = fromAbsDay(abs, calType);
      const f = formMidxFromDoy(p.dayOfYear, p.year, calType);
      setY(p.year); setM(f.midx); setD(f.day);
    };
    setUseFrom(range?.from != null);
    setUseTo(range?.to != null);
    seed(range?.from ?? lo, setFy, setFm, setFd);
    seed(range?.to ?? hi, setTy, setTm, setTd);
  }, [open, range, calType, tl.db.events]);

  function apply() {
    const from = useFrom ? absDay(+fy, doyFromForm(fm, +fd, +fy, calType), calType) : null;
    const to   = useTo   ? absDay(+ty, doyFromForm(tm, +td, +ty, calType), calType) : null;
    if (from != null && to != null && to < from) { onApply({ from: to, to: from }); onClose(); return; }
    onApply(from == null && to == null ? null : { from, to });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} onSubmit={apply} title="⏳ Filter by date">
      <p className="text-sm text-text-muted mb-3">
        Show only events overlapping this timeframe. Leave a bound unchecked for an open end.
      </p>

      <label className="flex items-center gap-2 cursor-pointer text-sm mb-2">
        <input type="checkbox" className="w-4 h-4 accent-[var(--gold)]" checked={useFrom} onChange={(e) => setUseFrom(e.target.checked)} />
        <span>From</span>
      </label>
      <div className={useFrom ? '' : 'opacity-40 pointer-events-none'}>
        <MonthDayYear cal={calType} year={fy} midx={fm} day={fd} setYear={setFy} setMidx={setFm} setDay={setFd} />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm mt-4 mb-2">
        <input type="checkbox" className="w-4 h-4 accent-[var(--gold)]" checked={useTo} onChange={(e) => setUseTo(e.target.checked)} />
        <span>To</span>
      </label>
      <div className={useTo ? '' : 'opacity-40 pointer-events-none'}>
        <MonthDayYear cal={calType} year={ty} midx={tm} day={td} setYear={setTy} setMidx={setTm} setDay={setTd} />
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="danger" onClick={() => { onApply(null); onClose(); }}>Clear filter</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={apply}>Apply</Button>
      </div>
    </Modal>
  );
}

export default function TimelineModals({ modal, onClose, onOpen, tl, dateRange, onApplyRange }) {
  // Resolve the freshest event for view/edit modals.
  const ev = modal?.data ? tl.db.events.find((e) => e.id === modal.data.id) || modal.data : null;
  return (
    <>
      <NewProfileModal open={modal?.type === 'new-profile'} onClose={onClose} tl={tl} />
      <AddPlayerModal open={modal?.type === 'add-player'} onClose={onClose} tl={tl} />
      <AddLocationModal open={modal?.type === 'add-location'} onClose={onClose} tl={tl} />
      <SetTodayModal open={modal?.type === 'set-today'} onClose={onClose} tl={tl} />
      <ViewEventModal open={modal?.type === 'view-event'} ev={ev} onClose={onClose} onOpen={onOpen} tl={tl} />
      <EditEventModal open={modal?.type === 'edit-event'} ev={ev} onClose={onClose} tl={tl} />
      <DateRangeModal open={modal?.type === 'date-range'} onClose={onClose} tl={tl} range={dateRange} onApply={onApplyRange} />
    </>
  );
}
