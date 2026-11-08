/**
 * components/HomebrewSpellInfo.jsx
 *
 * SrdInfo's counterpart for a homebrew spell: the ⓘ (or a clickable name)
 * that opens its card. Nothing to fetch — the spell is already in hand —
 * and the same SpellCard, so an official spell and a homebrew one read alike
 * except for the line saying which it is.
 */
import { useState } from 'react';

import { Modal } from '@/components/ui';
import SpellCard from '@/components/SpellCard';

export default function HomebrewSpellInfo({ spell, className = '', children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onPointerDown={(e) => e.preventDefault()}
        className={children ? `srd-info-term ${className}`.trim() : `srd-info-btn ${className}`.trim()}
        title={`${spell.name} — homebrew`}
        aria-label={children ? undefined : `About ${spell.name} (homebrew)`}
      >
        {children ?? 'ⓘ'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={spell.name}>
        <p className="spell-card-level" style={{ marginBottom: 4 }}>Homebrew</p>
        <SpellCard spell={spell} />
      </Modal>
    </>
  );
}
