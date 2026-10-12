/**
 * pages/TimelinePublic/index.jsx
 *
 * Read-only public view of a campaign's combined timeline, via share token
 * (`/timeline-public/:token`). Renders every (non-DM) player's timelines on one
 * Gantt with a per-timeline show/hide legend. No auth, no editing.
 */

import { useRef } from 'react';
import { useParams } from 'react-router-dom';

import { timelineApi } from '@/api/timeline';
import { useAsync } from '@/hooks/useAsync';
import { useCombinedTimeline } from '@/hooks/useCombinedTimeline';
import { Badge, Spinner } from '@/components/ui';
import {
  sliderToPPD, ppdToSlider, granLabel,
} from '@/pages/Timeline/layout';
import TimelineCanvas from '@/pages/Timeline/TimelineCanvas';
import TableView from '@/pages/Timeline/TableView';
import CombinedLegend from '@/pages/Timeline/CombinedLegend';
import '@/pages/Timeline/timeline.css';

export default function TimelinePublic() {
  const { token } = useParams();
  const { data, loading, error } = useAsync(() => timelineApi.publicData(token), { autoRun: true, deps: [token] });

  const rows = data?.rows || [];
  const calType = data?.calendar_type || 'harptos';
  const tl = useCombinedTimeline(rows, calType, {}, data?.today_marker ?? null);
  const canvasRef = useRef(null);

  return (
    <div className="tl-app">
      <div className="app-header" id="appHeader">
        <div style={{ fontFamily: 'var(--fd)', color: 'var(--gold)', fontSize: '.9rem', letterSpacing: '.06em' }}>
          📜 {data?.campaign_name || 'Timeline'}
        </div>
        <Badge variant="default">👁 Read Only</Badge>
        <div className="vt" style={{ marginLeft: 16 }}>
          <button className={tl.ui.view === 'graph' ? 'active' : ''} onClick={() => tl.setView('graph')}>Timeline</button>
          <button className={tl.ui.view === 'table' ? 'active' : ''} onClick={() => tl.setView('table')}>Table</button>
        </div>
        <div className="zoom-row" style={{ marginLeft: 'auto' }}>
          <span>Zoom</span>
          <input type="range" min={0} max={100} value={ppdToSlider(tl.ppd)} onChange={(e) => tl.setPpd(sliderToPPD(+e.target.value))} aria-label="Zoom" />
          <span className="zoom-lbl">{granLabel(tl.ppd)}</span>
          <button
            className="btn sm"
            title={tl.db.todayAbs == null ? 'No Today marker set' : 'Go to Today'}
            disabled={tl.db.todayAbs == null}
            onClick={() => canvasRef.current?.scrollToToday()}
          >
            📅
          </button>
        </div>
      </div>

      <div className="app-body">
        <CombinedLegend tree={tl.tree} hiddenTimelines={tl.hiddenTimelines} onToggle={tl.toggleTimeline} />

        {loading ? (
          <div className="tl-area" id="tl-area"><div className="es" style={{ display: 'flex' }}><Spinner className="w-8 h-8" /><p>Loading…</p></div></div>
        ) : error ? (
          <div className="tl-area" id="tl-area"><div className="es" style={{ display: 'flex' }}><div className="g">🔒</div><p>{error}</p></div></div>
        ) : tl.ui.view === 'table' ? (
          <TableView tl={tl} readOnly />
        ) : (
          <TimelineCanvas ref={canvasRef} tl={tl} readOnly />
        )}
      </div>
    </div>
  );
}
