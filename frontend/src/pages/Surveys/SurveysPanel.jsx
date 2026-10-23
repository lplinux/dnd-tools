/**
 * pages/Surveys/SurveysPanel.jsx
 *
 * The DM's side: write a survey, ask it, read what came back.
 *
 * "Ask it" is opening a RUN. The same survey asked again in three months is
 * a second run of the same questions, which is what makes the results a
 * comparison rather than a snapshot — so the primary action on a survey
 * that already has history is *Ask again*, not *New survey*.
 */
import { useCallback, useEffect, useState } from 'react';

import { Button, Modal, Spinner, FormField } from '@/components/ui';
import { campaignsApi } from '@/api/campaigns';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import SurveyEditor from './SurveyEditor';
import SurveyResults from './SurveyResults';
import { blankQuestion } from './constants';
import ShareLink from './ShareLink';

const INPUT = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 '
  + 'rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

const newForm = () => ({
  id: null, title: '', intro: '', anonymous: true, questions: [blankQuestion()],
});

export default function SurveysPanel({ campaignId }) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);        // the editor, null = shut
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null);  // { surveyId, data } | null
  const [asking, setAsking] = useState(null);    // the survey being opened
  // The link to send, shown straight after opening a run — the moment the
  // DM wants it — and again from the card while it stays open.
  const [sharing, setSharing] = useState(null);  // { title, token } | null

  const load = useCallback(async () => {
    try { setList(await campaignsApi.listSurveys(campaignId) ?? []); }
    catch (e) { toast(e.message, 'error'); setList([]); }
  }, [campaignId, toast]);

  useEffect(() => { load(); }, [load]);

  async function openEditor(row) {
    if (!row) { setForm(newForm()); return; }
    try {
      const full = await campaignsApi.getSurvey(campaignId, row.id);
      setForm({
        id: full.id,
        title: full.title ?? '',
        intro: full.intro ?? '',
        anonymous: full.anonymous !== false,
        questions: (full.questions ?? []).map((q) => ({ ...q, low_label: q.low_label ?? '', high_label: q.high_label ?? '' })),
      });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function save() {
    setSaving(true);
    const body = {
      title: form.title,
      intro: form.intro,
      anonymous: form.anonymous,
      questions: form.questions.filter((q) => q.prompt.trim()),
    };
    try {
      if (form.id) await campaignsApi.saveSurvey(campaignId, form.id, body);
      else await campaignsApi.addSurvey(campaignId, body);
      setForm(null);
      await load();
      // Re-reading an open results view, so a reworded question updates
      // underneath it rather than showing the old text.
      if (results) await showResults(results.surveyId);
      toast('Survey saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally { setSaving(false); }
  }

  const showResults = useCallback(async (surveyId) => {
    try {
      setResults({ surveyId, data: null });
      setResults({ surveyId, data: await campaignsApi.surveyResults(campaignId, surveyId) });
    } catch (e) { toast(e.message, 'error'); setResults(null); }
  }, [campaignId, toast]);

  async function ask(survey, label) {
    try {
      const run = await campaignsApi.openRun(campaignId, survey.id, { label });
      setAsking(null);
      await load();
      setSharing({ title: survey.title, token: run.share_token });
    } catch (e) { toast(e.message, 'error'); }
  }

  async function closeOpenRun(survey) {
    try {
      const full = await campaignsApi.getSurvey(campaignId, survey.id);
      const open = (full.runs ?? []).find((r) => !r.closed_at);
      if (!open) { await load(); return; }
      await campaignsApi.setRun(campaignId, survey.id, open.id, { closed: true });
      await load();
      if (results?.surveyId === survey.id) await showResults(survey.id);
      toast('Closed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  /*
   * Wipe the results, keep the questions. The numbers come from the server
   * rather than from the list, which only counts askings — "delete 2 runs"
   * says much less than "and the 9 answers given to them".
   */
  async function reset(survey) {
    let runs = Number(survey.run_count) || 0;
    let answers = 0;
    try {
      const full = await campaignsApi.getSurvey(campaignId, survey.id);
      runs = (full.runs ?? []).length;
      answers = (full.runs ?? []).reduce((n, r) => n + (Number(r.response_count) || 0), 0);
    } catch { /* the confirmation still works on the list's own count */ }
    const open = Number(survey.open_count) > 0;
    if (!await confirm(
      [
        `Reset “${survey.title}”?`,
        `This deletes ${runs} asking${runs === 1 ? '' : 's'} and the ${answers} answer${answers === 1 ? '' : 's'} given to ${runs === 1 ? 'it' : 'them'}. The questions stay, ready to ask again.`,
        open ? 'It is open right now: it closes, and the players’ bubbles for it disappear.' : null,
        'This cannot be undone. To keep a copy, use Settings → Export part… with “Surveys — results” first.',
      ].filter(Boolean).join('\n\n'),
      { title: 'Reset survey', confirmLabel: 'Reset' })) return;
    try {
      const r = await campaignsApi.resetSurvey(campaignId, survey.id);
      await load();
      if (results?.surveyId === survey.id) await showResults(survey.id);
      toast(`Reset — ${r.runs} asking(s) and ${r.responses} answer(s) removed.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function remove(survey) {
    if (!await confirm(
      `Delete “${survey.title}” and every answer ever given to it?`,
      { title: 'Delete survey', confirmLabel: 'Delete' })) return;
    try {
      await campaignsApi.deleteSurvey(campaignId, survey.id);
      if (results?.surveyId === survey.id) setResults(null);
      await load();
      toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  if (list === null) return <div className="py-10 text-center"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-text-muted text-xs italic flex-1">
          Ask the table how it is going. You write the questions; asking one puts a bubble in
          front of every player next time they are in the app. Ask the same one again later and
          the answers line up against the last time.
        </p>
        <Button variant="accent" onClick={() => openEditor(null)}>＋ New survey</Button>
      </div>

      {!list.length ? (
        <p className="text-text-dim text-sm italic text-center py-6">
          No surveys yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((s) => (
            <div key={s.id} className="border border-border rounded-sm p-2.5 bg-surface2">
              <div className="flex items-center flex-wrap gap-2">
                <strong className="text-text flex-1 min-w-0">{s.title}</strong>
                {Number(s.open_count) > 0 && (
                  <span className="text-[0.65rem] font-display uppercase tracking-wider
                                   rounded-sm px-1.5 py-0.5 bg-[#2d3a1a] text-[#9fd49f]">
                    Open
                  </span>
                )}
                {s.anonymous && (
                  <span className="text-[0.65rem] text-text-muted" title="Answers carry no name">
                    anonymous
                  </span>
                )}
              </div>
              <div className="text-[0.7rem] text-text-muted mt-0.5">
                {s.question_count} question(s) · asked {s.run_count} time(s)
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {Number(s.open_count) > 0 ? (
                  <>
                    <Button variant="accent"
                      onClick={() => setSharing({ title: s.title, token: s.open_run_token })}>
                      🔗 Link
                    </Button>
                    <Button variant="default" onClick={() => closeOpenRun(s)}>■ Close</Button>
                  </>
                ) : (
                  <Button variant="accent" onClick={() => setAsking(s)}>
                    {Number(s.run_count) > 0 ? '↻ Ask again' : '▶ Ask'}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => showResults(s.id)}>📊 Results</Button>
                <Button variant="ghost" onClick={() => openEditor(s)}>✎ Edit</Button>
                {/* Only once there is something to clear. */}
                {Number(s.run_count) > 0 && (
                  <Button variant="ghost" onClick={() => reset(s)}
                    title="Delete every asking and answer, keep the questions">
                    ↺ Reset
                  </Button>
                )}
                <Button variant="danger" onClick={() => remove(s)} title="Delete the survey">🗑</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)}
        title={form?.id ? '✎ Edit survey' : '＋ New survey'}
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
        {form && (
          <SurveyEditor form={form} setForm={setForm} saving={saving}
            onSave={save} onCancel={() => setForm(null)} />
        )}
      </Modal>

      {/* Asking is its own small step because the label is worth setting:
          "After session 25" reads better in the results than a date. */}
      <Modal open={!!asking} onClose={() => setAsking(null)} title="Ask the table">
        {asking && (
          <AskForm survey={asking} onCancel={() => setAsking(null)}
            onAsk={(label) => ask(asking, label)} />
        )}
      </Modal>

      <Modal open={!!sharing} onClose={() => setSharing(null)} title="🔗 Send it to the table">
        {sharing && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-dim">
              <strong className="text-text">{sharing.title}</strong> is open. Players already get
              a bubble in the app; this link takes them straight to it from the group chat.
            </p>
            <ShareLink token={sharing.token} />
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSharing(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!results} onClose={() => setResults(null)}
        title="📊 Results"
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
        {results && (results.data
          ? <SurveyResults data={results.data} />
          : <div className="py-10 text-center"><Spinner /></div>)}
      </Modal>
    </div>
  );
}

function AskForm({ survey, onAsk, onCancel }) {
  const [label, setLabel] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-dim">
        Opens <strong className="text-text">{survey.title}</strong> for every player in this
        campaign. They will see a bubble until they answer or you close it.
      </p>
      <FormField label="Name this asking (optional)">
        <input className={INPUT} value={label} autoFocus
          onChange={(e) => setLabel(e.target.value)}
          placeholder="After session 25" />
      </FormField>
      <p className="text-[0.7rem] text-text-muted italic">
        It becomes the column heading in the results. Without one, the date is used.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="accent" onClick={() => onAsk(label)}>Open it</Button>
      </div>
    </div>
  );
}
