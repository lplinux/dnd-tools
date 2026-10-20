/**
 * components/CrossLinkPopover.jsx
 *
 * What a `[[Name]]` link opens.
 *
 * There is no location page in this app and the in-app Journey Map is DM-only,
 * so a link has nowhere to navigate to — it shows what it knows instead: the
 * name, the description, the pin image, and a way through to the shared map
 * when that location actually has a pin on one.
 *
 * An NPC popover is a name and nothing else, because `campaign_npcs` is a name
 * and nothing else. It exists so the branch is wired for the day NPCs grow a
 * description, and so a DM clicking one gets an answer rather than silence.
 *
 * Placement reuses `placeCard`, which already handles flipping away from the
 * pointer near a viewport edge and is tested without a DOM.
 *
 * PORTALLED, and above the modal layer. The journal and diary read an entry
 * inside a `Modal`, which portals itself to the end of `<body>` — so a
 * popover rendered in place sat at the same z-50 but EARLIER in the document,
 * and opened behind the note that triggered it. Portalling puts it in the
 * same stacking layer; `z-[60]` puts it in front, and keeps it in front of the
 * `z-[51]` the modal's own panel uses.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, Markdown } from '@/components/ui';
import { placeCard } from '@/data/placeCard';
import { campaignsApi } from '@/api/campaigns';

/**
 * @param {{kind:string,id:number,name:string,description?:string}|null} target
 * @param {{x:number,y:number}} at        where the link was clicked
 * @param {string|null} mapPath           public map URL, when one is shared
 * @param {Function} [onMap]              open this location's map in the app
 */
export default function CrossLinkPopover({ target, at, campaignId, mapPath, onMap, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [image, setImage] = useState(null);

  // Measured, not assumed: the box is as tall as the description is long.
  useLayoutEffect(() => {
    setPos(null);
    if (!target || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos(placeCard({
      x: at?.x ?? 0, y: at?.y ?? 0, width, height,
      vw: window.innerWidth, vh: window.innerHeight,
    }));
  }, [target, at]);

  /**
   * The pin image is fetched only now. It is a base64 column, so it is kept
   * out of the link-targets index that the autocomplete loads for every
   * campaign.
   */
  useEffect(() => {
    setImage(null);
    if (!target || target.kind !== 'location' || !campaignId) return;
    let alive = true;
    campaignsApi.listLocations(campaignId)
      .then((rows) => {
        if (!alive) return;
        const hit = (rows ?? []).find((r) => String(r.id) === String(target.id));
        setImage(hit?.image_data || null);
      })
      .catch(() => { /* the popover is still useful without it */ });
    return () => { alive = false; };
  }, [target, campaignId]);

  useEffect(() => {
    if (!target) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  return createPortal(
    <>
      {/* A click anywhere else dismisses it. Transparent, so it does not dim
          the entry you are reading — but it must sit above the modal, or the
          modal swallows the click and the popover cannot be dismissed. */}
      <div className="fixed inset-0 z-[59]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-label={target.name}
        className="fixed z-[60] w-72 max-w-[calc(100vw-2rem)] bg-surface2 border
                   border-[var(--gold-dim)] rounded-sm shadow-xl p-3 flex flex-col gap-2"
        style={pos
          ? { left: pos.left, top: pos.top }
          // Off-screen for the measuring pass, so it is never seen unplaced.
          : { left: -9999, top: -9999 }}
      >
        <div className="flex items-baseline gap-2">
          <span aria-hidden="true">{target.kind === 'npc' ? '🧟' : '📍'}</span>
          <h4 className="font-display text-gold text-sm flex-1 min-w-0 truncate">{target.name}</h4>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-text-muted hover:text-gold text-sm leading-none">✕</button>
        </div>

        {image && (
          <img src={image} alt="" className="w-full max-h-32 object-contain rounded-sm" />
        )}

        {/* An NPC the DM has not revealed only ever reaches a DM — the index
            a player loads leaves hidden ones out entirely — so this badge is
            a reminder to the DM, never a hint to the table. */}
        {target.kind === 'npc' && target.is_public === false && (
          <p className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted">
            Not met yet · hidden from players
          </p>
        )}

        {(target.description || target.public_info || target.private_info) ? (
          <div className="text-[0.75rem] text-text-dim max-h-64 overflow-y-auto flex flex-col gap-1.5">
            {target.description && <Markdown>{target.description}</Markdown>}
            {/* An NPC's fields are different things — who they are, what the
                party has worked out, and what only the DM knows — so they are
                not run together into one blob. */}
            {target.public_info && (
              <>
                {target.description && <hr className="border-border" />}
                <Markdown>{target.public_info}</Markdown>
              </>
            )}
            {/* Shown when it is THERE, which is the gate: the server never
                sends private_info to a player, so this branch can only ever
                render for someone entitled to it. No role check here would
                add anything a missing field has not already decided. */}
            {target.private_info && (
              <>
                <hr className="border-[var(--gold-dim)]" />
                <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">
                  Your notes
                </p>
                <Markdown>{target.private_info}</Markdown>
              </>
            )}
          </div>
        ) : (
          <p className="text-[0.7rem] text-text-muted italic">
            {target.kind === 'npc'
              ? 'No notes on this one yet.'
              : 'No description yet.'}
          </p>
        )}

        {/* Who is standing here. Supplied by the caller rather than fetched:
            the lists that open this card already hold every NPC, and a
            request per card would be a round trip to answer a question the
            page can already answer. A player's copy of that list contains
            only revealed NPCs, so this cannot leak one. */}
        {target.kind === 'location' && !!target.here?.length && (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">
              Here ({target.here.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {target.here.map((n) => (
                <span
                  key={n.id}
                  className={`text-[0.68rem] px-1.5 py-0.5 rounded-sm border ${
                    n.is_public
                      ? 'bg-surface3 border-border text-text'
                      : 'bg-surface2 border-border text-text-muted'
                  }`}
                  title={n.is_public ? n.name : `${n.name} — not met yet`}
                >
                  🧟 {n.name}{n.is_public ? '' : ' ·'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* A map OF this place, or the one it is pinned on. `onMap` is the
            in-app route; `mapPath` is the public share link the reading
            views pass. They are different journeys, so both can appear. */}
        {onMap && target.kind === 'location' && target.map_id && (
          <Button variant="ghost" onClick={() => { onMap(target); onClose(); }}>
            🗺 Open “{target.map_name}”
          </Button>
        )}

        {mapPath && target.kind === 'location' && (
          <Button variant="ghost" onClick={() => window.open(mapPath, '_blank', 'noopener')}>
            🗺 Show on the map
          </Button>
        )}
      </div>
    </>,
    document.body,
  );
}
