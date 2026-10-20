/**
 * pages/ManageCampaigns/tabs/InvitePanel.jsx
 *
 * Mint an invite link, copy it, and revoke the ones still outstanding.
 *
 * Lives under Players because an invite is how a seat gets filled — the row
 * it produces is the same row the Add button above makes, only created by the
 * person joining rather than by the DM.
 *
 * THE LINK IS SHOWN ONCE. The server stores only a hash of the token, so
 * there is nothing to re-read: a DM who loses it revokes and mints another.
 * The panel says so rather than letting someone discover it by closing the
 * box and looking for a "show again" that cannot exist.
 */

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { invitesApi } from '@/api/invites';
import { useToast } from '@/hooks/useToast';

const inputCls = [
  'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

/** "in 47 min" — enough for a DM to know whether the link they sent is cold. */
function expiresIn(iso) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Number.isNaN(mins) || mins <= 0) return 'expiring';
  return `${mins} min left`;
}

export default function InvitePanel({ campaignId, players = [] }) {
  const { toast } = useToast();
  const [pending, setPending] = useState([]);
  const [seat, setSeat] = useState('');       // '' = make a new one
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState(null);  // { url } — shown once

  // Only seats nobody is playing. Inviting into a taken one is refused by the
  // server anyway; not offering it is how the DM finds that out sooner.
  const freeSeats = players.filter((p) => !p.user_id);

  const load = useCallback(async () => {
    if (!campaignId) { setPending([]); return; }
    try { setPending(await invitesApi.list(campaignId) ?? []); }
    catch { /* a listing that fails is not worth a toast over a link box */ }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  // A seat filled while the panel was open should stop being offered.
  useEffect(() => {
    if (seat && !freeSeats.some((p) => String(p.id) === String(seat))) setSeat('');
  }, [seat, freeSeats]);

  async function mint() {
    setBusy(true);
    try {
      const { token } = await invitesApi.create(campaignId, seat || null);
      const url = `${window.location.origin}/join/${token}`;
      setMinted({ url });
      // Copy straight away: the DM pressed this button in order to send a
      // link, and the clipboard is allowed here because it is inside the
      // click. Doing it on a later button would need a second gesture.
      try {
        await navigator.clipboard.writeText(url);
        toast('Invite link copied — it works once, for an hour.');
      } catch {
        toast('Invite link ready — copy it below.');
      }
      await load();
    } catch (e) {
      toast(e?.message || 'Could not create an invite', 'error');
    } finally { setBusy(false); }
  }

  async function revoke(id) {
    try {
      await invitesApi.revoke(campaignId, id);
      // Whichever link was on screen may be the one just killed, and we
      // cannot tell — the token is not in the listing. Clearing it is the
      // honest move.
      setMinted(null);
      await load();
      toast('Invite revoked.');
    } catch (e) { toast(e?.message || 'Could not revoke', 'error'); }
  }

  // A column inside the Players block, not a panel of its own: the border,
  // the background and the grid cell all belong to the parent.
  return (
    <section className="p-3 flex flex-col gap-2">
      <p className="font-display uppercase tracking-wider text-[0.7rem] text-text-dim">
        Invite a player
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={seat}
          onChange={(e) => setSeat(e.target.value)}
          className={`${inputCls} flex-1 min-w-[110px]`}
          aria-label="Which seat the invite fills"
        >
          <option value="">New player</option>
          {freeSeats.map((p) => (
            <option key={p.id} value={p.id}>Seat: {p.player_name}</option>
          ))}
        </select>
        <Button variant="accent" loading={busy} onClick={mint} disabled={!campaignId}>
          🔗 Create link
        </Button>
      </div>

      <p className="text-[0.7rem] text-text-muted font-body italic">
        Works <strong>once</strong>, expires in an hour. They pick their own username and
        password — or sign in, if they already have an account.
      </p>

      {minted && (
        <div className="flex items-center gap-2 flex-wrap bg-surface2 border border-[var(--gold-dim)] rounded-sm p-2">
          <input
            readOnly
            value={minted.url}
            onFocus={(e) => e.target.select()}
            className={`${inputCls} flex-1 min-w-[12rem] text-xs`}
            aria-label="Invite link"
          />
          <Button
            variant="default"
            onClick={() => navigator.clipboard?.writeText(minted.url)
              .then(() => toast('Copied.'))
              .catch(() => toast('Select the text and copy it.', 'error'))}
          >
            Copy
          </Button>
          <p className="w-full text-[0.68rem] text-text-muted font-body">
            Copy it now — it is not stored and cannot be shown again. Lost it? Revoke below and
            make another.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">
            Outstanding ({pending.length})
          </p>
          {pending.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 text-xs font-body text-text-dim">
              <span className="flex-1">
                {inv.player_name ? `Seat: ${inv.player_name}` : 'New player'}
                <span className="text-text-muted"> · {expiresIn(inv.expires_at)}</span>
              </span>
              <Button variant="danger" onClick={() => revoke(inv.id)} title="Revoke this invite">
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
