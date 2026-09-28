/**
 * pages/Timeline/CombinedLegend.jsx
 *
 * Sidebar legend for the combined timeline (DM combined view + public view):
 * players → their timelines, each with a colour swatch and a show/hide toggle.
 */

export default function CombinedLegend({ tree = [], hiddenTimelines, onToggle }) {
  return (
    <div className="sidebar" id="sidebar">
      <div className="s-sec">
        <div className="s-ttl" style={{ cursor: 'default' }}>Players &amp; Timelines</div>
        <div className="s-body">
          <div className="s-inner">
            {tree.length === 0 && <div className="empty-m">No timelines.</div>}
            {tree.map((p) => (
              <div key={p.id} className="dm-player-toggle">
                <div style={{ fontFamily: 'var(--fd)', fontSize: '.72rem', color: 'var(--gold)', padding: '4px 2px 0' }}>{p.name}</div>
                {p.username && <div style={{ fontSize: '.65rem', color: 'var(--text-dim)', padding: '0 2px 4px' }}>{p.username}</div>}
                {p.timelines.map((t) => {
                  const hidden = hiddenTimelines.has(t.id);
                  return (
                    <div key={t.id} className="dm-tl-row" style={{ opacity: hidden ? 0.5 : 1 }}>
                      <span className="color-dot" style={{ background: t.color, width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
                      <span className="dm-tl-name" style={{ flex: 1 }}>{t.name}</span>
                      <button className="btn sm" onClick={() => onToggle(t.id)}>{hidden ? 'Show' : 'Hide'}</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
