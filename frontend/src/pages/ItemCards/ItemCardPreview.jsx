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
import { RARITIES } from './constants';

/** Circle use-charge indicator */
function UseCircle() {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      border: '2px solid var(--gold-dim)', borderRadius: '50%',
    }} />
  );
}

const ItemCardPreview = forwardRef(function ItemCardPreview({ form }, ref) {
  const {
    name, type, rarity, flavor, attunement,
    damage, damageType, properties,
    acBonus, armorType,
    uses,
    abilities,
  } = form;

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
        .ic-card { background: var(--surface2); padding: 12px; font-size: 14px; line-height: 1.5; }
        .ic-name { font-family: var(--fd); font-size: 2rem; color: var(--gold); margin-bottom: 4px; font-weight: 600; }
        .ic-type { font-size: 13px; color: var(--text-dim); margin-bottom: 6px; }
        .ic-stat { font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }
        .ic-flavor { font-style: italic; color: var(--text-dim); margin-bottom: 8px; padding: 8px; background: var(--surface3); border-left: 2px solid var(--gold-dim); }
        .ic-abilities { font-size: 13px; color: var(--text); white-space: normal; line-height: 1.6; }
        .ic-abilities ul { padding-left: 1.3em; margin: 2px 0; list-style: disc; }
        .ic-abilities ol { padding-left: 1.3em; margin: 2px 0; list-style: decimal; }
        .ic-abilities li { margin: 1px 0; }
        .ic-abilities u { text-decoration: underline; }
        .ic-abilities b, .ic-abilities strong { color: var(--gold); }
        .ic-abilities i, .ic-abilities em { color: var(--text-dim); }
      `}</style>

      <div
        ref={ref}
        className="ic-card rounded-sm"
        // Match the printed card width (63 mm) so the preview reads at true card size
        // instead of stretching the whole panel.
        style={{ border: `1px solid ${rarityColor}`, width: '63mm', maxWidth: '100%', marginInline: 'auto' }}
      >
        <div className="ic-name">{displayName}</div>
        <div className="ic-type">{typeLabel}</div>

        {hasStats && (
          <div style={{ marginBottom: 8 }}>
            {showWeapon && (
              <>
                {damage     && <div className="ic-stat">Damage: {damage}</div>}
                {damageType && <div className="ic-stat">Type: {damageType}</div>}
                {properties && <div className="ic-stat">Properties: {properties}</div>}
              </>
            )}
            {showArmor && (
              <>
                {acBonus   && <div className="ic-stat">AC: {acBonus}</div>}
                {armorType && <div className="ic-stat">Armor Type: {armorType}</div>}
              </>
            )}
            {showUses && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
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
