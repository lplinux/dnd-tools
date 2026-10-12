/**
 * pages/NpcSheet/SpellSection.jsx
 *
 * Spell slot table (.spell-table). Rows derive from caster type + level; only
 * rows with slots (or a saved spell name) are shown. Each slot box toggles
 * used/unused. The spell-meta-row (DC/Atk/Ability/Reset) lives in index.jsx.
 */

import { useEffect, useRef, useState } from 'react';
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

  // Which level is being typed into, or null for none. The names used to render
  // TWICE — once in this input, once as the chips below it — because a ⓘ lookup
  // link cannot live inside an <input>, so the parsed names were mirrored
  // underneath. The textareas elsewhere do the same thing but hide the mirror on
  // screen (.field-print); the spell chips never got that gate, so every spell
  // appeared twice. Now the chips ARE the view and the input is the editor:
  // exactly one list is on screen at a time, and the lookups survive.
  //
  // Local state on purpose — this is view state and must never reach
  // collectSheet(), which serialises the sheet for saving.
  const [editingLevel, setEditingLevel] = useState(null);
  // Set while Escape is cancelling, so the blur it triggers does not re-open.
  const escaping = useRef(false);

  // Printing mid-edit would put a text input on the paper instead of the chip
  // list. The stat sheet prints via its own window.print(), so beforeprint is
  // the one hook that fires on every path into it.
  useEffect(() => {
    const close = () => setEditingLevel(null);
    window.addEventListener('beforeprint', close);
    return () => window.removeEventListener('beforeprint', close);
  }, []);

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
              {(() => {
                const raw = String(spellNames[lv] ?? '');
                const names = raw.split(',').map((n) => n.trim()).filter(Boolean);
                const editing = editingLevel === lv;

                // The editor. autoFocus is safe here because it only mounts in
                // response to a click or Enter on the chip row.
                if (editing) {
                  return (
                    <input
                      className="spell-name-inp"
                      type="text"
                      autoFocus
                      value={raw}
                      onChange={(e) => onSetSpellName(lv, e.target.value)}
                      onBlur={() => { if (!escaping.current) setEditingLevel(null); escaping.current = false; }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); setEditingLevel(null); }
                        // Escape closes without reverting: every keystroke has
                        // already gone through onSetSpellName, so there is no
                        // pre-edit value left to restore and pretending
                        // otherwise would be a lie. It just stops editing.
                        if (e.key === 'Escape') { escaping.current = true; setEditingLevel(null); }
                      }}
                      placeholder={lv === 0 ? 'Fire Bolt, Mage Hand…' : 'Spell names, comma separated…'}
                      autoComplete="off"
                    />
                  );
                }

                // The resting view: chips, each with its ⓘ lookup where the SRD
                // has one. A button rather than a div so it is reachable by
                // keyboard — this is the only way into the editor.
                return (
                  <button
                    type="button"
                    className={`spell-chips-btn${names.length ? '' : ' is-empty'}`}
                    onClick={() => setEditingLevel(lv)}
                    title="Click to edit"
                  >
                    {names.length ? (
                      <span className="spell-chips">
                        {names.map((n, i) => (
                          <span className="spell-chip" key={`${n}-${i}`}>
                            {n}
                            {/* Stop the ⓘ from opening the editor underneath it. */}
                            {srdHasEntry(srdSlugs, n) && (
                              <span onClick={(e) => e.stopPropagation()}>
                                <SrdInfo resource="spells" name={n} />
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="spell-chips-ph">
                        {lv === 0 ? 'Fire Bolt, Mage Hand…' : 'Spell names, comma separated…'}
                      </span>
                    )}
                  </button>
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
