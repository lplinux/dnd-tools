/**
 * pages/PcSheet/tabs/CampaignLinksTab.jsx
 *
 * Everything the DM has shared with the table, in one place.
 *
 * It exists because there was nowhere to put a share link. A DM would copy a
 * map URL into Discord and that was the only copy; lose the message and the
 * map was unreachable, because the in-app Journey Map is DM-only. A player
 * hitting a dead link got "Map not found", which reads as though the map is
 * gone rather than the link being stale.
 *
 * The server lists only what carries a share token, so there is nothing to
 * hide here — the DM sees the same list a player does, which is the point: it
 * answers "what has the table been given", not "what exists".
 *
 * These links open read-only pages that require a logged-in member of this
 * campaign. They are a convenience for the table, not something to hand to
 * anyone outside it.
 */
import { useCallback, useEffect, useState } from 'react';

import { Spinner } from '@/components/ui';
import { campaignsApi } from '@/api/campaigns';
import { useToast } from '@/hooks/useToast';

/** When it was shared. The date alone — the hour is never the question. */
function sharedOn(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * One link. A real `<a>`, not a button with an onClick: these open a public
 * page that works without a session, so middle-click, copy-link and open-in-
 * new-tab all have to behave the way they look like they will.
 */
function LinkCard({ icon, title, subtitle, href, meta }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-surface2 border border-border rounded-sm p-3 flex items-start gap-3
                 hover:border-[var(--gold-dim)] transition-colors group"
    >
      <span className="text-lg leading-none mt-0.5 flex-shrink-0" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-gold text-sm group-hover:underline truncate">
          {title}
        </span>
        {subtitle && <span className="block text-[0.7rem] text-text-dim truncate">{subtitle}</span>}
        {meta && <span className="block text-[0.65rem] text-text-muted mt-0.5">{meta}</span>}
      </span>
      <span className="text-text-muted text-xs flex-shrink-0 mt-0.5" aria-hidden="true">↗</span>
    </a>
  );
}

function Section({ title, hint, children }) {
  return (
    <section>
      <h3 className="font-display uppercase tracking-widest text-[0.65rem] text-gold
                     border-b border-[var(--gold-dim)] mb-2 pb-1">
        {title}
      </h3>
      {hint && <p className="text-[0.65rem] text-text-muted italic mb-2">{hint}</p>}
      {children}
    </section>
  );
}

export default function CampaignLinksTab({ campaignId }) {
  const { toast } = useToast();
  const [links, setLinks] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId) { setLinks(null); return; }
    setLoading(true);
    try {
      setLinks(await campaignsApi.listLinks(campaignId));
    } catch (e) {
      toast(e?.message || String(e), 'error');
      setLinks({ maps: [], timelines: [], npcs: [] });
    } finally { setLoading(false); }
  }, [campaignId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!links) {
    return (
      <p className="text-text-dim text-sm italic text-center py-8">
        Pick a campaign to see what has been shared with you.
      </p>
    );
  }

  const { maps = [], timelines = [], npcs = [] } = links;
  const nothing = !maps.length && !timelines.length && !npcs.length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.7rem] text-text-muted italic">
        Everything your DM has shared with the table. These open as read-only pages, and only
        for someone logged in and playing in this campaign — so a link that escapes the table
        shows a stranger nothing.
      </p>

      {nothing && (
        <p className="text-text-dim text-sm italic text-center py-8">
          Nothing has been shared yet. Your DM can share a journey map from the map itself, and a
          timeline from the Timeline page.
        </p>
      )}

      {/* A column, as asked — one card per line rather than a grid, because a
          map name plus the date it was shared does not fit a narrow tile. */}
      {!!maps.length && (
        <Section title={`🗺 Journey maps (${maps.length})`}>
          <div className="flex flex-col gap-2">
            {maps.map((m) => (
              <LinkCard
                key={m.token}
                icon="🗺"
                title={m.name}
                subtitle="Players' map — hidden locations and the road network are not drawn"
                meta={m.shared_at ? `shared ${sharedOn(m.shared_at)}` : null}
                href={m.path}
              />
            ))}
          </div>
        </Section>
      )}

      {!!timelines.length && (
        <Section title={`📜 Timelines (${timelines.length})`}>
          <div className="flex flex-col gap-2">
            {timelines.map((t) => (
              <LinkCard
                key={t.token}
                icon="📜"
                title={t.scope === 'campaign' ? 'Campaign timeline' : t.name}
                subtitle={t.scope === 'campaign'
                  ? 'Every event the DM has made visible'
                  : `${t.player_name ? `${t.player_name} — ` : ''}one timeline only`}
                meta={t.shared_at ? `shared ${sharedOn(t.shared_at)}` : null}
                href={t.path}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Prepared. The server returns an empty list today, so this renders
          nothing — filling it later is a server change and nothing else. */}
      {!!npcs.length && (
        <Section title={`🧟 NPCs (${npcs.length})`} hint="People the party has met.">
          <div className="flex flex-col gap-2">
            {npcs.map((n) => (
              <LinkCard key={n.token || n.id} icon="🧟" title={n.name}
                subtitle={n.subtitle} href={n.path} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
