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
import { lookupByResource, loadIndex, toSlug, ATTRIBUTION } from '@/api/srd';

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

export default function SrdInfo({ resource, name, className = '' }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, entry: null });

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setState({ loading: true, entry: null });
    lookupByResource(resource, name).then((entry) => {
      if (alive) setState({ loading: false, entry });
    });
    return () => { alive = false; };
  }, [open, resource, name]);

  return (
    <>
      <button
        type="button"
        className={`srd-info-btn ${className}`.trim()}
        title={`${name} — 2024 SRD`}
        aria-label={`Look up ${name} in the 2024 SRD`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        ⓘ
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        {state.loading && <div className="srd-modal-loading"><Spinner /></div>}

        {!state.loading && state.entry && (
          <div className="srd-modal-body">
            {state.entry.text.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {!state.loading && !state.entry && (
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
