/**
 * components/SpellCard.jsx
 *
 * A spell, laid out the way the 2024 Player's Handbook lays one out: the
 * level-and-school line, then Casting Time, Range, Components and Duration,
 * then the text and what a higher-level slot does.
 *
 * Content only, no modal — SrdInfo puts it in one, and anything else that
 * wants a spell on screen can use it as is.
 */
import {
  levelLine, castingTimeFull, componentsText, durationText,
} from '@/data/spellDetails';

export default function SpellCard({ spell }) {
  const rows = [
    ['Casting Time', castingTimeFull(spell)],
    ['Range', spell.range],
    ['Components', componentsText(spell)],
    ['Duration', durationText(spell)],
  ];
  return (
    <div className="spell-card">
      <p className="spell-card-level">{levelLine(spell)}</p>
      <dl className="spell-card-stats">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '—'}</dd>
          </div>
        ))}
      </dl>
      {(spell.concentration || spell.ritual) && (
        <p className="spell-card-tags">
          {spell.concentration && <span>Concentration</span>}
          {spell.ritual && <span>Ritual</span>}
        </p>
      )}
      <div className="srd-modal-body">
        {spell.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        {spell.higherLevel && (
          <p><strong>Using a Higher-Level Spell Slot.</strong> {spell.higherLevel}</p>
        )}
      </div>
    </div>
  );
}
