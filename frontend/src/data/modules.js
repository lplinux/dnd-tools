/**
 * data/modules.js
 *
 * Every module the app has, and the group it is filed under. One list for
 * the home page and the header's Tools menu, so the two cannot disagree
 * about what exists or who may open it.
 *
 * Keep in sync with the route declarations in App.jsx — `access` here only
 * decides what is SHOWN; the routes and the server do the refusing.
 */

/**
 * Grouped by who the tool is for, not by what it does. A DM looking for the
 * session prep and a player looking for their sheet should each find their
 * own corner first, and the free tools last.
 */
export const GROUPS = [
  { id: 'dm',      title: 'DM tools',     blurb: 'Running the campaign. Players never see these.' },
  { id: 'players', title: 'Player tools', blurb: 'What the table uses. As the DM you see every character.' },
  { id: 'public',  title: 'Public tools', blurb: 'Free to use, no login needed.' },
  { id: 'admin',   title: 'Admin',        blurb: 'Accounts and roles.' },
];

export const MODULES = [
  // ── DM ──
  {
    key: 'campaigns',
    group: 'dm',
    icon: '🏰',
    title: 'Manage Campaigns',
    desc: 'Players, NPCs, locations, session prep, the backlog, the journal and the rest of a campaign.',
    url: '/manage-campaigns',
    access: ['dm'],
    docs: 'manage-campaigns',
  },
  {
    key: 'diary',
    group: 'dm',
    icon: '📔',
    title: 'Campaign Diary',
    desc: "Session write-ups, shareable by link once published, plus every player's private diary.",
    url: '/diary',
    access: ['dm'],
    docs: 'diary',
  },
  {
    key: 'journeymap',
    group: 'dm',
    icon: '🗺️',
    title: 'Journey Path Map',
    desc: 'Draw party routes on a map. Track groups, set distances and see travel times.',
    url: '/journey-map',
    access: ['dm'],
    docs: 'journey-map',
  },
  {
    key: 'pdf',
    group: 'dm',
    icon: '📖',
    title: 'PDF Viewer',
    desc: 'Rulebooks and references, with fullscreen support.',
    url: '/pdf-viewer',
    access: ['dm'],
    docs: 'pdf-viewer',
  },
  {
    key: 'dmtips',
    group: 'dm',
    icon: '💡',
    title: 'DM Tips',
    desc: 'What goes where — Sessions, Diary, Journal, Timeline — and what each module is good for.',
    url: '/dm-tips',
    access: ['dm'],
    // No README: the page IS the documentation.
    docs: null,
  },

  // ── Players ──
  {
    key: 'pcsheet',
    group: 'players',
    icon: '🧝',
    title: 'PC Character Sheet',
    desc: 'Your character — story, stats, inventory, diary and the shared journal.',
    url: '/pc-sheet',
    access: ['dm', 'player'],
    docs: 'pc-sheet',
  },
  {
    key: 'timeline',
    group: 'players',
    icon: '📜',
    title: 'Timeline',
    desc: 'Campaign events across the in-world calendar.',
    url: '/timeline',
    access: ['dm', 'player'],
    docs: 'timeline',
  },

  // ── Public ──
  {
    key: 'npc',
    group: 'public',
    icon: '🧙',
    title: 'NPC Sheet',
    desc: 'D&D 5e stat blocks with automatic ability modifiers.',
    url: '/npc-sheet',
    access: 'public',
    docs: 'npc-sheet',
  },
  {
    key: 'items',
    group: 'public',
    icon: '🗡️',
    title: 'Item Cards',
    desc: 'Magic item cards with rarities and special abilities.',
    url: '/item-cards',
    access: 'public',
    docs: 'item-cards',
  },
  {
    key: 'split',
    group: 'public',
    icon: '🪟',
    title: 'Split View',
    desc: 'Several tools side by side, in a layout of your choosing.',
    url: '/split-view',
    access: 'public',
    docs: 'split-view',
  },

  // ── Admin ──
  {
    key: 'userpanel',
    group: 'admin',
    icon: '⚙️',
    title: 'User Panel',
    desc: 'Manage users, roles and permissions.',
    url: '/user-panel',
    access: ['admin'],
    docs: 'user-panel',
  },
];

/** True if the module is shown to this user (null = a guest). */
export function canAccess(mod, user) {
  if (mod.access === 'public') return true;
  if (!user) return false;
  return mod.access.includes(user.role);
}

/**
 * The groups this user has anything in, each with its visible modules, in
 * GROUPS order — so a DM sees their own tools first and a guest sees only
 * the public ones.
 */
export function groupsFor(user) {
  return GROUPS
    .map((g) => ({ ...g, modules: MODULES.filter((m) => m.group === g.id && canAccess(m, user)) }))
    .filter((g) => g.modules.length > 0);
}
