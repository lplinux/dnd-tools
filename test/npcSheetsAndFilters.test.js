/**
 * test/npcSheetsAndFilters.test.js
 *
 * Five small features that landed together, all of them about finding and
 * recording things rather than about new data:
 *
 *   - NPCs filter by place, life state and whether the party has met them;
 *   - the Grant-from-library picker sorts and searches;
 *   - the last four big text boxes render markdown;
 *   - an NPC can have a stat block of its own;
 *   - and clicking an NPC shows who they are connected to.
 *
 * Structural, like the rest of this suite: what is asserted here is which
 * query a route runs, which column it withholds, and which component reads
 * which field — none of which a render test can see.
 *
 * The stat-block migration is also verified live against a scratch Postgres,
 * because the interesting half of it only happens on the SECOND boot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');

/** Every file under `dir` with this extension, relative to the repo root. */
function glob(dir, ext) {
  const out = [];
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...glob(rel, ext));
    else if (e.name.endsWith(ext)) out.push(rel);
  }
  return out;
}
const source = src('app.js');

function route(signature) {
  const at = source.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
}

const NPCS_TAB = src('frontend/src/pages/ManageCampaigns/tabs/NpcsTab.jsx');
const POPOVER  = src('frontend/src/components/CrossLinkPopover.jsx');
const INVENTORY = src('frontend/src/pages/PcSheet/tabs/InventoryTab.jsx');

describe('filtering the NPC list', () => {
  it('narrows by place, life state and met-ness, on top of the search', () => {
    // All three already ride on the row the list fetched, so none of this
    // costs a request.
    expect(NPCS_TAB).toMatch(/if \(fLoc && \(fLoc === NO_LOCATION \? n\.location_name : n\.location_name !== fLoc\)\) return false;/);
    expect(NPCS_TAB).toMatch(/if \(fLife && \(n\.life_state \?\? 'alive'\) !== fLife\) return false;/);
    expect(NPCS_TAB).toMatch(/if \(fMet && String\(!!n\.is_public\) !== fMet\) return false;/);
  });

  it('treats a missing life_state as alive', () => {
    // The column defaults to it, and every NPC written before it existed
    // has null. Without the fallback, "Alive" would hide most of them.
    expect(NPCS_TAB).toMatch(/n\.life_state \?\? 'alive'/);
  });

  it('offers "nowhere" as a choice, not as the absence of one', () => {
    // "Who is unplaced" is a real question when tidying a campaign.
    expect(NPCS_TAB).toMatch(/const NO_LOCATION = /);
    expect(NPCS_TAB).toMatch(/<option value=\{NO_LOCATION\}>/);
  });

  it('builds the place list from the NPCs, not from every location', () => {
    // A campaign has far more locations than it has NPCs standing in
    // them, and an option that can only ever return nothing is noise.
    expect(NPCS_TAB).toMatch(/const placeOpts = useMemo\(\(\) => \{/);
    expect(NPCS_TAB).toMatch(/new Set\(sorted\.map\(\(n\) => n\.location_name\)\.filter\(Boolean\)\)/);
  });

  it('and says which empty it is', () => {
    // "No NPCs yet" in front of a filtered-out list sends you off to write
    // one you already have.
    expect(NPCS_TAB).toMatch(/No NPC matches those filters\./);
    expect(NPCS_TAB).toMatch(/const anyFilter = /);
  });
});

describe('granting an item from the library', () => {
  it('sorts by name', () => {
    // The API returns newest-first, which is right for a library you are
    // building and wrong for one you are looking something up in.
    expect(INVENTORY).toMatch(/\.sort\(\(a, b\) => String\(a\.name \?\? ''\)\.localeCompare\(String\(b\.name \?\? ''\)\)\)/);
  });

  it('searches name, type and rarity', () => {
    expect(INVENTORY).toMatch(/\[c\.name, c\.type, rarityLabel\(c\.rarity\)\]/);
  });

  it('only once the list is long enough to need it', () => {
    expect(INVENTORY).toMatch(/assignable\.length > 7 &&/);
  });

  it('shows which tier of an evolving item it is', () => {
    /*
     * Granting tier 3 of a sword straight out is a real choice, but the
     * tiers are often near-identical by name — so without this the list
     * reads as three copies of the same item.
     */
    expect(INVENTORY).toMatch(/tier \$\{tierById\.get\(c\.id\)\.tier\} of \$\{tierById\.get\(c\.id\)\.of\}/);
  });

  it('and works that out once for the library, not once per row', () => {
    // chainOf walks the whole list; calling it per card walks it n times.
    expect(INVENTORY).toMatch(/const tierById = useMemo\(/);
    expect(INVENTORY).toMatch(/for \(const e of groupByChain\(myCards \?\? \[\]\)\)/);
    expect(INVENTORY).toMatch(/if \(e\.tier > 0\) m\.set/);
  });

  it('and the box is cleared on the way out, both ways', () => {
    // Otherwise the next grant opens pre-filtered by a word you typed
    // last week, looking like an empty library.
    expect(INVENTORY).toMatch(/setAssign\(false\); setLibQuery\(''\);/);
    expect(INVENTORY).toMatch(/onClose=\{\(\) => \{ setAssign\(false\); setLibQuery\(''\); \}\}/);
  });
});

describe('the last big text boxes render markdown', () => {
  const cases = [
    ['DM notes',          'frontend/src/pages/PcSheet/tabs/index.jsx',   /<Markdown className="text-\[12px\][^"]*">\{note\.content\}<\/Markdown>/],
    ['inventory notes',   'frontend/src/pages/PcSheet/tabs/InventoryTab.jsx', /<Markdown className="text-sm text-text-dim[^"]*">\{item\.notes\}<\/Markdown>/],
    ['timeline events',   'frontend/src/pages/Timeline/Modals.jsx',      /<Markdown>\{ev\.description\}<\/Markdown>/],
  ];

  it.each(cases)('%s', (_name, file, re) => {
    expect(src(file)).toMatch(re);
  });

  it('and none of them still renders it raw', () => {
    for (const [name, file] of cases) {
      const text = src(file);
      expect(text, `${name} still has a pre-wrap block`)
        .not.toMatch(/whitespace-pre-wrap[^>]*>\{(note\.content|item\.notes|ev\.description)\}/);
    }
  });

  it('the search view agrees about the format', () => {
    /*
     * The same note rendered two ways reads as two different notes: one
     * resolving its asterisks and the other showing them. `bodyFormat`
     * is what the search detail dispatches on, so it has to move with
     * the component.
     */
    const dmNote = source.slice(source.indexOf("case 'dm-note':"), source.indexOf("case 'item':"));
    expect(dmNote).toMatch(/bodyFormat: 'markdown'/);
    const event = source.slice(source.indexOf("case 'event':"), source.indexOf("case 'character':"));
    expect(event).toMatch(/bodyFormat: 'markdown'/);
  });

  it("a character's Public and Private Information, everywhere they are read", () => {
    /*
     * Three read surfaces, and they must agree: the public share page, the
     * printed sheet, and the search detail. The editor is still a plain
     * textarea — these fields have no in-app read view of their own, which
     * is why the split went unnoticed.
     */
    expect(src('frontend/src/pages/PcPublic.jsx'))
      .toMatch(/<Markdown className="px-3\.5 py-3\.5 leading-relaxed text-sm">\s*\n\s*\{data\.public_info\}/);
    expect(src('frontend/src/pages/PcSheet/index.jsx'))
      .toMatch(/<Markdown className="pc-print-text">\{body\}<\/Markdown>/);
  });

  it('and the printed DM notes too, not just the tab', () => {
    // The tab was changed first and the print path was missed, which is
    // the same split one level down.
    expect(src('frontend/src/pages/PcSheet/index.jsx'))
      .toMatch(/<Markdown className="pc-print-text">\{n\.content\}<\/Markdown>/);
  });

  it('the public page resolves no cross-links, on purpose', () => {
    /*
     * It is reachable without an account, so there is no index to resolve
     * `[[Name]]` against. The renderer leaves an unresolved name as plain
     * text, which is also what a reader who may not resolve it should
     * see — so passing nothing is the correct behaviour, not a gap.
     */
    const pub = src('frontend/src/pages/PcPublic.jsx');
    const at = pub.indexOf('{data.public_info}');
    const el = pub.slice(pub.lastIndexOf('<Markdown', at), at);
    expect(el).not.toMatch(/links=/);
  });

  it('the search view formats each SECTION, not the whole card', () => {
    /*
     * One bodyFormat for all six would have to be wrong for one group:
     * the two Information fields are prose, the four short boxes are not.
     */
    const ch = source.slice(source.indexOf("case 'character':"), source.indexOf("case 'dm-note':"));
    expect(ch).toMatch(/\['Public info', r\.public_info, 'markdown'\]/);
    expect(ch).toMatch(/\['Private info', r\.private_info, 'markdown'\]/);
    for (const plain of ['Story', 'Traits', 'Flaws', 'Goals']) {
      expect(ch, `${plain} should stay plain`).toMatch(new RegExp(`\\['${plain}', r\\.\\w+, 'text'\\]`));
    }
    expect(ch).toMatch(/\.map\(\(\[label, value, format\]\) => \(\{ label, value: String\(value\), format \}\)\)/);
  });

  it('and the component honours it, defaulting to plain', () => {
    // A section with no format — any other caller — must not suddenly
    // start resolving asterisks.
    const d = src('frontend/src/components/SearchResultDetail.jsx');
    expect(d).toMatch(/\{sec\.format === 'markdown' \? \(/);
    expect(d).toMatch(/<p className="text-sm text-text-dim whitespace-pre-wrap">/);
  });

  it('and the editors say markdown works, since nothing else would', () => {
    // A plain textarea gives no hint, and these two have no read view in
    // the app to discover it from.
    const tabs = src('frontend/src/pages/PcSheet/tabs/index.jsx');
    expect((tabs.match(/Markdown works here/g) ?? []).length).toBe(2);
  });

  it('but a truncated list preview still does NOT', () => {
    // One line of a note, cut mid-sentence, with its markup resolved is
    // worse than the raw text: you get a bold fragment and a stray dash.
    expect(NPCS_TAB).toMatch(/\{n\.description \|\| ''\}/);
  });
});

describe("an NPC's stat block", () => {
  const get = route("app.get('/api/campaigns/:campaignId/npcs/:npcId/sheet'");
  const put = route("app.put('/api/campaigns/:campaignId/npcs/:npcId/sheet'");
  const del = route("app.delete('/api/campaigns/:campaignId/npcs/:npcId/sheet'");

  it('is DM-only, all three verbs', () => {
    /*
     * Unlike the relationships route beside it, which a player may read
     * for an NPC they have met. A stat block answers "can we take them",
     * and that is settled in play.
     */
    for (const [name, r] of [['GET', get], ['PUT', put], ['DELETE', del]]) {
      expect(r, name).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
      expect(r, name).toMatch(/await dmOwnsCampaign\(/);
      expect(r, name).toMatch(/await npcInCampaign\(campaignId, npcId\)/);
    }
  });

  it('is a side table, not a column and not a PC sheet', () => {
    /*
     * A column would carry a kilobyte of JSON on every NPC in the list.
     * A PC sheet would need a `campaign_players` row, dragging the NPC
     * into the seat list, diaries, timelines, inventory and the bundle.
     */
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS npc_sheets \(/);
    expect(source).toMatch(/npc_id\s+INTEGER NOT NULL UNIQUE REFERENCES campaign_npcs\(id\) ON DELETE CASCADE/);
  });

  it('goes through the same validator as a character\'s', () => {
    expect(put).toMatch(/JSON\.stringify\(validateStats\(req\.body\)\)/);
  });

  it('distinguishes "no sheet" from "an empty one"', () => {
    // That is what decides whether the row's icon offers Create or Open.
    expect(get).toMatch(/exists: r\.rows\.length > 0/);
  });

  it('and the list answers that without fetching any of them', () => {
    expect(source).toMatch(/EXISTS \(SELECT 1 FROM npc_sheets s WHERE s\.npc_id = n\.id\) AS has_sheet/);
  });

  it('the editor is the shared frame, not a second copy of the bridge', () => {
    const frame = src('frontend/src/components/StatsSheetFrame.jsx');
    expect(frame).toMatch(/const BRIDGE_ORIGIN = window\.location\.origin;/);
    expect(NPCS_TAB).toMatch(/<StatsSheetFrame/);
    expect(src('frontend/src/pages/PcSheet/tabs/index.jsx')).toMatch(/<StatsSheetFrame/);
    // The old inline copy is gone, not orphaned beside the shared one.
    expect(src('frontend/src/pages/PcSheet/tabs/index.jsx')).not.toMatch(/BRIDGE_ORIGIN/);
  });

  it('and the row is patched rather than the list refetched', () => {
    // A refetch remounts the table under the open modal.
    expect(NPCS_TAB).toMatch(/actions\.patchNpc\?\.\(sheetFor\.id, \{ has_sheet: true \}\)/);
    expect(src('frontend/src/hooks/useManageCampaigns.js')).toMatch(/const patchNpc = useCallback/);
  });
});

describe('a modal body never reads the state that closing it clears', () => {
  /*
   * Closing the stat-block modal turned the whole page black.
   *
   * `<Modal open={!!x}>{…x.id…}</Modal>` — JSX evaluates the children
   * before Modal is called, so the body still runs on the render where
   * closing set `x` to null. Modal returning null for `open={false}` does
   * not help: by then the children have already been built. The effect
   * that clears the companion state has not run either, so the inner
   * `{!sheet ? … : …}` guard was still taking the branch that read
   * `sheetFor.id`. With no error boundary above it, the TypeError took the
   * page down.
   *
   * Swept across every modal rather than asserted on the one that broke:
   * this is a pattern that reads as correct, and the next one written
   * from memory will have it too.
   */
  const MODALS = glob('frontend/src', '.jsx')
    .flatMap((file) => {
      const text = src(file);
      const out = [];
      const re = /<Modal\b[^>]*?open=\{!!?(\w+)[^>]*?>/gs;
      for (const m of text.matchAll(re)) {
        const end = text.indexOf('</Modal>', m.index);
        if (end < 0) continue;
        const body = text.slice(m.index + m[0].length, end);
        const v = m[1];
        if (!new RegExp(`\\b${v}\\.\\w+`).test(body)) continue;   // reads nothing
        out.push([`${file} — open={${v}}`, body, v]);
      }
      return out;
    });

  it('found some to check', () => {
    expect(MODALS.length).toBeGreaterThan(5);
  });

  it.each(MODALS)('%s guards its body', (_label, body, v) => {
    expect(new RegExp(`\\{\\s*${v}\\s*&&`).test(body),
      `reads ${v}.… in a body that can render after ${v} is null`).toBe(true);
  });
});

describe("the relationships on an NPC's card", () => {
  it('are fetched by the card, not carried on the list', () => {
    // Forty NPCs, one card open: a column would be forty subqueries to
    // answer a question about one of them.
    expect(POPOVER).toMatch(/campaignsApi\.npcRelationships\(campaignId, target\.id\)/);
    expect(POPOVER).toMatch(/if \(!target \|\| target\.kind !== 'npc' \|\| !campaignId\) return undefined;/);
  });

  it('and the route was already wired to withhold', () => {
    // This is the half that was missing: the gate shipped with no caller.
    const rel = route("app.get('/api/campaigns/:campaignId/npcs/:npcId/relationships'");
    expect(rel).toMatch(/\(\$3 OR cr\.is_public = true\)/);
  });

  it('so the card adds no role check of its own', () => {
    /*
     * `notes` and `is_public` are simply absent for a player, the same
     * way private_info is — so the branch that renders them can only
     * fire for someone entitled to them.
     */
    expect(POPOVER).toMatch(/\{r\.is_public === false && \(/);
    expect(POPOVER).toMatch(/\{r\.notes && \(/);
  });

  it('and shows which way the edge points', () => {
    // "owes money to" reads backwards if you cannot tell who owes whom.
    expect(POPOVER).toMatch(/\{r\.outgoing \? '→' : '←'\}/);
  });
});
