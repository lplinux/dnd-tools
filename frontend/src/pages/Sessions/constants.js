/**
 * pages/Sessions/constants.js
 *
 * The shape of a session's notes: which sections exist, in what order, and
 * what each is for. The prose matters — a DM opening an empty session should
 * be able to tell the four apart without being told.
 */

/**
 * In the order a session is actually used: read the recap aloud, do the prep,
 * run the beats, write up what happened.
 *
 * `ongoing` is NOT here. It is a view the server derives from earlier
 * sessions' items, not a section anything is stored in, so it has no "add"
 * button and is rendered separately.
 */
export const SECTIONS = [
  {
    id: 'recap',
    label: 'Where we left off',
    hint: 'The short version of last time, to read aloud when everyone sits down.',
    addLabel: 'Add a recap point',
  },
  {
    id: 'prep',
    label: 'Before it begins',
    hint: 'What you need ready before the session — statblocks, handouts, a map.',
    addLabel: 'Add something to prepare',
  },
  {
    id: 'beats',
    label: 'The session',
    hint: 'Things that could happen. Nothing here has to.',
    addLabel: 'Add a beat',
  },
  {
    id: 'outcome',
    label: 'What happened',
    hint: 'What actually happened, written during or after — the raw material for the diary.',
    addLabel: 'Add what happened',
  },
];

/**
 * The five states a card can be in.
 *
 * Ordered as a thing moves through them, so the picker reads as a lifecycle
 * rather than an alphabetical list. `skipped` sits with `done` at the end
 * because both mean "stop looking at this".
 */
export const STATES = [
  { id: 'in-preparation', label: 'In preparation', icon: '✎', cls: 'bg-surface3 border-border text-text-dim' },
  { id: 'ready',          label: 'Ready',          icon: '●', cls: 'bg-surface3 border-[var(--gold-dim)] text-gold' },
  { id: 'on-going',       label: 'On-going',       icon: '▶', cls: 'bg-[var(--gold-dim)] border-[var(--gold)] text-text' },
  { id: 'done',           label: 'Done',           icon: '✓', cls: 'bg-surface2 border-border text-text-muted' },
  { id: 'skipped',        label: 'Skipped',        icon: '—', cls: 'bg-surface2 border-border text-text-muted' },
];

export const stateOf = (id) => STATES.find((s) => s.id === id) ?? STATES[0];

/**
 * Flat rows → a tree, by parent_id.
 *
 * Pure, so it is tested without a DOM. Orphans — a row whose parent is not
 * in the list — are surfaced at the ROOT rather than dropped: losing a card
 * because its parent went missing is worse than showing it in the wrong
 * place, and the DM can at least see it to deal with it.
 */
export function nest(items) {
  const byId = new Map((items ?? []).map((i) => [i.id, { ...i, children: [] }]));
  const roots = [];
  for (const row of byId.values()) {
    const parent = row.parent_id != null ? byId.get(row.parent_id) : null;
    if (parent) parent.children.push(row);
    else roots.push(row);
  }
  return roots;
}

/** Everything in one section, nested. */
export const sectionTree = (items, section) =>
  nest((items ?? []).filter((i) => i.section === section));
