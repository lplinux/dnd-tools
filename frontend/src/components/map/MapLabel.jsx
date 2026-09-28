/**
 * components/map/MapLabel.jsx
 *
 * A map name label drawn on a small parchment plate (rounded, aged-paper fill
 * with a brown border) so location and road names stay legible over busy map
 * art — replacing the old stroke-halo text. Shared by the editor and public map.
 *
 * `x, y` is the text baseline anchor (same convention as the SVG <text> it
 * replaces). Width is estimated from the text length (the font is a wide serif),
 * which is fine — the plate is padded, so a slight over-estimate just adds margin.
 */

const INK = '#3a2c14';       // dark parchment ink
const PAPER = '#e7dcc0';     // parchment fill
const EDGE = '#6f5a34';      // border

export function MapLabel({
  x, y, text,
  fontSize = 11, fontWeight, fontStyle, letterSpacing,
  uppercase = false, anchor = 'middle', ink = INK, onMouseDown,
}) {
  if (!text) return null;
  const label = uppercase ? String(text).toUpperCase() : String(text);
  const interactive = typeof onMouseDown === 'function';

  // Glyph advance is wider for spaced caps; pad generously so text never clips.
  const factor = uppercase ? 0.82 : 0.62;
  const padX = Math.max(5, fontSize * 0.55);
  const padY = Math.max(2, fontSize * 0.32);
  const ascent = fontSize * 0.74;
  const descent = fontSize * 0.22;

  const w = label.length * fontSize * factor + padX * 2;
  const h = ascent + descent + padY * 2;
  const rx = Math.min(h * 0.35, 6);
  const rectX = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const rectY = y - ascent - padY;

  return (
    <g style={{ pointerEvents: interactive ? undefined : 'none' }}>
      <rect x={rectX} y={rectY} width={w} height={h} rx={rx} ry={rx}
        fill={PAPER} stroke={EDGE} strokeWidth={1} opacity={0.94}
        onMouseDown={onMouseDown}
        style={interactive ? { cursor: 'move' } : undefined} />
      <rect x={rectX + 1.5} y={rectY + 1.5} width={w - 3} height={h - 3} rx={Math.max(0, rx - 1.5)} ry={Math.max(0, rx - 1.5)}
        fill="none" stroke={EDGE} strokeWidth={0.5} opacity={0.4} style={{ pointerEvents: 'none' }} />
      <text x={x} y={y} textAnchor={anchor} style={{ fontFamily: 'var(--fd)', fontSize, fontWeight, fontStyle, letterSpacing, fill: ink, stroke: 'none', pointerEvents: 'none' }}>
        {label}
      </text>
    </g>
  );
}
