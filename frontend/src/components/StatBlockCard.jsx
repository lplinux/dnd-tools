/**
 * components/StatBlockCard.jsx
 *
 * A stat block to READ — at the table, mid-fight — rather than to edit.
 *
 * Drawn natively from the saved blob instead of embedding the sheet in an
 * iframe: the sheet is an editor with its own app inside it, and loading one
 * per creature is what made Split View too slow to switch between. This is
 * plain markup, so switching is instant and two can sit side by side.
 *
 * The numbers come from data/statBlock.js, which uses the same arithmetic as
 * the editable sheet. Spell names open their card — the campaign's homebrew
 * first, the SRD otherwise. DM notes start folded: they are the "how it
 * plays" you read before the fight, not during every turn.
 */
import { useMemo } from 'react';

import SrdInfo from '@/components/SrdInfo';
import HomebrewSpellInfo from '@/components/HomebrewSpellInfo';
import { statBlockView } from '@/data/statBlock';
import { fmtMod, SPELL_LEVEL_NAMES } from '@/data/dnd';

function Line({ label, children }) {
  if (!children) return null;
  return (
    <div><span className="text-gold font-semibold">{label}</span> {children}</div>
  );
}

function Entries({ entries }) {
  return entries.map((e, i) => (
    <p key={i} className={`m-0 ${e.sub ? 'pl-4' : ''}`}>
      {e.name && <strong className="italic text-text">{e.name}. </strong>}
      {e.text}
    </p>
  ));
}

export default function StatBlockCard({ stats, homebrewSpells = null, fallbackName = '', actions = null }) {
  const v = useMemo(() => statBlockView(stats), [stats]);

  const spellLink = (name) => {
    const hb = homebrewSpells?.get(name);
    if (hb) return <HomebrewSpellInfo spell={hb}>{name}</HomebrewSpellInfo>;
    return <SrdInfo resource="spells" name={name}>{name}</SrdInfo>;
  };

  return (
    <article className="flex flex-col gap-2.5 text-[0.85rem] leading-snug text-text-dim font-body">
      <header className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-gold text-lg leading-tight">{v.name || fallbackName}</h3>
          {(v.kindLine || v.cr) && (
            <p className="italic text-text-muted text-[0.8rem]">
              {[v.kindLine, v.cr && `CR ${v.cr}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {actions}
      </header>

      <div className="grid grid-cols-3 gap-1 text-center">
        {[['AC', v.ac], ['HP', v.hp], ['Speed', v.speed]].map(([k, val]) => (
          <div key={k} className="bg-surface2 border border-border rounded-sm px-1 py-1">
            <div className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted">{k}</div>
            <div className="text-text font-semibold">{val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-1 text-center">
        {v.abilities.map((a) => (
          <div key={a.id} className="bg-surface2 border border-border rounded-sm py-1"
            title={a.save !== null ? `Saving throw ${fmtMod(a.save)} (proficient)` : undefined}>
            <div className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted">{a.id}</div>
            <div className="text-text font-semibold">{a.score} <span className="text-text-dim font-normal">({fmtMod(a.mod)})</span></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <Line label="Saving Throws">{v.saves.join(', ')}</Line>
        <Line label="Skills">{v.skills.join(', ')}</Line>
        {v.tags.map((t) => <Line key={t.label} label={t.label}>{t.value}</Line>)}
        <Line label="Senses">{v.senses}</Line>
        <Line label="Languages">{v.langs}</Line>
        <Line label="Proficiency">{fmtMod(v.prof)}</Line>
      </div>

      {v.sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <h4 className="font-display uppercase tracking-wider text-gold text-[0.75rem] border-b border-[var(--gold-dim)] pb-0.5">
            {s.title}
          </h4>
          <Entries entries={s.entries} />
        </section>
      ))}

      {v.spells.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="font-display uppercase tracking-wider text-gold text-[0.75rem] border-b border-[var(--gold-dim)] pb-0.5">
            Spellcasting{v.spellDc !== null && ` — ${v.spellAbility.toUpperCase()}, DC ${v.spellDc}, ${fmtMod(v.spellAtk)} to hit`}
          </h4>
          {v.spells.map((r) => (
            <p key={r.level} className="m-0">
              <span className="text-text-muted font-semibold">
                {r.level === 0 ? 'Cantrips' : `${SPELL_LEVEL_NAMES[r.level]} (${r.slots} slot${r.slots === 1 ? '' : 's'})`}:
              </span>{' '}
              {r.names.map((n, i) => (
                <span key={n}>{i > 0 && ', '}{spellLink(n)}</span>
              ))}
            </p>
          ))}
        </section>
      )}

      {v.equipment && <Line label="Equipment">{v.equipment}</Line>}

      {(v.personality || v.dmNotes) && (
        <details className="border-t border-border pt-1.5">
          <summary className="cursor-pointer font-display uppercase tracking-wider text-[0.7rem] text-text-muted hover:text-gold">
            DM notes
          </summary>
          <div className="flex flex-col gap-1.5 mt-1.5 whitespace-pre-wrap">
            {v.personality && <p className="m-0 italic">{v.personality}</p>}
            {v.dmNotes && <p className="m-0">{v.dmNotes}</p>}
          </div>
        </details>
      )}
    </article>
  );
}
