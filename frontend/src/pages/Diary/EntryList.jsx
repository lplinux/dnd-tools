/**
 * pages/Diary/EntryList.jsx
 *
 * Compact entry cards in a responsive grid — a campaign runs to dozens of
 * entries and full-width cards made the list a scroll. The card carries enough
 * to recognise an entry (title, session, a few lines of its opening) and
 * clicking it opens the full text; it is not trying to be a reader.
 *
 * `readOnly` powers the DM's view of a player's diary unchanged: the DM may
 * read those but never edit them.
 */
import { useState } from 'react';
import { Badge, Button, Markdown, Modal } from '@/components/ui';
import { useConfirm } from '@/contexts/ConfirmContext';

function metaLine(e) {
  const bits = [];
  if (e.session_no != null) bits.push(`Session ${e.session_no}`);
  if (e.session_date) {
    const d = new Date(e.session_date);
    if (!Number.isNaN(d.getTime())) bits.push(d.toLocaleDateString());
  }
  return bits.join(' · ');
}

/** Markdown reduced to plain text, for the card's two-line teaser. */
function excerpt(md, max = 160) {
  const t = String(md || '')
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')      // bold
    .replace(/\*(.+?)\*/g, '$1')          // italic
    .replace(/`(.+?)`/g, '$1')            // code
    .replace(/^[>\-\d.]+\s+/gm, '')       // quote / list markers
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export default function EntryList({
  entries, readOnly = false, showStatus = false,
  onEdit, onDelete, onSetStatus, emptyText = 'No entries yet.',
}) {
  const confirm = useConfirm();
  const [reading, setReading] = useState(null);

  if (!entries.length) {
    return <p className="text-text-dim text-sm italic text-center py-6">{emptyText}</p>;
  }

  return (
    <>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {entries.map((e) => {
          const meta = metaLine(e);
          const published = e.status === 'published';
          return (
            <article
              key={e.id}
              className="bg-surface2 border border-border rounded-sm p-2.5 flex flex-col gap-1.5
                         hover:border-border2 transition-colors"
            >
              <button
                onClick={() => setReading(e)}
                className="text-left flex-1 min-w-0"
                title="Read this entry"
              >
                <h3 className="font-display text-gold text-[0.72rem] uppercase tracking-wider leading-snug line-clamp-2">
                  {e.title}
                </h3>
                {meta && <div className="text-[0.6rem] text-text-muted mt-0.5">{meta}</div>}
                {e.body && (
                  <p className="text-[0.7rem] text-text-dim leading-snug mt-1.5 line-clamp-3">
                    {excerpt(e.body)}
                  </p>
                )}
              </button>

              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                {/* One control, not a badge plus a button: the state and the way
                    to change it are the same thing. */}
                {showStatus && (readOnly ? (
                  <Badge variant={published ? 'gold' : 'default'}>
                    {published ? '👁 Published' : '✎ Draft'}
                  </Badge>
                ) : (
                  <button
                    onClick={() => onSetStatus(e.id, published ? 'draft' : 'published')}
                    title={published
                      ? 'Published — on the share link. Click to unpublish.'
                      : 'Draft — not on the share link. Click to publish.'}
                    className={[
                      'text-[0.58rem] font-display uppercase tracking-wider rounded-sm px-1.5 py-0.5 border transition-colors',
                      published
                        ? 'bg-[var(--gold-dim)] text-bg border-transparent hover:opacity-80'
                        : 'bg-surface3 text-text-dim border-border2 hover:text-gold',
                    ].join(' ')}
                  >
                    {published ? '👁 Published' : '✎ Draft'}
                  </button>
                ))}

                {!readOnly && (
                  <div className="flex gap-1 ml-auto">
                    <Button variant="default" onClick={() => onEdit(e)} title="Edit">✎</Button>
                    <Button
                      variant="danger"
                      title="Delete"
                      onClick={async () => {
                        if (await confirm(`Delete "${e.title}"? This cannot be undone.`,
                          { title: 'Delete entry', confirmLabel: 'Delete' })) onDelete(e.id);
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Reading a card opens it in full rather than expanding it in place —
          an expanding card reflows the whole grid under the pointer. */}
      <Modal
        open={!!reading}
        onClose={() => setReading(null)}
        onSubmit={() => setReading(null)}
        title={reading?.title ?? ''}
        className="max-w-2xl"
      >
        {reading && (
          <>
            {(metaLine(reading) || reading.chapter || reading.category) && (
              <div className="text-[0.65rem] text-text-muted mb-3">
                {[reading.chapter || reading.category, metaLine(reading)].filter(Boolean).join(' · ')}
              </div>
            )}
            <Markdown className="diary-read text-text-dim font-body">{reading.body || '*No text.*'}</Markdown>
            <div className="flex justify-end gap-2 mt-4">
              {!readOnly && (
                <Button variant="default" onClick={() => { const e = reading; setReading(null); onEdit(e); }}>
                  ✎ Edit
                </Button>
              )}
              <Button variant="accent" onClick={() => setReading(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
