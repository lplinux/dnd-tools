/**
 * pages/PcSheet/components/RelGraph.jsx
 *
 * SVG relationship graph — faithful port of renderRelGraph() from pc-sheet.html.
 *
 * Renders a zoomable/pannable SVG showing:
 *   - Family tree (tiered above/below the character node)
 *   - Social fan (fanned to the right)
 *   - Child-of-relationship nodes (orbiting their parent)
 *   - Legend
 *
 * Uses a foreignObject-based tooltip on hover.
 * Supports pan (drag) and zoom (wheel / buttons).
 * Clicking a node fires onNodeClick(relationship).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { arrangeAtExtremes } from '@/components/graph/ordering';

// ── Constants (match the vanilla version exactly) ─────────────────────────
const TH      = 88;
const NR      = 22;
const SR      = 30;
const HS      = 76;
const PAD     = 54;
const SOC_R   = 148;
const SOC_ANG = 62;
const CHILD_R = 68;

const FAMILY_TYPES = new Set(['Grandparent','Parent','Sibling','Child','Grandchild']);
const TIER_MAP     = { Grandparent:-2, Parent:-1, Sibling:0, Child:1, Grandchild:2 };

// ── Colour palettes ───────────────────────────────────────────────────────
const COL_DARK = {
  Grandparent:'#2e1a06',Parent:'#362206',Sibling:'#2c1e06',
  Child:'#1a2c08',Grandchild:'#162a06',
  Mentor:'#062c2c',Friend:'#062c1a',Ally:'#06202c',
  Rival:'#2c0628',Enemy:'#3c0808',Other:'#1a1a14',
};
const RING_DARK = {
  Grandparent:'#a06020',Parent:'#b07828',Sibling:'#887020',
  Child:'#5a8028',Grandchild:'#488020',
  Mentor:'#288888',Friend:'#288858',Ally:'#286898',
  Rival:'#885888',Enemy:'#a85050',Other:'#605840',
};
const TCOL_DARK = {
  Grandparent:'#e8c070',Parent:'#e8c070',Sibling:'#e0b860',
  Child:'#a0d858',Grandchild:'#90d050',
  Mentor:'#60d8d8',Friend:'#60d898',Ally:'#6098d8',
  Rival:'#d860d8',Enemy:'#d85868',Other:'#c0b888',
};
const COL_LIGHT  = {
  Grandparent:'#d8cba0',Parent:'#d4c898',Sibling:'#ccc090',
  Child:'#b8d0a0',Grandchild:'#a8cc90',
  Mentor:'#90c8c8',Friend:'#90c8a8',Ally:'#90a8c8',
  Rival:'#c898c8',Enemy:'#c89898',Other:'#c0b890',
};
const RING_LIGHT = {
  Grandparent:'#8b6010',Parent:'#a07018',Sibling:'#788010',
  Child:'#4a7018',Grandchild:'#387010',
  Mentor:'#187878',Friend:'#187848',Ally:'#185878',
  Rival:'#785078',Enemy:'#985040',Other:'#504830',
};
const TCOL_LIGHT = {
  Grandparent:'#4a3000',Parent:'#4a3800',Sibling:'#3a3000',
  Child:'#284800',Grandchild:'#204400',
  Mentor:'#005050',Friend:'#005030',Ally:'#003050',
  Rival:'#500050',Enemy:'#600010',Other:'#302810',
};

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Node SVG element generator ─────────────────────────────────────────────
function nodeEl({ r: rel, x, y }, COL, RING, TCOL, onHover, onLeave, onClick) {
  const rt   = rel.relation_type || 'Other';
  const lbl  = (rel.name || '?').length > 14 ? (rel.name || '?').slice(0,13) + '…' : (rel.name || '?');

  return (
    <g key={rel.id} style={{ cursor: 'pointer' }}
       onMouseEnter={e => onHover(rel, e)}
       onMouseLeave={onLeave}
       onClick={() => onClick(rel)}>
      <circle cx={x} cy={y} r={NR}
        fill={COL[rt] || COL.Other}
        stroke={RING[rt] || RING.Other}
        strokeWidth={1.8} />
      <text x={x} y={y + 4} textAnchor="middle"
        fill={TCOL[rt] || TCOL.Other}
        fontSize={8.5} fontFamily="Cinzel,Georgia,serif">
        {lbl}
      </text>
      <text x={x} y={y + NR + 12} textAnchor="middle"
        fill={TCOL[rt] || TCOL.Other}
        fontSize={8} fontFamily="Cinzel,Georgia,serif">
        {esc(rt)}
      </text>
    </g>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RelGraph({ relationships, crossConnections = [], playerId, charName, onEditRelation }) {
  const [vp,      setVp]      = useState({ scale: 1, ox: 0, oy: 0 });
  const [tooltip, setTooltip] = useState(null);  // { rel, x, y }
  const wrapRef  = useRef(null);
  const svgRef   = useRef(null);
  const boxRef   = useRef(null);              // the graph viewport box (for fit-to-size)
  const layoutRef = useRef({ VW: 1, VH: 1 }); // content bounds, updated each render
  const dragRef  = useRef(null);

  // ── Hooks must all run before the empty-state early return below ───────────
  // These three used to sit further down, after `if (!relationships.length)`.
  // React then saw 10 hooks on a populated graph and 7 on an empty one, so
  // deleting a character's last relationship — while a DM cross-connection kept
  // the component mounted — threw "Rendered fewer hooks than expected".
  // They only touch refs and setVp, never the layout computed below, so they
  // sit here quite happily.
  // Fit the whole graph to the current box size (so it fills the space; run on
  // mount, data change, and resize).
  const fit = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const { VW: vw, VH: vh } = layoutRef.current;
    if (!w || !h || !vw || !vh) return;
    const scale = Math.min(w / vw, h / vh) * 0.98;
    setVp({ scale, ox: (w - vw * scale) / 2, oy: (h - vh * scale) / 2 });
  }, []);

  useEffect(() => {
    fit();
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, relationships]);

  // Wheel-zoom via a native, non-passive listener so preventDefault() works
  // (React's onWheel is passive and warns "Unable to preventDefault…").
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      setVp((v) => ({
        scale: Math.max(0.3, Math.min(3, v.scale * f)),
        ox: e.offsetX - (e.offsetX - v.ox) * f,
        oy: e.offsetY - (e.offsetY - v.oy) * f,
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);


  const theme   = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = theme === 'light';
  const COL  = isLight ? COL_LIGHT  : COL_DARK;
  const RING = isLight ? RING_LIGHT : RING_DARK;
  const TCOL = isLight ? TCOL_LIGHT : TCOL_DARK;
  const cs   = getComputedStyle(document.documentElement);
  const get  = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  const C    = {
    gold:    get('--gold',    '#c9a84c'),
    goldDim: get('--gold-dim','#7a6030'),
    border:  get('--border',  '#3d3220'),
    border2: get('--border2', '#554428'),
    textDim: get('--text-dim','#a09070'),
    surface3:get('--surface3','#30281a'),
    bg:      get('--bg',      '#13100b'),
  };

  if (!relationships.length) {
    return (
      <p className="text-text-dim italic text-sm text-center py-6">
        No relations yet — add some above.
      </p>
    );
  }

  // ── Build node positions ──────────────────────────────────────────────────
  const family      = relationships.filter(r =>  FAMILY_TYPES.has(r.relation_type) && !r.parent_id);
  const famChildren = relationships.filter(r =>  FAMILY_TYPES.has(r.relation_type) &&  r.parent_id);
  const socialRaw   = relationships.filter(r => !FAMILY_TYPES.has(r.relation_type) && !r.parent_id);
  const socChildren = relationships.filter(r => !FAMILY_TYPES.has(r.relation_type) &&  r.parent_id);

  // How many child-of nodes orbit each relationship. Nodes with children need
  // the roomy fan/tier extremes so their orbits don't overlap neighbours.
  const childCount = {};
  [...famChildren, ...socChildren].forEach(r => {
    childCount[r.parent_id] = (childCount[r.parent_id] || 0) + 1;
  });
  const social = arrangeAtExtremes(socialRaw, r => childCount[r.id] || 0);

  // Family tiers
  const byTier = {};
  family.forEach(r => {
    const t = TIER_MAP[r.relation_type] ?? 0;
    if (!byTier[t]) byTier[t] = [];
    byTier[t].push(r);
  });
  const famNodes = [];
  Object.entries(byTier).forEach(([tierStr, nodes]) => {
    const t = parseInt(tierStr);
    if (t === 0) {
      nodes.forEach((r, i) => {
        famNodes.push({ r, x: (i % 2 === 0 ? -1 : 1) * (Math.floor(i/2) + 1) * HS, y: 0 });
      });
    } else {
      const ordered = arrangeAtExtremes(nodes, r => childCount[r.id] || 0);
      const sx = -(ordered.length - 1) * HS / 2;
      ordered.forEach((r, i) => famNodes.push({ r, x: sx + i * HS, y: t * TH }));
    }
  });

  // Social fan
  const famMaxAbsX = famNodes.length ? Math.max(...famNodes.map(p => Math.abs(p.x))) : 0;
  const famAnchorX = famMaxAbsX > 0 ? famMaxAbsX + NR + 28 : SR + 28;
  const socNodes   = [];
  if (social.length) {
    const halfAng = SOC_ANG * (Math.PI / 180);
    const n = social.length;
    const step = n === 1 ? 0 : (2 * halfAng) / (n - 1);
    // Grow the fan radius so adjacent nodes keep a minimum spacing (no stacking).
    const minArc = 2 * NR + 18;
    const socR = n > 1 ? Math.max(SOC_R, (minArc * (n - 1)) / (2 * halfAng)) : SOC_R;
    social.forEach((r, i) => {
      const angle = n === 1 ? 0 : -halfAng + i * step;
      socNodes.push({ r, x: famAnchorX + socR * Math.cos(angle), y: socR * Math.sin(angle) });
    });
  }

  // Children
  const tempPos = {};
  [...famNodes, ...socNodes].forEach(n => { tempPos[n.r.id] = { x: n.x, y: n.y }; });
  const childNodes = [];
  const byParent   = {};
  [...famChildren, ...socChildren].forEach(r => {
    if (!byParent[r.parent_id]) byParent[r.parent_id] = [];
    byParent[r.parent_id].push(r);
  });
  Object.entries(byParent).forEach(([pid, children]) => {
    const pp = tempPos[parseInt(pid)];
    if (!pp) return;
    const base = Math.atan2(pp.y, pp.x);
    const n = children.length;
    // Widen the arc with count (up to ~1.5π), then grow the orbit radius so adjacent
    // children keep a minimum chord spacing — prevents the "stack of nodes" overlap.
    const spread = n <= 1 ? 0 : Math.min(Math.PI * 1.5, (n - 1) * 0.5);
    const step = n <= 1 ? 0 : spread / (n - 1);
    const minChord = 2 * NR + 12;
    const childR = n <= 1 ? CHILD_R : Math.max(CHILD_R, minChord / (2 * Math.sin(step / 2)));
    children.forEach((r, i) => {
      const angle = n === 1 ? base : base - spread / 2 + i * step;
      childNodes.push({ r, x: pp.x + childR * Math.cos(angle), y: pp.y + childR * Math.sin(angle) });
    });
  });

  const allNodes = [...famNodes, ...socNodes, ...childNodes];

  // ── Cross-connections: external entities (NPCs / other players) linked to this
  //    character. Anchored to the self node (player link) or the relevant
  //    relationship node, laid out in a row below everything with dashed edges. ──
  const myRelIds = new Set(relationships.map(r => r.id));
  const isMine = (t, id) => (t === 'player' && Number(id) === Number(playerId)) || (t === 'relationship' && myRelIds.has(id));
  const posById = {};
  allNodes.forEach(n => { posById[n.r.id] = { x: n.x, y: n.y }; });
  const extName = (c, side) => {
    const t = c[`${side}_entity_type`];
    if (t === 'player') return c[`${side}_entity_player_name`] || 'Player';
    if (t === 'npc') return c[`${side}_npc_name`] || 'NPC';
    if (t === 'relationship') { const nm = c[`${side}_rel_name`]; return nm ? (myRelIds.has(c[`${side}_entity_id`]) ? nm : `${c[`${side}_player_name`] || '?'}: ${nm}`) : 'Rel'; }
    return '?';
  };
  const seenCx = new Set();
  const crossRaw = [];
  (crossConnections || []).forEach(c => {
    if (seenCx.has(c.id)) return;
    seenCx.add(c.id);
    const fromMine = isMine(c.from_entity_type, c.from_entity_id);
    const toMine = isMine(c.to_entity_type, c.to_entity_id);
    const mySide = (!fromMine && toMine) ? 'to' : 'from';
    const extSide = mySide === 'from' ? 'to' : 'from';
    const myType = c[`${mySide}_entity_type`];
    const myId = c[`${mySide}_entity_id`];
    const anchor = (myType === 'relationship' && posById[myId]) ? posById[myId] : { x: 0, y: 0 };
    crossRaw.push({ id: c.id, label: extName(c, extSide), extType: c[`${extSide}_entity_type`], connLabel: c.label, isDmOnly: !c.is_public, anchor });
  });
  const crossBaseY = (allNodes.length ? Math.max(0, ...allNodes.map(n => n.y)) : 0) + TH + 44;
  const crossW = 132;
  const crossTotal = crossW * Math.max(0, crossRaw.length - 1);
  const crossNodes = crossRaw.map((c, i) => ({ ...c, x: -crossTotal / 2 + i * crossW, y: crossBaseY }));

  const allX     = [0, ...allNodes.map(n => n.x), ...crossNodes.map(n => n.x)];
  const allY     = [0, ...allNodes.map(n => n.y), ...crossNodes.map(n => n.y)];
  const minX     = Math.min(...allX) - NR - PAD;
  const maxX     = Math.max(...allX) + NR + PAD;
  const minY     = Math.min(...allY) - SR - PAD;
  const maxY     = Math.max(...allY) + NR + PAD + 12;
  const VW       = maxX - minX;
  const VH       = maxY - minY;
  layoutRef.current = { VW, VH };

  // ── Edges ──────────────────────────────────────────────────────────────────
  function famEdge(n) {
    const { x, y, r } = n;
    if (r.parent_id) {
      const pp = tempPos[r.parent_id];
      if (!pp) return null;
      const x1 = pp.x, y1 = pp.y + NR, x2 = x, y2 = y - NR;
      const midY = (y1 + y2) / 2;
      return <path key={`fe-${r.id}`} d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
        fill="none" stroke={RING[r.relation_type] || RING.Other} strokeWidth={0.8} opacity={0.5} />;
    }
    const y2 = y + (y < 0 ? NR : -NR);
    return <line key={`fe-${r.id}`} x1={x} y1={0} x2={x} y2={y2}
      stroke={RING[r.relation_type] || RING.Other} strokeWidth={0.8} opacity={0.35} />;
  }

  function socEdge(n) {
    const { x, y, r } = n;
    if (r.parent_id) {
      const pp = tempPos[r.parent_id];
      if (!pp) return null;
      const cpx = (pp.x + x) / 2;
      return <path key={`se-${r.id}`} d={`M ${pp.x} ${pp.y} Q ${cpx} ${pp.y} ${x} ${y}`}
        fill="none" stroke={RING[r.relation_type] || RING.Other} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />;
    }
    const cpx = (0 + x) / 2;
    return <path key={`se-${r.id}`} d={`M 0 0 Q ${cpx} 0 ${x} ${y}`}
      fill="none" stroke={RING[r.relation_type] || RING.Other} strokeWidth={1} opacity={0.5} />;
  }

  // ── Self node label ────────────────────────────────────────────────────────
  const selfName = (charName || 'You').split(' ')[0].substring(0, 13);

  // ── Pan/zoom ───────────────────────────────────────────────────────────────
  function onMouseDown(e) {
    dragRef.current = { sx: e.clientX - vp.ox, sy: e.clientY - vp.oy };
  }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    setVp(v => ({ ...v, ox: e.clientX - dragRef.current.sx, oy: e.clientY - dragRef.current.sy }));
  }
  function onMouseUp() { dragRef.current = null; }

  // Print just the graph: clone the SVG, frame it to the content bounds (drop
  // pan/zoom), and open a print window. Colours are inline so it renders standalone.
  function printGraph() {
    const svg = svgRef.current;
    if (!svg) return;
    const { VW: vw, VH: vh } = layoutRef.current;
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    clone.setAttribute('width', String(vw));
    clone.setAttribute('height', String(vh));
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const outer = clone.querySelector('g');
    if (outer) outer.setAttribute('transform', ''); // remove pan/zoom; inner group frames content
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${(charName || 'Relationships')} — Graph</title><style>html,body{margin:0;background:#fff}svg{width:100vw;height:100vh}</style></head><body>${clone.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  const usedTypes = [...new Set(relationships.map(r => r.relation_type || 'Other'))];

  return (
    <div ref={wrapRef} className="flex flex-col gap-2">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs font-body" id="relLegend">
        {usedTypes.map(t => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block"
              style={{ background: RING[t] || RING.Other, border: `1px solid ${TCOL[t] || TCOL.Other}40` }} />
            <span style={{ color: TCOL[t] || TCOL.Other }}>{t}</span>
          </span>
        ))}
      </div>

      {/* SVG canvas — fills the available height */}
      <div
        ref={boxRef}
        className="rel-graph-box relative overflow-hidden rounded-sm"
        style={{ background: C.bg, border: `1px solid ${C.border}`, height: '70vh', minHeight: 360, cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{ display: 'block' }}
        >
          <g transform={`translate(${vp.ox || 0},${vp.oy || 0}) scale(${vp.scale || 1})`}>
            <g transform={`translate(${-minX},${-minY})`}>

              {/* Family tier bands */}
              {Object.entries(byTier).map(([tierStr, nodes]) => {
                const t   = parseInt(tierStr);
                if (t === 0) return null;
                const y   = t * TH;
                const xs  = famNodes.filter(n => n.y === y).map(n => n.x);
                if (xs.length < 2) return null;
                const hw  = (Math.max(...xs) - Math.min(...xs)) / 2 + NR + 12;
                return <rect key={`band-${t}`}
                  x={-hw} y={y - NR - 8} width={hw * 2} height={NR * 2 + 16}
                  rx={4} fill={isLight ? '#c8b890' : '#13100b'} opacity={0.2} />;
              })}

              {/* Divider between family and social */}
              {famNodes.length > 0 && socNodes.length > 0 && (
                <line x1={famAnchorX - 10} y1={minY + PAD / 2}
                  x2={famAnchorX - 10} y2={maxY - PAD / 2}
                  stroke={C.border2} strokeWidth={0.8} strokeDasharray="4 4" opacity={0.4} />
              )}

              {/* Section labels */}
              {famNodes.length > 0 && (
                <text x={0} y={Math.min(...famNodes.map(n => n.y)) - NR - 14}
                  textAnchor="middle" fill={C.border2}
                  fontSize={7.5} fontFamily="Cinzel,Georgia,serif" letterSpacing={2}>
                  FAMILY
                </text>
              )}
              {socNodes.length > 0 && (
                <text
                  x={socNodes.reduce((s,n) => s + n.x, 0) / socNodes.length}
                  y={Math.min(...socNodes.map(n => n.y)) - NR - 14}
                  textAnchor="middle" fill={C.border2}
                  fontSize={7.5} fontFamily="Cinzel,Georgia,serif" letterSpacing={2}>
                  CONNECTIONS
                </text>
              )}

              {/* Edges */}
              {famNodes.map(n => famEdge(n))}
              {childNodes.filter(n => FAMILY_TYPES.has(n.r.relation_type)).map(n => famEdge(n))}
              {socNodes.map(n => socEdge(n))}
              {childNodes.filter(n => !FAMILY_TYPES.has(n.r.relation_type)).map(n => socEdge(n))}

              {/* Nodes */}
              {allNodes.map(n => nodeEl(n, COL, RING, TCOL,
                (rel, e) => setTooltip({ rel, mx: e.clientX, my: e.clientY }),
                () => setTooltip(null),
                onEditRelation ?? (() => {}),
              ))}

              {/* Cross-connections: dashed edges + external nodes below the graph */}
              {crossNodes.length > 0 && (
                <text x={crossNodes.reduce((s, n) => s + n.x, 0) / crossNodes.length}
                  y={crossBaseY - NR - 14} textAnchor="middle" fill={C.border2}
                  fontSize={7.5} fontFamily="Cinzel,Georgia,serif" letterSpacing={2}>
                  CROSS-CONNECTIONS
                </text>
              )}
              {crossNodes.map(cn => {
                const col = cn.extType === 'npc' ? '#7ab050' : C.gold;
                const mx = (cn.anchor.x + cn.x) / 2;
                const my = (cn.anchor.y + cn.y) / 2;
                const nm = cn.label.length > 14 ? cn.label.slice(0, 13) + '…' : cn.label;
                return (
                  <g key={`cx-${cn.id}`}>
                    <line x1={cn.anchor.x} y1={cn.anchor.y} x2={cn.x} y2={cn.y}
                      stroke={col} strokeWidth={1} strokeDasharray="5 3" opacity={cn.isDmOnly ? 0.4 : 0.65} />
                    {cn.connLabel && (
                      <text x={mx} y={my - 3} textAnchor="middle" fill={C.textDim} fontSize={7} fontStyle="italic" fontFamily="Crimson Text,serif">
                        {cn.connLabel}
                      </text>
                    )}
                    <circle cx={cn.x} cy={cn.y} r={NR - 2}
                      fill={isLight ? '#e6dfca' : '#1c2740'} stroke={col} strokeWidth={1.6}
                      strokeDasharray={cn.isDmOnly ? '3 2' : undefined} />
                    <text x={cn.x} y={cn.y + 4} textAnchor="middle" fill={col} fontSize={8} fontFamily="Cinzel,Georgia,serif">{nm}</text>
                    <text x={cn.x} y={cn.y + NR + 10} textAnchor="middle" fill={C.border2} fontSize={7.5}>
                      {cn.extType === 'npc' ? '🧟 NPC' : cn.extType === 'player' ? '👤 Player' : '↳ Rel'}{cn.isDmOnly ? ' · 🔒' : ''}
                    </text>
                  </g>
                );
              })}

              {/* Self node */}
              <g style={{ cursor: 'default' }}>
                <circle cx={0} cy={0} r={SR}
                  fill={isLight ? '#c8a050' : '#4a3010'}
                  stroke={C.gold} strokeWidth={2.5} />
                <circle cx={0} cy={0} r={SR + 8}
                  fill="none" stroke={C.gold} strokeWidth={0.5} opacity={0.2} />
                <text x={0} y={4} textAnchor="middle"
                  fill={C.gold} fontSize={11} fontWeight="bold"
                  fontFamily="Cinzel,Georgia,serif"
                  style={{ paintOrder: 'stroke' }}
                  stroke={isLight ? '#c8a050' : '#4a3010'} strokeWidth={2.5}>
                  {selfName}
                </text>
              </g>
            </g>
          </g>
        </svg>

        {/* Zoom / fit / print controls */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {[
            ['+', 1.2],
            ['−', 0.8],
            ['⤢', 'fit'],
            ['🖨', 'print'],
          ].map(([label, action]) => (
            <button key={label}
              title={action === 'fit' ? 'Fit to view' : action === 'print' ? 'Print graph' : undefined}
              onClick={() => {
                if (action === 'print') printGraph();
                else if (action === 'fit') fit();
                else setVp(v => ({ ...v, scale: Math.max(0.3, Math.min(3, v.scale * action)) }));
              }}
              className="w-6 h-6 flex items-center justify-center rounded-sm text-xs"
              style={{ background: C.surface3, border: `1px solid ${C.border2}`, color: C.textDim }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.mx + 12, top: tooltip.my + 8,
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 2, padding: '5px 9px', fontSize: 11,
          fontFamily: 'var(--fb)', color: 'var(--text)',
          zIndex: 100, pointerEvents: 'none', maxWidth: 200,
          boxShadow: '0 2px 8px rgba(0,0,0,.5)',
        }}>
          <strong>{tooltip.rel.name}</strong>
          {tooltip.rel.status_label && <div style={{ color: 'var(--text-dim)' }}>{tooltip.rel.status_label}</div>}
          {tooltip.rel.is_dm_only && <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>🔒 DM only</div>}
          {onEditRelation && <div style={{ color: 'var(--gold)', fontSize: 10, marginTop: 2 }}>Click to edit</div>}
        </div>
      )}
    </div>
  );
}
