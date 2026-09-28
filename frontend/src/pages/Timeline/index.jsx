/**
 * pages/Timeline/index.jsx
 *
 * Campaign event Timeline. Two modes share one UI (canvas/sidebar/modals):
 *   - Personal (localStorage profiles)  → useTimeline
 *   - Campaign (DB-backed, per player/timeline) → useTimelineCampaign
 * A mode switch appears for authenticated users. Public read-only view is a
 * separate page. Access: DM + Player.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';

import { useTimeline } from '@/hooks/useTimeline';
import { useTimelineCampaign } from '@/hooks/useTimelineCampaign';
import { useAuth } from '@/hooks/useAuth';
import AppHeader from '@/components/layout/AppHeader';
import { absDay, formatDate } from '@/data/calendar';
import {
  sliderToPPD, ppdToSlider, granLabel, buildSegments, segTotalH, MIN_PPD, MAX_PPD,
} from './layout';

import Sidebar from './Sidebar';
import PrivSelBar from './PrivSelBar';
import CombinedLegend from './CombinedLegend';
import TimelineModals from './Modals';
import TimelineCanvas from './TimelineCanvas';
import TableView from './TableView';
import './timeline.css';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function Timeline() {
  const { user } = useAuth();
  const personalTl = useTimeline();
  const campaignTl = useTimelineCampaign();
  const [mode, setMode] = useState('local');
  const tl = mode === 'campaign' ? campaignTl : personalTl;

  const canvasRef = useRef(null);
  const [modal, setModal] = useState(null);
  const openModal = (type, data) => setModal({ type, data });
  const closeModal = () => setModal(null);

  // Load campaigns the first time campaign mode is entered.
  useEffect(() => {
    if (mode === 'campaign' && campaignTl.campaigns.length === 0) campaignTl.loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Deep-link from Manage Campaigns: /timeline?campaign=<id>&player=<id>&mode=private
  // switches to campaign mode and selects that campaign (and player's timeline).
  const [searchParams] = useSearchParams();
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !user) return;
    const campaignParam = searchParams.get('campaign');
    const playerParam = searchParams.get('player');
    if (!campaignParam && searchParams.get('mode') !== 'private') return;
    deepLinkedRef.current = true;
    setMode('campaign');
    (async () => {
      await campaignTl.loadCampaigns();
      if (!campaignParam) return;
      await campaignTl.selectCampaign(campaignParam);
      if (playerParam) await campaignTl.selectPlayerOption(String(playerParam), campaignParam);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // ── Search ──
  const [query, setQuery] = useState('');
  // The results dropdown is portalled into the page container so the toolbar's
  // overflow doesn't clip it; it's positioned from the search box's rect.
  const appRef = useRef(null);
  const searchWrapRef = useRef(null);
  const [srPos, setSrPos] = useState(null);
  const playerById = useMemo(() => new Map(tl.db.players.map((p) => [p.id, p])), [tl.db.players]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return tl.db.events
      .filter((ev) => {
        const pn = (ev.playerIds || []).map((id) => playerById.get(id)?.name.toLowerCase() || '').join(' ');
        return ev.title.toLowerCase().includes(q) || (ev.description || '').toLowerCase().includes(q) || ev.location.toLowerCase().includes(q) || pn.includes(q);
      })
      .sort((a, b) => absDay(a.year, a.dayOfYear, tl.calType) - absDay(b.year, b.dayOfYear, tl.calType))
      .slice(0, 10);
  }, [query, tl.db.events, tl.calType, playerById]);

  // Track the search box's viewport rect while results are open (also on scroll/resize).
  useLayoutEffect(() => {
    if (!results) { setSrPos(null); return undefined; }
    const el = searchWrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSrPos({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [results]);

  function jumpToEvent(id) {
    setQuery('');
    if (tl.ui.view !== 'graph') tl.setView('graph');
    setTimeout(() => canvasRef.current?.scrollToEvent(id), 120);
  }

  const isCombined = mode === 'campaign' && campaignTl.combined;
  const canRender = mode === 'campaign'
    ? (campaignTl.timelineId != null || campaignTl.combined)
    : (personalTl.profiles.length > 0 && personalTl.activeProfile);
  const fitKey = mode === 'campaign'
    ? (isCombined ? `c${tl.db.events.length}` : campaignTl.timelineId)
    : personalTl.activeId;

  // Fit-all: choose a zoom so the (compressed) timeline fills the viewport.
  // The content height is linear in ppd — H(ppd) = A·ppd + B — because clusters
  // are ppd-independent and the gap breaks + bottom padding are fixed overhead.
  // Sample two ppds to recover A and B, then solve H(ppd) = viewport exactly.
  // (The previous proportional rescale ignored B and consistently overflowed.)
  const fit = useCallback(() => {
    const body = document.getElementById('tl-body');
    const h = body?.clientHeight || 500;
    const evs = tl.db.events;
    if (!evs.length) { tl.setPpd(sliderToPPD(50)); return; }
    const h1 = segTotalH(buildSegments(evs, 1, tl.calType), 1);
    const h2 = segTotalH(buildSegments(evs, 2, tl.calType), 2);
    const A = h2 - h1;        // day-proportional px per unit ppd
    const B = h1 - A;         // fixed overhead (gap breaks + bottom padding)
    const target = Math.max(1, h - 6);
    const ppd = A > 0 ? clamp((target - B) / A, MIN_PPD, MAX_PPD) : MIN_PPD;
    tl.setPpd(ppd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.calType, tl.db.events]);

  useEffect(() => {
    if (fitKey == null) return undefined;
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const onEventClick = (id) => openModal('view-event', tl.db.events.find((e) => e.id === id));

  return (
    <>
      <AppHeader icon="📅" name="Timeline" />

      <div className="tl-app" ref={appRef}>
        {/* Toolbar */}
        <div className="app-header" id="appHeader">
          <div className="search-wrap" ref={searchWrapRef}>
            <span className="si">🔍</span>
            <input
              type="search"
              placeholder="Search events…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); if (e.key === 'Enter' && results?.length) jumpToEvent(results[0].id); }}
              aria-label="Search events"
            />
            {results && srPos && appRef.current && createPortal(
              <div className="sr" style={{ display: 'block', position: 'fixed', left: srPos.left, top: srPos.top, width: srPos.width, zIndex: 4000 }}>
                {results.length === 0
                  ? <div className="sr-empty">No results for &quot;{query}&quot;</div>
                  : results.map((ev) => (
                    <div key={ev.id} className="sri" onClick={() => jumpToEvent(ev.id)}>
                      <div className="sri-t">{ev.title}</div>
                      <div className="sri-m">
                        {(ev.playerIds || []).map((id) => playerById.get(id)).filter(Boolean).map((p) => (
                          <span key={p.id} style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                        ))}
                        <span>{ev.location} · {formatDate(ev.year, ev.dayOfYear, tl.calType)}</span>
                      </div>
                    </div>
                  ))}
              </div>,
              appRef.current,
            )}
          </div>

          {user && (
            <div className="vt" title="Personal (local) or campaign (shared) timelines">
              <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>Personal</button>
              <button className={mode === 'campaign' ? 'active' : ''} onClick={() => setMode('campaign')}>Campaign</button>
            </div>
          )}

          <div className="vt">
            <button className={tl.ui.view === 'graph' ? 'active' : ''} onClick={() => tl.setView('graph')}>Timeline</button>
            <button className={tl.ui.view === 'table' ? 'active' : ''} onClick={() => tl.setView('table')}>Table</button>
          </div>

          <div className="zoom-row" style={{ marginLeft: 'auto' }}>
            <span>Zoom</span>
            <input type="range" min={0} max={100} value={ppdToSlider(tl.ppd)} onChange={(e) => tl.setPpd(sliderToPPD(+e.target.value))} aria-label="Zoom" />
            <span className="zoom-lbl">{granLabel(tl.ppd)}</span>
            <button className="btn sm" title="Fit all" onClick={fit}>⊡</button>
            <button
              className="btn sm"
              title={tl.db.todayAbs == null
                ? 'No Today marker set — set one in Manage Campaigns'
                : 'Go to Today'}
              disabled={tl.db.todayAbs == null}
              onClick={() => canvasRef.current?.scrollToToday()}
            >
              📅
            </button>
          </div>
        </div>

        {mode === 'campaign' && <PrivSelBar tl={campaignTl} />}

        {/* Body */}
        <div className="app-body">
          {isCombined ? (
            <CombinedLegend tree={campaignTl.tree} hiddenTimelines={campaignTl.hiddenTimelines} onToggle={campaignTl.toggleTimeline} />
          ) : (
            <Sidebar
              tl={tl}
              onOpenModal={openModal}
              onScrollToEvent={jumpToEvent}
              hideProfileBar={mode === 'campaign'}
              readOnlyActors={!!tl.readOnlyActors}
              readOnlyToday={!!tl.readOnlyToday}
            />
          )}

          {!canRender ? (
            <div className="tl-area" id="tl-area">
              <div className="es" style={{ display: 'flex' }}>
                <div className="g">📜</div>
                {mode === 'campaign'
                  ? (
                    <>
                      <p>{campaignTl.status || 'Select a campaign, player and timeline above.'}</p>
                      {campaignTl.privPlayerId && (
                        <button className="btn gld" style={{ marginTop: 10 }} onClick={() => { const n = window.prompt('New timeline name:'); if (n && n.trim()) campaignTl.createTimeline(n.trim()); }}>＋ Create your first timeline</button>
                      )}
                    </>
                  )
                  : (
                    <>
                      <p>No timeline yet.</p>
                      <button className="btn gld" style={{ marginTop: 10 }} onClick={() => openModal('new-profile')}>＋ Create your first timeline</button>
                    </>
                  )}
              </div>
            </div>
          ) : tl.ui.view === 'table' ? (
            <TableView
              tl={tl}
              readOnly={isCombined}
              onEdit={(id) => openModal('view-event', tl.db.events.find((e) => e.id === id))}
              onDelete={(id) => { if (window.confirm('Delete this event?')) tl.deleteEvent(id); }}
            />
          ) : (
            <TimelineCanvas ref={canvasRef} tl={tl} onEventClick={isCombined ? undefined : onEventClick} readOnly={isCombined} />
          )}
        </div>
      </div>

      <TimelineModals modal={modal} onClose={closeModal} onOpen={openModal} tl={tl} />
    </>
  );
}
