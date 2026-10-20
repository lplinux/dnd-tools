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
import CrossLinkPopover from '@/components/CrossLinkPopover';
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

/**
 * One NPC or place, as a row that opens its card.
 *
 * A row rather than a full card: a campaign has dozens of each, and forty
 * expanded blocks is a scroll rather than a list. The card carries the prose;
 * this carries enough to recognise which one you want.
 *
 * `is_public === false` only ever reaches a DM looking at their own sheet —
 * the server leaves hidden rows out of a player's list entirely.
 */
function EntityRow({ icon, row, kind, onOpen }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen({ target: { ...row, kind }, at: { x: e.clientX, y: e.clientY } })}
      className="w-full text-left bg-surface2 border border-border rounded-sm px-3 py-2
                 flex items-start gap-3 hover:border-[var(--gold-dim)] transition-colors"
    >
      <span className="text-base leading-none mt-0.5 flex-shrink-0" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display text-gold text-sm">{row.name}</span>
          {row.location_name && (
            <span className="text-[0.65rem] text-text-muted">📍 {row.location_name}</span>
          )}
          {row.size_type && (
            <span className="text-[0.65rem] text-text-muted">{row.size_type}</span>
          )}
          {row.is_public === false && (
            <span className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted">
              hidden from players
            </span>
          )}
        </span>
        {row.description && (
          <span className="block text-[0.7rem] text-text-dim truncate">{row.description}</span>
        )}
      </span>
    </button>
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
  // The card opened by clicking a person or a place.
  const [card, setCard] = useState(null);   // { target, at } | null

  const load = useCallback(async () => {
    if (!campaignId) { setLinks(null); return; }
    setLoading(true);
    try {
      setLinks(await campaignsApi.listLinks(campaignId));
    } catch (e) {
      toast(e?.message || String(e), 'error');
      setLinks({ maps: [], timelines: [], npcs: [], places: [] });
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

  const { maps = [], timelines = [], npcs = [], places = [] } = links;
  const nothing = !maps.length && !timelines.length && !npcs.length && !places.length;

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

      {/* Not LinkCards: an NPC has no page to open, so a card that looks
          clickable and is not would be worse than plain text. The server
          sends a player only the revealed ones, and never private notes. */}
      {!!npcs.length && (
        <Section
          title={`🧟 People (${npcs.length})`}
          hint="Who you have met. Click one to read what you know about them."
        >
          <div className="flex flex-col gap-2">
            {npcs.map((n) => (
              <EntityRow key={n.id} icon="🧟" row={n} kind="npc" onOpen={setCard} />
            ))}
          </div>
        </Section>
      )}

      {!!places.length && (
        <Section
          title={`📍 Places (${places.length})`}
          hint="Where you have been, or heard of. Click one to read about it."
        >
          <div className="flex flex-col gap-2">
            {places.map((l) => (
              <EntityRow
                key={l.id}
                icon="📍"
                // Who the party knows to be here. `npcs` is already the
                // filtered list, so a place cannot reveal someone unmet.
                row={{ ...l, here: npcs.filter((n) => String(n.current_location_id) === String(l.id)) }}
                kind="location"
                onOpen={setCard}
              />
            ))}
          </div>
        </Section>
      )}

      <CrossLinkPopover
        target={card?.target ?? null}
        at={card?.at}
        campaignId={campaignId}
        onClose={() => setCard(null)}
      />
    </div>
  );
}
