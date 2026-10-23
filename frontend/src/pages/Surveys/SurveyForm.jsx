/**
 * pages/Surveys/SurveyForm.jsx
 *
 * The questions, as a player answers them.
 *
 * Shared by the floating bubble's modal and the `/survey/:runId` page a DM
 * can send as a link. They are the same act — answering one asking — and
 * two copies of the scale buttons would drift the first time either was
 * touched.
 *
 * Owns its own answers. The caller supplies the form and an `onSent` for
 * what happens after; sending is done here so the double-submit message and
 * the busy state cannot differ between the two places it is used.
 */
import { useState } from 'react';

import { Button, Markdown } from '@/components/ui';
import { surveysApi } from '@/api/surveys';
import { useToast } from '@/hooks/useToast';

/**
 * Tell the bubble a run was answered elsewhere.
 *
 * The bubble asks for its pending list once, when the layout mounts, and the
 * layout outlives every route change — so answering on the link page would
 * leave it still offering the same survey on the next page. An event costs
 * nothing; refetching on every navigation would be a request per click.
 */
export const ANSWERED_EVENT = 'survey:answered';

export default function SurveyForm({ form, onSent, onLater, laterLabel = 'Later' }) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await surveysApi.submit(form.id, {
        answers: (form.questions ?? []).map((q) => ({
          question_id: q.id,
          score: answers[q.id]?.score ?? null,
          comment: answers[q.id]?.comment ?? '',
        })),
      });
      window.dispatchEvent(new CustomEvent(ANSWERED_EVENT, { detail: { runId: form.id } }));
      toast('Thanks — sent', 'success');
      onSent?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {form.intro && (
        <div className="text-sm text-text-dim border-l-2 border-[var(--gold-dim)] pl-2">
          <Markdown>{form.intro}</Markdown>
        </div>
      )}
      <p className="text-[0.72rem] text-text-muted italic">
        {form.anonymous
          ? 'Answers are stored without your name. Your DM sees that you answered, not what you said — though on a table this size, writing in your own voice is still recognisable.'
          : 'Your DM will see your name against these answers.'}
        {' '}Every question can be skipped.
      </p>

      <div className="flex flex-col gap-4">
        {(form.questions ?? []).map((q, i) => (
          <div key={q.id} className="flex flex-col gap-1.5 border-b border-border pb-3">
            <p className="text-sm text-text">
              <span className="text-text-muted tabular-nums">{i + 1}. </span>{q.prompt}
            </p>

            {q.kind === 'scale' && (
              /* The end labels sit ON the row, either side of the numbers,
                 so "Very unevenly 1 … 10 Evenly shared" reads as one
                 sentence. Underneath, the right-hand label landed at the
                 far edge of the box, nowhere near the 10 it describes.
                 flex-wrap lets a phone break the row rather than scroll. */
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {q.low_label && (
                  <span className="text-xs text-text-muted">{q.low_label}</span>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: q.scale_max - q.scale_min + 1 },
                    (_, n) => q.scale_min + n).map((v) => {
                    const on = answers[q.id]?.score === v;
                    return (
                      <button
                        key={v} type="button"
                        aria-pressed={on}
                        aria-label={`${v}${v === q.scale_min && q.low_label ? ` — ${q.low_label}` : ''}${v === q.scale_max && q.high_label ? ` — ${q.high_label}` : ''}`}
                        onClick={() => setAnswers((a) => ({
                          ...a,
                          // Tapping the chosen one again clears it — the
                          // only way back to "skipped".
                          [q.id]: { ...a[q.id], score: on ? null : v },
                        }))}
                        className={`w-9 h-9 rounded-sm border text-sm tabular-nums ${on
                          ? 'bg-[var(--gold-dim)] border-gold text-text'
                          : 'bg-surface2 border-border2 text-text-dim hover:border-[var(--gold-dim)]'}`}
                      >{v}</button>
                    );
                  })}
                </div>
                {q.high_label && (
                  <span className="text-xs text-text-muted">{q.high_label}</span>
                )}
              </div>
            )}

            {(q.kind === 'text' || q.allow_comment) && (
              <textarea
                rows={q.kind === 'text' ? 4 : 2}
                value={answers[q.id]?.comment ?? ''}
                onChange={(e) => setAnswers((a) => ({
                  ...a, [q.id]: { ...a[q.id], comment: e.target.value },
                }))}
                placeholder={q.kind === 'text' ? 'Your answer…' : 'Anything to add? (optional)'}
                className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5
                           rounded-sm text-sm resize-y focus:outline-none
                           focus:border-[var(--gold-dim)]"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        {onLater && <Button variant="ghost" onClick={onLater}>{laterLabel}</Button>}
        <Button variant="accent" loading={busy} onClick={submit}>Send</Button>
      </div>
    </div>
  );
}
