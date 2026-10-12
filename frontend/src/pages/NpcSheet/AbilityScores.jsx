/**
 * pages/NpcSheet/AbilityScores.jsx
 *
 * Six ability-score columns (.ab-col): score input, auto-calculated modifier,
 * and a saving-throw proficiency toggle + value. Faithful to the original
 * parchment design (see npc-sheet.css).
 */

import { ABILITIES, ABILITY_IDS, fmtMod } from '@/data/dnd';
import StatInput from './StatInput';

function AbilityCol({ id, label, score, stProf, mod, stBonus, onChange }) {
  return (
    <div className="ab-col">
      <div className="ab-name">{label}</div>
      {/* Replace-on-focus: a rolled or bought score overwrites the old one,
          it is never edited digit by digit. StatInput withholds the empty
          intermediate, so clearing the box on the way to a new number does not
          snap the score to 10 and flash the modifier with it. */}
      <StatInput
        className="ab-score"
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={String(score ?? '')}
        placeholder="10"
        onChange={(v) => onChange(id, 'score', parseInt(v, 10) || 10)}
        autoComplete="off"
        aria-label={`${label} score`}
      />
      <div className="ab-lbl" style={{ marginTop: 3 }}>Modifier</div>
      <div className="ab-val">{fmtMod(mod)}</div>
      <div className="ab-st-wrap">
        <input
          type="checkbox"
          checked={stProf}
          onChange={(e) => onChange(id, 'stProf', e.target.checked)}
          title="Saving Throw Proficiency"
          aria-label={`${label} saving throw proficiency`}
        />
        <div className="ab-lbl" style={{ margin: '0 2px' }}>ST</div>
        <div className={`ab-val${stProf ? ' proficient' : ''}`}>{fmtMod(stBonus)}</div>
      </div>
    </div>
  );
}

export default function AbilityScores({ abilities, derived, onAbilityChange }) {
  return (
    <>
      <div className="sec-title">
        <span>Ability Scores</span>
        <small>☑ = ST proficiency</small>
      </div>
      <div className="ab-grid">
        {ABILITY_IDS.map((id, i) => (
          <AbilityCol
            key={id}
            id={id}
            label={ABILITIES[i]}
            score={abilities[id].score}
            stProf={abilities[id].stProf}
            mod={derived.mods[id]}
            stBonus={derived.savingThrows[id]}
            onChange={onAbilityChange}
          />
        ))}
      </div>
    </>
  );
}
