/**
 * pages/Timeline/TableView.jsx
 *
 * Tabular view of all events (sorted by date). Port of the legacy renderTable.
 * Edit/delete actions are hidden in read-only (DM combined / public) modes.
 */

import { absDay, fromAbsDay, formatDate, formatDuration } from '@/data/calendar';

export default function TableView({ tl, readOnly = false, onEdit, onDelete }) {
  const { sortedEvents, calType, db } = tl;
  const playerById = new Map(db.players.map((p) => [p.id, p]));
  const getPlayers = (ev) => (ev.playerIds || []).map((id) => playerById.get(id)).filter(Boolean);

  return (
    <div className="tbl-wrap" id="tbl-wrap" style={{ display: 'block' }}>
      <div className="tbl-count" id="tbl-count">{sortedEvents.length} event{sortedEvents.length === 1 ? '' : 's'}</div>
      <table className="tbl">
        <thead id="tbl-head">
          <tr>
            <th>Start Date</th><th>End Date</th><th>Title</th><th>Location</th><th>Players</th><th>Description</th>{!readOnly && <th />}
          </tr>
        </thead>
        <tbody id="tbl-body">
          {sortedEvents.length === 0 ? (
            <tr><td colSpan={readOnly ? 6 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: 24 }}>No events yet.</td></tr>
          ) : sortedEvents.map((ev) => {
            const pls = getPlayers(ev);
            let endCell = <span style={{ color: 'var(--text-muted)' }}>—</span>;
            if (ev.durationDays > 1) {
              const e = fromAbsDay(absDay(ev.year, ev.dayOfYear, calType) + ev.durationDays - 1, calType);
              endCell = <><span style={{ color: 'var(--text-dim)' }}>{formatDate(e.year, e.dayOfYear, calType)}</span><br /><span style={{ fontSize: '.74rem', color: 'var(--gold-dim)' }}>{formatDuration(ev.durationDays)}</span></>;
            }
            return (
              <tr key={ev.id}>
                <td>{formatDate(ev.year, ev.dayOfYear, calType)}</td>
                <td>{endCell}</td>
                <td className="ev-tit">{ev.title}</td>
                <td>📍 {ev.location}</td>
                <td>
                  <div className="pl-dots">
                    {pls.length ? pls.map((p) => (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                        <span style={{ color: p.color }}>{p.name}</span>
                      </span>
                    )) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </div>
                </td>
                <td style={{ fontStyle: 'italic' }}>{ev.description || ''}</td>
                {!readOnly && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" style={{ marginRight: 4 }} onClick={() => onEdit?.(ev.id)}>Edit</button>
                    <button className="btn sm dn" onClick={() => onDelete?.(ev.id)}>✕</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
