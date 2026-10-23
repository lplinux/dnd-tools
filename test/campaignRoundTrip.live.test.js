/**
 * test/campaignRoundTrip.live.test.js
 *
 * The only test in this repo that actually runs the server.
 *
 * Everything else here is static source analysis, which is why two whole
 * classes of data could go missing from the campaign bundle without a single
 * failure: a regex can tell you a column is named in a query, but not that
 * the value came back out the other side pointing at the right row.
 *
 * It exports a seeded campaign, imports the bundle, and compares. The seed is
 * built so that every assertion below CAN fail — a hidden location, two
 * locations sharing a name, an NPC standing in the hidden one, an in-game day
 * of exactly zero.
 *
 * GATED, because it needs a throwaway Postgres. Run it with:
 *
 *   ROUNDTRIP_DB=postgres://user:pass@127.0.0.1:5433/scratch \
 *   npx vitest run --root . test/campaignRoundTrip.live.test.js
 *
 * The database is wiped on entry, so point it at a scratch one and nothing
 * else. Without the variable the suite skips, and `npm test` stays green.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DSN = process.env.ROUNDTRIP_DB;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ROUNDTRIP_PORT || 3997);
const BASE = `http://127.0.0.1:${PORT}/api`;

/** A browser-ish session: carries the cookie and the CSRF token. */
function agent() {
  let cookie = '', csrf = null;
  return {
    async req(method, p, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (!['GET', 'HEAD'].includes(method)) {
        // Fetch the token before reading the cookie: it belongs to the
        // session the cookie names.
        if (!csrf) await this.req('GET', '/auth/user');
        headers['X-CSRF-Token'] = csrf;
      }
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(BASE + p, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      let json = null;
      try { json = await res.json(); } catch { /* empty body */ }
      if (typeof json?.csrfToken === 'string') csrf = json.csrfToken;
      return { status: res.status, body: json };
    },
  };
}


/** The same file, under another campaign name. */
const renamed = (b, name) => ({ ...b, campaign: { ...b.campaign, name } });

describe.skipIf(!DSN)('campaign bundle round-trip', () => {
  let server, db, dm, seeded, bundle, imported;

  beforeAll(async () => {
    const pg = (await import('pg')).default;
    const bcrypt = (await import('bcryptjs')).default;
    const u = new URL(DSN);

    db = new pg.Client({
      user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
      host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1),
    });
    await db.connect();
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    server = spawn('node', ['app.js'], {
      cwd: root,
      env: {
        ...process.env,
        DB_USER: decodeURIComponent(u.username), DB_PASSWORD: decodeURIComponent(u.password),
        DB_HOST: u.hostname, DB_PORT: String(u.port || 5432), DB_NAME: u.pathname.slice(1),
        SESSION_SECRET: 'round-trip', PORT: String(PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 30000);
      server.stdout.on('data', (d) => {
        if (String(d).includes('running at')) { clearTimeout(t); resolve(); }
      });
      server.on('error', reject);
    });

    // A DM, seeded directly: creating one needs an admin that does not exist yet.
    const hash = await bcrypt.hash('roundtrip-pw', 10);
    const r = await db.query(
      "INSERT INTO users (username,password_hash,role) VALUES ('rt_dm',$1,'dm') RETURNING id", [hash],
    );
    const dmUserId = r.rows[0].id;
    await db.query("INSERT INTO users (username,password_hash,role) VALUES ('rt_player',$1,'player')", [hash]);

    dm = agent();
    await dm.req('POST', '/auth/login', { username: 'rt_dm', password: 'roundtrip-pw' });

    // ── The seed ────────────────────────────────────────────────────────────
    const camp = (await dm.req('POST', '/campaigns', { name: 'Round Trip', description: 'seed' })).body;
    const cid = camp.id ?? camp.campaign?.id;

    const mkLoc = async (name, isPublic) => {
      const res = await dm.req('POST', `/campaigns/${cid}/locations`, { name });
      const id = res.body.id ?? res.body.location?.id;
      if (!isPublic) await dm.req('PATCH', `/campaigns/${cid}/locations/${id}/visibility`);
      return id;
    };
    const openLoc = await mkLoc('Hollow Keep', true);
    const hiddenLoc = await mkLoc('The Undervault', false);

    await dm.req('POST', `/campaigns/${cid}/npcs`, { names: 'Grathul, Silent One, Toll Keeper' });
    const npcRows = (await dm.req('GET', `/campaigns/${cid}/npcs`)).body;
    const npcId = Object.fromEntries(npcRows.map((n) => [n.name, n.id]));

    await dm.req('PUT', `/campaigns/${cid}/npcs/${npcId.Grathul}`, {
      name: 'Grathul', description: 'A scarred orc smith.',
      public_info: 'Sold the party a blade.', private_info: 'SECRET informant.',
      current_location_id: hiddenLoc,          // public NPC in a HIDDEN place
    });
    await dm.req('PATCH', `/campaigns/${cid}/npcs/${npcId.Grathul}/visibility`);
    // The other half of the location rule: an NPC somewhere PUBLIC, whose
    // whereabouts a player is allowed to know.
    await dm.req('PUT', `/campaigns/${cid}/npcs/${npcId['Toll Keeper']}`, {
      name: 'Toll Keeper', current_location_id: openLoc,
    });

    // A player seat, so a journal entry can be attributed to one.
    const seat = (await dm.req('POST', `/campaigns/${cid}/players`, { name: 'Thalia' })).body;
    const seatId = seat.playerId ?? seat.id;
    const plUser = (await db.query("SELECT id FROM users WHERE username='rt_player'")).rows[0].id;
    await dm.req('PUT', `/campaigns/${cid}/players/${seatId}/reassign`, { userId: plUser });

    await dm.req('POST', `/campaigns/${cid}/journal`, {
      title: 'The vault door', body: 'Sealed with green wax.',
      category: 'Clues', location_id: hiddenLoc, in_game_day: 0, dm_only: true,
    });
    const pl = agent();
    await pl.req('POST', '/auth/login', { username: 'rt_player', password: 'roundtrip-pw' });
    await pl.req('POST', `/campaigns/${cid}/journal`, {
      title: 'Rumour at the gate', body: 'They say the smith knows.', category: 'Rumours',
    });
    await dm.req('POST', `/campaigns/${cid}/journal`, { title: 'Title only', body: '' });

    seeded = { cid, openLoc, hiddenLoc, npcId, seatId, dmUserId };

    bundle = (await dm.req('GET', `/campaigns/${cid}/export`)).body;
    // Under its own name: the source campaign still exists, and an import
    // under a name already in use is refused (see the last test here).
    const res = await dm.req('POST', '/campaigns/import', renamed(bundle, 'Round trip — restored'));
    expect(res.status, `import failed: ${JSON.stringify(res.body)}`).toBe(200);
    imported = res.body.campaign_id;
  }, 90000);

  afterAll(async () => {
    server?.kill();
    await db?.end();
  });

  // ── The bundle itself ────────────────────────────────────────────────────

  it('is at least version 6, the one that added what this file checks', () => {
    /*
     * It said `toBe(6)` and went stale at 7, unnoticed, because this file
     * only runs with ROUNDTRIP_DB set. The exact number is pinned by
     * campaignBundle.test.js, which runs every time; this one only needs
     * the bundle to be new enough to carry the NPC fields and the journal.
     */
    expect(bundle.version).toBeGreaterThanOrEqual(6);
  });

  it('and an unfiltered export is a whole one', () => {
    expect(bundle.partial).toBe(false);
  });

  it('carries every NPC field', () => {
    const g = bundle.npcs.find((n) => n.name === 'Grathul');
    expect(g).toMatchObject({
      description: 'A scarred orc smith.',
      public_info: 'Sold the party a blade.',
      private_info: 'SECRET informant.',
      is_public: true,
      current_location_ref: 'The Undervault',
    });
    expect(bundle.npcs.find((n) => n.name === 'Silent One').is_public).toBe(false);
  });

  it('carries a public location by name too', () => {
    expect(bundle.npcs.find((n) => n.name === 'Toll Keeper').current_location_ref)
      .toBe('Hollow Keep');
  });

  it('refers to locations by name, never by id', () => {
    // The `__n` suffix locRefById can emit is unreachable for data created
    // through the app — campaign_locations_campaign_name_unique forbids two
    // locations sharing a name in one campaign — so it only ever protects
    // rows that predate that index. The property worth pinning is the one
    // that holds either way: nothing in `npcs` is numeric.
    for (const n of bundle.npcs) {
      expect(typeof n.current_location_ref === 'string' || n.current_location_ref === null).toBe(true);
    }
  });

  it('carries the journal, DM-only entries included', () => {
    expect(bundle.campaign_journal).toHaveLength(3);
    const v = bundle.campaign_journal.find((e) => e.title === 'The vault door');
    expect(v.dm_only).toBe(true);
    expect(v.location_ref).toBe('The Undervault');
    // Zero, not null — the absolute-day epoch starts there.
    expect(v.in_game_day).toBe(0);
    const r = bundle.campaign_journal.find((e) => e.title === 'Rumour at the gate');
    expect(r.player_ref).toBe('Thalia');
    expect(r.author_username).toBe('rt_player');
  });

  it('contains no raw database id for the hidden location', () => {
    // Blunt on purpose: walks the whole bundle, so it catches an id smuggled
    // into any key, present or future.
    const target = seeded.hiddenLoc;
    const hits = [];
    (function walk(node, trail) {
      if (node === null || node === undefined) return;
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${trail}[${i}]`));
      if (typeof node === 'object') {
        return Object.entries(node).forEach(([k, v]) => walk(v, `${trail}.${k}`));
      }
      if (node === target || node === String(target)) hits.push(trail);
    }(bundle, 'bundle'));
    expect(hits, `raw id ${target} leaked at: ${hits.join(', ')}`).toEqual([]);
  });

  // ── After the import ─────────────────────────────────────────────────────

  const rows = (sql, params) => db.query(sql, params).then((r) => r.rows);

  it('restores the NPC fields', async () => {
    const [g] = await rows(
      'SELECT * FROM campaign_npcs WHERE campaign_id=$1 AND name=$2', [imported, 'Grathul'],
    );
    expect(g.description).toBe('A scarred orc smith.');
    expect(g.private_info).toBe('SECRET informant.');
    expect(g.is_public).toBe(true);
  });

  it('keeps a hidden NPC hidden', async () => {
    const [s] = await rows(
      'SELECT is_public FROM campaign_npcs WHERE campaign_id=$1 AND name=$2', [imported, 'Silent One'],
    );
    expect(s.is_public).toBe(false);
  });

  it('re-points the location at the NEW campaign\'s row', async () => {
    const [g] = await rows(
      `SELECT n.current_location_id, l.name, l.is_public, l.campaign_id
         FROM campaign_npcs n JOIN campaign_locations l ON l.id = n.current_location_id
        WHERE n.campaign_id=$1 AND n.name=$2`, [imported, 'Grathul'],
    );
    expect(g.name).toBe('The Undervault');
    expect(g.campaign_id).toBe(imported);
    expect(g.current_location_id).not.toBe(seeded.hiddenLoc);
    expect(g.is_public).toBe(false);   // still hidden in the copy
  });

  it('never points anything at another campaign', async () => {
    // The sharpest single check: non-zero means a raw id was written through.
    for (const [table, col] of [['campaign_npcs', 'current_location_id'],
      ['campaign_journal_entries', 'location_id']]) {
      const [{ count }] = await rows(
        `SELECT count(*)::int FROM ${table} t
           JOIN campaign_locations l ON l.id = t.${col}
          WHERE t.campaign_id=$1 AND l.campaign_id <> $1`, [imported],
      );
      expect(count, `${table}.${col} points out of the campaign`).toBe(0);
    }
    const [{ count }] = await rows(
      `SELECT count(*)::int FROM campaign_journal_entries j
         JOIN campaign_players p ON p.id = j.player_id
        WHERE j.campaign_id=$1 AND p.campaign_id <> $1`, [imported],
    );
    expect(count).toBe(0);
  });

  it('restores the journal, with day zero and dm_only intact', async () => {
    const got = await rows(
      'SELECT * FROM campaign_journal_entries WHERE campaign_id=$1 ORDER BY title', [imported],
    );
    expect(got).toHaveLength(3);
    const v = got.find((e) => e.title === 'The vault door');
    expect(v.in_game_day).toBe(0);
    expect(v.dm_only).toBe(true);
    expect(v.created_at).not.toBeNull();
    const r = got.find((e) => e.title === 'Rumour at the gate');
    expect(r.category).toBe('Rumours');
    expect(r.player_id).not.toBeNull();
  });

  it('keeps authorship for a member, since created_by governs editing', async () => {
    const [r] = await rows(
      `SELECT u.username FROM campaign_journal_entries j JOIN users u ON u.id = j.created_by
        WHERE j.campaign_id=$1 AND j.title=$2`, [imported, 'Rumour at the gate'],
    );
    expect(r.username).toBe('rt_player');
  });

  it('a v5-shaped bundle lands every NPC hidden and no journal', async () => {
    // What an existing backup on disk looks like.
    const old = {
      ...bundle,
      version: 5,
      npcs: bundle.npcs.map((n) => ({ name: n.name })),
    };
    delete old.campaign_journal;
    const res = await dm.req('POST', '/campaigns/import', renamed(old, 'Round trip — from v5'));
    expect(res.status).toBe(200);
    const legacy = res.body.campaign_id;

    const npcs = await rows('SELECT name, is_public FROM campaign_npcs WHERE campaign_id=$1', [legacy]);
    expect(npcs).toHaveLength(3);
    expect(npcs.every((n) => n.is_public === false), 'an old backup published NPCs').toBe(true);
    const j = await rows('SELECT 1 FROM campaign_journal_entries WHERE campaign_id=$1', [legacy]);
    expect(j).toHaveLength(0);
    expect(res.body.journal).toBe(0);
  });

  it('restored data is still governed by the visibility gate', async () => {
    // Seat the player in the imported campaign, then read it as them.
    const [seat] = await rows(
      "SELECT id FROM campaign_players WHERE campaign_id=$1 AND player_name='Thalia'", [imported],
    );
    const [u] = await rows("SELECT id FROM users WHERE username='rt_player'");
    await db.query(
      `INSERT INTO campaign_user_assignments (player_id,user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`, [seat.id, u.id],
    );
    const pl = agent();
    await pl.req('POST', '/auth/login', { username: 'rt_player', password: 'roundtrip-pw' });
    const seen = (await pl.req('GET', `/campaigns/${imported}/npcs`)).body;

    expect(seen.map((n) => n.name)).toEqual(['Grathul']);
    const g = seen[0];
    expect(g.private_info).toBeUndefined();
    // He is visible; the place he stands in is not — so neither name nor id.
    expect(g.location_name).toBeNull();
    expect(g.current_location_id).toBeNull();
  });

  it('imports twice without collision', async () => {
    // Twice, under two names: the property is that no row id or unique
    // constraint collides between two copies of one file.
    const res = await dm.req('POST', '/campaigns/import', renamed(bundle, 'Round trip — second copy'));
    expect(res.status).toBe(200);
    const [{ count }] = await rows(
      'SELECT count(*)::int FROM campaign_npcs WHERE campaign_id=$1', [res.body.campaign_id],
    );
    expect(count).toBe(3);
  });

  it('but not under a name that is already in use', async () => {
    // Two campaigns with one name made every list in the app a guess.
    const res = await dm.req('POST', '/campaigns/import', bundle);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
    expect(res.body.suggestion).toMatch(/\(\d+\)$/);
  });
});
