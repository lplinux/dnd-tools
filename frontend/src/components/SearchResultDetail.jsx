/**
 * components/SearchResultDetail.jsx
 *
 * One search result, read without leaving the search.
 *
 * Navigating away to the module was the first version and it was wrong twice
 * over: it closed the search you had just run, and it landed you on the module
 * rather than on the thing, because nothing in this app can be deep-linked to
 * a single journal entry. Reading it here sidesteps both.
 *
 * `[[Name]]` links inside the text resolve and are clickable, and following one
 * opens THAT thing in this same pane — which is what turns a search into
 * something you can browse rather than a list you consume once.
 *
 * The search terms stay marked in here, not only in the list excerpt. Finding
 * the entry is half the job; finding the sentence inside a long one is the
 * other half, and scrolling a session write-up hunting for the word you
 * searched for is exactly what the excerpt was supposed to save you.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Markdown, Spinner } from '@/components/ui';
import { searchApi } from '@/api/search';
import { highlightElement, splitOnMatches } from '@/data/highlight';

const ICONS = {
  journal: '📖', diary: '📔', 'player-diary': '📔', location: '📍',
  npc: '🧟', event: '📜', character: '🧝', 'dm-note': '📝', item: '🎴',
};

/** Plain text with the search terms marked, as React nodes. */
export function Marked({ text, terms }) {
  const parts = splitOnMatches(text, terms ?? []);
  return (
    <>
      {/* The index is the right key here: the list is a pure function of
          (text, terms), so a given position always holds the same piece. */}
      {parts.map((p, i) => (p.match
        ? <mark key={i} className="search-hit">{p.text}</mark>
        : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** Sanitised HTML with the terms marked by walking its text nodes. */
function MarkedHtml({ html, terms, className }) {
  const ref = useRef(null);
  const key = (terms ?? []).join('\u0000');
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html;
    highlightElement(ref.current, key.split('\u0000').filter(Boolean));
  }, [html, key]);
  return <div ref={ref} className={className} />;
}

/**
 * The body, rendered as whatever it actually is.
 *
 * `html` is only ever an item card's abilities, which the server ran through
 * `sanitizeAbilities` on write — a tag allowlist with no `a`, no `href` and no
 * event handlers. `text` is rendered as text, never as markdown: a DM note
 * containing `*` is not emphasis.
 */
function Body({ format, value, links, onLinkClick, terms }) {
  if (!value || !String(value).trim()) return null;
  if (format === 'markdown') {
    return (
      <Markdown className="text-sm text-text-dim diary-read"
        links={links} onLinkClick={onLinkClick} highlight={terms}>
        {value}
      </Markdown>
    );
  }
  if (format === 'html') {
    return <MarkedHtml html={value} terms={terms}
      className="text-sm text-text-dim [&_p]:mb-2" />;
  }
  return (
    <p className="text-sm text-text-dim whitespace-pre-wrap">
      <Marked text={value} terms={terms} />
    </p>
  );
}

export default function SearchResultDetail({
  campaignId, target, depth, links, terms, onOpen, onBack, onClose,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!campaignId || !target) return undefined;
    let alive = true;
    setBusy(true); setErr(''); setData(null);
    searchApi.detail(campaignId, target.kind, target.id)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e?.message || String(e)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [campaignId, target]);

  /**
   * A `[[Name]]` inside the text. Locations and NPCs are both searchable
   * kinds, so following one is the same operation as clicking a result.
   */
  function followLink({ kind, id }) {
    onOpen({ kind: kind === 'npc' ? 'npc' : 'location', id });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {depth > 1 ? 'Back' : 'Back to results'}
        </Button>
        {depth > 1 && (
          <span className="text-[0.7rem] text-text-muted">
            {depth - 1} step{depth > 2 ? 's' : ''} from the results
          </span>
        )}
        {/* Reading happens here; editing still needs the real module. Lands on
            the module, not the entry — see the deep-linking item in TODO.md. */}
        {data?.path && (
          <Button variant="ghost" className="ml-auto"
            onClick={() => { onClose(); navigate(data.path); }}>
            Open in the module ↗
          </Button>
        )}
        <button type="button" onClick={onClose}
          className={`${data?.path ? '' : 'ml-auto '}text-text-muted hover:text-gold text-sm`}>✕</button>
      </div>

      {busy && <div className="flex justify-center py-10"><Spinner /></div>}
      {!busy && err && <p className="text-danger text-sm text-center py-8">{err}</p>}

      {/* The article below has no height cap and no scroller of its own. It was
          `max-h-[22rem] overflow-y-auto` while the search was a modal and had
          to fit inside one; in a tab that nested a second scrollbar inside the
          tab's own and cut long entries off mid-screen. The tab body scrolls. */}
      {!busy && !err && data && (
        <article className="flex flex-col gap-2">
          <h3 className="font-display text-gold text-base flex items-baseline gap-2">
            <span aria-hidden="true">{ICONS[data.kind] ?? '•'}</span>
            <span><Marked text={data.title} terms={terms} /></span>
          </h3>

          {!!data.meta?.length && (
            <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.68rem] text-text-muted">
              {data.meta.map((m) => (
                <div key={m.label} className="flex gap-1">
                  <dt className="font-display uppercase tracking-wider">{m.label}</dt>
                  <dd className="text-text-dim">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {data.lead && (
            <p className="text-sm italic text-text-dim border-l-2 border-[var(--gold-dim)] pl-2">
              <Marked text={data.lead} terms={terms} />
            </p>
          )}

          <div className="border-t border-border pt-2">
            <Body format={data.bodyFormat} value={data.body} terms={terms}
              links={links} onLinkClick={followLink} />
            {!data.body && !data.sections?.length && (
              <p className="text-text-muted text-sm italic">Nothing written here yet.</p>
            )}
          </div>

          {/* A character sheet is several fields rather than one body, and
              they are not all the same KIND of text: the two Information
              fields are markdown, the four short boxes are plain. Each
              section says which, defaulting to plain for any caller that
              does not. */}
          {data.sections?.map((sec) => (
            <section key={sec.label}>
              <h4 className="font-display uppercase tracking-widest text-[0.7rem] text-gold mt-2 mb-1">
                {sec.label}
              </h4>
              {sec.format === 'markdown' ? (
                <Body format="markdown" value={sec.value} terms={terms}
                  links={links} onLinkClick={followLink} />
              ) : (
                <p className="text-sm text-text-dim whitespace-pre-wrap">
                  <Marked text={sec.value} terms={terms} />
                </p>
              )}
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
