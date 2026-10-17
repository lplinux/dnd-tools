/**
 * test/journalVisibility.test.js
 *
 * A journal entry that names something hidden is withheld whole.
 *
 * Blanking the LINK was never enough: the name stays in the prose and the
 * sentence around it is usually the spoiler. So an entry that references a
 * place the party has not found, or a person they have not met, does not
 * reach them at all — and comes back on its own when the last of those is
 * revealed.
 *
 * This is the one withholding rule in the app that cannot be a SQL
 * predicate, because it needs the body parsed. These tests exist because
 * that makes it the easiest one to get subtly wrong: resolve against the
 * visible rows only and every hidden name sails through.
 *
 * Also exercised live against a scratch Postgres — see the CHANGELOG.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const fn = (name) => {
  const at = source.indexOf(`function ${name}(`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n}\n', at));
};

const journalRoute = (() => {
  const at = source.indexOf("app.get('/api/campaigns/:campaignId/journal'");
  expect(at).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
})();

describe('the index it resolves against', () => {
  const build = fn('journalLinkIndex');

  it('is built from ALL rows, hidden ones included', () => {
    // The whole mechanism depends on this. Filtering to visible rows first
    // would mean a hidden name simply failed to resolve, and the entry would
    // be published — the exact opposite of the intent, and it would look
    // like it was working.
    expect(build).not.toMatch(/is_public\s*(===|==)\s*true/);
    expect(build).not.toMatch(/\.filter\(/);
    expect(build).toMatch(/hidden: !row\.is_public/);
  });

  it('folds names the way the client does', () => {
    // `[[thea]]` has to find Théa, or the withholding is bypassed by typing
    // the name without its accent.
    expect(build).toMatch(/searchFold\(row\?\.name\)/);
  });

  it('lets a location win a bare [[Name]], as the client does', () => {
    // Being faithful to the precedence avoids withholding an entry whose
    // link actually resolves to a visible location that happens to share a
    // name with a hidden NPC.
    const locFirst = build.indexOf("put('location'");
    const npcAfter = build.indexOf("put('npc'");
    expect(locFirst).toBeGreaterThan(-1);
    expect(npcAfter).toBeGreaterThan(locFirst);
  });
});

describe('what counts as naming something', () => {
  const check = fn('journalNamesSomethingHidden');

  it('a [[link]] in the body', () => {
    expect(check).toMatch(/matchAll\(/);
    expect(check).toMatch(/hit\?\.hidden/);
  });

  it('the entry\'s own location field, even with no link', () => {
    // Tagging an entry with a secret place and not linking it would
    // otherwise be a way straight around this.
    expect(check).toMatch(/hiddenLocationIds\.has\(entry\.location_id\)/);
  });

  it('but NOT a name that resolves to nothing', () => {
    // Ordinary prose. The client renders an unresolved name as plain text
    // for everyone, so withholding on it would hide entries for no reason.
    expect(check).toMatch(/if \(!key\) continue;/);
  });

  it('and the typed form is honoured', () => {
    expect(fn('journalLinkToken')).toMatch(/LINK_KINDS\[/);
  });
});

describe('where it is applied', () => {
  it('only for a player', () => {
    expect(journalRoute).toMatch(/if \(!isDM\) \{/);
    expect(journalRoute).toMatch(/journalNamesSomethingHidden/);
  });

  it('the DM still sees everything', () => {
    // The filter sits inside the `!isDM` branch, so there is no path that
    // hides an entry from the person who wrote it.
    const guard = journalRoute.indexOf('if (!isDM) {');
    const filter = journalRoute.indexOf('journalNamesSomethingHidden');
    expect(guard).toBeLessThan(filter);
  });

  it('using the raw location id, not the one already blanked for players', () => {
    // The SELECT nulls a hidden location's id for a player. Testing that
    // nulled value would never match, so the check has to read the real one.
    expect(journalRoute).toMatch(/rawLoc/);
    expect(journalRoute).toMatch(/\(e\) => rawLoc\.get\(e\.id\)/);
  });
});

describe('the diary follows the same rule', () => {
  // A published diary entry can name a hidden place or an unmet NPC just as
  // easily as a journal entry can, and the campaign diary reaches players
  // only through the public share link.
  const diary = (() => {
    const at = source.indexOf("app.get('/api/diary-public/:token'");
    expect(at).toBeGreaterThan(-1);
    return source.slice(at, source.indexOf('\n});', at));
  })();

  it('filters the published entries before sending them', () => {
    expect(diary).toMatch(/await withholdHiddenEntries\(campaignId, entriesR\.rows\)/);
    // The filtered list is what goes out, not the raw one.
    expect(diary).toMatch(/entries,\n\s*\}\);/);
    expect(diary).not.toMatch(/entries: entriesR\.rows/);
  });

  it('shares ONE implementation with the journal', () => {
    // Two copies of a withholding rule is worse than one: the DM stops
    // being able to reason about it the moment they disagree.
    const uses = [...source.matchAll(/await withholdHiddenEntries\(/g)];
    expect(uses.length).toBe(2);
    expect(source.match(/async function withholdHiddenEntries\(/g)).toHaveLength(1);
  });

  it('applies to everyone on that route, which keeps it session-blind', () => {
    // The share link is the players' view; a DM opening it is previewing
    // exactly what the table sees. They read the full diary in the module.
    const call = diary.slice(diary.indexOf('withholdHiddenEntries'));
    expect(call.slice(0, 120)).not.toMatch(/isDM/);
  });
});
