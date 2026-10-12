/**
 * pages/PcSheet/tabs/CoinPurse.jsx
 *
 * The four denominations, pinned at the top of Treasure.
 *
 * On the character rather than as inventory rows, because coins are a running
 * balance you add to and spend from — not a thing you own one of. Four fields
 * rather than a single "gold" number because that is how players track them,
 * and converting in your head at the table is exactly the arithmetic a sheet
 * should take off you.
 *
 * Saved on blur, not per keystroke: this is a text input writing to the server,
 * and a request per digit would be both wasteful and racy.
 */
import { useEffect, useState } from 'react';

const COINS = [
  { key: 'coins_pp', label: 'PP', title: 'Platinum', cls: 'text-[#cfd4da]' },
  { key: 'coins_gp', label: 'GP', title: 'Gold',     cls: 'text-[var(--gold)]' },
  { key: 'coins_sp', label: 'SP', title: 'Silver',   cls: 'text-[#aab0b6]' },
  { key: 'coins_cp', label: 'CP', title: 'Copper',   cls: 'text-[#b2724a]' },
];

/** 5e: fifty coins weigh a pound, whatever the metal. */
export const COINS_PER_POUND = 50;

export function coinWeight(charData) {
  const total = COINS.reduce((n, c) => n + (parseInt(charData?.[c.key], 10) || 0), 0);
  return total / COINS_PER_POUND;
}

export default function CoinPurse({ charData, onSave }) {
  const [draft, setDraft] = useState(
    () => Object.fromEntries(COINS.map((c) => [c.key, String(charData?.[c.key] ?? 0)])),
  );

  // Re-sync when the values change underneath us — a player switch, or a
  // reload after saving. Keyed on the four values rather than on charData,
  // which is a new object on every unrelated sheet edit.
  const pp = charData?.coins_pp, gp = charData?.coins_gp;
  const sp = charData?.coins_sp, cp = charData?.coins_cp;
  useEffect(() => {
    setDraft({
      coins_pp: String(pp ?? 0), coins_gp: String(gp ?? 0),
      coins_sp: String(sp ?? 0), coins_cp: String(cp ?? 0),
    });
  }, [pp, gp, sp, cp]);

  const commit = () => {
    const next = Object.fromEntries(COINS.map((c) => [c.key, parseInt(draft[c.key], 10) || 0]));
    const changed = COINS.some((c) => next[c.key] !== (parseInt(charData?.[c.key], 10) || 0));
    if (changed) onSave(next);
  };

  const total = COINS.reduce((n, c) => n + (parseInt(draft[c.key], 10) || 0), 0);

  return (
    // flex-wrap: four label+input pairs plus the total overflowed a narrow
    // panel, clipping the first label against the panel edge.
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 px-3 py-2 border-b border-border bg-surface2/50">
      {COINS.map((c) => (
        <label key={c.key} className="flex items-center gap-1" title={c.title}>
          <span className={`font-display text-[0.7rem] tracking-wider ${c.cls}`}>{c.label}</span>
          <input
            type="number" min={0} inputMode="numeric"
            className="w-14 bg-surface border border-border2 rounded-sm px-1 py-0.5 text-sm text-right tabular-nums text-text focus:outline-none focus:border-[var(--gold-dim)]"
            value={draft[c.key]}
            onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
            onBlur={commit}
          />
        </label>
      ))}
      <span className="ml-auto text-[0.78rem] text-text-muted tabular-nums" title={`${COINS_PER_POUND} coins = 1 lb`}>
        {total} coin{total === 1 ? '' : 's'} · {Math.round((total / COINS_PER_POUND) * 100) / 100} lb
      </span>
    </div>
  );
}
