/**
 * test/timelineVisibility.test.js
 *
 * Whether the players have been shown an event (`visible_to_players`) has to
 * survive every file a timeline travels in. It used to travel in none of
 * them, so a restore put every event under the column's default — hidden —
 * including ones the table had already seen. And a player's own export must
 * never carry an event they cannot see in the app.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

function handler(method, routePath) {
  const start = source.indexOf(`app.${method}('${routePath}'`);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n});', start));
}

const campExport = handler('get', '/api/campaigns/:id/export');
const campImport = handler('post', '/api/campaigns/import');
const tlExport = handler('get', '/api/player-timelines/:timelineId/export');
const tlImport = handler('post', '/api/campaigns/:campaignId/import/timeline');

describe('the campaign file carries each event’s visibility', () => {
  it('on player and DM timeline events', () => {
    expect(campExport.match(/visible_to_players: e\.visible_to_players === true,/g)).toHaveLength(3);
  });

  it('on party events, which are read by their own query', () => {
    expect(campExport).toMatch(/SELECT title, description, location, year, day_of_year, duration_days, visible_to_players\s+FROM player_timeline_entries WHERE campaign_id=\$1 AND is_party=true/);
  });

  it('and every restore insert writes it back', () => {
    const inserts = campImport.match(/INSERT INTO player_timeline_entries[\s\S]*?\)`,\s*\[[\s\S]*?\]\s*\)/g) ?? [];
    expect(inserts.length).toBe(3);
    for (const ins of inserts) {
      expect(ins).toMatch(/visible_to_players\)/);
      expect(ins).toMatch(/e\.visible_to_players === true/);
    }
  });
});

describe('a file without the flag never reveals anything', () => {
  it('reveals only on an explicit true — never `!== false`, never truthy', () => {
    for (const [name, code] of [['campaign import', campImport], ['timeline import', tlImport]]) {
      expect(code, name).toMatch(/e\.visible_to_players === true/);
      expect(code, name).not.toMatch(/visible_to_players !== false/);
      expect(code, name).not.toMatch(/!!e\.visible_to_players/);
    }
  });
});

describe('the single-timeline file', () => {
  it('a player exports only the events they can see', () => {
    expect(tlExport).toMatch(/const canSeeHidden = \['dm', 'admin'\]\.includes\(req\.session\.role\)/);
    expect(tlExport).toMatch(/\$\{canSeeHidden \? '' : 'AND visible_to_players = true'\}/);
    expect(tlExport).not.toMatch(/'SELECT \* FROM player_timeline_entries WHERE timeline_id=\$1 ORDER BY/);
  });

  it('carries the flag, as version 2, and the import reads it', () => {
    expect(tlExport).toMatch(/visible_to_players: e\.visible_to_players === true,/);
    expect(tlExport).toMatch(/version: 2, type: 'timeline'/);
    expect(tlImport).toMatch(/player_ids, is_party, visible_to_players\)/);
  });
});
