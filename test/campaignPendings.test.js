/**
 * test/campaignPendings.test.js
 *
 * The campaign backlog — session cards that belong to no session yet.
 *
 * What is load-bearing: it is DM-only like the prep it feeds, a card moves
 * between the backlog and a session WHOLE (sub-cards with it) and is MOVED
 * rather than copied, and the backlog survives export and import.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const { PARTS, selectParts } = require('../lib/campaignParts.js');

const route = (sig) => {
  const at = source.indexOf(sig);
  expect(at, `${sig} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
};
const fn = (name) => {
  const at = source.indexOf(`async function ${name}(`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n}\n', at));
};

const ROUTES = [...source.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/campaigns\/:campaignId\/pendings[^']*)'/g)]
  .map((m) => `app.${m[1]}('${m[2]}'`);
const toSession = route("app.post('/api/campaigns/:campaignId/pendings/:itemId/to-session'");
const toPendings = route("app.post('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/to-pendings'");

describe('the backlog table', () => {
  const ddl = source.slice(source.indexOf('CREATE TABLE IF NOT EXISTS campaign_pendings'));

  it('nests, and goes with its campaign and its parent', () => {
    expect(ddl).toMatch(/campaign_id INTEGER NOT NULL REFERENCES campaigns\(id\) ON DELETE CASCADE/);
    expect(ddl).toMatch(/parent_id\s+INTEGER REFERENCES campaign_pendings\(id\) ON DELETE CASCADE/);
  });

  it('has the session cards\' states, so a card crosses without losing its own', () => {
    expect(ddl.slice(0, 900)).toMatch(/CHECK \(state IN \('in-preparation','ready','on-going','skipped','done'\)\)/);
  });
});

describe('every backlog route', () => {
  it('exists — list, add, edit, state, move, delete, to-session', () => {
    expect(ROUTES).toHaveLength(7);
  });

  it('is DM-only, and checks the campaign is theirs', () => {
    for (const sig of [...ROUTES, "app.post('/api/campaigns/:campaignId/sessions/:sessionId/items/:itemId/to-pendings'"]) {
      expect(sig.length && route(sig), sig).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
      expect(route(sig), sig).toMatch(/dmOwnsCampaign\(/);
    }
  });

  it('scopes every row by campaign, never by id alone', () => {
    for (const sig of ROUTES.filter((r) => r.includes(':itemId') && !r.includes('to-session'))) {
      expect(route(sig), sig).toMatch(/campaign_id\s*=\s*\$\d/);
    }
  });

  it('cascades a state to the sub-cards, like session cards', () => {
    const st = route("app.patch('/api/campaigns/:campaignId/pendings/:itemId/state'");
    expect(st).toMatch(/WITH RECURSIVE sub AS/);
    expect(st).toMatch(/WHERE id IN \(SELECT id FROM sub\)\s*RETURNING \*/);
  });

  it('refuses to move a card inside itself', () => {
    const mv = route("app.patch('/api/campaigns/:campaignId/pendings/:itemId/move'");
    expect(mv).toMatch(/A card cannot be moved inside itself/);
  });
});

describe('moving between the backlog and a session', () => {
  it('takes the whole subtree, bounded', () => {
    const walk = fn('subtreeRows');
    expect(walk).toMatch(/sub\.depth < 50/);
    expect(walk).toMatch(/ORDER BY depth ASC/);
    expect(toSession).toMatch(/subtreeRows\(client, 'campaign_pendings', itemId\)/);
    expect(toPendings).toMatch(/subtreeRows\(client, 'campaign_session_items', itemId\)/);
  });

  it('is a MOVE: the original goes, in the same transaction', () => {
    for (const [name, code, table] of [['to-session', toSession, 'campaign_pendings'],
      ['to-pendings', toPendings, 'campaign_session_items']]) {
      const ins = code.indexOf('INSERT INTO');
      const del = code.indexOf(`DELETE FROM ${table} WHERE id=$1`);
      expect(del, name).toBeGreaterThan(ins);
      expect(code.indexOf("'BEGIN'"), name).toBeLessThan(ins);
      expect(code.indexOf("'COMMIT'"), name).toBeGreaterThan(del);
    }
  });

  it('checks the card and the session are this campaign\'s', () => {
    expect(toSession).toMatch(/sessionOf\(sessionId, campaignId\)/);
    expect(toSession).toMatch(/String\(rows\[0\]\.campaign_id\) !== String\(campaignId\)/);
    expect(toPendings).toMatch(/String\(rows\[0\]\.session_id\) !== String\(sessionId\)/);
  });

  it('lands in The session or Before it begins, never anywhere else', () => {
    expect(toSession).toMatch(/\['prep', 'beats'\]\.includes\(want\) \? want : 'beats'/);
  });

  it('will not send What happened to the backlog — it is a record, not a plan', () => {
    expect(toPendings).toMatch(/rows\[0\]\.section === 'outcome' \|\| rows\[0\]\.section === 'recap'/);
  });
});

describe('the backlog in the campaign bundle', () => {
  it('is exported, and the version says so', () => {
    expect(source).toMatch(/pendings: pendingsOut,/);
    expect(source).toMatch(/version: 11,/);
  });

  it('is restored with a new campaign, and a bundle without it lands none', () => {
    expect(source).toMatch(/sessions = \[\], surveys = \[\], pendings = \[\] \} = bundle;/);
    expect(source).toMatch(/const pendingsIn = await importPendingList\(client, newId, pendings\)/);
  });

  it('is swapped whole on import-into, and only when the file carries it', () => {
    expect(source).toMatch(/if \(Array\.isArray\(bundle\.pendings\)\) \{\s*const had = await client\.query\(\s*'DELETE FROM campaign_pendings WHERE campaign_id=\$1 AND parent_id IS NULL RETURNING id'/);
  });

  it('is its own part of a partial export', () => {
    expect(PARTS.map((p) => p.id)).toContain('pendings');
    const b = { campaign: { name: 'x' }, pendings: [{ title: 'Letter for Teudis' }] };
    expect(selectParts(b, new Set(['pendings'])).pendings).toEqual([{ title: 'Letter for Teudis' }]);
    expect(selectParts(b, new Set(['sessions'])).pendings).toBeUndefined();
  });
});

describe('the page', () => {
  const card = read('frontend/src/pages/Sessions/ItemCard.jsx');
  const panel = read('frontend/src/pages/Sessions/SessionsPanel.jsx');
  const backlog = read('frontend/src/pages/Sessions/BacklogPanel.jsx');

  it('offers "send" on root cards only — a sub-card travels with its parent', () => {
    expect(card).toMatch(/!readOnly && depth === 0 && actions\.send\?\.allows\(item\)/);
  });

  it('sends session cards from prep and beats only, and not from a played session', () => {
    expect(panel).toMatch(/allows: \(item\) => !locked && \(item\.section === 'prep' \|\| item\.section === 'beats'\)/);
  });

  it('takes a backlog card only into a session still being prepared', () => {
    expect(backlog).toMatch(/allows: \(\) => !!session && !locked/);
  });

  it('keeps its own open set — backlog ids are another table\'s', () => {
    expect(backlog).toMatch(/const \[openItems, setOpenItems\] = useState/);
  });

  it('shows the arrival without the spinner', () => {
    expect(panel).toMatch(/onMovedIn=\{refreshItems\}/);
    const r = panel.slice(panel.indexOf('const refreshItems'), panel.indexOf('}, [campaignId, currentId, fail]);', panel.indexOf('const refreshItems')));
    expect(r).not.toMatch(/setLoading/);
  });
});
