/**
 * The PC sheet's actions bag must not drift from the hook that supplies it.
 *
 * `usePcSheet` exposes the actions; `PcSheet/index.jsx` destructures a
 * hand-written list of them and re-packages a hand-written subset into the
 * `actions` object that every tab receives. So adding an action means editing
 * three lists, and missing one of them fails at RUNTIME, in the browser, as
 * `actions.x is not a function` when somebody clicks the button — nothing in
 * the build or the test suite notices.
 *
 * That is exactly how `setItemCard` shipped broken: it was added to the hook
 * and to the component that calls it, and to neither list in between.
 *
 * This reads the three lists as text and compares them. It is a structural
 * test, not a behavioural one, which is the right shape here — the failure
 * being guarded against is an omission, and an omission has no behaviour.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = readFileSync(path.resolve(here, '../../hooks/usePcSheet.js'), 'utf8');
const page = readFileSync(path.resolve(here, 'index.jsx'), 'utf8');

/**
 * Actions the page uses itself rather than handing to a tab.
 *
 * Kept deliberately short, and each one has to earn its place — an entry here
 * is a promise that no tab will ever need it.
 */
const PAGE_ONLY = new Set([
  'onCampaignChange',   // the header's campaign selector
  'onPlayerChange',     // the header's character selector
  'loadSheet',          // internal to the hook's own effects
  'reloadInventory',    // internal; tabs get the data, not the refetch
  'reloadJournal',      // likewise — the Journal tab receives `journal`, not a reload
  'invFail',            // internal error helper, never exported
  'exportSheet',        // the header's export button
  'setCharData',        // passed to tabs directly, not through the bag
]);

/** Every `const x = useCallback(` in the hook. */
const hookActions = [...hook.matchAll(/const\s+([a-zA-Z][\w]*)\s*=\s*useCallback/g)]
  .map((m) => m[1]);

/** The keys of the `const actions = { … }` literal on the page. */
const bagKeys = (() => {
  const start = page.indexOf('const actions = {');
  expect(start, 'actions bag not found in PcSheet/index.jsx').toBeGreaterThan(-1);
  // Comma-separated, several per line — so match every identifier in the
  // literal, not just the one at the start of each line.
  const body = page.slice(start + 'const actions = {'.length, page.indexOf('};', start))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/([a-zA-Z][\w]*)\s*[,:}]/g)].map((m) => m[1]);
})();

/** The names pulled off the hook at the top of the component. */
const destructured = (() => {
  const start = page.indexOf('} = usePcSheet();');
  expect(start, 'usePcSheet destructure not found').toBeGreaterThan(-1);
  const open = page.lastIndexOf('const {', start);
  const body = page.slice(open, start);
  return [...body.matchAll(/([a-zA-Z][\w]*)\s*[,}]/g)].map((m) => m[1]);
})();

describe('the lists are actually being read', () => {
  it('finds the hook’s actions', () => {
    // A guard on the guard: a regex that stops matching would make every
    // assertion below pass vacuously.
    expect(hookActions.length).toBeGreaterThan(15);
    expect(hookActions).toContain('addItem');
  });

  it('finds the bag and the destructure', () => {
    expect(bagKeys.length).toBeGreaterThan(10);
    expect(destructured.length).toBeGreaterThan(15);
  });
});

describe('every action reaches the tabs', () => {
  const shouldForward = hookActions.filter((a) => !PAGE_ONLY.has(a));

  it('is destructured from the hook', () => {
    const missing = shouldForward.filter((a) => !destructured.includes(a));
    expect(missing, `not pulled off usePcSheet(): ${missing.join(', ')}`).toEqual([]);
  });

  it('is put into the actions bag', () => {
    // The one that would have caught setItemCard.
    const missing = shouldForward.filter((a) => !bagKeys.includes(a));
    expect(missing, `missing from the actions bag: ${missing.join(', ')}`).toEqual([]);
  });

  it('forwards setItemCard specifically', () => {
    // Named outright because it shipped broken once.
    expect(bagKeys).toContain('setItemCard');
    expect(destructured).toContain('setItemCard');
  });
});

describe('the bag holds nothing the hook does not supply', () => {
  it('has no key that is neither an action nor a known value', () => {
    // The mirror failure: a typo in the bag yields `undefined` rather than a
    // missing key, so the button does nothing at all instead of throwing.
    const known = new Set([...hookActions, 'getPublicLink']);
    const unknown = bagKeys.filter((k) => !known.has(k));
    expect(unknown, `in the bag but not from the hook: ${unknown.join(', ')}`).toEqual([]);
  });
});
