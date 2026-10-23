/**
 * pages/Surveys/SurveyResults.jsx
 *
 * Every run of one survey, side by side.
 *
 * This is the reason runs exist as their own table. A single average tells
 * a DM almost nothing — "6.2 on railroading" is only news next to the 7.8
 * it was three months ago. So the unit of display is the ROW: one question,
 * one column per asking, and the change against the time before.
 *
 * Colour comes from the question's polarity rather than from the number, so
 * a falling railroading score and a rising involvement score both read as
 * good news. See `toneOf`.
 */
import { useMemo } from 'react';

import { Markdown } from '@/components/ui';
import { toneOf, deltaOf } from './constants';

const TONE = {
  good: 'text-[#9fd49f]',
  bad:  'text-[#d49f9f]',
};

/** `2026-10-22` — the date alone; the time of day is noise here. */
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

export default function SurveyResults({ data }) {
  const { questions = [], runs = [], stats = [], comments = [], submitted = [], survey } = data ?? {};

  // (question, run) -> row, so the table is a lookup rather than a scan.
  const statAt = useMemo(() => {
    const m = new Map();
    for (const s of stats) m.set(`${s.question_id}:${s.run_id}`, s);
    return m;
  }, [stats]);

  const commentsAt = useMemo(() => {
    const m = new Map();
    for (const c of comments) {
      const k = `${c.question_id}:${c.run_id}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return m;
  }, [comments]);

  const whoAt = useMemo(() => {
    const m = new Map();
    for (const s of submitted) {
      if (!m.has(s.run_id)) m.set(s.run_id, []);
      m.get(s.run_id).push(s.player_name);
    }
    return m;
  }, [submitted]);

  if (!runs.length) {
    return (
      <p className="text-text-dim text-sm italic py-6 text-center">
        Never asked yet. Open it and the players get a bubble next time they are in.
      </p>
    );
  }

  const scaleQs = questions.filter((q) => q.kind === 'scale');
  const textQs  = questions.filter((q) => q.kind === 'text');

  return (
    <div className="flex flex-col gap-4">
      {survey?.intro && (
        <div className="text-sm text-text-dim border-l-2 border-[var(--gold-dim)] pl-2">
          <Markdown>{survey.intro}</Markdown>
        </div>
      )}

      {/* Who answered which run. Works on an anonymous survey because
          attendance is kept apart from the answers themselves. */}
      <div className="flex flex-wrap gap-2">
        {runs.map((r) => (
          <div key={r.id} className="border border-border rounded-sm px-2 py-1.5 bg-surface2">
            <div className="text-[0.7rem] font-display uppercase tracking-wider text-gold">
              {r.label || day(r.opened_at)}
              {!r.closed_at && <span className="text-[#9fd49f]"> · open</span>}
            </div>
            <div className="text-[0.7rem] text-text-muted">
              {r.response_count} answered
              {(whoAt.get(r.id) ?? []).length > 0 && ` · ${(whoAt.get(r.id) ?? []).join(', ')}`}
            </div>
          </div>
        ))}
      </div>

      {scaleQs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-2 py-2 font-display text-[0.7rem] uppercase tracking-wider text-text-dim">
                  Question
                </th>
                {runs.map((r) => (
                  <th key={r.id}
                    className="text-right px-2 py-2 font-display text-[0.7rem] uppercase tracking-wider text-text-dim whitespace-nowrap">
                    {r.label || day(r.opened_at)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scaleQs.map((q) => {
                const cells = runs.map((r) => statAt.get(`${q.id}:${r.id}`) ?? null);
                return (
                  <tr key={q.id} className="border-b border-border/50 align-top">
                    <td className="px-2 py-2 max-w-[28rem]">
                      <div className="text-text">{q.prompt}</div>
                      <div className="text-[0.68rem] text-text-muted">
                        {q.scale_min}–{q.scale_max}
                        {q.low_label && ` · ${q.scale_min} ${q.low_label}`}
                        {q.high_label && ` · ${q.scale_max} ${q.high_label}`}
                      </div>
                    </td>
                    {cells.map((c, i) => {
                      // Against the previous run that actually has a number,
                      // not the previous column — a run nobody answered
                      // should not break the comparison either side of it.
                      const prev = cells.slice(0, i).reverse().find((x) => x?.avg != null);
                      const d = deltaOf(c?.avg, prev?.avg);
                      const tone = toneOf(c?.avg, q);
                      return (
                        <td key={runs[i].id} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                          {c?.avg == null ? (
                            <span className="text-text-muted">—</span>
                          ) : (
                            <>
                              <span className={`text-base ${TONE[tone] ?? 'text-text'}`}>{c.avg}</span>
                              <span className="text-[0.65rem] text-text-muted"> /{q.scale_max}</span>
                              <div className="text-[0.65rem] text-text-muted">
                                n={c.n} · {c.min}–{c.max}
                                {d !== null && d !== 0 && (
                                  <span className="ml-1">{d > 0 ? `▲ +${d}` : `▼ ${d}`}</span>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[0.68rem] text-text-muted italic mt-1">
            Green and red follow each question&rsquo;s own direction, not the number — a falling
            railroading score and a rising involvement score are both good news. ▲▼ is the change
            since the previous asking.
          </p>
        </div>
      )}

      {/* What they actually wrote. Usually where the answer is. */}
      {questions.map((q) => {
        const all = runs.flatMap((r) => (commentsAt.get(`${q.id}:${r.id}`) ?? [])
          .map((c) => ({ ...c, run: r })));
        if (!all.length) return null;
        return (
          <div key={`c-${q.id}`} className="border-t border-border pt-2">
            <p className="font-display uppercase tracking-wider text-[0.7rem] text-gold mb-1">
              {q.prompt}
            </p>
            <ul className="flex flex-col gap-1.5">
              {all.map((c, i) => (
                <li key={i} className="text-sm text-text-dim border-l-2 border-border pl-2">
                  <Markdown>{c.comment}</Markdown>
                  <span className="text-[0.65rem] text-text-muted">
                    {c.run.label || day(c.run.opened_at)}
                    {/* Only on an attributed survey — an anonymous one has
                        no player on the response to join to. */}
                    {c.player_name ? ` · ${c.player_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {textQs.length > 0 && !comments.length && (
        <p className="text-text-muted text-sm italic">No written answers yet.</p>
      )}
    </div>
  );
}
