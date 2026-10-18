/**
 * test/playerUniqueness.test.js
 *
 * Two rules about who sits at a table.
 *
 * **A character's name is unique within its campaign**, case-insensitively,
 * and free across campaigns — the same character may be played in two of
 * them. The bundle refers to a player by NAME, so two seats called "Davin"
 * collapsed into one on import, taking the second one's inventory, diary and
 * timelines with them. Locations and NPCs already had this rule.
 *
 * **One person holds one seat per campaign.** Two seats for the same user
 * makes "which character wrote this" unanswerable — the journal's author
 * query picks the lowest id and says so in a comment — and it duplicated
 * the PC Sheet's campaign selector, which is how it first surfaced.
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

describe('a character name is unique inside its campaign', () => {
  it('and only inside it — the index is per campaign', () => {
    // Across campaigns the same name is not a clash, which is why this is
    // (campaign_id, name) and not a global unique on the column.
    expect(source).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS campaign_players_campaign_name_unique\s*\n?\s*ON campaign_players \(campaign_id, LOWER\(player_name\)\)/);
  });

  it('case-insensitively, like locations and NPCs', () => {
    for (const idx of ['campaign_locations_campaign_name_unique',
      'campaign_npcs_campaign_name_unique', 'campaign_players_campaign_name_unique']) {
      expect(source, `${idx} is not case-insensitive`)
        .toMatch(new RegExp(`${idx}[\\s\\S]{0,120}LOWER\\(`));
    }
  });

  it('existing clashes are RENAMED, not deleted', () => {
    // A seat owns a character sheet, stats, relationships, diary entries and
    // timelines. Deleting the loser would take all of it.
    const mig = source.slice(source.indexOf('UPDATE campaign_players p'),
      source.indexOf('campaign_players_campaign_name_unique'));
    expect(mig).toMatch(/SET player_name = p\.player_name \|\| ' #' \|\| p\.id/);
    expect(mig).toMatch(/PARTITION BY campaign_id, LOWER\(player_name\)/);
    expect(mig).not.toMatch(/DELETE FROM campaign_players/);
  });

  it('adding a duplicate answers 409, not 500', () => {
    expect(route("app.post('/api/campaigns/:campaignId/players'"))
      .toMatch(/error\.code === '23505'/);
  });

  it('and so does redeeming an invite with a taken name', () => {
    // The rollback leaves the invite unused, so they can pick another.
    for (const sig of ["app.post('/api/invites/:token/accept'", "app.post('/api/invites/:token/join'"]) {
      expect(route(sig), `${sig} 500s on a duplicate name`).toMatch(/e\.code === '23505'/);
    }
  });

  it('the import upserts rather than aborting the whole restore', () => {
    // A bundle written before this rule can carry two same-named seats.
    // They already collapsed on import — the refs key on the name — so this
    // keeps that outcome instead of failing the restore on a constraint.
    const imp = route("app.post('/api/campaigns/import'");
    expect(imp).toMatch(/ON CONFLICT \(campaign_id, LOWER\(player_name\)\)/);
  });
});

describe('one person holds one seat per campaign', () => {
  it('there is a single helper deciding it', () => {
    expect(source.match(/async function seatHeldBy\(/g)).toHaveLength(1);
  });

  it('which ignores the DM marker row', () => {
    // `is_dm_player` is a bookkeeping seat, not a character anyone plays.
    const fn = source.slice(source.indexOf('async function seatHeldBy('));
    expect(fn.slice(0, 900)).toMatch(/is_dm_player IS NULL OR cp\.is_dm_player = false/);
  });

  it('and can exclude the seat being edited', () => {
    // Or reassigning a user to the seat they already hold would refuse.
    const fn = source.slice(source.indexOf('async function seatHeldBy('));
    expect(fn.slice(0, 900)).toMatch(/\$3::int IS NULL OR cp\.id <> \$3/);
  });

  it('is checked when adding a player', () => {
    expect(route("app.post('/api/campaigns/:campaignId/players'"))
      .toMatch(/await seatHeldBy\(userId, campaignId\)/);
  });

  it('and when reassigning one, BEFORE anything is deleted', () => {
    // The reassign route drops the existing assignment first. Checking
    // after that would leave the seat empty on a refusal.
    const r = route("app.put('/api/campaigns/:campaignId/players/:playerId/reassign'");
    const check = r.indexOf('seatHeldBy');
    const del = r.indexOf('DELETE FROM campaign_user_assignments');
    expect(check).toBeGreaterThan(-1);
    expect(check, 'the check runs after the delete').toBeLessThan(del);
    expect(r).toMatch(/ROLLBACK/);
  });

  it('the invite flow already had its own version of this', () => {
    expect(source).toMatch(/async function alreadyInCampaign\(/);
  });
});
