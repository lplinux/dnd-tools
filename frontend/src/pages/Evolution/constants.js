/**
 * pages/Evolution/constants.js
 *
 * The three kinds of note and the four states, named once.
 *
 * "What the party has revealed" is deliberately NOT one of them: it is a
 * record of what happened rather than a way a character grows, so it lives
 * in the Campaign Journal as a DM-only entry under its own category.
 *
 * Both lists mirror the CHECK constraints in app.js. They are duplicated
 * rather than fetched because they are part of the UI's own vocabulary —
 * the labels and the ordering are a design decision, not data.
 */

export const CATEGORIES = [
  {
    id: 'path',
    label: '🌱 Learning paths',
    hint: 'What they can learn or earn, and what it costs.',
    addLabel: '+ Add a path',
  },
  {
    id: 'teacher',
    label: '🎓 Teachers',
    hint: 'Who would teach them. Link the NPC with [[their name]].',
    addLabel: '+ Add a teacher',
  },
  {
    // Not "spells": it holds features, gifts and anything else written for
    // this character, and the narrower name was steering what went in it.
    id: 'homebrew',
    label: '✨ Homebrew',
    hint: 'Anything written for this character — a spell, a feature, a gift.',
    addLabel: '+ Add something homebrew',
  },
];

/**
 * Four states, in the order a note travels through them.
 *
 * `idea` is the default and the one the DM's own notes use most — half of
 * them read "Details TBD". It exists so a half-formed thought has somewhere
 * to live that is visibly not ready.
 */
export const STATES = [
  { id: 'idea',        label: 'Idea',    icon: '○', cls: 'border-border text-text-muted' },
  { id: 'open',        label: 'Open',    icon: '◆', cls: 'border-[var(--gold-dim)] text-gold' },
  { id: 'in-progress', label: 'Running', icon: '◐', cls: 'border-[var(--gold)] text-gold' },
  { id: 'done',        label: 'Done',    icon: '✓', cls: 'border-border text-text-muted' },
];

export const stateOf = (id) => STATES.find((s) => s.id === id) ?? STATES[0];

/** Flat rows → a tree, preserving the order the server sent. */
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

/**
 * The tree for one character and one category.
 *
 * `playerId` is compared loosely against null so "the party" (player_id
 * NULL) selects correctly; everything else is an id.
 */
export const treeFor = (items, playerId, category) =>
  nest((items ?? []).filter((i) => i.category === category
    && (playerId == null ? i.player_id == null : String(i.player_id) === String(playerId))));

/** Cards in a tree, including children — for the heading count. */
export function countTree(tree) {
  let n = 0;
  for (const t of tree ?? []) n += 1 + countTree(t.children);
  return n;
}
