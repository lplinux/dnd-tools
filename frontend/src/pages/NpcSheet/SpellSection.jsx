/**
 * pages/NpcSheet/SpellSection.jsx
 *
 * Spell slot table (.spell-table). Rows derive from caster type + level; only
 * rows with slots (or a saved spell name) are shown. Each slot box toggles
 * used/unused. The spell-meta-row (DC/Atk/Ability/Reset) lives in index.jsx.
 */

import { SPELL_LEVEL_NAMES, getSlotArray } from '@/data/dnd';
import SrdInfo, { useSrdIndex, srdHasEntry } from '@/components/SrdInfo';

function SlotBox({ used, onToggle }) {
  return (
    <button
      type="button"
      className={`slot-box${used ? ' used' : ''}`}
      onClick={onToggle}
      aria-label={used ? 'Mark slot unused' : 'Mark slot used'}
    />
  );
}

export default function SpellSection({ casterType, level, spellNames, usedSlots, onSetSpellName, onToggleSlot }) {
  const slots = getSlotArray(casterType, level);
  const srdSlugs = useSrdIndex('spells');

  const rows = [];
  for (let i = 0; i < 10; i++) {
    const count = i === 0 ? 0 : (slots[i] ?? 0);
    // Keep a slotless row whenever the level has an entry at all — `i in spellNames`,
    // not `!spellNames[i]`. Testing truthiness meant clearing the text dropped the row
    // on the next render, and since there is no "add a level" control that was a
    // one-way door: a warlock's 1st/2nd-level spells could never be typed back in.
    if (i > 0 && count === 0 && casterType !== 'innate' && !(i in spellNames)) continue;
    rows.push({ level: i, count });
  }

  // Levels with no slots and no entry yet. Offered in the footer so a caster whose
  // slots don't line up with its known spells — a warlock records 1st/2nd-level
  // spells but only ever has Pact slots — can still add the row.
  const shown = new Set(rows.map(r => r.level));
  const hiddenLevels = Array.from({ length: 9 }, (_, n) => n + 1).filter(lv => !shown.has(lv));

  return (
    <table className="spell-table">
      <thead>
        <tr>
          <th style={{ width: 65 }}>Level</th>
          <th>Spell Names</th>
          <th style={{ width: 80, textAlign: 'right' }}>Slots</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ level: lv, count }) => (
          <tr key={lv}>
            <td className="lvl-cell">{SPELL_LEVEL_NAMES[lv]}</td>
            <td>
              <input
                className="spell-name-inp"
                type="text"
                value={spellNames[lv] ?? ''}
                onChange={(e) => onSetSpellName(lv, e.target.value)}
                placeholder={lv === 0 ? 'Fire Bolt, Mage Hand…' : 'Spell names, comma separated…'}
                autoComplete="off"
              />
              {/* Lookup chips. The input above stays the only editor — links cannot
                  live inside an <input>, so the parsed names are mirrored here
                  read-only. Purely presentational: spell_names is untouched. */}
              {(() => {
                const names = String(spellNames[lv] ?? '')
                  .split(',').map((n) => n.trim()).filter(Boolean);
                if (!names.length) return null;
                return (
                  <div className="spell-chips">
                    {names.map((n, i) => (
                      <span className="spell-chip" key={`${n}-${i}`}>
                        {n}
                        {srdHasEntry(srdSlugs, n) && <SrdInfo resource="spells" name={n} />}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </td>
            <td style={{ textAlign: 'right' }}>
              {count > 0 ? (
                <div className="slot-boxes">
                  {Array.from({ length: count }, (_, i) => (
                    <SlotBox key={i} used={(usedSlots[lv] ?? new Set()).has(i)} onToggle={() => onToggleSlot(lv, i)} />
                  ))}
                </div>
              ) : (
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>∞</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      {hiddenLevels.length > 0 && (
        <tfoot>
          <tr>
            <td className="lvl-cell" />
            <td colSpan={2}>
              <select
                className="spell-add-lvl"
                value=""
                onChange={(e) => { if (e.target.value !== '') onSetSpellName(Number(e.target.value), ''); }}
                aria-label="Add a spell level row"
              >
                <option value="">+ Add spell level…</option>
                {hiddenLevels.map(lv => (
                  <option key={lv} value={lv}>{SPELL_LEVEL_NAMES[lv]}</option>
                ))}
              </select>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
