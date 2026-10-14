/**
 * pages/ManageCampaigns/tabs/searchTab.test.js
 *
 * Campaign-wide search lives in Manage Campaigns, not in the header.
 *
 * The header version worked, but put a DM-only control in front of every
 * player — a button most of the table is shown and then refused — and made the
 * tab ask which campaign it meant when the module already knows. Structural,
 * because "which module owns this" is not something behaviour can show.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');

const TAB = read('./SearchTab.jsx');
const CONSTANTS = read('../constants.js');
const MODULE = read('../index.jsx');
const HEADER = read('../../../components/layout/AppHeader.jsx');

describe('where the tab sits', () => {
  const ids = [...CONSTANTS.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);

  it('is one of the Manage Campaigns tabs', () => {
    expect(ids).toContain('search');
  });

  it('sits immediately before Settings', () => {
    // Asked for explicitly: "along the char tree and other things, just before
    // the settings".
    expect(ids[ids.indexOf('search') + 1]).toBe('settings');
  });

  it('is rendered by the module’s switch, with the chosen campaign', () => {
    expect(MODULE).toMatch(/case 'search':/);
    expect(MODULE).toMatch(/<SearchTab campaignId=\{currentId\} \/>/);
  });
});

describe('the header no longer carries it', () => {
  it('has no search button, modal or shortcut left behind', () => {
    for (const ghost of ['CampaignSearchModal', 'searchOpen', 'canSearch', 'metaKey']) {
      expect(HEADER, `AppHeader still references ${ghost}`).not.toContain(ghost);
    }
  });

  it('does not import a Search icon it no longer uses', () => {
    const imports = HEADER.slice(0, HEADER.indexOf('export'));
    expect(imports).not.toMatch(/\bSearch\b/);
  });
});

describe('the tab takes its campaign rather than asking', () => {
  it('receives campaignId as a prop', () => {
    expect(TAB).toMatch(/export default function SearchTab\(\{ campaignId \}\)/);
  });

  it('has no campaign selector of its own', () => {
    // The sidebar already chose one; a second selector could disagree with it.
    expect(TAB).not.toMatch(/campaignsApi\.list/);
    expect(TAB).not.toMatch(/<Select/);
  });

  it('does not remember a campaign in localStorage any more', () => {
    expect(TAB).not.toMatch(/localStorage/);
  });

  it('resets when the campaign changes', () => {
    // Otherwise the previous campaign's results sit under a new campaign's name.
    expect(TAB).toMatch(/setQ\(''\); setResult\(null\); setErr\(''\); setStack\(\[\]\); setShut\(new Set\(\)\);/);
    const reset = TAB.indexOf("setQ(''); setResult(null)");
    const deps = TAB.indexOf('}, [campaignId]);', reset);
    expect(deps).toBeGreaterThan(reset);
  });

  it('is a panel, not a modal', () => {
    expect(TAB).not.toMatch(/<Modal/);
    expect(TAB).not.toMatch(/\bonClose\b\s*[,}]/);
  });
});

describe('what the move kept', () => {
  it('still reads results in place and stacks them', () => {
    expect(TAB).toMatch(/SearchResultDetail/);
    expect(TAB).toMatch(/setStack\(\(st\) => \[\.\.\.st, t\]\)/);
  });

  it('still collapses groups', () => {
    expect(TAB).toMatch(/aria-expanded=\{shown\}/);
    expect(TAB).toMatch(/Collapse all/);
  });

  it('still resolves cross-links inside a result', () => {
    expect(TAB).toMatch(/useCrossLinks/);
    expect(TAB).toMatch(/links=\{linkIndex\}/);
  });
});

/**
 * Layout. Both of these were sizing left over from the modal, and both only
 * showed up once the search was a tab.
 */
describe('it uses the height the tab gives it', () => {
  const DETAIL = read('../../../components/SearchResultDetail.jsx');
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the reading pane has no scroller of its own', () => {
    // `max-h-[22rem] overflow-y-auto` nested a second scrollbar inside the
    // tab's own and cut long entries off mid-screen.
    expect(code(DETAIL)).not.toMatch(/max-h-\[/);
    expect(code(DETAIL)).not.toMatch(/overflow-y-auto/);
  });

  it('nor does the result list', () => {
    expect(code(TAB)).not.toMatch(/max-h-\[/);
    expect(code(TAB)).not.toMatch(/overflow-y-auto/);
  });
});

describe('results use the width', () => {
  it('flows the groups into columns', () => {
    expect(TAB).toMatch(/columns-1 md:columns-2 2xl:columns-3/);
  });

  it('keeps each group whole', () => {
    // Without this a heading can land in one column and its hits in the next.
    expect(TAB).toMatch(/<section key=\{g\.kind\} className="break-inside-avoid/);
  });

  it('does not column the toolbar or the empty states', () => {
    // Only the groups go in the columned container — "Collapse all" and
    // "Nothing matches" belong across the full width.
    const colStart = TAB.indexOf('columns-1 md:columns-2');
    expect(TAB.indexOf('Collapse all')).toBeLessThan(colStart);
    expect(TAB.indexOf('Nothing matches')).toBeLessThan(colStart);
  });
});

/**
 * Highlighting. The hits are marked in the list AND inside an opened result —
 * finding the entry is half the job, finding the sentence in a long one is the
 * other half.
 */
describe('the search terms stay marked after you open a result', () => {
  const DETAIL = read('../../../components/SearchResultDetail.jsx');
  const MD = read('../../../components/ui/Markdown.jsx');

  it('the reading pane is given the terms', () => {
    expect(TAB).toMatch(/terms=\{terms\}/);
    expect(DETAIL).toMatch(/terms,/);
  });

  it('marks the title, the lead, the body and every section', () => {
    // Four separate render paths; missing one means a hit that looks absent.
    const marks = [...DETAIL.matchAll(/<Marked text=\{([^}]+)\}/g)].map((m) => m[1]);
    expect(marks).toContain('data.title');
    expect(marks).toContain('data.lead');
    expect(marks).toContain('sec.value');
    expect(marks).toContain('value');
  });

  it('marks all three body formats', () => {
    // markdown via the Markdown component, html via a DOM walk, text via nodes.
    expect(DETAIL).toMatch(/highlight=\{terms\}/);      // markdown
    expect(DETAIL).toMatch(/<MarkedHtml html=\{value\} terms=\{terms\}/);
    expect(DETAIL).toMatch(/<Marked text=\{value\} terms=\{terms\}/);
  });

  it('never marks by rewriting an HTML string', () => {
    // A search for "div" must mark the word, not the tags. Both HTML paths
    // walk text nodes with the DOM API instead.
    expect(DETAIL).toMatch(/highlightElement/);
    expect(MD).toMatch(/highlightElement/);
    for (const f of [DETAIL, MD]) {
      expect(f).not.toMatch(/\.replace\([^)]*<mark/);
    }
  });

  it('lets the effect own the content while marking, not React', () => {
    // Both writing the same node is how a mark ends up nested in a mark.
    expect(MD).toMatch(/dangerouslySetInnerHTML=\{marking \? undefined :/);
  });
});

describe('the list and the reading pane agree', () => {
  it('both mark with the same splitter', () => {
    expect(TAB).toMatch(/import SearchResultDetail, \{ Marked \}/);
    expect(TAB).toMatch(/queryTerms/);
  });

  it('the list no longer trusts the server\u2019s single offset', () => {
    // It marked only the first term, and the offset came from a fold that
    // does not preserve length on already-decomposed text.
    expect(TAB).not.toMatch(/excerpt\.at|\bat, len\b/);
  });
});
