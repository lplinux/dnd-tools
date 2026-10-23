/**
 * components/SurveyBubble.jsx
 *
 * "Your DM is asking something." A small floating bubble, bottom right, on
 * whatever page the player happens to be on.
 *
 * Mounted once in the app layout rather than on a page, because there is no
 * page a player reliably visits — they live in the timeline, the diary or
 * their sheet, and a survey waiting on the one they never open is a survey
 * nobody answers.
 *
 * Asked for ONCE per page load, not polled. A survey is a thing a DM opens
 * between sessions, not something that arrives mid-click, and a timer here
 * would be a request per player per interval forever to catch it a few
 * minutes sooner. A run answered on the link page is dropped by event — see
 * ANSWERED_EVENT — rather than by refetching on every navigation.
 *
 * Dismissal is per browser and per run (`localStorage`), so closing the
 * bubble does not mean "answered": it comes back next session, and the DM's
 * "who has answered" list is unaffected by it. Storage is wrapped because it
 * throws in a private window, and a survey prompt is not worth a crash.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, Modal, Spinner } from '@/components/ui';
import { surveysApi } from '@/api/surveys';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import SurveyForm, { ANSWERED_EVENT } from '@/pages/Surveys/SurveyForm';

const SNOOZE_KEY = 'survey-snoozed-runs';

function snoozed() {
  try { return new Set(JSON.parse(localStorage.getItem(SNOOZE_KEY) || '[]')); }
  catch { return new Set(); }
}
function snooze(runId) {
  try {
    const s = snoozed(); s.add(runId);
    localStorage.setItem(SNOOZE_KEY, JSON.stringify([...s]));
  } catch { /* private window: it simply reappears on the next page */ }
}

export default function SurveyBubble() {
  const { toast } = useToast();
  /*
   * AppLayout wraps the public token pages too — a shared map or diary is
   * read without an account. Gating on the session keeps those pages from
   * firing a request that can only ever 401.
   */
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(null);      // { run, form } | null

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    surveysApi.pending()
      .then((rows) => {
        if (!alive) return;
        const skip = snoozed();
        setPending((rows ?? []).filter((r) => !skip.has(r.run_id)));
      })
      // A player with no campaigns: not an error worth showing anyone.
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    const drop = (e) => setPending((p) => p.filter((x) => x.run_id !== e.detail?.runId));
    window.addEventListener(ANSWERED_EVENT, drop);
    return () => window.removeEventListener(ANSWERED_EVENT, drop);
  }, []);

  const start = useCallback(async (row) => {
    setOpen({ run: row, form: null });
    try {
      setOpen({ run: row, form: await surveysApi.form(row.run_id) });
    } catch (e) {
      toast(e.message, 'error');
      setOpen(null);
      // Closed or withdrawn while the bubble sat there.
      setPending((p) => p.filter((x) => x.run_id !== row.run_id));
    }
  }, [toast]);

  /*
   * Not on the link page itself. It already IS the survey, and a bubble in
   * the corner offering the same one again reads as a second survey.
   */
  if (pathname.startsWith('/survey/')) return null;
  if (!user || (!pending.length && !open)) return null;

  const next = pending[0];

  return (
    <>
      {next && !open && (
        <div className="fixed bottom-4 right-4 z-40 max-w-[22rem]">
          <div className="bg-surface2 border border-[var(--gold-dim)] rounded-sm shadow-xl p-3
                          flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span aria-hidden="true">📊</span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-gold text-sm">{next.title}</p>
                <p className="text-[0.7rem] text-text-muted">
                  {next.campaign_name}
                  {next.label ? ` · ${next.label}` : ''}
                  {next.anonymous ? ' · anonymous' : ''}
                </p>
              </div>
              <button type="button" aria-label="Not now"
                onClick={() => { snooze(next.run_id); setPending((p) => p.slice(1)); }}
                className="text-text-muted hover:text-gold text-sm leading-none">✕</button>
            </div>
            <p className="text-[0.75rem] text-text-dim">
              Your DM would like to know how the campaign is going.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost"
                onClick={() => { snooze(next.run_id); setPending((p) => p.slice(1)); }}>
                Not now
              </Button>
              <Button variant="accent" onClick={() => start(next)}>Answer</Button>
            </div>
            {pending.length > 1 && (
              <p className="text-[0.65rem] text-text-muted text-right">
                +{pending.length - 1} more waiting
              </p>
            )}
          </div>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)}
        title={open?.run?.title ?? ''}
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
        {open && (!open.form ? (
          <div className="py-10 text-center"><Spinner /></div>
        ) : (
          <div className="max-h-[78vh] overflow-y-auto pr-1">
            {/* The event SurveyForm fires on send removes it from `pending`. */}
            <SurveyForm form={open.form} onSent={() => setOpen(null)}
              onLater={() => setOpen(null)} />
          </div>
        ))}
      </Modal>
    </>
  );
}
