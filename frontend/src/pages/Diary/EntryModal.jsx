/**
 * pages/Diary/EntryModal.jsx
 * Create/edit one entry, with a markdown preview behind a toggle rather than
 * live — a pasted session transcript is long, and re-rendering it on every
 * keystroke is wasted work.
 */
import { useEffect, useState } from 'react';
import { Button, Modal, FormField, Markdown, FIELD_INPUT } from '@/components/ui';

const BLANK = { title: '', body: '', session_no: '', session_date: '', group: '' };

/**
 * `groupField` is 'chapter' for the campaign diary and 'category' for a player
 * diary — the same control, labelled for whichever list it is filing into.
 * `groupOptions` feeds a datalist, so existing groups are one keystroke away
 * while still allowing a new one: free text is the point.
 */
export default function EntryModal({
  open, entry, saving, onClose, onSave,
  groupField = 'chapter', groupLabel = 'Chapter', groupOptions = [],
}) {
  const [form, setForm] = useState(BLANK);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(false);
    setForm(entry
      ? {
        title: entry.title ?? '',
        body: entry.body ?? '',
        session_no: entry.session_no ?? '',
        session_date: entry.session_date ? String(entry.session_date).slice(0, 10) : '',
        group: entry[groupField] ?? '',
      }
      : BLANK);
  }, [open, entry, groupField]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    if (!form.title.trim()) return;
    onSave({
      title: form.title.trim(),
      body: form.body,
      session_no: form.session_no === '' ? null : Number(form.session_no),
      session_date: form.session_date || null,
      [groupField]: form.group.trim() || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      onSubmit={submit}
      title={entry ? '✎ Edit entry' : '＋ New entry'}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <FormField label="Title">
          <input className={FIELD_INPUT} value={form.title} onChange={set('title')} maxLength={255} autoFocus
            placeholder="e.g. Session 14 — The Sunless Citadel" />
        </FormField>

        <FormField label={`${groupLabel} (optional)`}>
          <input className={FIELD_INPUT} value={form.group} onChange={set('group')} maxLength={120}
            list="diary-group-options"
            placeholder={groupLabel === 'Chapter' ? 'e.g. Act I — The Road to Nyth' : 'e.g. Session notes'} />
          <datalist id="diary-group-options">
            {groupOptions.map((g) => <option key={g} value={g} />)}
          </datalist>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Session number (optional)">
            <input className={FIELD_INPUT} type="number" min={1} value={form.session_no} onChange={set('session_no')} />
          </FormField>
          <FormField label="Date played (optional)">
            <input className={FIELD_INPUT} type="date" value={form.session_date} onChange={set('session_date')} />
          </FormField>
        </div>

        <FormField label="Summary">
          {preview ? (
            <div className="bg-surface2 border border-border2 rounded-sm p-3 min-h-[12rem] max-h-[22rem] overflow-y-auto">
              <Markdown className="text-text-dim text-sm leading-relaxed font-body">{form.body}</Markdown>
            </div>
          ) : (
            <textarea
              className={`${FIELD_INPUT} resize-y font-body`}
              rows={12}
              value={form.body}
              onChange={set('body')}
              placeholder={'## What happened\n\nThe party **finally** reached the rift.\n\n- Thorn fell to the goblin ambush\n- Mira recovered the *Gulthias staff*\n\n> "We should not have opened it."\n\nSee the [tavern map](/journey-map).'}
            />
          )}
        </FormField>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? '✎ Write' : '👁 Preview'}
          </Button>
          <span className="text-[0.65rem] text-text-muted">
            Markdown: # heading, **bold**, *italic*, `code`, &gt; quote, - list, [text](link)
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="accent" loading={saving} disabled={!form.title.trim()} onClick={submit}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
