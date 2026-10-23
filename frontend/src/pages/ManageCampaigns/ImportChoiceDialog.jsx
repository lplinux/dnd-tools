/**
 * pages/ManageCampaigns/ImportChoiceDialog.jsx
 *
 * What to do with a campaign file: replace the campaign it came from, make
 * a new one, or merge it into the one on screen.
 *
 * It replaced a yes/no `confirm()`, which could not offer three things and a
 * name field — and so never asked the question that mattered most: you
 * already HAVE a campaign called this. Importing anyway made two "Leruhy"s,
 * and every list in the app became a guess.
 *
 * "Replace" means two different things, and the dialog says which:
 *
 *   - a WHOLE file replaces the whole campaign. The current one goes to the
 *     Trash — restorable, and renamed on the way back if the name is taken
 *     by then — and the file takes its place, players and maps included.
 *     The server does both in one transaction.
 *   - a PARTIAL file cannot do that without destroying everything it does
 *     not carry, so it MERGES instead: the sections in the file replace
 *     those sections, and the rest of the campaign is left alone.
 */
import { useEffect, useMemo, useState } from 'react';

import { Button, Modal } from '@/components/ui';

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

function Option({ title, children, action, onPick, tone = 'default', disabled }) {
  return (
    <div className="border border-border rounded-sm p-3 bg-surface2 flex flex-col gap-2">
      <p className="font-display text-gold text-sm">{title}</p>
      <div className="text-[0.78rem] text-text-dim flex flex-col gap-1">{children}</div>
      <div className="flex justify-end">
        <Button variant={tone} onClick={onPick} disabled={disabled}>{action}</Button>
      </div>
    </div>
  );
}

/** What a merge would do, said before the click. */
function MergeSummary({ summary }) {
  return (
    <>
      <span>
        {summary.replaces.length
          ? <>Replaces <strong>{summary.replaces.join(', ')}</strong>.</>
          : 'Replaces nothing.'}
      </span>
      {summary.adds.length > 0 && <span>Adds {summary.adds.join(', ')}.</span>}
      <span>Anything the file does not carry is left alone.</span>
      {summary.held.length > 0 && (
        <span className="text-[#d49f9f]">
          Its {summary.held.join(', ')} are not merged — there is no safe way to match them to what
          is already here (a seat, its account and its stats all have to agree). Create a new
          campaign to keep them.
        </span>
      )}
    </>
  );
}

export default function ImportChoiceDialog({ ask, campaigns, onAnswer }) {
  const [name, setName] = useState('');

  useEffect(() => { if (ask) setName(ask.suggestion ?? ask.fileName); }, [ask]);

  const taken = useMemo(
    () => (campaigns ?? []).some((c) => same(c.name, name)),
    [campaigns, name],
  );

  const { fileName, sameName, selected, isPartial, partsCount, summary } = ask ?? {};
  const mergeTarget = selected && (!sameName || String(selected.id) !== String(sameName.id))
    ? selected : null;

  return (
    <Modal open={!!ask} onClose={() => onAnswer(null)}
      title={ask ? `Import “${fileName}”` : ''}
      className="!max-w-[95vw] !w-[44rem] !max-h-[92vh]">
      {ask && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            {isPartial
              ? `Part of a campaign — ${partsCount} part${partsCount === 1 ? '' : 's'}.`
              : 'A whole campaign.'}
          </p>

          {sameName && (
            <p className="text-sm text-text border-l-2 border-[var(--gold-dim)] pl-2">
              You already have a campaign called <strong>{sameName.name}</strong>.
            </p>
          )}

          {sameName && !isPartial && (
            <Option title={`Replace “${sameName.name}”`} tone="danger"
              action="Replace it"
              onPick={() => onAnswer({ action: 'replace', id: sameName.id })}>
              <span>
                The current one goes to the <strong>Trash</strong>, and this file takes its place —
                players, sheets, maps and all.
              </span>
              <span>
                Changed your mind? Restore it from the Trash; it comes back under a free name like
                “{sameName.name} (2)”.
              </span>
              <span className="text-text-muted">
                Its share links, invite links and survey links belonged to the old campaign and stop
                working; share again from the new one.
              </span>
            </Option>
          )}

          {sameName && isPartial && (
            <Option title={`Merge into “${sameName.name}”`} tone="danger" action="Merge"
              onPick={() => onAnswer({ action: 'merge', id: sameName.id })}>
              <MergeSummary summary={summary} />
            </Option>
          )}

          {mergeTarget && (
            <Option title={`Merge into “${mergeTarget.name}”`} action="Merge"
              onPick={() => onAnswer({ action: 'merge', id: mergeTarget.id })}>
              <span className="text-text-muted">The campaign you have open.</span>
              <MergeSummary summary={summary} />
            </Option>
          )}

          <Option title="Create a new campaign" tone="accent" action="Create"
            disabled={!name.trim() || taken}
            onPick={() => onAnswer({ action: 'new', name: name.trim() })}>
            <label className="flex flex-col gap-1">
              <span>Called</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                aria-label="Name for the new campaign"
                className="bg-surface border border-border2 text-text px-2 py-1.5 rounded-sm text-sm
                           focus:outline-none focus:border-[var(--gold-dim)]" />
            </label>
            {taken && (
              <span className="text-[#d49f9f]">
                That name is taken — pick another, so the two can be told apart.
              </span>
            )}
          </Option>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onAnswer(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
