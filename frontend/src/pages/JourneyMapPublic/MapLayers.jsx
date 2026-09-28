/**
 * pages/JourneyMapPublic/MapLayers.jsx
 *
 * The three SVG layers drawn inside <MapStage>, in back-to-front order:
 * paths → regions → pins (matching the legacy pathsG/regionsG/pinsG stacking).
 *
 * Each layer is presentational: it receives data + the natural image size and
 * reports clicks/hovers upward. Selection and tooltip state live in the page.
 */

import { useState } from 'react';

import { pctToSvg, parseWaypoints, resolveWaypoints, isRegion, sameId, computePathDistance, roadDistance, buildRoadPath } from '@/components/map/geometry';
import { PinIcon, pinSize, pinLabelStyle, effectivePinImage } from '@/components/map/pinIcons';
import { MapLabel } from '@/components/map/MapLabel';

const ROUTE_STYLE = {
  road:     { color: '#9a8c6a', dash: undefined },
  flight:   { color: '#6aa3d8', dash: '2 7' },
  maritime: { color: '#3f9e9e', dash: '7 5' },
};

/** Polygon "regions" with a centered label. */
export function Regions({ locations, iw, ih, selLoc, onSelect, onHover, onLeave }) {
  return locations.filter(isRegion).map((loc) => {
    const points = loc.polygon.map((p) => { const s = pctToSvg(p.x, p.y, iw, ih); return `${s.x},${s.y}`; }).join(' ');
    const c = pctToSvg(loc.x, loc.y, iw, ih);
    return (
      <g
        key={loc.id}
        className={`jm-region${sameId(loc.id, selLoc) ? ' sel' : ''}`}
        onClick={() => onSelect(loc.id)}
        onMouseEnter={(e) => onHover(loc, e)}
        onMouseLeave={onLeave}
      >
        <polygon className="jm-region-poly" points={points} />
        <MapLabel x={c.x} y={c.y} text={loc.name} fontSize={11} />
      </g>
    );
  });
}

/** Point "pins" rendered as a type icon + label below. */
export function Pins({ locations, typeImages, iw, ih, selLoc, onSelect, onHover, onLeave }) {
  const [hoverId, setHoverId] = useState(null); // labels hidden except big/huge → show on hover
  return locations.filter((l) => !isRegion(l)).map((loc) => {
    const { x, y } = pctToSvg(loc.x, loc.y, iw, ih);
    const sel = sameId(loc.id, selLoc);
    const fmt = pinLabelStyle(loc.size_type);
    const labelY = y + pinSize(loc.icon_scale) / 2 + 6 + fmt.fontSize;
    const showLabel = !!fmt.upper || sameId(hoverId, loc.id);
    return (
      <g
        key={loc.id}
        className={`jm-pin${sel ? ' sel' : ''}`}
        onClick={() => onSelect(loc.id)}
        onMouseEnter={(e) => { onHover(loc, e); setHoverId(loc.id); }}
        onMouseLeave={(e) => { onLeave(e); setHoverId((h) => (sameId(h, loc.id) ? null : h)); }}
      >
        <PinIcon x={x} y={y} sizeType={loc.size_type} scale={loc.icon_scale} selected={sel} imageUrl={effectivePinImage(loc, typeImages)} />
        {showLabel && (
          <MapLabel
            x={x} y={labelY} text={loc.name}
            fontSize={fmt.fontSize} fontWeight={fmt.fontWeight}
            fontStyle={fmt.fontStyle} letterSpacing={fmt.letterSpacing}
            uppercase={!!fmt.upper}
          />
        )}
      </g>
    );
  });
}

/** Directed polylines between waypoints, with an optional distance label. */
export function Paths({ paths, iw, ih, selPath, distances, locations, onSelect }) {
  return paths.map((p) => {
    // Roads are sent for distance calculation only — never drawn on the public map.
    if (p.kind === 'route') return null;
    const wpts = resolveWaypoints(parseWaypoints(p), locations);
    if (wpts.length < 2) return null;
    const isRoute = p.kind === 'route';
    const style = ROUTE_STYLE[p.route_type] || ROUTE_STYLE.road;
    const color = isRoute ? style.color : (p.tracker_color || '#c9a84c');
    const sel = sameId(p.id, selPath);
    const road = buildRoadPath(wpts, iw, ih);
    const mid = wpts[Math.floor(wpts.length / 2)];
    const ms = pctToSvg(mid.x, mid.y, iw, ih);
    const dist = isRoute ? roadDistance(wpts) : computePathDistance(wpts, distances);
    return (
      // `color` drives the arrowhead marker (fill="currentColor").
      <g key={p.id} style={{ color }}>
        <path
          d={road.d}
          onClick={() => onSelect(p.id)}
          fill="none"
          stroke={color}
          strokeWidth={sel ? 3.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isRoute ? style.dash : undefined}
          opacity={isRoute ? (sel ? 1 : 0.85) : (sel ? 1 : 0.72)}
          markerEnd={isRoute ? undefined : 'url(#jm-arrowhead)'}
          style={{ cursor: 'pointer' }}
        />
        {dist.complete && dist.miles ? (
          <text className="jm-dist-label" x={ms.x} y={ms.y - 10}>{dist.miles}mi</text>
        ) : null}
      </g>
    );
  });
}
