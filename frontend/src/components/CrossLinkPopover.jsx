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
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button, Markdown } from '@/components/ui';
import { placeCard } from '@/data/placeCard';
import { campaignsApi } from '@/api/campaigns';

/**
 * @param {{kind:string,id:number,name:string,description?:string}|null} target
 * @param {{x:number,y:number}} at        where the link was clicked
 * @param {string|null} mapPath           public map URL, when one is shared
 */
export default function CrossLinkPopover({ target, at, campaignId, mapPath, onClose }) {
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

  return (
    <>
      {/* A click anywhere else dismisses it. Transparent, so it does not dim
          the entry you are reading. */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-label={target.name}
        className="fixed z-50 w-72 max-w-[calc(100vw-2rem)] bg-surface2 border
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

        {target.description ? (
          <div className="text-[0.75rem] text-text-dim max-h-48 overflow-y-auto">
            <Markdown>{target.description}</Markdown>
          </div>
        ) : (
          <p className="text-[0.7rem] text-text-muted italic">
            {target.kind === 'npc'
              ? 'No notes on this one yet.'
              : 'No description yet.'}
          </p>
        )}

        {mapPath && target.kind === 'location' && (
          <Button variant="ghost" onClick={() => window.open(mapPath, '_blank', 'noopener')}>
            🗺 Show on the map
          </Button>
        )}
      </div>
    </>
  );
}
