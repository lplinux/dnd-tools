/**
 * pages/JourneyMapPublic/Tooltips.jsx
 *
 * Cursor-following tooltips and the hoverable event chip.
 *
 * FloatingTooltip positions a fixed-position panel next to the cursor and
 * flips it back toward the pointer when it would overflow the viewport — the
 * React equivalent of the legacy positionTooltip()/positionEvTooltip() logic,
 * but measuring its own height via a ref instead of reading offsetHeight off a
 * mutated DOM node.
 */

import { useLayoutEffect, useRef, useState } from 'react';

const PAD = 12;

function FloatingTooltip({ x, y, maxWidth, className, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x + PAD, top: y + PAD, ready: false });

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    let left = x + PAD;
    let top = y + PAD;
    if (left + maxWidth > window.innerWidth) left = x - maxWidth - PAD;
    if (top + h + 20 > window.innerHeight) top = y - h - PAD;
    setPos({ left, top, ready: true });
  }, [x, y, maxWidth]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        maxWidth,
        zIndex: 1000,
        pointerEvents: 'none',
        // Avoid a one-frame flash at the wrong spot before measuring.
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}

/** Tooltip shown when hovering a pin/region: name, type, description, events. */
export function PinTooltip({ tip, events }) {
  const { loc, linkedEvents, x, y } = tip;
  return (
    <FloatingTooltip
      x={x}
      y={y}
      maxWidth={240}
      className="font-display rounded bg-[#1a130a] border border-[#7a6030] px-[11px] py-2 shadow-[0_4px_18px_rgba(0,0,0,.7)]"
    >
      <div className="text-[13px] font-bold text-[#c9a84c] mb-1">📍 {loc.name}</div>
      {loc.size_type && (
        <div className="text-[10px] text-[#7a6a40] capitalize mb-1">{loc.size_type}</div>
      )}
      {loc.location_description && (
        <div className="text-[11px] text-[#a09070] leading-[1.45] mb-1">{loc.location_description}</div>
      )}
      {linkedEvents.length > 0 && (
        <div className="mt-[5px] border-t border-[#3a2e18] pt-[5px]">
          {linkedEvents.map((e) => {
            const ev = events?.[e.id];
            const dateStr = ev?.year && ev?.day_of_year ? ` · Yr ${ev.year} D${ev.day_of_year}` : '';
            return (
              <div key={e.id} className="text-[10px] text-[#80a858] leading-[1.4]">
                🗓 {e.title}{dateStr}
              </div>
            );
          })}
        </div>
      )}
    </FloatingTooltip>
  );
}

/** Tooltip shown when hovering a timeline-event chip. */
export function EventTooltip({ tip }) {
  const { ev, x, y } = tip;
  const dateStr = ev.year && ev.day_of_year ? `Year ${ev.year}, Day ${ev.day_of_year}` : null;
  return (
    <FloatingTooltip
      x={x}
      y={y}
      maxWidth={260}
      className="font-display rounded bg-[#141008] border border-[#4a6a30] px-3 py-[9px] shadow-[0_4px_20px_rgba(0,0,0,.8)]"
    >
      <div className="text-[12px] font-bold text-[#c9a84c] mb-[5px] leading-[1.3]">🗓 {ev.title}</div>
      {dateStr && <EvRow icon="📅" value={dateStr} />}
      {ev.location && <EvRow icon="📍" value={ev.location} />}
      {ev.player_name && <EvRow icon="⚔️" value={ev.player_name} />}
      {ev.description && (
        <div className="text-[10px] text-[#786858] leading-[1.45] mt-[5px] border-t border-[#2a2418] pt-[5px]">
          {ev.description}
        </div>
      )}
    </FloatingTooltip>
  );
}

function EvRow({ icon, value }) {
  return (
    <div className="flex gap-[6px] text-[10px] leading-[1.5] mb-[2px]">
      <span className="text-[#5a5a40] flex-shrink-0">{icon}</span>
      <span className="text-[#a09878]">{value}</span>
    </div>
  );
}

/**
 * A small hoverable event chip. Reports hover position upward so the page can
 * render the shared <EventTooltip>.
 */
export function EventChip({ event, onHover, onMove, onLeave }) {
  return (
    <span
      className="inline-flex items-center gap-[3px] text-[10px] text-[#80a858] bg-[rgba(80,120,50,.12)] hover:bg-[rgba(80,120,50,.22)] border border-[rgba(80,120,50,.3)] rounded-[3px] px-[6px] py-px mx-[2px] my-px cursor-default"
      onMouseEnter={(e) => onHover(event.id, e)}
      onMouseMove={(e) => onMove(event.id, e)}
      onMouseLeave={onLeave}
    >
      🗓 {event.title}
    </span>
  );
}
