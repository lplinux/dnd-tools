/**
 * pages/NpcSheet/SpellSection.jsx
 *
 * Spell slot table (.spell-table). Rows derive from caster type + level; only
 * rows with slots (or a saved spell name) are shown. Each slot box toggles
 * used/unused. The spell-meta-row (DC/Atk/Ability/Reset) lives in index.jsx.
 */

import { SPELL_LEVEL_NAMES, getSlotArray } from '@/data/dnd';
import TagInput from './TagInput';
import { useSrdNames } from '@/hooks/useSrdNames';
import { splitList, joinList, removeOne } from '@/data/listValue';

/**
 * The spell chips for ONE level.
 *
 * Its own component because the suggestions are now per-level and a hook
 * cannot be called inside the row loop. Ten of these still make one network
 * request between them — `loadEntries` caches the index per resource, and the
 * level narrowing happens locally on the cached copy.
 */
function SpellNames({ level, value, onSet }) {
  // Only this level's spells: 42 at 3rd rather than all 339, so "fire" offers
  // Fireball without Fire Bolt and Fire Shield, which belong to other rows.
  const options = useSrdNames('spells', level);
  const names = splitList(value);
  const setNames = (next) => onSet(joinList(next));

  // Chips, the same editor as Defenses. It replaced a comma-separated text
  // box with a click-to-edit toggle, which was wrong twice: reopening a saved
  // level put the caret at the end — inside the LAST spell — so it read as
  // editing that one and the autocomplete offered it straight back; and the
  // resting view had no way to remove a single spell. A chip is finished the
  // moment it is added.
  return (
    <TagInput
      options={options}
      values={names}
      onAdd={(v) => setNames([...names, v])}
      onRemove={(v) => setNames(removeOne(names, v))}
      srdResource="spells"
      placeholder={level === 0 ? 'Fire Bolt, Mage Hand…' : `Add a ${SPELL_LEVEL_NAMES[level]}-level spell…`}
    />
  );
}

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

  // There is no editing MODE any more. The chips are the editor, as they are
  // for Defenses — which also retired the beforeprint hook that used to close
  // a half-open text input before the sheet reached paper, and the mirrored
  // chip list that input needed in order to show its ⓘ lookups.

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
              <SpellNames
                level={lv}
                value={spellNames[lv]}
                onSet={(v) => onSetSpellName(lv, v)}
              />
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
