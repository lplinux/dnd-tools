/**
 * test/sessionPrep.test.js
 *
 * Session prep — the DM's plan for one sitting.
 *
 * Two things here are load-bearing and neither is obvious from reading the
 * routes. The whole feature is DM-only, with no player-facing counterpart at
 * all, because it holds what the table must not know yet. And "On-Going" is
 * a VIEW over earlier sessions rather than a place anything is stored, so
 * there is exactly one copy of a thread and marking it done clears it
 * everywhere at once.
 *
 * Also exercised live against a scratch Postgres — 28 checks, including the
 * ordering the view depends on.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const route = (sig) => {
  const at = source.indexOf(sig);
  expect(at, `${sig} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
};

/** A top-level `async function` body, for logic shared by several routes. */
const fn = (name) => {
  const at = source.indexOf(`async function ${name}(`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n}\n', at));
};

/** Every session-prep route in the file. */
const ROUTES = [...source.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/campaigns\/:campaignId\/sessions[^']*)'/g)]
  .map((m) => [`app.${m[1]}('${m[2]}'`, `${m[1].toUpperCase()} ${m[2]}`]);

describe('the whole feature is the DM\'s', () => {
  it('found the routes', () => {
    // If the path shape ever changes, every assertion below silently stops
    // covering anything.
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(ROUTES)('%s is DM-only and ownership-checked', (sig) => {
    const body = route(sig);
    expect(body).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(body).toMatch(/await dmOwnsCampaign\(/);
  });

  it('and nothing exposes a session to a player', () => {
    // No canAccessCampaign anywhere near these tables, which is what a
    // player-readable route would need.
    for (const [sig] of ROUTES) {
      expect(route(sig), `${sig} uses the member gate`).not.toMatch(/canAccessCampaign/);
    }
  });
});

describe('On-Going is a view, not a place', () => {
  const view = source.slice(source.indexOf('async function sessionOnGoing('),
    source.indexOf('app.get(\'/api/campaigns/:campaignId/sessions\''));

  it('reads items from other sessions rather than storing copies', () => {
    // Carrying a thread forward by copying it is how you end up with two of
    // it, one of them quietly stale.
    expect(view).toMatch(/i\.state = 'on-going'/);
    expect(view).toMatch(/i\.session_id <> \$2/);
  });

  it('is not one of the stored sections', () => {
    // A fifth CHECK value would make it storable, and then the UI would
    // offer an "add" for something that should only ever be derived.
    expect(source).toMatch(/CHECK \(section IN \('recap','prep','beats','outcome'\)\)/);
    expect(source).toMatch(/const SESSION_SECTIONS = \['recap', 'prep', 'beats', 'outcome'\]/);
  });

  it('only looks BACKWARDS, in the campaign\'s own order', () => {
    // A DM writing session 12 before session 11 should still see 11's
    // threads in 12 — so it is session_no/date order, not clock time, and
    // a later session's thread must not leak into an earlier one.
    expect(view).toMatch(/COALESCE\(s\.session_no, 2147483647\)/);
    expect(view).toMatch(/COALESCE\(s\.session_date, '9999-12-31'::date\)/);
    expect(view).toMatch(/\) < \(/);
  });

  it('names where each thread came from', () => {
    expect(view).toMatch(/s\.session_no, s\.title AS session_title/);
  });

  it('ignores What happened, which is a record and not a thread', () => {
    /*
     * Those cards carry no state in the UI, but they can still hold one:
     * a beat dragged there keeps whatever it had. Without this, filing a
     * thread under "this happened" would leave it running for ever in
     * every later session.
     */
    expect(view).toMatch(/i\.section <> 'outcome'/);
  });

  it('and so does the count the session list shows', () => {
    // Same reasoning, and a count that disagreed with the list under it
    // is the kind of thing nobody reports and everybody distrusts.
    const list = route("app.get('/api/campaigns/:campaignId/sessions'");
    const sub = list.slice(list.indexOf("i.state = 'on-going'"));
    expect(sub).toMatch(/i\.section <> 'outcome'/);
  });
});

describe('items', () => {
  const add = route("app.post('/api/campaigns/:campaignId/sessions/:sessionId/items'");

  it('nest, and a child cannot escape its parent\'s session', () => {
    expect(add).toMatch(/That parent is not in this session/);
  });

  it('take their parent\'s section whatever the caller claims', () => {
    // Otherwise a card could nest under one in a different section and
    // appear properly in neither.
    //
    // BOTH places, counted: the expression appears once when picking the
    // next position and once in the INSERT, and a first version of this
    // test matched either — so breaking only the INSERT, which is the one
    // that decides where the card actually lives, passed.
    const uses = add.match(/parent \? parent\.section : section/g) ?? [];
    expect(uses, 'the parent\'s section is not used in both places').toHaveLength(2);
  });

  it('cascade when a parent goes', () => {
    // A beat's detail has no life of its own.
    expect(source).toMatch(/parent_id   INTEGER REFERENCES campaign_session_items\(id\) ON DELETE CASCADE/);
  });

  it('have their own state route, so flipping one cannot blank a title', () => {
    // A PUT omitting `title` would null it, and this is the most frequent
    // write the feature has.
    const patch = route("app.patch('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/state'");
    expect(patch).toMatch(/SET state=\$1/);
    expect(patch).not.toMatch(/title=/);
  });

  it('reject an unknown state or section rather than storing it', () => {
    expect(add).toMatch(/Unknown section/);
    expect(route("app.patch('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/state'"))
      .toMatch(/Unknown state/);
  });

  it('are scoped by campaign, never by id alone', () => {
    for (const sig of ["app.put('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId'",
      "app.delete('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId'"]) {
      expect(route(sig)).toMatch(/campaign_id=\$/);
    }
  });
});

describe('marking a card done', () => {
  const patch = route("app.patch('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/state'");

  it('takes its sub-cards with it', () => {
    // Finishing a beat and leaving three half-ticked details underneath is
    // just a second chore the DM would do by hand every time.
    expect(patch).toMatch(/WITH RECURSIVE sub AS/);
    expect(patch).toMatch(/const cascade = state === 'done'/);
  });

  it('and so does skipped, which means the same thing', () => {
    // "Stop looking at this", both of them. Leaving skipped per-card meant
    // abandoning a beat and then ticking its details off one by one.
    expect(patch).toMatch(/const cascade = state === 'done' \|\| state === 'skipped'/);
  });

  it('but the other three do NOT cascade', () => {
    /*
     * A parent is on-going precisely because one child is and the rest are
     * not; pushing that down would erase the distinction. The guard is the
     * `$4 OR` — without it every state cascades.
     */
    expect(patch).toMatch(/AND \(\$4 OR id = \$2\)/);
    for (const st of ['in-preparation', 'ready', 'on-going']) {
      expect(patch, `${st} must not cascade`).not.toMatch(new RegExp(`cascade[^;]*'${st}'`));
    }
  });

  it('is bounded, so a cycle cannot spin for ever', () => {
    // parent_id is a tree by construction, not by constraint.
    expect(patch).toMatch(/sub\.depth < 50/);
  });

  it('returns every row it changed', () => {
    // The page patches those rows in place instead of refetching, which is
    // what stopped it jumping back to the top mid-session.
    expect(patch).toMatch(/res\.json\(\{ updated: r\.rows \}\)/);
  });

  it('still writes only the state', () => {
    expect(patch).toMatch(/SET state=\$1/);
    expect(patch).not.toMatch(/title=/);
  });
});

describe('the session page', () => {
  const panel = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
  const card = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');

  it('opens with every section shut', () => {
    // A played session runs to a hundred cards; four open sections is a
    // page you cannot navigate.
    expect(panel).toMatch(/const \[openSections, setOpenSections\] = useState\(\(\) => new Set\(\)\)/);
    expect(panel).toMatch(/openSections\.has\(def\.id\)/);
  });

  it('except while filtering, when a section with a hit opens itself', () => {
    // A match behind a shut heading reads as "no results".
    expect(panel).toMatch(/filtering \? tree\.length > 0 : openSections\.has\(def\.id\)/);
  });

  it('says how many cards a shut section holds', () => {
    // And how many SURVIVE the filter while one is on, or the count argues
    // with the list underneath it.
    expect(panel).toMatch(/total=\{filtering \? countTree\(tree\) : items\.filter/);
  });

  it('starts finished cards collapsed', () => {
    expect(panel).toMatch(/parents\.has\(i\.id\) && i\.state !== 'done'/);
  });

  it('and folds one away the moment it is finished', () => {
    expect(panel).toMatch(/if \(u\.state === 'done'\) next\.delete\(u\.id\)/);
  });

  it('expand-all deliberately skips the finished ones', () => {
    // Re-opening fifty done beats is not what anyone means by "expand all".
    const fn = panel.slice(panel.indexOf('const expandAll'), panel.indexOf('const expandAll') + 700);
    expect(fn).toMatch(/if \(i\.state !== 'done'\) next\.add\(i\.id\)/);
  });

  it('owns card open/closed itself, so expand-all can make that distinction', () => {
    // Local state inside ItemCard could not be told to skip anything.
    expect(card).toMatch(/isOpen, onToggle,/);
    expect(card).not.toMatch(/useState\(true\)/);
  });

  it('patches changed rows instead of refetching the session', () => {
    // Refetching remounted every card and threw the DM back to the top of
    // the page, mid-session, while they were ticking something off.
    const fn = panel.slice(panel.indexOf('setState: async'), panel.indexOf('remove: async'));
    expect(fn).toMatch(/setDetail\(\(d\) =>/);
    expect(fn).not.toMatch(/loadDetail\(\)/);
  });
});

describe('a finished card', () => {
  const card = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');

  it('fades its TEXT, not the whole box', () => {
    // Dimming the container took the state menu with it, which is what
    // made the menu see-through.
    expect(card).not.toMatch(/opacity-60/);
    expect(card).toMatch(/spent \? 'text-text-muted' : 'text-text'/);
  });

  it('and the menu sits on an opaque background', () => {
    expect(card).toMatch(/bg-surface2\s*\n?\s*border border-border2 rounded-sm shadow-xl/);
  });
});

describe('"What happened" is not a plan', () => {
  const card = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');

  it('carries no state control', () => {
    // These are things that actually happened; preparing or skipping one
    // after the fact is a question with a single answer.
    expect(card).toMatch(/const stateless = item\.section === 'outcome'/);
    // The chip — interactive or frozen — renders only when not stateless.
    expect(card).toMatch(/\{!stateless && \(locked/);
    expect(card).toMatch(/<StateChip state=\{item\.state\}/);
  });

  it('and is never greyed out', () => {
    expect(card).toMatch(/const spent = !stateless &&/);
  });
});

describe('moving a card', () => {
  const mv = route("app.patch('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/move'");

  it('MAY cross sections, taking its subtree with it', () => {
    /*
     * This was refused once, on the grounds that a card means something
     * because of where it sits. True — and the reason to allow it: a beat
     * that actually happened belongs in What happened.
     *
     * The subtree is the load-bearing half. A child's section is its
     * parent's everywhere else, so a card moved without its descendants
     * would leave them in a section their parent has left, where nothing
     * renders them.
     */
    expect(mv).not.toMatch(/A card cannot move to another section/);
    expect(mv).toMatch(/if \(section !== self\.section\)/);
    const cascade = mv.slice(mv.indexOf('if (section !== self.section)'));
    expect(cascade).toMatch(/WITH RECURSIVE sub AS/);
    expect(cascade).toMatch(/UPDATE campaign_session_items SET section=\$2/);
  });

  it('takes the section from the parent when there is one, not from the body', () => {
    // Otherwise a caller could name a section that disagrees with the
    // parent it is dropping onto, and the child would vanish.
    expect(mv).toMatch(/section = parent\.section;/);
    expect(mv).toMatch(/if \(parentId == null && SESSION_SECTIONS\.includes\(wantSection\)\)/);
  });

  it('renumbers the DESTINATION section, not the one it came from', () => {
    // `self.section` here would renumber the old list and leave the new one
    // with two cards claiming the same slot.
    const sibs = mv.slice(mv.indexOf('Renumber the destination'));
    expect(sibs).toMatch(/AND section=\$2[\s\S]*?\[sessionId, section, parentId, itemId\]/);
  });

  it('cannot be dropped inside its own subtree', () => {
    // That would detach the whole branch: the rows survive and nothing
    // ever renders them again.
    expect(mv).toMatch(/A card cannot be moved inside itself/);
    expect(mv).toMatch(/WITH RECURSIVE sub AS/);
  });

  it('and BOTH of its tree walks are bounded', () => {
    /*
     * There are two now — the cycle check and the section cascade — and
     * parent_id is a tree by construction, not by constraint. Matching
     * `depth < 50` anywhere would let either bound be dropped silently,
     * so each walk is checked in its own slice.
     */
    const walks = mv.split('WITH RECURSIVE sub AS').slice(1);
    expect(walks, 'expected exactly two recursive walks').toHaveLength(2);
    for (const w of walks) expect(w.slice(0, 400)).toMatch(/sub\.depth < 50/);
  });

  it('renumbers the whole destination list', () => {
    // Positions stay dense, so two cards can never claim one slot.
    expect(mv).toMatch(/UPDATE campaign_session_items SET position=\$1 WHERE id=\$2/);
    expect(mv).toMatch(/sibs\.splice\(at, 0,/);
  });

  it('clamps the index rather than trusting it', () => {
    expect(mv).toMatch(/Math\.max\(0, Math\.min\(position, sibs\.length\)\)/);
  });

  it('returns the renumbered list, since the page cannot know what shifted', () => {
    expect(mv).toMatch(/res\.json\(\{ items: all\.rows \}\)/);
  });
});

describe('generating the next session', () => {
  const gen = route("app.post('/api/campaigns/:campaignId/sessions/:sessionId/generate-next'");

  it('carries ready and on-going into the beats, in-preparation into prep', () => {
    expect(gen).toMatch(/'ready': 'beats', 'on-going': 'beats', 'in-preparation': 'prep'/);
  });

  it('carries nothing that is done or skipped', () => {
    // They are finished, and the played session keeps them as its record.
    const map = gen.slice(gen.indexOf('const CARRY'), gen.indexOf('const CARRY') + 160);
    expect(map).not.toMatch(/done|skipped/);
  });

  it('only the two forward-looking sections carry', () => {
    // "What happened" already travels as the recap prose. Carrying it as
    // cards too put every event of last session into next session's plan,
    // which is exactly what the first version did.
    expect(gen).toMatch(/const forward = \(i\) => i\.section === 'prep' \|\| i\.section === 'beats'/);
    expect(gen).toMatch(/const carries = \(i\) => forward\(i\) && !!CARRY\[i\.state\]/);
  });

  it('turns What happened into one recap card', () => {
    expect(gen).toMatch(/VALUES \(\$1,\$2,'recap'/);
  });

  it('COPIES — the played session keeps its record', () => {
    expect(gen).not.toMatch(/DELETE FROM campaign_session_items/);
    expect(gen).not.toMatch(/UPDATE campaign_session_items/);
  });

  it('pulls the ancestors of a live card in with it', () => {
    // A live sub-beat under a finished one is meaningless alone — "if they
    // refuse" with nothing to refuse. An earlier version promoted it to the
    // root instead, which kept the thread and threw away what it was part
    // of. Losing the thread entirely would be worse than either.
    expect(gen).toMatch(/let cur = byId\.get\(i\.parent_id\)/);
    expect(gen).toMatch(/keep\.add\(cur\.id\)/);
  });

  it('and BOTH of its upward walks are bounded', () => {
    /*
     * parent_id is a tree by construction, not by constraint, so a cycle
     * would spin for ever. There are two walks — collecting ancestors and
     * finding a root — and a first version of this test matched `d < 50`
     * anywhere, so removing the bound from one of them still passed.
     */
    expect(gen).toMatch(/for \(let d = 0; cur && forward\(cur\) && d < 50; d\+\+\)/);
    expect(gen).toMatch(/for \(let d = 0; cur\.parent_id != null && byId\.get\(cur\.parent_id\) && d < 50; d\+\+\)/);
  });

  it('but still drops a finished leaf', () => {
    // Only the connective tissue between a root and something live earns
    // its place; everything else finished stays behind.
    expect(gen).toMatch(/if \(!keep\.has\(i\.id\)\) continue/);
  });

  it('gives a whole tree ONE section, decided by what is live in it', () => {
    // Splitting a tree across two sections is the thing this exists to
    // avoid, so the section cannot be per-card any more.
    expect(gen).toMatch(/const sectionOfTree = new Map\(\)/);
    expect(gen).toMatch(/if \(CARRY\[i\.state\] === 'beats'\) sectionOfTree\.set\(root, 'beats'\)/);
    expect(gen).toMatch(/sectionOfTree\.get\(rootOf\(i\)\)/);
  });

  it('and a parent is always written before its children', () => {
    // Every ancestor of a kept card is kept, so the parent id is already
    // mapped by the time the child is reached — the tree arrives whole.
    expect(gen).toMatch(/const parent = newIdOf\.get\(i\.parent_id\) \?\? null/);
    expect(gen).toMatch(/const visit = \(parentId\) =>/);
  });

  it('numbers from the top of the campaign, so generating twice cannot collide', () => {
    expect(gen).toMatch(/COALESCE\(MAX\(session_no\), 0\)/);
  });
});

describe('a played session is a record', () => {
  const panel = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
  const card = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');

  it('its cards are frozen until it is marked prepared again', () => {
    expect(panel).toMatch(/const locked = detail\?\.session\?\.status === 'played'/);
    expect(panel).toMatch(/locked=\{locked\} readOnly=\{locked\}/);
  });

  it('including the state chip, not just the buttons', () => {
    // readOnly alone left the chip live, which is most of the editing.
    expect(card).toMatch(/\{!stateless && \(locked/);
    expect(card).toMatch(/draggable=\{!readOnly && !locked\}/);
  });

  it('and it says so, rather than just not responding', () => {
    expect(panel).toMatch(/This session is played, so its cards are read-only/);
  });

  it('Still Running is hidden on it, not deleted', () => {
    expect(panel).toMatch(/\{!locked && !filtering && ongoing\.length > 0/);
  });
});

describe('Still Running updates in place', () => {
  const panel = readFileSync(
    path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');

  it('patches the ongoing list, not only the session\'s own items', () => {
    // They are rows from OTHER sessions, so patching `items` alone left a
    // thread you had just closed sitting there until a reload.
    const fn = panel.slice(panel.indexOf('setState: async'), panel.indexOf('remove: async'));
    expect(fn).toMatch(/ongoing: \(d\.ongoing \?\? \[\]\)/);
  });

  it('and drops a row that has stopped being on-going', () => {
    const fn = panel.slice(panel.indexOf('setState: async'), panel.indexOf('remove: async'));
    expect(fn).toMatch(/\.filter\(\(i\) => i\.state === 'on-going'\)/);
  });
});

describe('export and import', () => {
  // The work lives in two shared helpers; the routes are the wrappers that
  // name the file type. Both are exercised, because the campaign bundle
  // calls the helpers directly and never goes through these routes.
  const exp = fn('sessionsForExport');
  const imp = fn('importSessionList');
  const expRoute = route("app.get('/api/campaigns/:campaignId/sessions/export'");
  const impRoute = route("app.post('/api/campaigns/:campaignId/sessions/import'");

  it('is its own file type AND part of the campaign bundle', () => {
    /*
     * Both, now. The `campaign-sessions` file is still how a DM moves prep
     * between campaigns without dragging players and maps along — but a
     * whole-campaign backup that silently omitted the prep was a backup
     * that lost work.
     */
    expect(expRoute).toMatch(/type: 'campaign-sessions'/);
    expect(impRoute).toMatch(/bundle\?\.type !== 'campaign-sessions'/);
  });

  it('the export carries no database ids', () => {
    // An id means nothing in the campaign a file lands in. The emitted
    // object is checked for the absence; the mapping that builds it lives
    // above res.json, so it is checked against the whole handler.
    const emitted = exp.slice(exp.indexOf('return sessR.rows.map'));
    expect(emitted).not.toMatch(/\bid:/);
    expect(exp).toMatch(/section: i\.section, title: i\.title, body: i\.body, state: i\.state/);
  });

  it('and nests items, unlike the read route', () => {
    // A file is read by people and diffed by tools; `children` survives
    // both, a flat list keyed on ids survives neither.
    expect(exp).toMatch(/children\.length \? \{ children \} : \{\}/);
  });

  it('the import MERGES by number, so a later session does not wipe the series', () => {
    // The one way this differs from the diary import, which replaces the
    // lot. A diary is one document; sessions are a running series.
    expect(imp).toMatch(/existing\.find\(\(e\) => e\.session_no === no\)/);
    expect(imp).not.toMatch(/DELETE FROM campaign_sessions/);
  });

  it('falls back to the title when a session has no number', () => {
    expect(imp).toMatch(/e\.session_no == null && e\.title === title/);
  });

  it('replaces a matched session whole, so re-importing does not double it', () => {
    expect(imp).toMatch(/DELETE FROM campaign_session_items WHERE session_id=\$1/);
  });

  it('refuses the wrong file BEFORE it deletes anything', () => {
    // The whole route, not the helper: the guard is the route's job and
    // the helper is what deletes.
    const whole = impRoute + imp;
    const check = whole.indexOf("!== 'campaign-sessions'");
    const del = whole.indexOf('DELETE FROM');
    expect(check).toBeGreaterThan(-1);
    expect(check, 'the type check runs after a delete').toBeLessThan(del);
  });

  it('is one transaction', () => {
    expect(impRoute).toMatch(/await client\.query\('BEGIN'\)/);
    expect(impRoute).toMatch(/ROLLBACK/);
  });

  it('and the helper takes that transaction rather than opening its own', () => {
    /*
     * The campaign import is the reason. It writes the prep last, inside
     * the transaction that built the campaign — a helper that connected
     * for itself would commit prep for a campaign that then rolled back.
     */
    expect(source).toMatch(/async function importSessionList\(client, campaignId, userId, sessions\)/);
    expect(imp).not.toMatch(/pool\.connect\(\)/);
    expect(imp).not.toMatch(/client\.query\('(BEGIN|COMMIT)'\)/);
  });

  it('forces a child into its parent\'s section, even from a hand-edited file', () => {
    // The interactive route enforces this; a bundle must not be a way round
    // it, or a card appears in neither section.
    expect(imp).toMatch(/const section = inherited/);
    expect(imp).toMatch(/insertItems\(sessionId, raw\.children, r\.rows\[0\]\.id, section\)/);
  });

  it('clamps an unknown state and section rather than storing them', () => {
    expect(imp).toMatch(/SESSION_STATES\.includes\(raw\.state\) \? raw\.state : 'in-preparation'/);
    expect(imp).toMatch(/SESSION_SECTIONS\.includes\(raw\.section\) \? raw\.section : 'beats'/);
  });

  it('is registered before the :sessionId route of the SAME method', () => {
    /*
     * Express only shadows within a method, so the comparison has to be
     * per method — a first version of this compared the first occurrence
     * of any method and failed on the PUT/DELETE session routes, which sit
     * above export and cannot swallow a GET.
     */
    const at = (needle) => {
      const i = source.indexOf(needle);
      expect(i, `${needle} not found`).toBeGreaterThan(-1);
      return i;
    };
    expect(at("app.get('/api/campaigns/:campaignId/sessions/export'"))
      .toBeLessThan(at("app.get('/api/campaigns/:campaignId/sessions/:sessionId'"));
    // No POST on /sessions/:sessionId exists today; if one is ever added it
    // must go below the import, and routeOrder.test.js will say so.
    const postParam = source.indexOf("app.post('/api/campaigns/:campaignId/sessions/:sessionId'");
    if (postParam !== -1) {
      expect(at("app.post('/api/campaigns/:campaignId/sessions/import'")).toBeLessThan(postParam);
    }
  });
});

describe('the schema', () => {
  it('cascades items when a session is deleted', () => {
    expect(source).toMatch(/session_id  INTEGER NOT NULL REFERENCES campaign_sessions\(id\) ON DELETE CASCADE/);
  });

  it('carries campaign_id on items so the view is one indexed read', () => {
    // The on-going view spans sessions; joining back through
    // campaign_sessions on every page load would be the alternative.
    expect(source).toMatch(/campaign_id INTEGER NOT NULL REFERENCES campaigns\(id\) ON DELETE CASCADE,\s*\n\s*session_id/);
    expect(source).toMatch(/\['idx_csi_campaign_state',\s*'campaign_session_items\(campaign_id, state\)'\]/);
  });

  it('has only two statuses for a session', () => {
    expect(source).toMatch(/CHECK \(status IN \('prepared','played'\)\)/);
  });
});

describe('merging a bundle into an EXISTING campaign', () => {
  const imp = route("app.post('/api/campaigns/:campaignId/import-into'");
  const hook = readFileSync(path.join(root, 'frontend/src/hooks/useManageCampaigns.js'), 'utf8');

  it('merges the prep rather than silently dropping it', () => {
    /*
     * The bundle grew a `sessions` key and this route did not, so a merge
     * quietly lost the prep — and the dialog did not even list it among
     * the things it refuses, because that list is hand-written.
     */
    expect(imp).toMatch(/await importSessionList\(client, cid, req\.session\.userId, bundle\.sessions\)/);
  });

  it('through the SAME helper as the other two import paths', () => {
    // Three importers would drift, and the least-used one would be the
    // one a restore went through.
    const all = [...source.matchAll(/importSessionList\(/g)];
    expect(all.length, 'expected one definition and three callers').toBe(4);
  });

  it('and still refuses what it cannot match', () => {
    // Player sheets and maps have no safe identity to merge on: a seat,
    // its user assignment, stats and inventory all have to agree.
    expect(imp).toMatch(/\['players', 'player sheets, stats and timelines'\]/);
    expect(imp).toMatch(/\['journey_maps', 'maps'\]/);
  });

  it('names the prep in the confirmation, since a match is replaced whole', () => {
    // The most destructive thing in that dialog. Unnamed, the DM agrees to
    // "replace 3 NPCs" and loses a session's cards.
    expect(hook).toMatch(/session\$\{data\.sessions\.length === 1 \? '' : 's'\} of prep \(matched ones replaced whole\)/);
  });

  it('and says WHY the rest is refused, not merely that it is', () => {
    expect(hook).toMatch(/no safe way to match/);
    expect(hook).toMatch(/Import as a new campaign to keep them/);
  });

  it('and reports what landed', () => {
    expect(hook).toMatch(/r\.sessions && `sessions: \$\{r\.sessions\.added\} added, \$\{r\.sessions\.replaced\} replaced`/);
  });
});

describe('What happened becomes journal entries', () => {
  const r = route("app.post('/api/campaigns/:campaignId/sessions/:sessionId/to-journal'");
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');

  it('is DM-only and ownership-checked, like the rest of the feature', () => {
    expect(r).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(r).toMatch(/await dmOwnsCampaign\(/);
  });

  it('reads ONLY the outcome section', () => {
    // The other three are a plan. Publishing a plan to the table as a
    // record of the night would give away what has not happened yet.
    expect(r).toMatch(/section='outcome'/);
  });

  it('copies rather than moves', () => {
    // A played session is a record; emptying it to fill the journal would
    // destroy the thing the section exists for.
    expect(r).not.toMatch(/DELETE FROM campaign_session_items/);
    expect(r).not.toMatch(/UPDATE campaign_session_items/);
  });

  it('folds sub-cards into the body instead of filing them separately', () => {
    // A sub-card is detail about its parent, not a separate event.
    expect(r).toMatch(/const bullets = \(id, depth\)/);
    expect(r).toMatch(/if \(depth > 50\) return \[\]/);
  });

  it('skips what is already in the journal, so clicking twice is safe', () => {
    /*
     * Asserted as STRUCTURE, not as a string anywhere in the handler:
     * wrapping the lookup in `if (false)` leaves every one of these lines
     * present and the check dead, which an earlier version of this test
     * happily passed.
     */
    expect(r).toMatch(
      /if \(title\) \{\s*const dupe = await client\.query\(\s*'SELECT 1 FROM campaign_journal_entries WHERE campaign_id=\$1 AND title=\$2 LIMIT 1',/,
    );
    expect(r).toMatch(/if \(dupe\.rows\.length\) \{ skipped \+= 1; continue; \}/);
    expect(r).toMatch(/res\.json\(\{ success: true, created, skipped \}\)/);
  });

  it('honours the journal\'s own validation and column limits', () => {
    expect(r).toMatch(/journalStr\(r\.title, 255\)/);
    expect(r).toMatch(/journalStr\([\s\S]*?50000/);
    // journalDay, never `|| null`: day ZERO is a real date in this epoch.
    expect(r).toMatch(/journalDay\(day\)/);
    expect(r).not.toMatch(/in_game_day \|\|/);
  });

  it('is one transaction', () => {
    expect(r).toMatch(/await client\.query\('BEGIN'\)/);
    expect(r).toMatch(/ROLLBACK/);
  });

  it('and the page keeps the entries DM-only until the DM says otherwise', () => {
    /*
     * These are the DM's private notes. Publishing them to the table is
     * the deliberate act, so the box is an opt-IN and it says what it
     * does rather than naming the column.
     */
    expect(panel).toMatch(/dmOnly: true,/);
    expect(panel).toMatch(/Let the players read these/);
    expect(panel).toMatch(/checked=\{!journalForm\.dmOnly\}/);
  });

  it('and offers it on a played session too', () => {
    // Converting reads the prep, it does not edit it, so read-only has no
    // say — and after the night is played is exactly when you would.
    const sec = panel.slice(panel.indexOf('function Section('), panel.indexOf('export default'));
    expect(sec).toMatch(/\{action\}/);
    expect(sec).not.toMatch(/!locked && action/);
  });
});

describe('marking a session played', () => {
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
  const toggle = panel.slice(panel.indexOf('function toggleStatus()'),
    panel.indexOf('async function setStatus('));

  it('asks when it finished, rather than just flipping a flag', () => {
    /*
     * A dialog, because there is something to fill in. The warning that
     * used to be its own confirm in front of it now lives inside the same
     * box — one question instead of two.
     */
    expect(toggle).toMatch(/setPlayedForm\(\{/);
    expect(panel).toMatch(/title="✓ Mark this session as played"/);
  });

  it('and writes NOTHING until it is answered', () => {
    /*
     * The structural version of "asked before the write": opening the
     * dialog cannot save, so the question must come first. This used to
     * be an index comparison inside one function, which stopped meaning
     * anything once the two were separated.
     */
    expect(toggle).not.toMatch(/sessionsApi\.update\(/);
    expect(panel).toMatch(/onClick=\{\(\) => setStatus\('played', absDayFromParts\(playedForm\.date, calendarType\)\)\}/);
  });

  it('defaults the date to where the campaign already is', () => {
    // The today marker, falling back to the session's own start so an
    // undated campaign still opens on something rather than blank.
    expect(toggle).toMatch(/partsFromAbsDay\(todayMarker \?\? detail\.session\.in_game_day \?\? null, calendarType\)/);
  });

  it('still warns when nothing is written under What happened', () => {
    const modal = panel.slice(panel.indexOf('Mark this session as played'),
      panel.indexOf('Edit session'));
    expect(modal).toMatch(/!items\.some\(\(i\) => i\.section === 'outcome'\)/);
    expect(modal).toMatch(/read-only/);
  });

  it('and un-marking asks nothing, nor erases the date', () => {
    /*
     * No date argument at all. Passing null here would have cleared the
     * session's own in-game date on the way back to Prepared — the two
     * share one column now.
     */
    expect(toggle).toMatch(/void setStatus\('prepared'\); return;/);
    expect(toggle).not.toMatch(/setStatus\('prepared', null\)/);
    const panel2 = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
    expect(panel2).toMatch(/\.\.\.\(day !== undefined \? \{ in_game_day: day \} : \{\}\)/);
  });
});

describe("a played session moves the campaign's clock", () => {
  const put = route("app.put('/api/campaigns/:campaignId/sessions/:sessionId'");
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');

  it('there is ONE in-game date, not a start and a finish', () => {
    /*
     * A second column was added on the reasoning that a session spans
     * days. True, and not worth a field: a DM says "session 26 happened
     * on 18 Marpenoth", and two pickers asked a question nobody had.
     */
    expect(source).toMatch(/DROP COLUMN IF EXISTS in_game_end_day/);
    expect(put).toMatch(/in_game_day=\$5,/);
    expect(put).not.toMatch(/in_game_end_day/);
  });

  it('and what the second one held is folded in, not dropped', () => {
    // Only where the first is empty: an existing start date was typed by
    // the DM, and the end date is the better answer only in its absence.
    expect(source).toMatch(/UPDATE campaign_sessions SET in_game_day = in_game_end_day\s*\n\s*WHERE in_game_day IS NULL AND in_game_end_day IS NOT NULL;/);
  });

  it('but only if that column is still there to fold', () => {
    /*
     * UPDATE has no IF EXISTS form, and a statement naming a column that
     * does not exist fails at parse time — before the WHERE can decide
     * there are no rows to touch. So the bare UPDATE took initDb down on
     * every database that had already run it once (the DROP below having
     * removed the column), and on every fresh install, where the second
     * column never existed at all. No tables, no server.
     */
    const fold = source.slice(source.indexOf('ALTER TABLE campaign_sessions ADD COLUMN IF NOT EXISTS in_game_day'),
      source.indexOf('DROP COLUMN IF EXISTS in_game_end_day'));
    expect(fold).toMatch(/IF EXISTS \(\s*\n\s*SELECT 1 FROM information_schema\.columns/);
    expect(fold).toMatch(/table_name = 'campaign_sessions' AND column_name = 'in_game_end_day'/);
    // The UPDATE inside the guard, not beside it.
    expect(fold.indexOf('THEN')).toBeLessThan(fold.indexOf('UPDATE campaign_sessions'));
  });

  it('day zero survives as a date', () => {
    expect(put).toMatch(/journalDay\(inGameDay\)/);
    expect(put).not.toMatch(/inGameDay \|\|/);
  });

  it('the marker moves on the SERVER, in the same transaction', () => {
    /*
     * So the rule holds however the status is changed — including from a
     * script. Two client calls would leave a window where the session is
     * played and the clock is not.
     */
    expect(put).toMatch(/await client\.query\('BEGIN'\)/);
    expect(put).toMatch(/INSERT INTO campaign_meta \(campaign_id, today_marker\)/);
    expect(put).toMatch(/ON CONFLICT \(campaign_id\) DO UPDATE SET today_marker/);
    expect(put).toMatch(/ROLLBACK/);
  });

  it('only for a played session with a date', () => {
    // Dating a session still being prepped is planning, not time passing;
    // and a status flip with no date says nothing about when.
    expect(put).toMatch(/if \(saved\.in_game_day != null && saved\.status === 'played'\)/);
  });

  it('and the page is told, rather than guessing', () => {
    expect(put).toMatch(/\.\.\.\(marker !== undefined \? \{ today_marker: marker \} : \{\}\)/);
    expect(panel).toMatch(/if \(saved\?\.today_marker !== undefined\) onTodayMarkerChanged\?\.\(\);/);
  });
});

describe('Edit shows the date that was actually saved', () => {
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
  const cal = readFileSync(path.join(root, 'frontend/src/components/ui/CalendarDate.jsx'), 'utf8');

  it('one picker, reading the one column', () => {
    expect(panel).toMatch(/date: partsFromAbsDay\(detail\.session\.in_game_day, calendarType\)/);
    expect(panel).toMatch(/label="in-game date"/);
    expect(panel).not.toMatch(/label="in-game date — starts"/);
    expect(panel).not.toMatch(/endDate/);
  });

  it('and saving sends it back', () => {
    const fn = panel.slice(panel.indexOf('async function saveMeta()'),
      panel.indexOf('async function saveMeta()') + 900);
    expect(fn).toMatch(/in_game_day: absDayFromParts\(metaForm\.date, calendarType\)/);
  });

  it('with the clock following an edit to a played session', () => {
    const fn = panel.slice(panel.indexOf('async function saveMeta()'),
      panel.indexOf('async function saveMeta()') + 1200);
    expect(fn).toMatch(/if \(saved\?\.today_marker !== undefined\) onTodayMarkerChanged\?\.\(\);/);
  });

  it('and an unset date LOOKS unset', () => {
    /*
     * With no value the month fell back to index 0 and the day to 1, so
     * "no date" rendered as a blank year beside Hammer and 1 — which reads
     * as 1 Hammer with the year missing rather than as nothing at all.
     */
    expect(cal).toMatch(/const unset = value == null;/);
    expect(cal).toMatch(/\{unset && <option value="">—<\/option>\}/);
  });
});

describe('the page keeps its place', () => {
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');
  const fnOf = (sig) => {
    const at = panel.indexOf(sig);
    expect(at, `${sig} not found`).toBeGreaterThan(-1);
    return panel.slice(at, at + 1600);
  };

  it('saving a card does not reload the session', () => {
    /*
     * loadDetail() swaps the whole panel for a spinner, so the list
     * unmounts: the scroll position goes back to the top and every
     * expanded card shuts — mid-session, while the DM is writing in it.
     */
    const fn = fnOf('async function saveItem()');
    expect(fn).not.toMatch(/loadDetail\(\)/);
    expect(fn).toMatch(/setDetail\(\(d\) =>/);
  });

  it('and patches the edited row rather than appending it', () => {
    const fn = fnOf('async function saveItem()');
    expect(fn).toMatch(/d\.items\.map\(\(i\) => \(i\.id === saved\.id \? saved : i\)\)/);
    expect(fn).toMatch(/\[\.\.\.d\.items, saved\]/);
  });

  it('and opens the parent of a new sub-card', () => {
    // Saved into a collapsed parent, it would otherwise vanish and the
    // save would look like it failed.
    expect(fnOf('async function saveItem()'))
      .toMatch(/new Set\(prev\)\.add\(saved\.parent_id\)/);
  });

  it('deleting does not reload either, and drops the subtree', () => {
    // The server cascades to sub-cards; the page has to mirror that or
    // the children linger with a parent that is gone.
    const fn = fnOf('remove: async (item)');
    expect(fn).not.toMatch(/loadDetail\(\)/);
    expect(fn).toMatch(/doomed/);
    expect(fn).toMatch(/pass < 50/);
  });

  it('and the section headings float over their cards', () => {
    // A long section otherwise scrolls past unlabelled.
    expect(panel).toMatch(/sticky top-0 z-20 -mx-4 px-4/);
    // Opaque, and spanning the tab body's own p-4, or cards show through.
    expect(panel).toMatch(/sticky top-0[^"]*bg-surface/);
  });

  it('and the heading sits UNDER the state menu, not over it', () => {
    // The chip menu opens at z-50 with a z-40 backdrop; a heading above
    // either would eat the click.
    const card = readFileSync(path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');
    expect(card).toMatch(/z-50/);
    const z = /sticky top-0 z-(\d+)/.exec(panel);
    expect(Number(z[1])).toBeLessThan(40);
  });
});

describe('cross-section drag, in the page', () => {
  const card = readFileSync(path.join(root, 'frontend/src/pages/Sessions/ItemCard.jsx'), 'utf8');
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');

  it('no longer refuses a drop from another section', () => {
    // The server allows it; a UI that still filtered would make the
    // feature unreachable without anything erroring.
    expect(card).toMatch(/const canDrop = !!drag && drag\.id !== item\.id;/);
    expect(card).not.toMatch(/drag\.section === item\.section/);
  });

  it('names the destination section on a root-level strip', () => {
    /*
     * A root strip has no parent to inherit from, so if it did not say
     * where it was dropping, the server would keep the card's own section
     * and the drag would appear to do nothing.
     */
    expect(card).toMatch(/onMove\(drag\.id, item\.parent_id \?\? null, index, item\.section\)/);
    expect(panel).toMatch(/onMove\(drag\.id, null, items\.length, def\.id\)/);
  });

  it('and the section tail shows for ANY drag, not a same-section one', () => {
    // It is the only target an empty section has — "What happened" is
    // usually empty, and it is the section this feature exists for.
    const tail = panel.slice(panel.indexOf('The tail of the root list'));
    expect(tail.slice(0, 700)).not.toMatch(/drag\.section === def\.id/);
    expect(tail).toMatch(/\{drag && \(/);
  });

  it('labels it when the drag came from elsewhere', () => {
    expect(panel).toMatch(/drag\.section !== def\.id && `Move to \$\{def\.label\}`/);
  });

  it('and a shut section springs open under a drag', () => {
    // Every drop target lives inside `open &&`, so without this the one
    // section this feature exists to reach is unreachable whenever it is
    // collapsed — which, being "What happened", it usually is.
    expect(panel).toMatch(/onDragOver=\{drag && !open \? \(e\) => \{ e\.preventDefault\(\); onToggle\(\); \} : undefined\}/);
  });

  it('and the move call passes the section through', () => {
    const api = readFileSync(path.join(root, 'frontend/src/api/sessions.js'), 'utf8');
    expect(api).toMatch(/moveItem:/);
    expect(panel).toMatch(/const moveItem = useCallback\(async \(id, parentId, position, section\)/);
    expect(panel).toMatch(/parent_id: parentId, position, section/);
  });
});

describe('the campaign bundle carries the prep', () => {
  const exp = route("app.get('/api/campaigns/:id/export'");
  const imp = route("app.post('/api/campaigns/import'");

  it('exports it', () => {
    // A whole-campaign backup that silently omitted the prep was a backup
    // that lost work.
    expect(exp).toMatch(/const sessionsOut = await sessionsForExport\(id\)/);
    expect(exp).toMatch(/sessions: sessionsOut,/);
  });

  it('and imports it through the SAME helper as the sessions file', () => {
    // Two importers would drift, and the one with fewer tests would be
    // the one a backup went through.
    expect(imp).toMatch(/await importSessionList\(client, newId, req\.session\.userId, sessions\)/);
  });

  it('inside the campaign transaction, not after it', () => {
    // A bundle that failed later must not leave half a campaign's prep
    // behind.
    const at = imp.indexOf('importSessionList(');
    const commit = imp.indexOf("client.query('COMMIT')");
    expect(at).toBeGreaterThan(-1);
    expect(at, 'the prep is written after COMMIT').toBeLessThan(commit);
  });

  it('and an older bundle with no sessions key lands none', () => {
    // Compatibility here is field-driven, not version-driven, as it is
    // for every other key in this handler.
    expect(imp).toMatch(/campaign_journal = \[\], sessions = \[\]/);
    expect(imp).not.toMatch(/bundle\.version/);
  });

  it('reports how much prep arrived', () => {
    // Silence would hide a bundle that carried none.
    expect(imp).toMatch(/sessions: sessionsIn\.added/);
    expect(imp).toMatch(/session_cards: sessionsIn\.cards/);
  });
});

describe("a session's in-game date, and what the timeline says is near it", () => {
  const up = route("app.get('/api/campaigns/:campaignId/sessions/:sessionId/upcoming'");
  const put = route("app.put('/api/campaigns/:campaignId/sessions/:sessionId'");
  const post = route("app.post('/api/campaigns/:campaignId/sessions'");
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Sessions/SessionsPanel.jsx'), 'utf8');

  it('is a separate column from the evening you played', () => {
    /*
     * They drift apart constantly: a session played in October can fall on
     * 30 Hammer, and three sittings can be one day in the world.
     */
    expect(source).toMatch(/ALTER TABLE campaign_sessions ADD COLUMN IF NOT EXISTS in_game_day INTEGER/);
    expect(put).toMatch(/session_date=\$3/);
    expect(put).toMatch(/in_game_day=\$5/);
  });

  it('and day ZERO is a real date, on create and on update', () => {
    // The epoch puts year 1 day 1 at zero, so `|| null` would drop it.
    expect(put).toMatch(/journalDay\(inGameDay\)/);
    expect(post).toMatch(/journalDay\(inGameDay\)/);
    for (const body of [put, post]) expect(body).not.toMatch(/inGameDay \|\|/);
  });

  it('the window OVERLAPS rather than starting after', () => {
    /*
     * An event that began before this date and is still running is the
     * most relevant kind there is — a siege the party walked into is not
     * upcoming, it is happening.
     */
    expect(up).toMatch(/\+ GREATEST\(e\.duration_days, 1\) - 1\) >= \$2/);
    expect(up).toMatch(/e\.day_of_year\) <= \$3/);
  });

  it('and computes the absolute day rather than storing a second copy', () => {
    // The same arithmetic absDay does on the client.
    expect(up).toMatch(/\(\(e\.year - 1\) \* 365 \+ e\.day_of_year\)/);
  });

  it('an undated session is empty, not an error', () => {
    // Most sessions are prepped before anyone decides when they happen.
    expect(up).toMatch(/if \(session\.in_game_day == null\) return res\.json\(\{ in_game_day: null/);
  });

  it('the window is bounded and falls back', () => {
    expect(up).toMatch(/Number\.isFinite\(asked\) && asked > 0 && asked <= 3650 \? asked : 30/);
    expect(up).toMatch(/LIMIT 100/);
  });

  it('and it is DM-only, like the rest of the tab', () => {
    expect(up).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(up).toMatch(/await dmOwnsCampaign\(/);
  });

  it('the page refetches when the DATE changes, not just the session', () => {
    // Otherwise moving a session leaves the old list under a new date.
    expect(panel).toMatch(/const when = detail\?\.session\?\.in_game_day \?\? null;/);
    expect(panel).toMatch(/\}, \[campaignId, currentId, when\]\);/);
  });

  it('and says nothing at all when there is nothing near', () => {
    // An empty "nothing coming up" box on every session is noise.
    expect(panel).toMatch(/upcoming\?\.events\?\.length > 0 && \(/);
  });

  it('leading with what is already under way', () => {
    expect(panel).toMatch(/e\.running\s*\n?\s*\? 'under way'/);
  });
});

describe('one date formatter, not three', () => {
  it('lives in the calendar module', () => {
    const cal = readFileSync(path.join(root, 'frontend/src/data/calendar.js'), 'utf8');
    expect(cal).toMatch(/export function inGameDate\(absD, calType\)/);
  });

  it('and the journal uses it instead of its own copy', () => {
    const j = readFileSync(path.join(root, 'frontend/src/pages/Journal/JournalPanel.jsx'), 'utf8');
    expect(j).toMatch(/import \{ inGameDate \} from '@\/data\/calendar'/);
    expect(j).not.toMatch(/^function inGameDate\(/m);
  });
});
