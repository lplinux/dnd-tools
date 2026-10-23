/**
 * test/surveys.test.js
 *
 * Campaign surveys: the DM writes the questions, asks them, and asks the
 * same ones again later so the answers can be compared.
 *
 * The risks worth pinning are not "does it store a number":
 *
 *   - a run is the unit of history, so anything that would silently delete
 *     or rewrite past answers has to be refused rather than allowed;
 *   - "anonymous" has to mean the column is NULL, not that the UI hides a
 *     name it is still storing;
 *   - the player routes resolve the seat server-side, so there is no id in
 *     a request body deciding whose answer this is;
 *   - and the DM's `polarity` — which direction is the good one — must not
 *     reach the person answering, because it is a nudge.
 *
 * Also verified live against a scratch Postgres: 43 checks over both the
 * anonymous and attributed paths, two runs of one survey, and the refusals.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(path.join(root, p), 'utf8');
const source = src('app.js');

function route(signature) {
  const at = source.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
}

describe('the shape: a survey, and each asking of it', () => {
  it('runs are their own table, not a column on the survey', () => {
    /*
     * The whole feature is the comparison. A survey with "last answered"
     * and an average on it could hold one asking; this holds all of them.
     */
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS campaign_survey_runs \(/);
    expect(source).toMatch(/survey_id INTEGER NOT NULL REFERENCES campaign_surveys\(id\) ON DELETE CASCADE/);
    expect(source).toMatch(/closed_at TIMESTAMP/);
  });

  it('and answers hang off a response, which hangs off a run', () => {
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS campaign_survey_responses \(/);
    expect(source).toMatch(/run_id       INTEGER NOT NULL REFERENCES campaign_survey_runs\(id\) ON DELETE CASCADE/);
    expect(source).toMatch(/response_id INTEGER NOT NULL REFERENCES campaign_survey_responses\(id\) ON DELETE CASCADE/);
  });

  it('the questions are the DM\'s — nothing is seeded', () => {
    // A fixed set would make this a different feature.
    expect(source).not.toMatch(/INSERT INTO campaign_survey_questions[\s\S]{0,200}railroading/i);
  });

  it('kind and polarity are constrained in the database', () => {
    // Added separately, because a CHECK inside CREATE TABLE never reaches
    // a table that already exists.
    expect(source).toMatch(/ADD CONSTRAINT campaign_survey_questions_kind_check\s*\n\s*CHECK \(kind IN \('scale','text'\)\)/);
    expect(source).toMatch(/ADD CONSTRAINT campaign_survey_questions_polarity_check\s*\n\s*CHECK \(polarity IN \('higher','lower','middle','neutral'\)\)/);
  });
});

describe('anonymity is a stored fact, not a hidden one', () => {
  const post = route("app.post('/api/surveys/runs/:runId/responses'");

  it('an anonymous response records no player at all', () => {
    // Not "unknown" — deliberately not written. A UI that hid a name it
    // was still storing would be a promise the database could break.
    expect(post).toMatch(/\[runId, row\.anonymous \? null : seat\.id\]/);
  });

  it('but who answered is kept, separately', () => {
    /*
     * So the DM can chase the two who have not without being able to read
     * what the other three said. Two tables rather than a nullable column
     * is what makes that possible at all.
     */
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS campaign_survey_submissions \(/);
    expect(source).toMatch(/PRIMARY KEY \(run_id, player_id\)/);
    expect(post).toMatch(/INSERT INTO campaign_survey_submissions \(run_id, player_id\)/);
  });

  it('and the attendance row is claimed FIRST, by row count', () => {
    /*
     * Its primary key is the only thing that settles a double submit — two
     * taps on a slow connection is a race, and checking first does not win
     * it. So it has to be claimed before any answer is written.
     *
     * By ON CONFLICT, not by catching the 23505: Postgres aborts the whole
     * transaction on a failed statement, so a catch in here would be
     * reasoning about a dead connection. That is the bug test/transactions
     * exists to prevent, and it caught this one.
     */
    expect(post.indexOf('campaign_survey_submissions'))
      .toBeLessThan(post.indexOf('INSERT INTO campaign_survey_responses'));
    expect(post).toMatch(/ON CONFLICT \(run_id, player_id\) DO NOTHING\s*\n\s*RETURNING player_id/);
    expect(post).toMatch(/if \(!claimed\.rows\.length\) \{\s*\n\s*await client\.query\('ROLLBACK'\);/);
    /*
     * No catch inside the transaction at all — asserted on the CODE, with
     * comments stripped. The first version of this line matched the word
     * "catching" in the comment above explaining why there is no catch,
     * which is the same trap test/transactions.test.js documents in its
     * own header.
     */
    const tx = post.slice(post.indexOf("query('BEGIN')"), post.indexOf("query('COMMIT')"))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(tx).not.toMatch(/catch/);
  });

  it('the results join a name only where one was stored', () => {
    const results = route("app.get('/api/campaigns/:campaignId/surveys/:surveyId/results'");
    expect(results).toMatch(/LEFT JOIN campaign_players cp    ON cp\.id = p\.player_id/);
  });
});

describe('whose answer this is, is never in the request', () => {
  const post = route("app.post('/api/surveys/runs/:runId/responses'");
  const pending = route("app.get('/api/surveys/pending'");

  it('the seat is resolved from the session', () => {
    expect(post).toMatch(/const seat = await seatHeldBy\(req\.session\.userId, row\.campaign_id\)/);
    expect(post).not.toMatch(/req\.body\.player_id|req\.body\?\.player_id/);
  });

  it('and the pending list is keyed on the session too', () => {
    // Account-wide: the bubble asks "anything for me, anywhere".
    expect(pending).toMatch(/WHERE cua\.user_id = \$1/);
    expect(pending).toMatch(/\[req\.session\.userId\]/);
  });

  it('a non-member gets nothing, by the join rather than by a filter', () => {
    expect(pending).toMatch(/JOIN campaign_user_assignments cua ON cua\.player_id = cp\.id/);
  });

  it('and answering still checks membership of that campaign', () => {
    expect(post).toMatch(/await canAccessCampaign\(row\.campaign_id, req\.session\.userId, req\.session\.role\)/);
  });

  it('an already-answered run drops off the list', () => {
    expect(pending).toMatch(/NOT EXISTS \(\s*\n\s*SELECT 1 FROM campaign_survey_submissions sub/);
  });

  it('and a closed one does too', () => {
    expect(pending).toMatch(/run\.closed_at IS NULL/);
    // In the shared helper both doors call, after their own access check.
    const helper = source.slice(source.indexOf('async function sendSurveyForm'),
      source.indexOf("app.get('/api/surveys/runs/:runId/form'"));
    expect(helper).toMatch(/if \(row\.closed_at\) return res\.status\(410\)/);
  });
});

describe('the history cannot be quietly rewritten', () => {
  const put = route("app.put('/api/campaigns/:campaignId/surveys/:surveyId'");

  it('an answered question cannot be removed', () => {
    /*
     * Deleting it cascades its answers, which would change what a past run
     * said after the fact — the one thing a comparison must not do.
     */
    expect(put).toMatch(/const answered = doomed\.filter\(\(q\) => Number\(q\.answers\) > 0\)/);
    expect(put).toMatch(/return res\.status\(409\)/);
  });

  it('and the refusal names which ones', () => {
    // "Some questions cannot be removed" with twelve on screen is useless.
    expect(put).toMatch(/questions: answered\.map\(\(q\) => q\.prompt\)/);
  });

  it('but rewording one is allowed, and keeps its answers', () => {
    /*
     * It is how a typo gets fixed. Refusing would push the DM into a
     * near-duplicate survey, which loses the comparison far more
     * thoroughly than an edited prompt does.
     */
    expect(put).toMatch(/UPDATE campaign_survey_questions\s*\n\s*SET position=\$1, prompt=\$2/);
  });

  it('the whole edit is one transaction', () => {
    // A refused delete must not leave the title already changed.
    expect(put).toMatch(/await client\.query\('BEGIN'\)/);
    expect(put).toMatch(/ROLLBACK/);
  });

  it('only one run of a survey is open at a time', () => {
    // Two would be the same questions asked twice at once, and the
    // player's bubble could not say which it meant.
    expect(route("app.post('/api/campaigns/:campaignId/surveys/:surveyId/runs'"))
      .toMatch(/closed_at IS NULL[\s\S]{0,200}status\(409\)/);
  });

  it('and a survey with no questions cannot be asked', () => {
    expect(route("app.post('/api/campaigns/:campaignId/surveys/:surveyId/runs'"))
      .toMatch(/Add at least one question before asking it/);
  });
});

describe("the DM's reading of the scale stays with the DM", () => {
  it('polarity is not sent to the person answering', () => {
    /*
     * "Higher is better" on screen is a nudge toward the answer the DM
     * wants, which is the opposite of what the survey is for.
     */
    const form = route("app.get('/api/surveys/runs/:runId/form'");
    const select = form.slice(form.indexOf('SELECT id, position'), form.indexOf('FROM campaign_survey_questions'));
    expect(select).not.toMatch(/polarity/);
  });

  it('and the results colour by it rather than by the number', () => {
    /*
     * 9 for railroading is bad news and 9 for involvement is good news, in
     * the same column. Thresholds are proportions of the scale, so a 0-5
     * question reads like a 1-10 one.
     */
    const c = src('frontend/src/pages/Surveys/constants.js');
    expect(c).toMatch(/if \(q\.polarity === 'higher'\)/);
    expect(c).toMatch(/if \(q\.polarity === 'lower'\)/);
    expect(c).toMatch(/const t = \(Number\(avg\) - min\) \/ \(max - min\)/);
  });

  it("including the ones where the middle is the good answer", () => {
    // "Do I describe too much or too little" is a complaint at both ends.
    const c = src('frontend/src/pages/Surveys/constants.js');
    expect(c).toMatch(/return t > 0\.33 && t < 0\.66 \? 'good' : 'bad'/);
  });
});

describe('what the player is shown', () => {
  const bubble = src('frontend/src/components/SurveyBubble.jsx');

  it('is mounted once in the layout, not on a page', () => {
    // There is no page every player reliably opens.
    expect(src('frontend/src/components/layout/AppLayout.jsx')).toMatch(/<SurveyBubble \/>/);
  });

  it('and asks for nothing when nobody is logged in', () => {
    // AppLayout wraps the public token pages too.
    expect(bubble).toMatch(/if \(!user\) return undefined;/);
    expect(bubble).toMatch(/if \(!user \|\| \(!pending\.length && !open\)\) return null;/);
  });

  it('is fetched once per page load, not polled', () => {
    // A survey is opened between sessions; a timer would be a request per
    // player per interval forever to catch it a few minutes sooner.
    expect(bubble).not.toMatch(/setInterval/);
  });

  it('dismissing is not answering', () => {
    /*
     * "Not now" is per browser and per run, so it comes back next session
     * — and it must not touch the DM's "who has answered" list, which is
     * why it is localStorage rather than a request.
     */
    expect(bubble).toMatch(/const SNOOZE_KEY = 'survey-snoozed-runs'/);
    expect(bubble).toMatch(/catch \{ return new Set\(\); \}/);
  });

  it('and every question can be skipped', () => {
    // Including un-picking a score, which is the only way back. In the
    // shared form now, which both the bubble and the link page render.
    expect(src('frontend/src/pages/Surveys/SurveyForm.jsx'))
      .toMatch(/\[q\.id\]: \{ \.\.\.a\[q\.id\], score: on \? null : v \}/);
  });

  it('the modal body is guarded, like every other', () => {
    expect(bubble).toMatch(/\{open && \(!open\.form \? \(/);
  });
});

describe('the scale cannot be made unusable', () => {
  it('is clamped server-side, not just in the editor', () => {
    /*
     * The scale drives a row of buttons in the player's form, so a max of
     * 10000 is a denial of service against the person answering.
     */
    expect(source).toMatch(/max = Math\.min\(Math\.max\(max, min \+ 1\), min \+ 10\)/);
    expect(source).toMatch(/min = Math\.min\(Math\.max\(min, 0\), 99\)/);
  });

  it('and an answer outside its own scale is refused', () => {
    const post = route("app.post('/api/surveys/runs/:runId/responses'");
    expect(post).toMatch(/if \(!Number\.isFinite\(n\) \|\| n < q\.scale_min \|\| n > q\.scale_max\)/);
  });

  it('an answer to a question from another survey is dropped', () => {
    const post = route("app.post('/api/surveys/runs/:runId/responses'");
    expect(post).toMatch(/if \(!q\) continue;/);
  });
});

describe('the DM side is DM-only', () => {
  const dmRoutes = [
    "app.get('/api/campaigns/:campaignId/surveys'",
    "app.post('/api/campaigns/:campaignId/surveys'",
    "app.get('/api/campaigns/:campaignId/surveys/:surveyId'",
    "app.put('/api/campaigns/:campaignId/surveys/:surveyId'",
    "app.delete('/api/campaigns/:campaignId/surveys/:surveyId'",
    "app.get('/api/campaigns/:campaignId/surveys/:surveyId/results'",
    "app.post('/api/campaigns/:campaignId/surveys/:surveyId/runs'",
  ];

  it.each(dmRoutes)('%s', (sig) => {
    const r = route(sig);
    expect(r).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(r).toMatch(/await dmOwnsCampaign\(/);
  });
});

describe('a link the DM can send', () => {
  const app = src('frontend/src/App.jsx');
  const page = src('frontend/src/pages/Surveys/SurveyPage.jsx');

  it('is a route OUTSIDE ProtectedRoute', () => {
    /*
     * That guard sends a logged-out visitor to `/` and drops where they
     * were going — fatal for a link clicked from a group chat. The page
     * asks the server instead, like every share page.
     */
    const at = app.indexOf('path="survey/:token"');
    expect(at).toBeGreaterThan(-1);
    const line = app.slice(at, app.indexOf('\n', at));
    expect(line).toMatch(/element=\{<SurveyPage \/>\}/);
    expect(line).not.toMatch(/ProtectedRoute/);
  });

  it('and sends a logged-out visitor to log in and straight back', () => {
    // ShareGateMessage carries the return path through api/returnTo,
    // which validates it — the destination arrives in a URL anyone writes.
    expect(page).toMatch(/<ShareGateMessage icon="📊" status=\{errorInfo\?\.status\}/);
  });

  it('closed is its own message, not a generic failure', () => {
    // The link was right; it is just too late, and "ask the DM" is the
    // wrong next step for that.
    expect(page).toMatch(/errorInfo\?\.status === 410/);
  });

  it('says "already answered" up front rather than after the form', () => {
    const helper = source.slice(source.indexOf('async function sendSurveyForm'),
      source.indexOf("app.get('/api/surveys/runs/:runId/form'"));
    expect(helper).toMatch(/const seat = await seatHeldBy\(req\.session\.userId, row\.campaign_id\)/);
    expect(helper).toMatch(/answered, can_answer: !!seat/);
    expect(page).toMatch(/\(sent \|\| data\.answered\)/);
  });

  it('a DM without a seat gets a preview, with no Send to be refused', () => {
    expect(page).toMatch(/!data\.can_answer/);
    expect(page).toMatch(/<div className="pointer-events-none opacity-70">/);
  });

  it('the list says which run is open, so the panel can build the URL', () => {
    const list = route("app.get('/api/campaigns/:campaignId/surveys'");
    expect(list).toMatch(/AS open_run_id/);
  });

  it('Copy still works when the clipboard does not', () => {
    /*
     * navigator.clipboard exists only in a secure context. Over plain HTTP
     * on a LAN address it is undefined, and a button that silently does
     * nothing is worse than none — so the URL is always visible and Copy
     * falls back to selecting it.
     */
    const share = src('frontend/src/pages/Surveys/ShareLink.jsx');
    expect(share).toMatch(/if \(!navigator\.clipboard\?\.writeText\) throw/);
    expect(share).toMatch(/ref\.current\?\.select\(\)/);
    expect(share).toMatch(/readOnly/);
  });

  it('and the URL is absolute, because it is going into a chat', () => {
    expect(src('frontend/src/pages/Surveys/ShareLink.jsx'))
      .toMatch(/`\$\{window\.location\.origin\}\/survey\/\$\{token\}`/);
  });

  it('and says so when the address is one only this machine can open', () => {
    // A DM on http://localhost gets a localhost link, like every share link
    // in the app — which no player can open. Anchored, so a real domain
    // that merely starts with "localhost." is not flagged.
    const share = src('frontend/src/pages/Surveys/ShareLink.jsx');
    expect(share).toMatch(/\/\^\(localhost\$\|127\\\.\|/);
  });

  it('the polarity is still withheld through the shared helper', () => {
    const helper = source.slice(source.indexOf('async function sendSurveyForm'),
      source.indexOf("app.get('/api/surveys/runs/:runId/form'"));
    const select = helper.slice(helper.indexOf('SELECT id, position'), helper.indexOf('FROM campaign_survey_questions'));
    expect(select).not.toMatch(/polarity/);
  });
});

describe('the page and the bubble are one form', () => {
  const bubble = src('frontend/src/components/SurveyBubble.jsx');

  it('both render SurveyForm, and the scale buttons live there alone', () => {
    expect(bubble).toMatch(/<SurveyForm form=\{open\.form\}/);
    expect(src('frontend/src/pages/Surveys/SurveyPage.jsx')).toMatch(/<SurveyForm form=\{data\}/);
    expect(bubble).not.toMatch(/aria-pressed/);
  });

  it('answering on the page drops it from the bubble, by event', () => {
    /*
     * The bubble fetches once and the layout outlives route changes, so
     * without this the next page would still offer the survey just sent.
     * An event rather than a refetch per navigation.
     */
    const form = src('frontend/src/pages/Surveys/SurveyForm.jsx');
    expect(form).toMatch(/window\.dispatchEvent\(new CustomEvent\(ANSWERED_EVENT/);
    expect(bubble).toMatch(/window\.addEventListener\(ANSWERED_EVENT, drop\)/);
    expect(bubble).toMatch(/window\.removeEventListener\(ANSWERED_EVENT, drop\)/);
  });

  it('and the bubble stays out of the way on the link page', () => {
    // It already IS the survey; a corner bubble offering it again reads as
    // a second one.
    expect(bubble).toMatch(/if \(pathname\.startsWith\('\/survey\/'\)\) return null;/);
  });
});

describe('the link is a token, not a run id', () => {
  it('every run gets one from the database, whoever creates it', () => {
    /*
     * Runs are made by the Ask route AND by the campaign import. A default
     * covers both, and Postgres fills it per row when the column is added,
     * so runs that already existed each get their own.
     */
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL\s*\n\s*DEFAULT replace\(gen_random_uuid\(\)::text, '-', ''\)/);
    expect(source).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_runs_share_token/);
  });

  it('and the link route looks the run up by it', () => {
    const r = route("app.get('/api/surveys/link/:token'");
    expect(r).toMatch(/loadSurveyRun\('share_token', token\)/);
    expect(r).toMatch(/if \(!\/\^\[0-9a-f\]\{32\}\$\/\.test\(token\)\)/);
  });

  it('gated like every share route: token first, then shareGate', () => {
    /*
     * Not requireRole. Middleware runs before the token resolves, so a
     * logged-out visitor with a DEAD link was told to log in for something
     * that no longer exists. That is what shipped first.
     */
    const r = route("app.get('/api/surveys/link/:token'");
    expect(r).not.toMatch(/requireRole/);
    expect(r.indexOf("loadSurveyRun('share_token'")).toBeLessThan(r.indexOf('await shareGate(req,'));
    expect(r).toMatch(/if \(gate\) return denyShare\(res, gate\);/);
  });

  it('the id doors answer a stranger NOT FOUND, so they are not an oracle', () => {
    // 403 would confirm "that run exists, in a campaign you are not in".
    const form = route("app.get('/api/surveys/runs/:runId/form'");
    expect(form).toMatch(/canAccessCampaign\([^)]*\)\)\s*\n\s*return res\.status\(404\)/);
    const post = route("app.post('/api/surveys/runs/:runId/responses'");
    expect(post).toMatch(/canAccessCampaign\([^)]*\)\)\s*\n\s*return res\.status\(404\)/);
  });

  it('and the token never leaves in the bundle', () => {
    /*
     * A copy of the campaign gets fresh tokens, so a link sent for the
     * original cannot open the copy, and two bundles cannot collide on the
     * unique index.
     */
    const exp = source.slice(source.indexOf('async function surveysForExport'),
      source.indexOf('async function importSurveyList'));
    const runsOut = exp.slice(exp.indexOf('runs: (runs.rows'), exp.indexOf('submitted:'));
    expect(runsOut).not.toMatch(/share_token/);
  });
});

describe('resetting a survey', () => {
  const reset = route("app.delete('/api/campaigns/:campaignId/surveys/:surveyId/runs'");
  const panel = src('frontend/src/pages/Surveys/SurveysPanel.jsx');

  it('deletes every asking, and the cascade takes the answers', () => {
    expect(reset).toMatch(/DELETE FROM campaign_survey_runs WHERE survey_id = \$1/);
  });

  it('and never the survey or its questions', () => {
    // The point of a reset over a delete: ask the same questions again.
    expect(reset).not.toMatch(/DELETE FROM campaign_surveys\b/);
    expect(reset).not.toMatch(/DELETE FROM campaign_survey_questions/);
  });

  it('is DM-only, and a DELETE so no API token can reach it', () => {
    /*
     * Tokens are refused every DELETE. That is what keeps the one
     * unrecoverable thing on a survey out of a script's reach — verified
     * live with a write-scoped token, which was turned away.
     */
    expect(reset).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(reset).toMatch(/await dmOwnsCampaign\(/);
    expect(source).toMatch(/if \(req\.method === 'DELETE'\) \{/);
  });

  it('reports what it removed', () => {
    expect(reset).toMatch(/count\(DISTINCT r\.id\)::int AS runs, count\(p\.id\)::int AS responses/);
    expect(reset).toMatch(/res\.json\(\{ ok: true, \.\.\.counted\.rows\[0\] \}\)/);
  });

  it('the confirmation names the ANSWERS, not just the askings', () => {
    // "Delete 2 runs" says far less than "and the 9 answers given to them".
    expect(panel).toMatch(/the \$\{answers\} answer/);
    expect(panel).toMatch(/This cannot be undone/);
    expect(panel).toMatch(/Export part… with “Surveys — results” first/);
  });

  it('says when it will close a survey that is open', () => {
    expect(panel).toMatch(/It is open right now: it closes, and the players’ bubbles for it disappear\./);
  });

  it('and the button only appears once there is something to clear', () => {
    expect(panel).toMatch(/\{Number\(s\.run_count\) > 0 && \(\s*\n\s*<Button variant="ghost" onClick=\{\(\) => reset\(s\)\}/);
  });
});
