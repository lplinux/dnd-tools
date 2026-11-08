/**
 * test/homebrew.test.js
 *
 * The homebrew library. What is worth guarding: an entry is the DM's own and
 * nobody else's; a player only ever receives what their campaign revealed,
 * filtered in SQL, and never the balance notes; and a body is rebuilt from
 * known fields on every write rather than stored as sent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

function handlerCode(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const list = handlerCode('get', '/api/homebrew');
const create = handlerCode('post', '/api/homebrew');
const edit = handlerCode('put', '/api/homebrew/:id');
const del = handlerCode('delete', '/api/homebrew/:id');
const forCampaign = handlerCode('get', '/api/campaigns/:campaignId/homebrew');
const setUse = handlerCode('put', '/api/campaigns/:campaignId/homebrew/:entryId');

describe('the library is the DM’s own', () => {
  it('is DM-only on every library route', () => {
    for (const [n, h] of [['list', list], ['create', create], ['edit', edit], ['delete', del], ['use', setUse]]) {
      expect(source.slice(source.indexOf(h.slice(0, 60)) - 0, source.indexOf(h.slice(0, 60)) + 120), n)
        .toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    }
  });

  it('reads, edits and deletes only the caller’s entries', () => {
    expect(list).toMatch(/WHERE e\.user_id = \$1/);
    expect(edit).toMatch(/WHERE id=\$6 AND user_id=\$7/);
    expect(edit).toMatch(/SELECT kind FROM homebrew_entries WHERE id=\$1 AND user_id=\$2/);
    expect(del).toMatch(/DELETE FROM homebrew_entries WHERE id=\$1 AND user_id=\$2/);
  });

  it('is owned by a user, and campaigns only point at it', () => {
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS homebrew_entries[\s\S]{0,200}user_id\s+INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(source).toMatch(/entry_id\s+INTEGER NOT NULL REFERENCES homebrew_entries\(id\) ON DELETE CASCADE/);
    expect(source).toMatch(/PRIMARY KEY \(campaign_id, entry_id\)/);
  });

  it('lets a campaign use only its own DM’s entries', () => {
    expect(setUse).toMatch(/dmOwnsCampaign\(campaignId, req\.session\.userId, req\.session\.role\)/);
    expect(setUse).toMatch(/SELECT 1 FROM homebrew_entries WHERE id=\$1 AND user_id=\$2/);
  });

  it('refuses a duplicate name with a sentence, not a 500', () => {
    expect(source).toMatch(/UNIQUE \(user_id, kind, name\)/);
    expect(create).toMatch(/e\.code === '23505'\) return res\.status\(409\)/);
  });
});

describe('what a player receives', () => {
  it('only revealed entries, filtered in SQL', () => {
    expect(forCampaign).toMatch(/\$\{isDM \? '' : 'AND ch\.is_public = true'\}/);
    expect(forCampaign).toMatch(/canAccessCampaign/);
  });

  it('never the balance notes', () => {
    expect(forCampaign).toMatch(/\$\{isDM \? ', e\.balance_note' : ''\}/);
    expect(forCampaign).not.toMatch(/SELECT e\.\*/);
  });

  it('starts hidden: using an entry does not reveal it', () => {
    expect(source).toMatch(/is_public   BOOLEAN NOT NULL DEFAULT false/);
    expect(setUse).toMatch(/isPublic === true/);
  });
});

describe('the body is rebuilt, not stored as sent', () => {
  const fn = source.slice(source.indexOf('function cleanHomebrewSpell('), source.indexOf('const HOMEBREW_KINDS'));

  it('goes through the kind’s cleaner on create and edit', () => {
    expect(source).toMatch(/data: HOMEBREW_KINDS\[kind\]\(b\.data\)/);
    expect(create).toMatch(/homebrewFields\(req\.body\)/);
    expect(edit).toMatch(/homebrewFields\(req\.body, cur\.rows\[0\]\.kind\)/);
  });

  it('refuses a kind this build does not know', () => {
    expect(source).toMatch(/if \(!Object\.hasOwn\(HOMEBREW_KINDS, kind\)\) return \{ error: 'Unknown homebrew kind' \}/);
  });

  it('bounds a spell the way the book does', () => {
    expect(fn).toMatch(/level >= 0 && level <= 9/);
    expect(fn).toMatch(/HB_SCHOOLS\.find/);
    expect(fn).toMatch(/\['V', 'S', 'M'\]\.filter/);
    expect(fn).toMatch(/material: components\.includes\('M'\)/);
  });

  it('caps every string', () => {
    for (const f of ['castingTime', 'range', 'duration', 'description', 'higherLevel']) {
      expect(fn, f).toMatch(new RegExp(`${f}: hbStr\\(b\\.${f}, \\d+\\)`));
    }
  });
});

describe('the library travels on its own', () => {
  const exp = handlerCode('get', '/api/homebrew/export');
  const imp = handlerCode('post', '/api/homebrew/import');

  it('exports the caller’s entries with no ids and no campaigns', () => {
    expect(exp).toMatch(/SELECT kind, name, status, data, balance_note, based_on\s+FROM homebrew_entries WHERE user_id=\$1/);
    expect(exp).not.toMatch(/campaign_homebrew|e\.id|SELECT id/);
    expect(exp).toMatch(/type: 'homebrew-library'/);
  });

  it('is registered before the /:id routes', () => {
    expect(source.indexOf("app.get('/api/homebrew/export'")).toBeLessThan(source.indexOf("app.put('/api/homebrew/:id'"));
    expect(source.indexOf("app.post('/api/homebrew/import'")).toBeLessThan(source.indexOf("app.put('/api/homebrew/:id'"));
  });

  it('adds what is new and never overwrites a name the library has', () => {
    expect(imp).toMatch(/ON CONFLICT \(user_id, kind, name\) DO NOTHING RETURNING id/);
    expect(imp).not.toMatch(/DO UPDATE/);
  });

  it('cleans every entry like a manual save, in one transaction', () => {
    expect(imp).toMatch(/const f = homebrewFields\(raw\)/);
    expect(imp).toMatch(/BEGIN[\s\S]*COMMIT[\s\S]*ROLLBACK/);
  });

  it('is not inside the campaign file', () => {
    const campExport = handlerCode('get', '/api/campaigns/:id/export');
    expect(campExport).not.toMatch(/homebrew/);
  });
});

describe('homebrew spells on a campaign’s sheets', () => {
  const read = (p) => readFileSync(path.join(root, p), 'utf8');
  const frame = read('frontend/src/components/StatsSheetFrame.jsx');
  const sheet = read('frontend/src/pages/NpcSheet/index.jsx');
  const section = read('frontend/src/pages/NpcSheet/SpellSection.jsx');

  it('reach the sheet through the campaign it belongs to', () => {
    expect(frame).toMatch(/\$\{campaignId \? `&campaign=\$\{campaignId\}` : ''\}/);
    expect(read('frontend/src/pages/PcSheet/tabs/index.jsx')).toMatch(/campaignId=\{campaignId\}/);
    expect(read('frontend/src/pages/ManageCampaigns/tabs/NpcsTab.jsx')).toMatch(/campaignId=\{campaignId\}/);
  });

  it('only on an embedded sheet with a numeric campaign — the public sheet gets none', () => {
    expect(sheet).toMatch(/const campaignParam = isEmbedded \?/);
    expect(sheet).toMatch(/\/\^\\d\+\$\/\.test\(campaignParam/);
  });

  it('are offered at their own level, marked homebrew, once per name', () => {
    expect(section).toMatch(/filter\(\(s\) => s\.level === level\)/);
    expect(section).toMatch(/srdOptions\.filter\(\(n\) => !homebrew\.has\(n\)\)/);
    expect(section).toMatch(/badgeFor=\{\(v\) => \(homebrew\.has\(v\) \? 'homebrew' : null\)\}/);
  });

  it('show their own card, ahead of an SRD spell of the same name', () => {
    expect(section).toMatch(/const d = hb \? \{ status: 'ok', spell: hb, homebrew: true \}/);
    expect(section).toMatch(/<HomebrewSpellInfo spell=\{d\.spell\}>/);
  });
});

describe('creatures', () => {
  const read = (p) => readFileSync(path.join(root, p), 'utf8');
  const page = read('frontend/src/pages/Homebrew/index.jsx');
  const npcs = read('frontend/src/pages/ManageCampaigns/tabs/NpcsTab.jsx');

  it('are stat blocks, cleaned by the same validator as every sheet', () => {
    expect(source).toMatch(/creature: \(d\) => validateStats\(d\)/);
  });

  it('are edited in the stat sheet itself, one frame per creature', () => {
    expect(page).toMatch(/<StatsSheetFrame key=\{selected\.id\}/);
    expect(page).toMatch(/onSave=\{\(stats\) => saveStats\(selected, stats\)\}/);
  });

  it('save the sheet without dropping the rest of the entry', () => {
    // An edit replaces the whole row, so the name, status and notes go back too.
    expect(page).toMatch(/name: entry\.name, status: entry\.status, data: stats,\s*balance_note: entry\.balance_note/);
  });

  it('can start an NPC’s stat block — as a copy, asked first if one exists', () => {
    expect(npcs).toMatch(/homebrewApi\.list\('creature'\)/);
    expect(npcs).toMatch(/await saveSheet\(\{ \.\.\.c\.data, char_name: sheetFor\.name \}\)/);
    expect(npcs).toMatch(/sheet\?\.exists && !await confirm\(/);
  });
});

describe('item cards as the Items tab', () => {
  const read = (p) => readFileSync(path.join(root, p), 'utf8');
  it('reuse the Item Cards page, without its own header', () => {
    expect(read('frontend/src/pages/ItemCards/index.jsx')).toMatch(/\{!embedded && <AppHeader icon="🗡️" name="Item Card Creator" \/>\}/);
    expect(read('frontend/src/pages/Homebrew/index.jsx')).toMatch(/<ItemCards embedded \/>/);
  });
});
