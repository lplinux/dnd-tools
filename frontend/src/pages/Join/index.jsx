/**
 * pages/Join/index.jsx
 *
 * The screen behind an invite link: /join/:token.
 *
 * Public, because the people it is for do not have accounts yet — the token
 * in the URL is the whole credential, which is why the server makes it 256
 * bits, single-use and an hour long.
 *
 * It shows the campaign before asking for anything. A link that says only
 * "create an account" is indistinguishable from a phishing page, and the
 * campaign name is the one thing the invitee can recognise.
 *
 * Two ways in, because a DM invites both newcomers and people who already
 * play in another of their campaigns:
 *   - Create an account  → POST /invites/:token/accept
 *   - Use an existing one → POST /invites/:token/join
 * Both log you in and land you on your sheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button, FormField, Spinner } from '@/components/ui';
import { invitesApi } from '@/api/invites';
import { useAuth } from '@/hooks/useAuth';

const INPUT = [
  'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

/** "in 47 minutes" — the invitee's reason to act now rather than tomorrow. */
function expiresIn(iso) {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Number.isNaN(mins) || mins <= 0) return 'any moment';
  if (mins === 1) return 'in a minute';
  if (mins < 60) return `in ${mins} minutes`;
  return 'in an hour';
}

export default function Join() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dead, setDead] = useState(null);       // the link is no good

  // 'new' = create an account, 'existing' = already have one.
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState({ username: '', password: '', characterName: '' });
  // Only meaningful while logged in: false means "use a different account".
  const [asSelf, setAsSelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    invitesApi.preview(token)
      .then((data) => {
        if (!alive) return;
        setInvite(data);
        // Someone already logged in almost certainly wants to join as
        // themselves, so open on that rather than on a signup form.
        if (data.loggedInAs) setMode('existing');
        // A seat the DM prepared already has a name; offer it rather than
        // making them guess what to type.
        if (data.playerName) setForm((f) => ({ ...f, characterName: data.playerName }));
      })
      .catch((e) => { if (alive) setDead(e?.message || 'This invite link is invalid or has expired'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'new') {
        await invitesApi.accept(token, form);
      } else if (invite?.loggedInAs && asSelf) {
        // No credentials: the server reads that as "join as whoever I am".
        await invitesApi.join(token, { characterName: form.characterName });
      } else {
        await invitesApi.join(token, form);
      }
      // The session changed underneath the SPA, so tell AuthProvider before
      // navigating — PcSheet is role-gated and would bounce us to "/".
      await refresh();
      navigate('/pc-sheet', { replace: true });
    } catch (err) {
      // A dead link cannot be retried, so the form goes away with it. Every
      // other failure — taken username, wrong password — leaves it up,
      // because the invite is still good and they can try again.
      if (err?.code === 'INVITE_INVALID' || err?.status === 404) setDead(err.message);
      else setError(err?.message || 'Something went wrong');
      setBusy(false);
    }
  }, [mode, asSelf, form, invite, token, refresh, navigate]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (dead) {
    return (
      <div className="max-w-md mx-auto py-12 text-center flex flex-col gap-3">
        <h1 className="font-display uppercase tracking-wider text-gold text-lg">Invite link</h1>
        <p className="text-text-dim font-body">{dead}</p>
        <p className="text-text-muted text-sm font-body">
          Invite links last an hour and work once. Ask your DM for a fresh one.
        </p>
        <div><Button variant="default" onClick={() => navigate('/')}>Back to the start</Button></div>
      </div>
    );
  }

  const useOwnAccount = invite.loggedInAs && mode === 'existing' && asSelf;

  return (
    <div className="max-w-md mx-auto py-10 flex flex-col gap-5">
      <header className="text-center flex flex-col gap-1">
        <p className="font-display uppercase tracking-widest text-text-muted text-[0.6rem]">
          You have been invited to join
        </p>
        <h1 className="font-display uppercase tracking-wider text-gold text-xl">
          {invite.campaignName}
        </h1>
        {invite.playerName && (
          <p className="text-text-dim text-sm font-body">as {invite.playerName}</p>
        )}
        <p className="text-text-muted text-[0.7rem] font-body italic">
          This link expires {expiresIn(invite.expiresAt)} and can be used once.
        </p>
      </header>

      <div className="flex border-b border-border">
        {[['new', 'Create an account'], ['existing', 'I already have one']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setMode(k); setError(null); }}
            className={[
              'flex-1 px-3 py-2 font-display uppercase tracking-wider text-[0.62rem] transition-colors',
              k === mode
                ? 'text-gold border-b-2 border-b-gold bg-surface2 -mb-px'
                : 'text-text-dim hover:text-gold hover:bg-surface2',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {useOwnAccount ? (
          <p className="text-text-dim text-sm font-body">
            Joining as <strong className="text-text">{invite.loggedInAs}</strong>.{' '}
            <button
              type="button"
              className="text-gold underline"
              onClick={() => setAsSelf(false)}
            >
              Use a different account
            </button>
          </p>
        ) : (
          <>
            <FormField label="Username">
              <input
                type="text" value={form.username} onChange={set('username')}
                autoComplete={mode === 'new' ? 'username' : 'username'}
                className={INPUT} required
              />
            </FormField>
            <FormField label="Password">
              <input
                type="password" value={form.password} onChange={set('password')}
                autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
                className={INPUT} required
              />
              {mode === 'new' && (
                <p className="text-text-muted text-[0.7rem] font-body mt-1">
                  At least 8 characters.
                </p>
              )}
            </FormField>
          </>
        )}

        <FormField label="Character name">
          <input
            type="text" value={form.characterName} onChange={set('characterName')}
            placeholder="Who are you playing?"
            className={INPUT} required maxLength={255}
          />
        </FormField>

        {error && <p className="text-danger text-sm font-body">{error}</p>}

        <Button variant="accent" type="submit" loading={busy} className="mt-1">
          Join {invite.campaignName}
        </Button>
      </form>
    </div>
  );
}
