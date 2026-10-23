/**
 * pages/Surveys/SurveyPage.jsx
 *
 * `/survey/:token` — one asking, as a page, so a DM can paste a link into
 * the group chat instead of waiting for everyone to open the app.
 *
 * Deliberately NOT behind ProtectedRoute. That guard sends a logged-out
 * visitor to `/` and drops where they were going, which is fatal for a link
 * whose whole job is to be clicked from outside the app. This page instead
 * asks the server, and lets ShareGateMessage turn a 401 into "log in" with
 * the way back carried along — the same thing every share page does.
 *
 * By share TOKEN, not run id. An id was guessable, and the answers it got
 * back — "exists, not yours" versus "does not exist" — told a stranger how
 * many surveys the instance had asked. Every other share link in the app
 * was already a token. Seat and membership are still checked behind it;
 * the token only decides which survey you are asking about.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui';
import { surveysApi } from '@/api/surveys';
import { useAsync } from '@/hooks/useAsync';
import ShareGateMessage from '@/components/ShareGateMessage';
import AppHeader from '@/components/layout/AppHeader';
import SurveyForm from './SurveyForm';

function Panel({ icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
      <div className="text-4xl" aria-hidden="true">{icon}</div>
      <div className="text-text-dim text-sm max-w-sm">{children}</div>
    </div>
  );
}

export default function SurveyPage() {
  const { token } = useParams();
  const [sent, setSent] = useState(false);
  const { data, loading, error, errorInfo } = useAsync(
    () => surveysApi.byToken(token),
    { autoRun: true, deps: [token] },
  );

  useEffect(() => {
    document.title = data?.title ? `${data.title} — Survey` : 'Survey';
  }, [data]);

  return (
    <>
      <AppHeader icon="📊" name="Survey" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[740px] mx-auto px-4 pb-10 pt-7">
          {loading && <Panel icon="⏳">Loading…</Panel>}

          {/* Closed is its own answer, not a generic failure: the link was
              right, it is just too late, and "ask the DM" is the wrong next
              step for that. */}
          {!loading && error && errorInfo?.status === 410 && (
            <Panel icon="🔒">
              This survey has closed. Thanks anyway — if there is something you
              still want to say, tell your DM directly.
            </Panel>
          )}

          {!loading && error && errorInfo?.status !== 410 && (
            <ShareGateMessage icon="📊" status={errorInfo?.status} code={errorInfo?.code}
              message="This survey link does not exist, or it is not for this campaign." />
          )}

          {!loading && !error && data && (sent || data.answered) && (
            <Panel icon="✅">
              <p className="mb-3">
                {sent ? 'Sent — thank you.' : 'You have already answered this one.'}
              </p>
              <Link to="/"><Button variant="ghost">Back to the app</Button></Link>
            </Panel>
          )}

          {/* A DM opening their own link has no seat to answer from. Showing
              the form anyway lets them check what the players will see —
              but the Send would only ever be refused, so it is not offered. */}
          {!loading && !error && data && !sent && !data.answered && !data.can_answer && (
            <>
              <Panel icon="👁">
                This is what your players will see. You do not hold a seat in this
                campaign, so there is nothing for you to send.
              </Panel>
              <h1 className="font-display text-gold text-lg mb-3">{data.title}</h1>
              <div className="pointer-events-none opacity-70">
                <SurveyForm form={data} />
              </div>
            </>
          )}

          {!loading && !error && data && !sent && !data.answered && data.can_answer && (
            <>
              <h1 className="font-display text-gold text-lg mb-1">{data.title}</h1>
              {data.label && <p className="text-xs text-text-muted mb-4">{data.label}</p>}
              <SurveyForm form={data} onSent={() => setSent(true)} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
