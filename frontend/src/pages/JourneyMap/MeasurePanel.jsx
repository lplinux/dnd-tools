/**
 * pages/JourneyMap/MeasurePanel.jsx
 *
 * Floating panel for the Measure tool. Shows the picked route, total distance,
 * travel times, and per-segment breakdown computed from stored distances.
 */

import { sameId, distanceBetween, fmtTravelTime, SPEEDS } from '@/components/map/geometry';

export default function MeasurePanel({ measurePts, placedLocs, distances, onClear }) {
  const names = measurePts.map((id) => placedLocs.find((l) => sameId(l.id, id))?.name || '?');

  let body;
  if (measurePts.length < 2) {
    body = <div className="text-text-muted text-[11px]">{measurePts.length ? 'Add another location to measure distance' : 'Click pinned locations to add waypoints'}</div>;
  } else {
    const segs = [];
    let total = 0;
    let complete = true;
    for (let i = 0; i < measurePts.length - 1; i++) {
      const mi = distanceBetween(measurePts[i], measurePts[i + 1], distances);
      if (mi === null) { complete = false; segs.push(null); } else { total += mi; segs.push(mi); }
    }
    body = complete ? (
      <>
        <div className="text-base font-semibold text-gold my-0.5">{total.toFixed(1)} mi</div>
        <div className="text-text-muted text-[10px]">🚶 {fmtTravelTime(total / SPEEDS.walk)} &nbsp; 🐎 {fmtTravelTime(total / SPEEDS.horse)} &nbsp; 🦅 {fmtTravelTime(total / SPEEDS.fly)}</div>
        {measurePts.length > 2 && (
          <div className="text-[10px] text-text-muted mt-1">{segs.map((s, i) => `${names[i]}→${names[i + 1]}: ${s}mi`).join(' · ')}</div>
        )}
      </>
    ) : (
      <div className="text-text-muted text-[11px]">⚠ Some distances not set{segs.some((s) => s !== null) ? ` (known: ${segs.filter((s) => s !== null).reduce((a, b) => a + b, 0).toFixed(1)} mi)` : ''}</div>
    );
  }

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 min-w-[260px] text-center bg-surface border border-[var(--gold-dim)] rounded px-3.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
      <div className="font-display uppercase tracking-wider text-[0.65rem] text-gold mb-1.5">📐 Measure Path</div>
      {names.length > 0 && (
        <div className="text-[11px] text-text-dim mb-1">{names.map((n, i) => <span key={i} className="text-text">{n}{i < names.length - 1 ? ' → ' : ''}</span>)}</div>
      )}
      {body}
      <button type="button" onClick={onClear} className="mt-1.5 border border-border2 text-text-dim hover:text-text hover:border-[var(--gold-dim)] rounded-sm text-[10px] px-2 py-0.5">
        ✕ Clear
      </button>
    </div>
  );
}
