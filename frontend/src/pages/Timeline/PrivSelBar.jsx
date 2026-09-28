/**
 * pages/Timeline/PrivSelBar.jsx
 *
 * Campaign-mode selector bar: campaign → player/view → named timeline, plus
 * new/delete timeline. Shown only in campaign mode.
 */

export default function PrivSelBar({ tl }) {
  const groups = [];
  const flat = [];
  tl.playerOptions.forEach((o) => {
    if (!o.group) { flat.push(o); return; }
    let g = groups.find((x) => x.label === o.group);
    if (!g) { g = { label: o.group, items: [] }; groups.push(g); }
    g.items.push(o);
  });

  return (
    <div className="priv-sel-bar visible" id="privSelBar">
      <select value={tl.campaignId} onChange={(e) => tl.selectCampaign(e.target.value)}>
        <option value="">— Campaign —</option>
        {[...tl.campaigns].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {tl.playerOptions.length > 0 && (
        <select value={tl.playerSel} onChange={(e) => tl.selectPlayerOption(e.target.value)}>
          {flat.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {groups.map((g) => (
            <optgroup key={g.label} label={`── ${g.label} ──`}>
              {g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      )}

      {/* Timeline picker + delete only exist once there's at least one timeline. */}
      {tl.timelines.length > 0 && (
        <select value={tl.timelineId ?? ''} onChange={(e) => tl.selectTimeline(e.target.value ? Number(e.target.value) : null)}>
          {[...tl.timelines].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((t) => <option key={t.id} value={t.id}>{t.name}{t.entry_count != null ? ` (${t.entry_count})` : ''}</option>)}
        </select>
      )}
      {/* New-timeline is available whenever a specific (ownable) actor is selected —
          including when they have zero timelines yet. */}
      {tl.privPlayerId && (
        <button className="btn sm" title="New timeline" onClick={() => { const n = window.prompt('New timeline name:'); if (n && n.trim()) tl.createTimeline(n.trim()); }}>＋ New</button>
      )}
      {tl.timelineId && (
        <button className="btn sm" title="Export this timeline (import it from Manage Campaigns)" onClick={() => tl.exportTimeline()}>⬇</button>
      )}
      {tl.timelines.length > 0 && (
        <button className="btn sm dn" title="Delete timeline" onClick={() => { if (window.confirm('Delete this timeline and all its entries?')) tl.deleteTimeline(); }}>🗑</button>
      )}

      {tl.isDM && tl.campaignId && (
        <button
          className="btn sm gld"
          style={{ marginLeft: 'auto' }}
          title="Copy a public read-only link to this campaign's combined timeline"
          onClick={async () => {
            const url = await tl.getShareUrl();
            if (!url) return;
            try { await navigator.clipboard.writeText(url); window.alert(`Public link copied:\n${url}`); }
            catch { window.prompt('Public link:', url); }
          }}
        >
          🔗 Share
        </button>
      )}

      {/* Status wraps to its own full-width row (flex-wrap) so a long message never
          crowds or overlaps the selectors. */}
      {tl.status && <span style={{ flexBasis: '100%', fontSize: '.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{tl.status}</span>}
    </div>
  );
}
