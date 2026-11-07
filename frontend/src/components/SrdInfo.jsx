/**
 * components/SrdInfo.jsx
 *
 * An ⓘ button that opens the 2024 SRD (SRD 5.2) text for a named rules element —
 * a condition, damage type or spell.
 *
 * Two pieces:
 *   useSrdIndex(resource) — one cached index request per resource, used to decide
 *                           which names are worth offering a lookup for. Returns
 *                           null while loading or if the index failed, in which
 *                           case callers should fail OPEN and show the button.
 *   <SrdInfo>             — the button + modal. Fetches only on click.
 *
 * Nothing here is fetched on render beyond that single index, so a sheet with
 * forty chips still costs one request, not forty.
 */

import { useEffect, useState } from 'react';
import { Modal, Spinner } from '@/components/ui';
import { lookupByResource, lookupRaw, loadIndex, toSlug, ATTRIBUTION } from '@/api/srd';
import { spellFromSrd } from '@/data/spellDetails';
import SpellCard from '@/components/SpellCard';

/** Cached slug index for a resource. `null` = unknown (loading or unavailable). */
export function useSrdIndex(resource) {
  const [slugs, setSlugs] = useState(null);
  useEffect(() => {
    if (!resource) return undefined;   // lookups not enabled for this caller
    let alive = true;
    loadIndex(resource).then((s) => { if (alive) setSlugs(s); });
    return () => { alive = false; };
  }, [resource]);
  return slugs;
}

/**
 * Should a lookup be offered for this name?
 * Fails open: while the index is unknown we still show the button, and the modal
 * reports the miss. Better a rare empty modal than a silently missing affordance.
 */
export function srdHasEntry(slugs, name) {
  return slugs ? slugs.has(toSlug(name)) : true;
}

/**
 * `children`, when given, replaces the ⓘ as the trigger — so a term can be
 * clickable in place. An item card lists several weapon properties on one
 * line and an ⓘ after each would be more punctuation than card.
 */
export default function SrdInfo({ resource, name, className = '', children }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, entry: null, spell: null });

  /*
   * A spell is read from the whole record, not just its prose: school,
   * casting time, range, components and duration were all in the response
   * and all being thrown away, leaving a card that said what Fireball does
   * but not what it costs to cast. Same request either way, and the same
   * cache, since `lookup` is built on `lookupRaw`.
   */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setState({ loading: true, entry: null, spell: null });
    const load = resource === 'spells'
      ? lookupRaw(resource, name).then((body) => ({ spell: spellFromSrd(body) }))
      : Promise.resolve(null);
    load.then(async (got) => {
      if (got?.spell) { if (alive) setState({ loading: false, entry: null, spell: got.spell }); return; }
      const entry = await lookupByResource(resource, name);
      if (alive) setState({ loading: false, entry, spell: null });
    });
    return () => { alive = false; };
  }, [open, resource, name]);

  return (
    <>
      <button
        type="button"
        className={children
          ? `srd-info-term ${className}`.trim()
          : `srd-info-btn ${className}`.trim()}
        title={`${name} — 2024 SRD`}
        aria-label={`Look up ${name} in the 2024 SRD`}
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        {children ?? 'ⓘ'}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        {state.loading && <div className="srd-modal-loading"><Spinner /></div>}

        {!state.loading && state.spell && <SpellCard spell={state.spell} />}

        {!state.loading && !state.spell && state.entry && (
          <div className="srd-modal-body">
            {state.entry.text.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {!state.loading && !state.spell && !state.entry && (
          <div className="srd-modal-body">
            <p>
              No entry for <strong>{name}</strong> in SRD 5.2.
            </p>
            <p className="srd-modal-hint">
              The SRD is a subset of the 2024 Player&apos;s Handbook, so this may still exist in the
              book — or the lookup service may be unreachable right now.
            </p>
          </div>
        )}

        <p className="srd-modal-attrib">{ATTRIBUTION}</p>
      </Modal>
    </>
  );
}
