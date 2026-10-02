/**
 * pages/Timeline/svgUtils.jsx
 *
 * Small SVG helpers for the timeline canvas, ported from the legacy renderer:
 *  - darken(): darken a hex colour by a fraction (for circle strokes)
 *  - <WrappedText>: word-wrapped centered SVG text (location headers)
 *  - <PieSlices>: a multi-colour pie/circle for shared events
 */

export function darken(hex, f) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const ch = (i) => Math.max(0, parseInt(c.slice(i, i + 2), 16) - Math.round(255 * f));
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

/** Word-wrapped, vertically-centered SVG text. Returns an array of <text>. */
export function WrappedText({ cx, centerY, text, maxChars, fontFamily = 'Cinzel,Georgia,serif', fontSize = 11, fill, letterSpacing = '0.5' }) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + (cur ? 1 : 0) > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const lineH = fontSize * 1.35;
  const y0 = centerY - ((lines.length - 1) * lineH) / 2;
  return lines.map((l, i) => (
    <text key={i} x={cx} y={y0 + i * lineH} textAnchor="middle" fontFamily={fontFamily} fontSize={fontSize} fill={fill} letterSpacing={letterSpacing}>
      {l}
    </text>
  ));
}

/** Pie (or single circle) filled with each player's colour, outlined by strokeC. */
export function PieSlices({ cx, cy, r, colors, strokeC }) {
  const n = colors.length;
  if (!n) return <circle cx={cx} cy={cy} r={r} fill="var(--border2)" stroke={strokeC} strokeWidth={2} />;
  if (n === 1) return <circle cx={cx} cy={cy} r={r} fill={colors[0]} stroke={strokeC} strokeWidth={2} />;
  const paths = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const lg = a1 - a0 > Math.PI ? 1 : 0;
    paths.push(<path key={i} d={`M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${lg} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`} fill={colors[i]} />);
  }
  return <>{paths}<circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeC} strokeWidth={2} /></>;
}
