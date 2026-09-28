/**
 * pages/Timeline/TimelineCanvas.jsx
 *
 * The SVG-Gantt timeline canvas — idiomatic React port of renderTimeline() and
 * its interactions:
 *   - three coordinated SVGs (location header / date axis / body)
 *   - hover: cursor-following tooltip + dim non-related players' lines & circles
 *   - drag an event circle to reschedule (ghost + target-column highlight)
 *   - double-click empty space to zoom 2× keeping the clicked row stable
 *   - imperative scrollToEvent(id) (used by search jump) with a flash highlight
 *
 * Layout math from layout.js; colours resolve from the active theme.
 */

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { absDay, fromAbsDay, formatDate, formatDuration, gregDaysInYear } from '@/data/calendar';
import {
  buildSegments, segTotalH, dayY, yToAbsDay, buildDateMarks, SIDE_W, HEADER_H, R, GSPC, MAX_PPD,
} from './layout';
import { darken, WrappedText, PieSlices } from './svgUtils';

const CVARS = ['--surface', '--border', '--border2', '--gold', '--gold-dim', '--special-bg', '--special-fg', '--text', '--text-dim', '--text-muted', '--bg', '--today', '--today-bg'];
const FALLBACK = {
  '--surface': '#1e1810', '--border': '#3d3220', '--border2': '#554428', '--gold': '#c9a84c',
  '--gold-dim': '#7a6030', '--special-bg': '#1f1800', '--special-fg': '#f0d060', '--text': '#e8dcc0',
  '--text-dim': '#a09070', '--text-muted': '#6a5a40', '--bg': '#13100b', '--today': '#ffffff', '--today-bg': 'rgba(255,255,255,0.07)',
};
const pidKey = (ev) => (ev.playerIds || []).slice().sort().join(',');

const TimelineCanvas = forwardRef(function TimelineCanvas({ tl, onEventClick, readOnly = false }, ref) {
  const { db, calType, ppd, visibleLocs, displayedLocs, hiddenPlayers, soloPlayerId } = tl;
  const { theme } = useTheme();
  const events = db.events;
  const players = db.players;
  const todayAbs = db.todayAbs;

  const areaRef = useRef(null);
  const bodyRef = useRef(null);
  const liRef = useRef(null);
  const diRef = useRef(null);
  const [areaW, setAreaW] = useState(0);

  // Interaction state
  const dragRef = useRef(null); // { evId, startX, startY, hasMoved }
  const [ghost, setGhost] = useState(null); // { x, y, colX, colW }
  const [hover, setHover] = useState(null); // { ev, x, y }
  const [flashId, setFlashId] = useState(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const update = () => setAreaW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const C = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const v of CVARS) out[v] = cs.getPropertyValue(v).trim() || FALLBACK[v];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const col = (v) => C[v];

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const getPlayers = (ev) => (ev.playerIds || []).map((id) => playerById.get(id)).filter(Boolean);
  // Effective hidden set: when a player is "soloed", hide everyone else; otherwise use
  // the per-player eye toggles. Solo overrides while active.
  const effHidden = useMemo(
    () => (soloPlayerId != null ? new Set(players.filter((p) => p.id !== soloPlayerId).map((p) => p.id)) : hiddenPlayers),
    [soloPlayerId, players, hiddenPlayers],
  );
  const visPlayers = players.filter((p) => !effHidden.has(p.id));

  const dispLocs = useMemo(() => {
    const withEvents = new Set(events.map((e) => e.location));
    let d = visibleLocs.filter((l) => withEvents.has(l));
    if (!d.length) d = visibleLocs.length ? visibleLocs : displayedLocs;
    return d;
  }, [events, visibleLocs, displayedLocs]);

  const segments = useMemo(() => buildSegments(events, ppd, calType), [events, ppd, calType]);
  const totalH = Math.max(1, segTotalH(segments, ppd));
  const marks = useMemo(() => buildDateMarks(segments, ppd, calType), [segments, ppd, calType]);

  const dynCOL = Math.max(90, Math.floor((areaW - SIDE_W - 2) / Math.max(1, dispLocs.length)));
  const totalW = Math.max(1, dispLocs.length * dynCOL);

  const geo = useMemo(() => {
    const slotMap = {};
    events.forEach((ev) => {
      if (!dispLocs.includes(ev.location)) return;
      const pls = getPlayers(ev).filter((p) => !effHidden.has(p.id));
      if (!pls.length) return;
      const dk = `${absDay(ev.year, ev.dayOfYear, calType)}__${ev.location}`;
      if (!slotMap[dk]) slotMap[dk] = {};
      const pk = pidKey(ev);
      if (!(pk in slotMap[dk])) slotMap[dk][pk] = Object.keys(slotMap[dk]).length;
    });
    const evSlot = (ev) => {
      const dk = `${absDay(ev.year, ev.dayOfYear, calType)}__${ev.location}`;
      const slots = slotMap[dk] || {};
      return { slot: slots[pidKey(ev)] ?? 0, n: Object.keys(slots).length };
    };
    const evCX = (ev) => {
      const { slot, n } = evSlot(ev);
      return dispLocs.indexOf(ev.location) * dynCOL + dynCOL / 2 + (slot - (n - 1) / 2) * GSPC;
    };
    const evStartY = (ev) => dayY(absDay(ev.year, ev.dayOfYear, calType), segments, ppd);
    const evEndY = (ev) => {
      const dur = ev.durationDays || 1;
      if (dur <= 1) return evStartY(ev);
      const startAbs = absDay(ev.year, ev.dayOfYear, calType);
      const endAbs = startAbs + dur - 1;
      for (let si = segments.length - 1; si >= 0; si--) {
        const s = segments[si];
        if (endAbs < s.minA || startAbs > s.maxA) continue;
        return s.yStart + (Math.min(endAbs, s.maxA) - s.minA) * ppd + ppd / 2;
      }
      return evStartY(ev);
    };
    const evBarY = (ev, atAbs) => {
      for (const s of segments) {
        if (atAbs >= s.minA && atAbs <= s.maxA) return s.yStart + (atAbs - s.minA) * ppd + ppd / 2;
      }
      return evStartY(ev);
    };
    return { evCX, evStartY, evEndY, evBarY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, dispLocs, dynCOL, segments, ppd, calType, effHidden, playerById]);

  const syncScroll = () => {
    const b = bodyRef.current;
    if (liRef.current) liRef.current.style.transform = `translateX(-${b.scrollLeft}px)`;
    if (diRef.current) diRef.current.style.transform = `translateY(-${b.scrollTop}px)`;
  };

  // ── Imperative scroll-to-event (used by search jump) ──
  useImperativeHandle(ref, () => ({
    scrollToEvent(id) {
      const ev = events.find((e) => e.id === id);
      const body = bodyRef.current;
      if (!ev || !body) return;
      const targetY = dayY(absDay(ev.year, ev.dayOfYear, calType), segments, ppd);
      body.scrollTo({ top: Math.max(0, targetY - body.clientHeight / 2), behavior: 'smooth' });
      setTimeout(() => {
        setFlashId(id);
        setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2100);
      }, 400);
    },

    // Centre the Today marker. Same mechanics as scrollToEvent, minus the flash
    // — there is no row to highlight, the marker is drawn across the whole width.
    scrollToToday() {
      const body = bodyRef.current;
      if (todayAbs == null || !body) return false;
      const targetY = dayY(todayAbs, segments, ppd);
      body.scrollTo({ top: Math.max(0, targetY - body.clientHeight / 2), behavior: 'smooth' });
      return true;
    },
  }), [events, segments, ppd, calType, todayAbs]);

  // ── Drag-to-reschedule ──
  function onCircleDown(ev, e) {
    if (readOnly || e.button !== 0) return;
    dragRef.current = { evId: ev.id, startX: e.clientX, startY: e.clientY, hasMoved: false };
    const onMove = (me) => {
      const d = dragRef.current;
      if (!d) return;
      if (Math.abs(me.clientX - d.startX) > 5 || Math.abs(me.clientY - d.startY) > 5) d.hasMoved = true;
      if (!d.hasMoved) return;
      setHover(null);
      const body = bodyRef.current;
      const r = body.getBoundingClientRect();
      const svgX = me.clientX - r.left + body.scrollLeft;
      const svgY = me.clientY - r.top + body.scrollTop;
      const locIdx = Math.max(0, Math.min(dispLocs.length - 1, Math.floor(svgX / dynCOL)));
      setGhost({ x: svgX, y: svgY, colX: locIdx * dynCOL, colW: dynCOL });
    };
    const onUp = (ue) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      if (!d || !d.hasMoved) return;
      const body = bodyRef.current;
      const r = body.getBoundingClientRect();
      const svgX = ue.clientX - r.left + body.scrollLeft;
      const svgY = ue.clientY - r.top + body.scrollTop;
      const locIdx = Math.max(0, Math.min(dispLocs.length - 1, Math.floor(svgX / dynCOL)));
      const newLocation = dispLocs[locIdx];
      let snapped = Math.max(0, yToAbsDay(svgY, segments, ppd));
      if (segments.length) {
        let best = Infinity;
        for (const s of segments) {
          const cl = Math.max(s.minA, Math.min(s.maxA, snapped));
          if (Math.abs(cl - snapped) < best) { best = Math.abs(cl - snapped); snapped = cl; }
        }
      }
      const { year, dayOfYear } = fromAbsDay(snapped, calType);
      const safeDoY = Math.max(1, Math.min(calType === 'harptos' ? 365 : gregDaysInYear(year), dayOfYear));
      if (newLocation) tl.updateEvent(d.evId, { year, dayOfYear: safeDoY, location: newLocation });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onCircleClick(ev) {
    if (readOnly || dragRef.current?.hasMoved) return;
    onEventClick?.(ev.id);
  }

  // ── Double-click empty space to zoom 2× ──
  function onBodyDblClick(e) {
    if (e.target.closest('.ev-g')) return;
    const body = bodyRef.current;
    const r = body.getBoundingClientRect();
    const clickY = e.clientY - r.top + body.scrollTop;
    const newPPD = Math.min(MAX_PPD, ppd * 2);
    if (newPPD === ppd) return;
    const ratio = newPPD / ppd;
    tl.setPpd(newPPD);
    setTimeout(() => { body.scrollTop = clickY * ratio - (e.clientY - r.top); }, 0);
  }

  // ── Hover dimming ──
  const hoverPids = hover ? new Set(hover.ev.playerIds || []) : null;
  const onEnter = (ev, e) => { if (!dragRef.current?.hasMoved) setHover({ ev, x: e.clientX, y: e.clientY }); };
  const onMoveTip = (e) => { setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)); };
  const onLeave = () => setHover(null);

  const empty = !db.locations.length || !players.length;
  if (empty) {
    return (
      <div className="tl-area" id="tl-area" ref={areaRef}>
        <div className="es" style={{ display: 'flex' }}>
          <div className="g">📜</div>
          <p>{!players.length ? 'Add players to begin.' : 'Add locations and events to begin.'}</p>
        </div>
      </div>
    );
  }

  // ── Location header ──
  const locHeader = dispLocs.map((l, i) => {
    const x = i * dynCOL;
    const cx = x + dynCOL / 2;
    return (
      <g key={l}>
        <rect x={x} y={0} width={dynCOL} height={HEADER_H} fill="none" stroke={col('--border')} strokeWidth={1} />
        <WrappedText cx={cx} centerY={HEADER_H / 2 - 4} text={l} maxChars={Math.max(6, Math.floor(dynCOL / 7.5))} fontSize={11} fill={col('--gold')} />
        <text x={cx} y={HEADER_H - 5} textAnchor="middle" fontFamily="Cinzel,serif" fontSize={8} fill={col('--text-muted')} opacity={0.35}>⠿</text>
      </g>
    );
  });

  // ── Gap markers ──
  const gaps = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const s1 = segments[i];
    const s2 = segments[i + 1];
    const gapY = s1.yStart + (s1.maxA - s1.minA + 1) * ppd;
    gaps.push({ gapY, gapH: s2.yStart - gapY, s1, s2 });
  }
  const lastSeg = segments[segments.length - 1];
  const markCutoff = lastSeg ? lastSeg.yStart + (lastSeg.maxA - lastSeg.minA + 1) * ppd - 1 : totalH;

  // ── Date axis ──
  const dateEls = [];
  gaps.forEach((g, i) => {
    const y1r = fromAbsDay(g.s1.maxA + 1, calType);
    const y2r = fromAbsDay(Math.max(g.s1.maxA + 1, g.s2.minA - 1), calType);
    const lbl = y1r.year === y2r.year ? `${y1r.year}` : `${y1r.year}–${y2r.year}`;
    dateEls.push(
      <g key={`gap${i}`}>
        <rect x={0} y={g.gapY} width={SIDE_W} height={g.gapH} fill="rgba(80,60,30,.25)" />
        <line x1={0} y1={g.gapY + g.gapH / 2} x2={SIDE_W} y2={g.gapY + g.gapH / 2} stroke={col('--gold-dim')} strokeWidth={1} strokeDasharray="4,3" />
        <text x={SIDE_W / 2} y={g.gapY + g.gapH / 2 + 5} textAnchor="middle" fontFamily="Cinzel,serif" fontSize={10} fill={col('--gold-dim')}>~ {lbl} ~</text>
      </g>,
    );
  });
  const seenYL = new Set();
  marks.forEach((m, idx) => {
    const y = dayY(m.a, segments, ppd);
    if (y < -80 || y > markCutoff) return;
    if (m.type === 'yearLabel') {
      if (seenYL.has(m.a)) return;
      seenYL.add(m.a);
      const ly = Math.max(16, y - ppd * 0.5);
      if (ly > markCutoff) return;
      dateEls.push(<text key={idx} x={5} y={ly} fontFamily="Cinzel,serif" fontSize={15} fill={col('--gold')} fontWeight={700} stroke={col('--bg')} strokeWidth={3.5} paintOrder="stroke">{m.label}</text>);
    } else if (m.type === 'special') {
      const h = Math.max(ppd, 2);
      dateEls.push(<g key={idx}><rect x={0} y={y - h / 2} width={SIDE_W} height={h} fill={col('--special-bg')} opacity={0.9} /><line x1={0} y1={y - h / 2} x2={SIDE_W} y2={y - h / 2} stroke={col('--gold-dim')} strokeWidth={1.5} /><text x={SIDE_W - 5} y={y + 5} textAnchor="end" fontFamily="Cinzel,serif" fontSize={13} fill={col('--special-fg')} fontStyle="italic">{m.label}</text></g>);
    } else if (m.type === 'month') {
      dateEls.push(<g key={idx}><line x1={0} y1={y - ppd / 2} x2={SIDE_W} y2={y - ppd / 2} stroke={col('--border')} strokeWidth={1} /><text x={5} y={y + 5} fontFamily="Cinzel,serif" fontSize={13} fontWeight={600} fill={col('--text')} stroke={col('--bg')} strokeWidth={3} paintOrder="stroke">{m.label}</text></g>);
    } else if (m.type === 'year') {
      dateEls.push(<g key={idx}><line x1={0} y1={y} x2={SIDE_W} y2={y} stroke={col('--border')} strokeWidth={0.8} /><text x={5} y={y + 5} fontFamily="Cinzel,serif" fontSize={12} fill={col('--text-muted')} stroke={col('--bg')} strokeWidth={2.5} paintOrder="stroke">{m.label}</text></g>);
    } else if (m.type === 'decade' || m.type === 'century' || m.type === 'millennium') {
      const big = m.type === 'millennium';
      const med = m.type === 'century';
      dateEls.push(<g key={idx}><line x1={0} y1={y} x2={SIDE_W} y2={y} stroke={big ? col('--gold') : med ? col('--gold-dim') : col('--border2')} strokeWidth={big ? 2.5 : med ? 2 : 1.2} /><text x={5} y={y + 6} fontFamily="Cinzel,serif" fontSize={big ? 17 : med ? 15 : 14} fill={big ? col('--gold') : med ? col('--gold-dim') : col('--text-muted')} fontWeight={big || med ? 700 : 400}>{m.label}</text></g>);
    } else if (m.type === 'day') {
      dateEls.push(<text key={idx} x={SIDE_W - 5} y={y + 5} textAnchor="end" fontFamily="Cinzel,serif" fontSize={12} fill={col('--text-muted')} stroke={col('--bg')} strokeWidth={2.5} paintOrder="stroke">{m.label}</text>);
    }
  });
  if (todayAbs != null) {
    const rawTy = dayY(todayAbs, segments, ppd);
    const ty = Math.max(4, Math.min(totalH - 4, rawTy));
    if (rawTy >= 0 && rawTy <= totalH) {
      const td = fromAbsDay(todayAbs, calType);
      dateEls.push(
        <g key="td-axis">
          <rect x={0} y={ty - 12} width={SIDE_W} height={22} fill={col('--today-bg')} />
          <line x1={0} y1={ty} x2={SIDE_W} y2={ty} stroke={col('--today')} strokeWidth={2.5} />
          <text x={SIDE_W - 4} y={ty - 4} textAnchor="end" fontFamily="Cinzel,serif" fontSize={10} fill={col('--today')} fontWeight={700}>TODAY</text>
          <text x={4} y={ty + 14} fontFamily="Cinzel,serif" fontSize={9} fill={col('--today')} opacity={0.8}>{formatDate(td.year, td.dayOfYear, calType)}</text>
        </g>,
      );
    }
  }

  // ── Body grid ──
  const bgStripes = dispLocs.map((_, i) => {
    const x = i * dynCOL;
    return (
      <g key={`st${i}`}>
        {i % 2 === 1 && <rect x={x} y={0} width={dynCOL} height={totalH} fill="rgba(128,100,50,.03)" />}
        <line x1={x} y1={0} x2={x} y2={totalH} stroke={col('--border')} strokeWidth={0.5} opacity={0.6} />
      </g>
    );
  });
  const bodyGridEls = [];
  marks.forEach((m, idx) => {
    if (m.type === 'yearLabel' || m.type === 'day') return;
    const y = dayY(m.a, segments, ppd);
    if (y < 0 || y > markCutoff) return;
    if (m.type === 'special') {
      bodyGridEls.push(<g key={idx}><rect x={0} y={y - ppd / 2} width={totalW} height={Math.max(ppd, 2)} fill="rgba(200,160,20,.04)" /><line x1={0} y1={y - ppd / 2} x2={totalW} y2={y - ppd / 2} stroke={col('--gold-dim')} strokeWidth={0.8} opacity={0.4} /></g>);
    } else if (m.type === 'month' || m.type === 'year') {
      bodyGridEls.push(<line key={idx} x1={0} y1={y - ppd / 2} x2={totalW} y2={y - ppd / 2} stroke={col('--border')} strokeWidth={0.5} opacity={0.35} />);
    } else if (m.type === 'decade' || m.type === 'century' || m.type === 'millennium') {
      const big = m.type === 'millennium';
      bodyGridEls.push(<line key={idx} x1={0} y1={y} x2={totalW} y2={y} stroke={big ? col('--gold-dim') : col('--border2')} strokeWidth={big ? 1.2 : 0.7} opacity={0.5} />);
    }
  });
  const bodyToday = [];
  if (todayAbs != null) {
    const rawTy = dayY(todayAbs, segments, ppd);
    const ty = Math.max(4, Math.min(totalH - 4, rawTy));
    if (rawTy >= 0 && rawTy <= totalH) {
      const td = fromAbsDay(todayAbs, calType);
      bodyToday.push(
        <g key="td-body">
          <rect x={0} y={ty - 14} width={totalW} height={28} fill={col('--today-bg')} />
          <line x1={0} y1={ty} x2={totalW} y2={ty} stroke={col('--today')} strokeWidth={2.5} opacity={0.85} />
          <text x={8} y={ty - 5} fontFamily="Cinzel,serif" fontSize={11} fill={col('--today')} opacity={0.9} fontWeight={700}>TODAY · {formatDate(td.year, td.dayOfYear, calType)}</text>
        </g>,
      );
    }
  }

  // ── Duration bars ──
  const bars = [];
  events.forEach((ev) => {
    if (!dispLocs.includes(ev.location)) return;
    const pls = getPlayers(ev).filter((p) => !effHidden.has(p.id));
    if (!pls.length || (ev.durationDays || 1) <= 1) return;
    const startAbs = absDay(ev.year, ev.dayOfYear, calType);
    const endAbs = startAbs + ev.durationDays - 1;
    const cx = geo.evCX(ev);
    const barW = R * 1.4;
    const color = pls[0].color;
    segments.forEach((s, si) => {
      if (endAbs < s.minA || startAbs > s.maxA) return;
      const sy = s.yStart + (Math.max(startAbs, s.minA) - s.minA) * ppd + ppd / 2;
      const ey = s.yStart + (Math.min(endAbs, s.maxA) - s.minA) * ppd + ppd / 2;
      if (ey - sy >= 2) bars.push(<g key={`bar${ev.id}-${si}`}><rect x={cx - barW / 2} y={sy} width={barW} height={ey - sy} fill={color} opacity={0.18} rx={barW / 2} pointerEvents="none" /><line x1={cx} y1={sy + R} x2={cx} y2={ey} stroke={color} strokeWidth={2} opacity={0.28} pointerEvents="none" /></g>);
    });
  });

  // ── Connection lines ──
  const lines = [];
  const linePath = (cx1, y1, cx2, y2) => {
    if (Math.abs(cx1 - cx2) < 2) { const dir = y2 > y1 ? 1 : -1; return `M ${cx1},${y1 + dir * R} L ${cx2},${y2 - dir * R}`; }
    const my = (y1 + y2) / 2;
    return `M ${cx1},${y1} C ${cx1},${my} ${cx2},${my} ${cx2},${y2}`;
  };
  visPlayers.forEach((pl) => {
    const pEvs = events.filter((e) => (e.playerIds || []).includes(pl.id) && dispLocs.includes(e.location))
      .sort((a, b) => absDay(a.year, a.dayOfYear, calType) - absDay(b.year, b.dayOfYear, calType));
    const lineOpacity = hoverPids ? (hoverPids.has(pl.id) ? 0.85 : 0.05) : 0.5;
    for (let i = 0; i < pEvs.length - 1; i++) {
      const e1 = pEvs[i];
      const e2 = pEvs[i + 1];
      const e1End = absDay(e1.year, e1.dayOfYear, calType) + (e1.durationDays || 1) - 1;
      const e2Start = absDay(e2.year, e2.dayOfYear, calType);
      const cx1 = geo.evCX(e1);
      const cx2 = geo.evCX(e2);
      const y1 = e2Start <= e1End && e1.durationDays > 1 ? geo.evBarY(e1, e2Start) : geo.evEndY(e1);
      const y2 = geo.evStartY(e2);
      if (Math.abs(cx1 - cx2) < 2 && Math.abs(y2 - y1) < 2) continue;
      lines.push(<path key={`pl${pl.id}-${i}`} d={linePath(cx1, y1, cx2, y2)} stroke={pl.color} strokeWidth={2} fill="none" opacity={lineOpacity} strokeLinecap="round" />);
    }
  });
  events.forEach((e1) => {
    if (!(e1.manualLinks || []).length || !dispLocs.includes(e1.location)) return;
    const pls1 = getPlayers(e1).filter((p) => !effHidden.has(p.id));
    if (!pls1.length) return;
    e1.manualLinks.forEach((tid) => {
      const e2 = events.find((x) => x.id === tid);
      if (!e2 || !dispLocs.includes(e2.location)) return;
      if (!getPlayers(e2).filter((p) => !effHidden.has(p.id)).length) return;
      const e1Start = absDay(e1.year, e1.dayOfYear, calType);
      const e1End = e1Start + (e1.durationDays || 1) - 1;
      const e2Start = absDay(e2.year, e2.dayOfYear, calType);
      const e2End = e2Start + (e2.durationDays || 1) - 1;
      const y1 = e1.durationDays > 1 && e2Start >= e1Start && e2Start <= e1End ? geo.evBarY(e1, e2Start) : geo.evStartY(e1);
      const y2 = e2.durationDays > 1 && e1Start >= e2Start && e1Start <= e2End ? geo.evBarY(e2, e1Start) : geo.evStartY(e2);
      const cx1 = geo.evCX(e1);
      const cx2 = geo.evCX(e2);
      if (Math.abs(cx1 - cx2) < 2 && Math.abs(y2 - y1) < 2) return;
      lines.push(<path key={`ml${e1.id}-${tid}`} d={linePath(cx1, y1, cx2, y2)} stroke={pls1[0].color} strokeWidth={1.8} fill="none" opacity={0.55} strokeDasharray="6,4" strokeLinecap="round" />);
    });
  });

  // ── Event circles ──
  const endCircles = [];
  const startCircles = [];
  const drawn = new Set();
  events.forEach((ev) => {
    if (!dispLocs.includes(ev.location)) return;
    const pls = getPlayers(ev).filter((p) => !effHidden.has(p.id));
    if (!pls.length) return;
    const startAbs = absDay(ev.year, ev.dayOfYear, calType);
    const pk = pidKey(ev);
    const colors = pls.map((p) => p.color);
    const strokeC = darken(colors[0], 0.35);
    const dur = ev.durationDays || 1;
    const cx = geo.evCX(ev);
    const gOpacity = hoverPids ? (pls.some((p) => hoverPids.has(p.id)) ? 1 : 0.15) : 1;

    if (dur > 1) {
      const endAbs = startAbs + dur - 1;
      const key = `end__${endAbs}__${ev.location}__${pk}`;
      if (!drawn.has(key)) {
        drawn.add(key);
        const ey = geo.evEndY(ev);
        const Re = Math.round(R * 0.7);
        endCircles.push(
          <g key={key} className="ev-g" style={{ cursor: 'pointer', opacity: gOpacity }} onMouseDown={(e) => onCircleDown(ev, e)} onMouseEnter={(e) => onEnter(ev, e)} onMouseLeave={onLeave} onClick={() => onCircleClick(ev)}>
            <circle cx={cx} cy={ey} r={Re + 5} fill="transparent" />
            <PieSlices cx={cx} cy={ey} r={Re} colors={colors} strokeC={strokeC} />
            <circle cx={cx} cy={ey} r={Re} fill="none" stroke={strokeC} strokeWidth={1.5} />
          </g>,
        );
      }
    }

    const key = `${startAbs}__${ev.location}__${pk}`;
    if (!drawn.has(key)) {
      drawn.add(key);
      const cy = geo.evStartY(ev);
      const label = pls.length === 1
        ? (pls[0].name.replace(/^\p{Emoji}\s*/u, '').replace(/\s*\(.*\)$/, '').trim().slice(0, 2).toUpperCase() || '?')
        : `${pls.length}`;
      startCircles.push(
        <g key={key} className="ev-g" style={{ cursor: 'pointer', opacity: gOpacity }} onMouseDown={(e) => onCircleDown(ev, e)} onMouseEnter={(e) => onEnter(ev, e)} onMouseLeave={onLeave} onClick={() => onCircleClick(ev)}>
          <circle cx={cx} cy={cy} r={R + 6} fill="transparent" />
          <PieSlices cx={cx} cy={cy} r={R} colors={colors} strokeC={strokeC} />
          <circle className={`ev-ring${flashId === ev.id ? ' evfl' : ''}`} cx={cx} cy={cy} r={R} fill="none" stroke={flashId === ev.id ? 'white' : 'transparent'} strokeWidth={flashId === ev.id ? 3 : 2} />
          <text x={cx} y={cy + 4} textAnchor="middle" fontFamily="Cinzel,serif" fontSize={pls.length === 1 ? 10 : 11} fill="white" pointerEvents="none" fontWeight={600}>{label}</text>
          {dur > 1 && <text x={cx + R + 2} y={cy - R + 3} fontFamily="Cinzel,serif" fontSize={10} fill={col('--text-dim')} opacity={0.85} pointerEvents="none">{formatDuration(dur)}</text>}
        </g>,
      );
    }
  });

  return (
    <div className="tl-area" id="tl-area" ref={areaRef}>
      <div className="tl-corner">Date · Place</div>
      <div className="tl-lw" id="tl-lw">
        <div className="tl-li" id="tl-li" ref={liRef}>
          <svg className="svg-loc" width={totalW} height={HEADER_H}>
            <rect width={totalW} height={HEADER_H} fill={col('--surface')} />
            {locHeader}
          </svg>
        </div>
      </div>
      <div className="tl-dw">
        <div className="tl-di" id="tl-di" ref={diRef}>
          <svg className="svg-dates" width={SIDE_W} height={totalH}>
            <defs><clipPath id="tl-dc"><rect x={0} y={0} width={SIDE_W} height={markCutoff} /></clipPath></defs>
            <rect width={SIDE_W} height={totalH} fill={col('--surface')} />
            <g clipPath="url(#tl-dc)">{dateEls}</g>
          </svg>
        </div>
      </div>
      <div className="tl-body" id="tl-body" ref={bodyRef} onScroll={syncScroll} onMouseMove={hover ? onMoveTip : undefined} onDoubleClick={onBodyDblClick}>
        <svg className="svg-body" width={totalW} height={totalH}>
          <rect width={totalW} height={totalH} fill={col('--bg')} />
          {bars}
          {bgStripes}
          <line x1={totalW} y1={0} x2={totalW} y2={totalH} stroke={col('--border')} strokeWidth={0.5} opacity={0.6} />
          {gaps.map((g, i) => (
            <g key={`bgap${i}`}>
              <rect x={0} y={g.gapY} width={totalW} height={g.gapH} fill="rgba(80,60,30,.09)" />
              <line x1={0} y1={g.gapY + g.gapH / 2} x2={totalW} y2={g.gapY + g.gapH / 2} stroke={col('--gold-dim')} strokeWidth={0.8} strokeDasharray="8,5" opacity={0.35} />
            </g>
          ))}
          {bodyGridEls}
          {bodyToday}
          {lines}
          {endCircles}
          {startCircles}
          {ghost && (
            <>
              <rect className="col-drag-line" x={ghost.colX} y={0} width={ghost.colW} height={totalH} fill="rgba(200,180,60,.07)" stroke={col('--gold-dim')} strokeWidth={1} pointerEvents="none" />
              <circle className="drag-ghost-circle" cx={ghost.x} cy={ghost.y} r={R} fill="rgba(200,180,60,.5)" stroke="white" strokeWidth={2} strokeDasharray="4,2" pointerEvents="none" />
            </>
          )}
        </svg>
      </div>

      {hover && (
        <div
          id="tip"
          style={{
            // The stylesheet's `#tip { display: none }` is the resting state for the
            // legacy (non-React) markup; inline `display:block` overrides it so the
            // React-rendered tooltip actually shows on hover.
            display: 'block',
            position: 'fixed',
            left: Math.min(hover.x + 14, window.innerWidth - 260),
            top: Math.min(hover.y - 10, window.innerHeight - 120),
            zIndex: 600,
            pointerEvents: 'none',
          }}
        >
          <div className="tl"><b>{hover.ev.title}</b></div>
          <div className="tl">📍 {hover.ev.location}</div>
          <div className="tl">📅 {formatDate(hover.ev.year, hover.ev.dayOfYear, calType)}{hover.ev.durationDays > 1 ? ` → +${formatDuration(hover.ev.durationDays)}` : ''}</div>
          <div className="tl">👤 {getPlayers(hover.ev).length ? getPlayers(hover.ev).map((p, i) => <span key={p.id} style={{ color: p.color }}>{i ? ', ' : ''}{p.name}</span>) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
          {hover.ev.description?.trim() && <div className="td">{hover.ev.description}</div>}
        </div>
      )}
    </div>
  );
});

export default TimelineCanvas;
