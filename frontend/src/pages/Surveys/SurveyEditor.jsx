/**
 * pages/Surveys/SurveyEditor.jsx
 *
 * Writing the questions. The whole point of the feature is that the DM
 * chooses them, so this is a list builder rather than a fixed form.
 *
 * Questions already answered cannot be removed — the server refuses, and
 * the editor says so before you try rather than letting you queue up a
 * change that will bounce. Rewording one IS allowed: that is how a typo is
 * fixed, and forcing a near-duplicate survey instead would lose exactly the
 * comparison the runs exist to provide.
 */
import { useState } from 'react';

import { Button, FormField } from '@/components/ui';
import { KINDS, POLARITIES, blankQuestion } from './constants';

const INPUT = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 '
  + 'rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';
const SMALL = 'bg-surface2 border border-border2 text-text px-1.5 py-1 rounded-sm '
  + 'text-xs focus:outline-none focus:border-[var(--gold-dim)]';

export default function SurveyEditor({ form, setForm, saving, onSave, onCancel }) {
  const [error, setError] = useState(null);

  const setQ = (i, patch) => setForm((f) => ({
    ...f, questions: f.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)),
  }));
  const addQ = () => setForm((f) => ({ ...f, questions: [...f.questions, blankQuestion()] }));
  const removeQ = (i) => setForm((f) => ({
    ...f, questions: f.questions.filter((_, n) => n !== i),
  }));
  const move = (i, by) => setForm((f) => {
    const qs = [...f.questions];
    const to = i + by;
    if (to < 0 || to >= qs.length) return f;
    [qs[i], qs[to]] = [qs[to], qs[i]];
    return { ...f, questions: qs };
  });

  function save() {
    if (!form.title.trim()) { setError('Give it a title.'); return; }
    if (!form.questions.some((q) => q.prompt.trim())) { setError('Add at least one question.'); return; }
    setError(null);
    onSave();
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Title">
        <input className={INPUT} value={form.title} autoFocus
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="How is the campaign going?" />
      </FormField>

      <FormField label="Intro (optional)">
        <textarea className={INPUT + ' resize-y'} rows={2} value={form.intro}
          onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
          placeholder="What you want them to know before answering. Markdown works here." />
      </FormField>

      <label className="flex items-start gap-2 text-sm text-text-dim">
        <input type="checkbox" checked={form.anonymous} className="mt-0.5"
          onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))} />
        <span>
          <strong className="text-text">Anonymous</strong> — answers are stored with no name
          against them. You still see who has and has not answered.
          <span className="block text-[0.7rem] text-text-muted italic mt-0.5">
            With a table of five, free text still sounds like whoever wrote it. This stops
            casual attribution, not a determined guess.
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="font-display uppercase tracking-wider text-[0.7rem] text-gold">
          Questions ({form.questions.length})
        </span>
        <Button variant="ghost" onClick={addQ}>＋ Add question</Button>
      </div>

      <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto pr-1">
        {form.questions.map((q, i) => (
          <div key={q.id ?? `new-${i}`}
            className="border border-border rounded-sm p-2 bg-surface2 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="text-text-muted text-xs pt-2 tabular-nums w-5">{i + 1}.</span>
              <textarea className={INPUT + ' resize-y'} rows={2} value={q.prompt}
                onChange={(e) => setQ(i, { prompt: e.target.value })}
                placeholder="How much do you feel there is railroading?" />
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-text-muted hover:text-gold disabled:opacity-25" title="Move up">▴</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === form.questions.length - 1}
                  className="text-text-muted hover:text-gold disabled:opacity-25" title="Move down">▾</button>
              </div>
              {/* Answered questions cannot go — removing one would cascade
                  its answers and rewrite the history being compared. */}
              <button type="button" onClick={() => removeQ(i)} disabled={Number(q.answer_count) > 0}
                title={Number(q.answer_count) > 0
                  ? 'Already answered — it stays, so the history stays comparable'
                  : 'Remove'}
                className="text-danger hover:brightness-125 disabled:opacity-25 disabled:hover:brightness-100">✕</button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-7">
              <select className={SMALL} value={q.kind} aria-label="Question type"
                onChange={(e) => setQ(i, { kind: e.target.value })}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>

              {q.kind === 'scale' && (
                <>
                  <span className="text-[0.7rem] text-text-muted">from</span>
                  <input type="number" className={SMALL + ' w-14'} value={q.scale_min}
                    aria-label="Scale minimum"
                    onChange={(e) => setQ(i, { scale_min: e.target.value })} />
                  <span className="text-[0.7rem] text-text-muted">to</span>
                  <input type="number" className={SMALL + ' w-14'} value={q.scale_max}
                    aria-label="Scale maximum"
                    onChange={(e) => setQ(i, { scale_max: e.target.value })} />
                  <input className={SMALL + ' w-28'} value={q.low_label ?? ''}
                    aria-label="Label for the low end"
                    onChange={(e) => setQ(i, { low_label: e.target.value })}
                    placeholder="low label" />
                  <input className={SMALL + ' w-28'} value={q.high_label ?? ''}
                    aria-label="Label for the high end"
                    onChange={(e) => setQ(i, { high_label: e.target.value })}
                    placeholder="high label" />
                  <select className={SMALL} value={q.polarity} aria-label="Which direction is better"
                    onChange={(e) => setQ(i, { polarity: e.target.value })}>
                    {POLARITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[0.7rem] text-text-dim">
                    <input type="checkbox" checked={q.allow_comment !== false}
                      onChange={(e) => setQ(i, { allow_comment: e.target.checked })} />
                    comment box
                  </label>
                </>
              )}
            </div>

            {q.kind === 'scale' && (
              <p className="pl-7 text-[0.68rem] text-text-muted italic">
                {POLARITIES.find((p) => p.id === q.polarity)?.hint}
                {Number(q.answer_count) > 0 && ` · ${q.answer_count} answer(s) already`}
              </p>
            )}
          </div>
        ))}
        {!form.questions.length && (
          <p className="text-text-dim text-sm italic text-center py-4">
            No questions yet. A 1-10 scale with a comment box is a good default.
          </p>
        )}
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="accent" loading={saving} onClick={save}>Save survey</Button>
      </div>
    </div>
  );
}
