/**
 * pages/DiaryPublic/index.jsx
 *
 * Read-only public view of a campaign diary, reached by share token
 * (`/diary-public/:token`). Access: public — no login.
 *
 * The server sends only PUBLISHED entries and an explicit column list, and
 * never touches player diaries, so there is nothing to filter here. There is
 * deliberately no auth hook anywhere in this tree: the page renders the same
 * thing for everyone, which is what makes "did we leak?" checkable with a
 * cookie-less curl.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { diaryApi } from '@/api/diary';
import { useAsync } from '@/hooks/useAsync';
import AppHeader from '@/components/layout/AppHeader';
import { Badge, Button, Spinner, Markdown } from '@/components/ui';
import { openDiaryBook } from '../Diary/printBook';

function CenterMessage({ icon, children }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted py-20">
      <div className="text-5xl opacity-40">{icon}</div>
      <p className="font-display tracking-wider text-center px-6">{children}</p>
    </div>
  );
}

function entryMeta(e) {
  const bits = [];
  if (e.session_no != null) bits.push(`Session ${e.session_no}`);
  if (e.session_date) bits.push(new Date(e.session_date).toLocaleDateString());
  return bits.join(' · ');
}

export default function DiaryPublic() {
  const { token } = useParams();
  const { data, loading, error } = useAsync(
    () => diaryApi.publicData(token),
    { autoRun: true, deps: [token] },
  );

  const entries = data?.entries ?? [];

  // Read like a book: one entry per page, with the page in the URL so a reader
  // can bookmark or send a link to the session being discussed.
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  useEffect(() => {
    const p = parseInt(params.get('p') ?? '1', 10);
    setPage(Number.isFinite(p) && p > 0 ? p - 1 : 0);
  }, [params]);

  const idx = Math.min(page, Math.max(0, entries.length - 1));
  const entry = entries[idx];
  const goto = (i) => {
    setParams(i === 0 ? {} : { p: String(i + 1) }, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <AppHeader icon="📔" name={data?.campaign_name || 'Campaign Diary'} hideBack>
        <Badge variant="gold">📢 Public View</Badge>
        {/* Everything here is published by construction, so there is nothing to
            filter — a reader can take their own copy. */}
        {entries.length > 0 && (
          <Button
            variant="default"
            className="no-print"
            title="Print this diary as a book (PDF)"
            onClick={async () => {
              // Portraits for the annex, fetched only on print.
              const roster = await diaryApi.publicRoster(token).catch(() => null);
              if (!openDiaryBook({ campaignName: data?.campaign_name || 'Campaign', entries, roster })) {
                window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
              }
            }}
          >
            🖨 Print book
          </Button>
        )}
      </AppHeader>

      <main className="flex-1 overflow-y-auto min-h-0">
        {loading && <div className="flex justify-center py-20"><Spinner /></div>}

        {/* A revoked link and a wrong one give the same message, matching the
            server's deliberately generic 404. */}
        {!loading && error && (
          <CenterMessage icon="📔">This diary link is not valid, or has been revoked.</CenterMessage>
        )}

        {!loading && !error && entries.length === 0 && (
          <CenterMessage icon="✎">No entries have been published yet — check back after the next session.</CenterMessage>
        )}

        {!loading && !error && entry && (
          <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Jump straight to a session. Grouped by chapter where the DM set
                one, so a long campaign reads as a table of contents. */}
            {entries.length > 1 && (
              <nav className="mb-5 flex flex-wrap gap-1.5 items-center no-print">
                {entries.map((e, i) => (
                  <button
                    key={e.id}
                    onClick={() => goto(i)}
                    title={`${e.chapter ? `${e.chapter} — ` : ''}${e.title}`}
                    className={[
                      'w-7 h-7 text-[0.7rem] font-display rounded-sm border transition-colors',
                      i === idx
                        ? 'bg-[var(--gold-dim)] text-bg border-transparent'
                        : 'bg-surface2 text-text-dim border-border2 hover:text-gold',
                    ].join(' ')}
                  >
                    {e.session_no ?? i + 1}
                  </button>
                ))}
              </nav>
            )}

            <article className="bg-surface2 border border-border rounded-sm p-6 md:p-8">
              {entry.chapter && (
                <div className="font-display text-[0.6rem] uppercase tracking-[0.2em] text-text-muted mb-2">
                  {entry.chapter}
                </div>
              )}
              <h2 className="font-display text-gold text-xl uppercase tracking-wider">{entry.title}</h2>
              {entryMeta(entry) && (
                <div className="text-[0.68rem] text-text-muted mt-1 mb-4">{entryMeta(entry)}</div>
              )}
              {entry.body && (
                <Markdown className="diary-read text-text-dim leading-relaxed font-body">{entry.body}</Markdown>
              )}
            </article>

            <nav className="mt-5 flex items-center gap-3 no-print">
              <Button variant="default" disabled={idx === 0} onClick={() => goto(idx - 1)}>
                ← Previous
              </Button>
              <span className="text-[0.7rem] text-text-muted flex-1 text-center">
                {idx + 1} of {entries.length}
              </span>
              <Button variant="default" disabled={idx >= entries.length - 1} onClick={() => goto(idx + 1)}>
                Next →
              </Button>
            </nav>
          </div>
        )}
      </main>
    </>
  );
}
