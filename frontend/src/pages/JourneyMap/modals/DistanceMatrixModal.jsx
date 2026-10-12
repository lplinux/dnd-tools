/**
 * pages/JourneyMap/modals/DistanceMatrixModal.jsx
 *
 * Full editable distance grid between all placed locations. Clicking a cell
 * opens the DistanceModal (via onEditDistance). Sticky row/column headers.
 */

import { Modal } from '@/components/ui';
import { sameId, isRegion, distanceBetween, fmtTravelTime, SPEEDS } from '@/components/map/geometry';

// Minor sub-location types hidden from a continent-scale matrix when they sit
// inside another location (e.g. an inn within a city).
const MINOR_TYPES = new Set(['inn', 'neighborhood', 'other']);

export default function DistanceMatrixModal({ open, onClose, placedLocs, distances, scope, onEditDistance }) {
  const visible = placedLocs.filter((l) => (
    // Regions (polygons) are areas, not points — they don't belong in a
    // point-to-point distance grid.
    !isRegion(l)
    && !(
      scope?.type === 'continent'
      && l.parent_id != null
      && MINOR_TYPES.has((l.size_type || '').toLowerCase())
    )
  ));
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={onClose} title="📏 Distance Matrix" className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
      {sorted.length < 2 ? (
        <div className="text-text-muted text-[12px]">Place at least 2 locations to define distances.</div>
      ) : (
        <>
          <div className="text-[11px] text-text-muted mb-2">Click any cell to set the distance between two locations.</div>
          <div className="overflow-auto max-h-[78vh]">
            <table className="jm-matrix">
              <thead>
                <tr>
                  <th />
                  {sorted.map((l) => <th key={l.id} title={l.name}>{l.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((from) => (
                  <tr key={from.id}>
                    <th>{from.name}</th>
                    {sorted.map((to) => {
                      if (sameId(from.id, to.id)) return <td key={to.id} className="self">—</td>;
                      const mi = distanceBetween(from.id, to.id, distances);
                      return (
                        <td key={to.id} className="editable" onClick={() => onEditDistance(from.id, to.id)} title={`${from.name} ↔ ${to.name}`}>
                          {mi !== null ? (
                            <>
                              <div className="font-semibold">{mi}mi</div>
                              <div className="text-[10px] text-text-muted">🚶{fmtTravelTime(mi / SPEEDS.walk)} 🐎{fmtTravelTime(mi / SPEEDS.horse)} 🦅{fmtTravelTime(mi / SPEEDS.fly)}</div>
                            </>
                          ) : (
                            <span className="text-[var(--gold-dim)]">+ set</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
