/**
 * components/ApiTokensPanel.jsx
 *
 * API tokens, opened from the Account menu in the header.
 *
 * It lived in a campaign's Settings tab first, which was wrong: a token is
 * tied to the ACCOUNT and works across every campaign, and a control that
 * sits inside one campaign implies it is limited to that campaign. Acting on
 * that belief is how a token meant for one table reaches every other.
 *
 * Reachable from anywhere, by anyone logged in, because that is what the
 * credential belongs to. `/user-panel` would have been the other candidate
 * and is admin-only, so a DM could not have reached it at all.
 *
 * The raw token exists in exactly one HTTP response. It is held in component
 * state until dismissed and never fetched again, because the server keeps
 * only a sha256 of it — so the copy box is not a convenience, it is the only
 * chance.
 */
import { useCallback, useEffect, useState } from 'react';
import { Copy, Trash2, Plus } from 'lucide-react';

import { Button, FormField } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { tokensApi } from '@/api/tokens';

const INPUT = 'w-full bg-surface border border-border rounded-sm px-2 py-1.5 text-sm text-text';

const when = (v) => (v ? String(v).slice(0, 10) : '—');

export default function ApiTokensPanel() {
  // `useToast()` returns an OBJECT and `useConfirm()` returns the function
  // itself. Easy to get backwards, and calling the object throws only when
  // the handler actually runs — which is why this reached the browser.
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', scope: 'read', days: '' });
  const [fresh, setFresh] = useState(null);   // the one-time secret
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await tokensApi.list()); } catch { /* the panel is still usable */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name.trim()) { toast('Give it a name so you can tell them apart.'); return; }
    setBusy(true);
    try {
      const r = await tokensApi.create({
        name: form.name.trim(),
        scope: form.scope,
        expires_in_days: form.days === '' ? null : Number(form.days),
      });
      setFresh(r.token);
      setForm({ name: '', scope: 'read', days: '' });
      await load();
    } catch (e) { toast(e.message || 'Could not create the token'); }
    finally { setBusy(false); }
  }

  async function revoke(row) {
    const ok = await confirm(
      `Revoke "${row.name}"? Anything using it stops working immediately.`,
      { title: 'Revoke token', confirmLabel: 'Revoke' },
    );
    if (!ok) return;
    try { await tokensApi.revoke(row.id); await load(); toast('Revoked.'); }
    catch (e) { toast(e.message || 'Could not revoke'); }
  }

  const live = rows.filter((r) => !r.revoked_at);

  return (
    <div className="flex flex-col">
      <p className="text-text-dim text-xs mb-3">
        A second way to sign in to <strong className="text-text">your account</strong>, for scripts
        and for an assistant reading or updating a running instance. One token covers{' '}
        <strong className="text-text">everything you can reach</strong>, across every campaign,
        and grants exactly what you can already do — nothing more.
        {' '}A token can never delete anything, change your password, or create another token.
      </p>

      {fresh && (
        <div className="border border-[var(--gold)] bg-[var(--gold-glow)] rounded-sm p-3 mb-3">
          <p className="text-xs text-text mb-2">
            <strong>Copy it now.</strong> This is the only time it is shown — the server keeps
            only a hash. Keep it out of anything you commit; an environment variable or a
            password manager is the right home.
          </p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 truncate bg-surface border border-border rounded-sm
                             px-2 py-1.5 text-[0.7rem] text-text">{fresh}</code>
            <Button variant="accent" onClick={() => {
              navigator.clipboard?.writeText(fresh).then(
                () => toast('Copied.'),
                () => toast('Could not copy — select it by hand.'),
              );
            }}>
              <Copy size={12} className="inline mr-1" />Copy
            </Button>
            <Button variant="ghost" onClick={() => setFresh(null)}>Done</Button>
          </div>
          <p className="text-[0.65rem] text-text-muted mt-2">
            Use it as <code>Authorization: Bearer &lt;token&gt;</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end mb-3">
        <FormField label="Name">
          <input type="text" value={form.name} maxLength={100} className={INPUT}
            placeholder="laptop script"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormField>
        <FormField label="Can">
          <select value={form.scope} className={INPUT}
            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
            <option value="read">Read only</option>
            <option value="write">Read and update</option>
          </select>
        </FormField>
        <FormField label="Expires in (days)">
          <input type="number" value={form.days} className={INPUT} placeholder="never"
            onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
        </FormField>
        <Button variant="accent" loading={busy} onClick={create}>
          <Plus size={12} className="inline mr-1" />Create
        </Button>
      </div>

      {!live.length ? (
        <p className="text-text-dim text-xs italic">No tokens yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {live.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs border border-border
                                       rounded-sm px-2 py-1.5 bg-surface">
              <strong className="text-text flex-1 min-w-0 truncate">{r.name}</strong>
              <span className={`text-[0.7rem] px-1.5 py-0.5 rounded-sm border ${
                r.scope === 'write'
                  ? 'border-[var(--gold)] text-gold'
                  : 'border-border text-text-muted'}`}>
                {r.scope === 'write' ? 'read + update' : 'read only'}
              </span>
              {/* last_used_at is the only way to spot one you have forgotten. */}
              <span className="text-text-muted hidden sm:inline">used {when(r.last_used_at)}</span>
              <span className="text-text-muted hidden md:inline">
                {r.expires_at ? `expires ${when(r.expires_at)}` : 'no expiry'}
              </span>
              <button type="button" onClick={() => revoke(r)} title="Revoke"
                className="text-text-muted hover:text-danger"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
