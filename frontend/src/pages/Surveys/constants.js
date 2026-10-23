/**
 * pages/Surveys/constants.js
 *
 * The vocabulary a survey is built from. Kept out of the panel so the
 * player's form and the DM's editor agree on what a polarity means without
 * importing each other.
 */

/**
 * Which direction is the good one — the DM's reading, never shown to the
 * player answering.
 *
 * It exists because a results view cannot otherwise be read at a glance. On
 * a 1-10 scale, 9 for railroading is bad news and 9 for "how involved does
 * your character feel" is good news, and the two sit in the same column.
 * `middle` is for the questions whose honest answer is neither end — "do I
 * describe too much or too little" is a complaint at 1 and at 10.
 */
export const POLARITIES = [
  { id: 'higher',  label: 'Higher is better', hint: 'more is good — involvement, enjoyment' },
  { id: 'lower',   label: 'Lower is better',  hint: 'less is good — railroading, confusion' },
  { id: 'middle',  label: 'Middle is best',   hint: 'both ends are a complaint — pacing, balance' },
  { id: 'neutral', label: 'No direction',     hint: 'just a number to watch' },
];

export const KINDS = [
  { id: 'scale', label: 'Scale' },
  { id: 'text',  label: 'Free text' },
];

/** A fresh question row in the editor. */
export const blankQuestion = () => ({
  id: null,
  prompt: '',
  kind: 'scale',
  scale_min: 1,
  scale_max: 10,
  low_label: '',
  high_label: '',
  polarity: 'neutral',
  allow_comment: true,
});

/**
 * Where a score sits against its question's polarity: 'good', 'bad' or null.
 *
 * Thresholds are proportions of the scale rather than fixed numbers, so a
 * 0-5 question reads the same way as a 1-10 one.
 */
export function toneOf(avg, q) {
  if (avg == null || !q || q.polarity === 'neutral') return null;
  const min = q.scale_min ?? 1;
  const max = q.scale_max ?? 10;
  if (max <= min) return null;
  const t = (Number(avg) - min) / (max - min);          // 0..1
  if (q.polarity === 'higher') return t >= 0.66 ? 'good' : t <= 0.33 ? 'bad' : null;
  if (q.polarity === 'lower')  return t <= 0.33 ? 'good' : t >= 0.66 ? 'bad' : null;
  // middle: good in the middle third, a complaint at either end.
  return t > 0.33 && t < 0.66 ? 'good' : 'bad';
}

/** The change between two runs, as a signed number, or null. */
export function deltaOf(now, before) {
  if (now == null || before == null) return null;
  return Math.round((Number(now) - Number(before)) * 100) / 100;
}
