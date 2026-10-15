/**
 * pages/ItemCards/ItemCardPreview.jsx
 *
 * The visual card rendered from current form state.
 * Passed a `cardRef` so the parent can call html2canvas on it for download.
 *
 * The card is intentionally unstyled via Tailwind — its classes are kept
 * as plain CSS-variable strings so html2canvas captures them correctly at
 * download time (Tailwind JIT classes may not inline well into canvas).
 * Styles are applied via a scoped <style> block inside the component.
 */

import { forwardRef } from 'react';
import SrdInfo, { useSrdIndex, srdHasEntry } from '@/components/SrdInfo';
import { RARITIES } from './constants';

/** Circle use-charge indicator */
function UseCircle() {
  return (
    <span style={{
      display: 'inline-block', width: '1em', height: '1em',
      border: '0.143em solid var(--gold-dim)', borderRadius: '50%',
    }} />
  );
}

/**
 * The true printed card width. The preview is drawn WIDER than this so it fills
 * the panel, but the PNG and the print sheet are both this size, so it is the
 * width the download has to capture at — see handleDownload in index.jsx.
 */
export const CARD_WIDTH = '63mm';

/**
 * How wide the on-screen preview is allowed to get.
 *
 * The card used to be drawn at `CARD_WIDTH` — about 238 CSS pixels — which is
 * true to the print but unreadably small in a half-width panel. It now fills
 * the panel instead, with the TYPE UNCHANGED: the card gets wider, not louder,
 * so the same text simply takes fewer lines.
 *
 * Capped rather than unbounded because line length is a readability limit of
 * its own: at 14px, 34rem is roughly 70 characters a line, about the most that
 * still scans comfortably.
 */
const PREVIEW_MAX_WIDTH = '34rem';

/**
 * A rules term the reader can click for its 2024 SRD text, or just the text.
 *
 * `lookups` is OFF by default and that default matters: this same component is
 * what `handleDownload` captures for the PNG and what the creator renders as a
 * live preview. Interactive chrome in either would end up baked into an image.
 * Only the pinned inventory card turns it on.
 */
function Term({ lookups, resource, name, slugs }) {
  // Only offer the click for a name the SRD actually has. A homebrew property
  // rendered as a link would be a dead end that opens "no entry"; as plain
  // text it is simply the DM's own word, which is what it is.
  if (!lookups || !name || !srdHasEntry(slugs, name)) return name ?? null;
  return <SrdInfo resource={resource} name={name}>{name}</SrdInfo>;
}

/** "Light, Finesse" → each one clickable, commas left as commas. */
function TermList({ lookups, resource, value, slugs }) {
  if (!lookups) return value;
  const parts = String(value).split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return value;
  return parts.map((p, i) => (
    <span key={p}>
      {i > 0 && ', '}
      <Term lookups resource={resource} name={p} slugs={slugs} />
    </span>
  ));
}

const ItemCardPreview = forwardRef(function ItemCardPreview({ form, lookups = false }, ref) {
  const {
    name, type, rarity, flavor, attunement,
    damage, damageType, properties,
    acBonus, armorType,
    uses,
    abilities,
  } = form;

  // Gated on `lookups`: useSrdIndex does nothing without a resource, so the
  // creator's live preview and the PNG capture fetch nothing. One cached
  // index request per resource, not one per term.
  const propSlugs = useSrdIndex(lookups ? 'weapon-properties' : null);
  const dmgSlugs  = useSrdIndex(lookups ? 'damage-types' : null);

  const rarityDef   = RARITIES.find(r => r.id === rarity);
  const rarityColor = rarityDef?.color ?? 'var(--border)';
  const rarityLabel = rarityDef?.label ?? rarity;

  const displayName = name  || 'Item Name';
  const displayType = type  || 'Item';
  const displayFlavor = flavor || 'A legendary item forged by master craftsmen.';

  const attunementText = attunement ? ' — Requires Attunement' : '';
  const typeLabel = `${displayType} (Rarity: ${rarityLabel}${attunementText})`;

  const showWeapon = type === 'Weapon'   && (damage || damageType || properties);
  const showArmor  = type === 'Armor'    && (acBonus || armorType);
  const showUses   = (type === 'Consumable' || type === 'Potion') && parseInt(uses) > 0;
  const hasStats   = showWeapon || showArmor || showUses;

  const usesCount = parseInt(uses) || 0;

  const flavorHtml = displayFlavor
    .split('\n').map(l => l.trim()).filter(Boolean).join('<br>');

  return (
    <>
      {/* Scoped card styles — kept as CSS strings so html2canvas can read them */}
      <style>{`
        .ic-card { background: var(--surface2); padding: 0.857em; font-size: 14px; line-height: 1.5; }
        .ic-name { font-family: var(--fd); font-size: 2.286em; color: var(--gold); margin-bottom: 0.286em; font-weight: 600; }
        .ic-type { font-size: 0.929em; color: var(--text-dim); margin-bottom: 0.429em; }
        .ic-stat { font-size: 0.929em; color: var(--text-dim); margin-bottom: 0.286em; }
        .ic-flavor { font-style: italic; color: var(--text-dim); margin-bottom: 0.571em; padding: 0.571em; background: var(--surface3); border-left: 0.143em solid var(--gold-dim); }
        .ic-abilities { font-size: 0.929em; color: var(--text); white-space: normal; line-height: 1.6; }
        .ic-abilities ul { padding-left: 1.3em; margin: 0.143em 0; list-style: disc; }
        .ic-abilities ol { padding-left: 1.3em; margin: 0.143em 0; list-style: decimal; }
        .ic-abilities li { margin: 0.071em 0; }
        .ic-abilities u { text-decoration: underline; }
        .ic-abilities b, .ic-abilities strong { color: var(--gold); }
        .ic-abilities i, .ic-abilities em { color: var(--text-dim); }
      `}</style>

      <div
        ref={ref}
        className="ic-card rounded-sm"
        style={{
          border: `1px solid ${rarityColor}`,
          // Fills the panel. The download temporarily pins the element back to
          // CARD_WIDTH before capturing, so this width never reaches the PNG.
          width: '100%',
          maxWidth: PREVIEW_MAX_WIDTH,
          marginInline: 'auto',
        }}
      >
        <div className="ic-name">{displayName}</div>
        <div className="ic-type">{typeLabel}</div>

        {hasStats && (
          <div style={{ marginBottom: '0.571em' }}>
            {showWeapon && (
              <>
                {damage     && <div className="ic-stat">Damage: {damage}</div>}
                {damageType && (
                  <div className="ic-stat">
                    Type: <Term lookups={lookups} resource="damage-types"
                      name={damageType} slugs={dmgSlugs} />
                  </div>
                )}
                {properties && (
                  <div className="ic-stat">
                    Properties: <TermList lookups={lookups} resource="weapon-properties"
                      value={properties} slugs={propSlugs} />
                  </div>
                )}
              </>
            )}
            {showArmor && (
              <>
                {acBonus   && <div className="ic-stat">AC: {acBonus}</div>}
                {armorType && <div className="ic-stat">Armor Type: {armorType}</div>}
              </>
            )}
            {showUses && (
              <div style={{ marginTop: '0.429em', display: 'flex', alignItems: 'center', gap: '0.286em' }}>
                <span className="ic-stat" style={{ marginBottom: 0 }}>Uses:</span>
                {Array.from({ length: usesCount }, (_, i) => <UseCircle key={i} />)}
              </div>
            )}
          </div>
        )}

        <div className="ic-flavor" dangerouslySetInnerHTML={{ __html: flavorHtml }} />

        {abilities && (
          <div className="ic-abilities" dangerouslySetInnerHTML={{ __html: abilities }} />
        )}
      </div>
    </>
  );
});

export default ItemCardPreview;
