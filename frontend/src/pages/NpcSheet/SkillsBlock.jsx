/**
 * pages/NpcSheet/SkillsBlock.jsx
 *
 * Skills & Saving Throws in a 3-column grid (.skills-grid). Each row:
 * [proficiency circle] [bonus] [Skill Name ABILITY]. The circle cycles
 * none → proficient (●) → expertise (◆). Original parchment design.
 */

import { SKILLS, fmtMod } from '@/data/dnd';

const PROF_ICON  = ['○', '●', '◆'];
const PROF_CLASS = ['', ' prof', ' expert'];
const VAL_CLASS  = ['', ' proficient', ' expert'];

export default function SkillsBlock({ skillProfs, derived, onCycleSkill }) {
  return (
    <>
      <div className="sec-title">
        <span>Skills &amp; Saving Throws</span>
        <small>● proficient &nbsp; ◆ expertise</small>
      </div>
      <div className="skills-grid">
        {SKILLS.map(([name, ab]) => {
          const p = skillProfs[name] ?? 0;
          const bonus = derived.skillValues[name];
          return (
            <div key={name} className="skill-row">
              <button
                type="button"
                className={`prof-btn${PROF_CLASS[p]}`}
                onClick={() => onCycleSkill(name)}
                title="None / Proficient / Expertise"
                aria-label={`Toggle ${name} proficiency`}
              >
                {PROF_ICON[p]}
              </button>
              <div className={`skill-val${VAL_CLASS[p]}`}>{fmtMod(bonus)}</div>
              <span className="skill-name">{name} <em>{ab.toUpperCase()}</em></span>
            </div>
          );
        })}
      </div>
    </>
  );
}
