/**
 * pages/ManageCampaigns/tabs/SearchTab.jsx
 *
 * One box over everything written down about a campaign.
 *
 * Lives in Manage Campaigns rather than in the header: this is the module a DM
 * runs a campaign from, the campaign is already chosen here, and a global
 * control for something only a DM can use is a control most of the table is
 * shown and refused. The per-module boxes in the Diary and the Journal stay —
 * they filter a list you are already reading, which is a different act from
 * looking for something you cannot find.
 *
 * DM only, which the module already is; the server refuses a player outright
 * rather than teaching one query seven different withholding rules.
 *
 * Clicking a result READS IT HERE rather than navigating. Navigating closed the
 * search you had just run, and landed you on the module rather than on the
 * thing, because nothing in this app can be deep-linked to a single entry. The
 * reading pane keeps the results behind it and stacks, so following a
 * `[[Name]]` out of one note and coming back is one click each way.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/ui';
import { searchApi } from '@/api/search';
import { useCrossLinks } from '@/hooks/useCrossLinks';
import SearchResultDetail, { Marked } from '@/components/SearchResultDetail';
import { queryTerms } from '@/data/highlight';

const ICONS = {
  journal: '📖', diary: '📔', 'player-diary': '📔', location: '📍',
  npc: '🧟', event: '📜', character: '🧝', 'dm-note': '📝', item: '🎴',
};

/**
 * The excerpt with every matched term marked.
 *
 * The server chooses the WINDOW — it is the only side that has the whole
 * field — but the marking is done here, with the same splitter the reading
 * pane uses. That keeps the two consistent, marks every term rather than only
 * the first, and does not depend on the server's offset surviving a fold.
 *
 * React nodes, never `dangerouslySetInnerHTML`: the text is whatever a DM
 * typed into a diary, and marking a match is not a reason to trust it as
 * markup.
 */
function Excerpt({ excerpt, terms }) {
  const text = excerpt?.text;
  if (!text) return null;
  return <span className="text-text-dim"><Marked text={text} terms={terms} /></span>;
}

export default function SearchTab({ campaignId }) {
  const inputRef = useRef(null);
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // What is being read, as a stack: following a [[link]] pushes, Back pops.
  // Empty means the results are showing.
  const [stack, setStack] = useState([]);
  // Collapsed, not expanded, is the state worth tracking — a group that
  // appears after a collapse should be open, like the diary's groups.
  const [shut, setShut] = useState(() => new Set());
  const { index: linkIndex } = useCrossLinks(campaignId || null);

  // Switching campaign in the sidebar must not leave the previous campaign's
  // results on screen under a new campaign's heading.
  useEffect(() => {
    setQ(''); setResult(null); setErr(''); setStack([]); setShut(new Set());
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [campaignId]);

  const run = useCallback(async (query, cid) => {
    if (!cid || query.trim().length < 2) { setResult(null); return; }
    setBusy(true); setErr('');
    try {
      setResult(await searchApi.campaign(cid, query.trim()));
    } catch (e) {
      setErr(e?.message || String(e));
      setResult(null);
    } finally { setBusy(false); }
  }, []);

  // Debounced: the server reads every row of the campaign to fold accents, so
  // a request per keystroke would be wasteful for a question nobody finishes
  // asking in under a quarter second.
  useEffect(() => {
    const t = setTimeout(() => run(q, campaignId), 250);
    return () => clearTimeout(t);
  }, [q, campaignId, run]);

  // A new query always returns you to the results — otherwise you would be
  // reading something from the previous search while a new list sat behind it.
  useEffect(() => { setStack([]); }, [q, campaignId]);

  const toggle = (key) => setShut((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Folded once per query rather than per rendered row.
  const terms = queryTerms(result?.query ?? '');
  const groups = result?.groups ?? [];
  const allShut = groups.length > 0 && groups.every((g) => shut.has(g.kind));
  const reading = stack[stack.length - 1] ?? null;
  const short = q.trim().length > 0 && q.trim().length < 2;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="A name, a place, a thing somebody said…"
            aria-label="Search this campaign"
            className="flex-1 min-w-[12rem] bg-surface2 border border-border2 text-text
                       px-3 py-2 rounded-sm text-sm font-body
                       focus:outline-none focus:border-[var(--gold-dim)]"
          />
        </div>

        <p className="text-[0.65rem] text-text-muted italic">
          Journal, both diaries, locations, NPCs, timeline, character sheets, your own notes and
          the items in play. Accents are ignored, and every word has to appear somewhere.
        </p>

        {reading ? (
          <SearchResultDetail
            campaignId={campaignId}
            target={reading}
            depth={stack.length}
            links={linkIndex}
            terms={terms}
            onOpen={(t) => setStack((st) => [...st, t])}
            onBack={() => setStack((st) => st.slice(0, -1))}
            onClose={() => setStack([])}
          />
        ) : (
        <div className="min-h-[8rem] flex flex-col gap-4">
          {busy && <div className="flex justify-center py-8"><Spinner /></div>}
          {!busy && err && <p className="text-danger text-sm text-center py-6">{err}</p>}
          {!busy && !err && short && (
            <p className="text-text-muted text-sm italic text-center py-8">
              Two letters or more.
            </p>
          )}
          {!busy && !err && !short && !campaignId && (
            <p className="text-text-muted text-sm italic text-center py-8">
              Pick a campaign in the sidebar to search it.
            </p>
          )}
          {!busy && !err && result && !groups.length && (
            <p className="text-text-dim text-sm italic text-center py-8">
              Nothing matches “{result.query}”.
            </p>
          )}

          {groups.length > 1 && (
            <div className="flex justify-end -mb-2">
              <button
                type="button"
                onClick={() => setShut(allShut ? new Set() : new Set(groups.map((g) => g.kind)))}
                className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted
                           hover:text-gold"
              >
                {allShut ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
          )}

          {/* CSS columns rather than a grid: groups are different heights and
              columns pack them without leaving a row's worth of empty space under
              the short ones. break-inside-avoid keeps a group whole, so a
              heading never ends up in one column and its hits in the next. */}
          <div className="columns-1 md:columns-2 2xl:columns-3 gap-4">
          {groups.map((g) => {
            const shown = !shut.has(g.kind);
            return (
            <section key={g.kind} className="break-inside-avoid mb-4">
              <button
                type="button"
                onClick={() => toggle(g.kind)}
                aria-expanded={shown}
                className="w-full font-display uppercase tracking-widest text-[0.65rem] text-gold
                           border-b border-[var(--gold-dim)] mb-1.5 pb-1 flex items-center gap-2
                           text-left hover:text-[var(--gold)] transition-colors"
              >
                <span className={`inline-block transition-transform ${shown ? '' : '-rotate-90'}`}>▾</span>
                <span className="flex-1">{ICONS[g.kind] ?? '•'} {g.label}</span>
                <span className="text-text-muted normal-case tracking-normal">{g.hits.length}</span>
              </button>
              {shown && (
              <ul className="flex flex-col gap-1">
                {g.hits.map((h) => (
                  <li key={`${g.kind}:${h.id}`}>
                    <button
                      type="button"
                      onClick={() => setStack([{ kind: g.kind, id: h.id }])}
                      className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-surface3
                                 transition-colors"
                    >
                      <span className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-text text-sm">
                          <Marked text={h.title} terms={terms} />
                        </span>
                        {h.note && (
                          <span className="text-[0.7rem] text-text-muted">{h.note}</span>
                        )}
                      </span>
                      <span className="block text-[0.72rem] leading-snug mt-0.5">
                        <Excerpt excerpt={h.excerpt} terms={terms} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              )}
            </section>
            );
          })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
