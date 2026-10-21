/**
 * components/ui/CalendarDate.jsx
 *
 * Pick a date on the campaign's own calendar — Harptos or Gregorian.
 *
 * The point of it being a picker rather than three number boxes is that a
 * wrong date should be unreachable, not merely discouraged. So:
 *
 *   - the day is a <select> built from the chosen month's real length, which
 *     is how 31 Mirtul or 30 Feb stop being typeable at all;
 *   - the five Harptos festivals are one-day "months", so the day control
 *     disappears for them instead of offering a choice of one;
 *   - switching to a shorter month clamps the day rather than leaving an
 *     impossible pair on screen;
 *   - February follows the leap year, because the Gregorian path already
 *     knows how to.
 *
 * Stores and emits a single absolute day, the same integer the timelines and
 * `campaign_meta.today_marker` use, so a date set here formats identically
 * everywhere else.
 */
import { useMemo } from 'react';

import FormField from './FormField';
import {
  HARPTOS, GREG_DAYS, absDay, fromAbsDay, doyFromForm, formMidxFromDoy,
  gregMonthDays, monthOptions,
} from '@/data/calendar';

const CLS = [
  'w-full bg-surface2 border border-border2 text-text',
  'px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)] transition-colors',
].join(' ');

/** How many days the month at `midx` holds in `year`. */
export function daysInMonth(midx, year, calType) {
  if (calType === 'harptos') return HARPTOS[midx]?.days ?? 30;
  return gregMonthDays(midx, Number(year) || 1) ?? GREG_DAYS[midx];
}

/** An absolute day → the { year, midx, day } this control edits. */
export function partsFromAbsDay(abs, calType) {
  if (abs == null) return null;
  const { year, dayOfYear } = fromAbsDay(abs, calType);
  const { midx, day } = formMidxFromDoy(dayOfYear, year, calType);
  return { year, midx, day };
}

/** The { year, midx, day } this control edits → an absolute day, or null. */
export function absDayFromParts(parts, calType) {
  if (!parts || parts.year === '' || parts.year == null) return null;
  const year = Number(parts.year);
  if (!Number.isFinite(year) || year < 1) return null;
  const day = Number(parts.day) || 1;
  return absDay(year, doyFromForm(Number(parts.midx) || 0, day, year, calType), calType);
}

/**
 * `value` is { year, midx, day } or null for "no date". `onChange` receives
 * the same shape, or null when the date is cleared.
 */
export default function CalendarDate({
  value, onChange, calType = 'harptos', label = 'Date', hint, clearable = true,
}) {
  const months = useMemo(() => monthOptions(calType), [calType]);
  /*
   * No date at all is a state this control has to be able to LOOK like.
   *
   * With `value` null the month fell back to index 0 and the day to 1, so
   * an unset date rendered as a blank year beside "Hammer" and "1" — which
   * reads as 1 Hammer with the year missing, rather than as nothing. The
   * selects carry a "—" option while that is the case.
   */
  const unset = value == null;
  const special = calType === 'harptos' && !!HARPTOS[value?.midx ?? 0]?.sp;
  const max = daysInMonth(value?.midx ?? 0, value?.year, calType);

  const days = useMemo(
    () => Array.from({ length: max }, (_, i) => i + 1),
    [max],
  );

  function set(patch) {
    const next = { year: '', midx: 0, day: 1, ...value, ...patch };
    // A month change must not leave 30 Hammer standing as 30 Midwinter.
    const cap = daysInMonth(Number(next.midx) || 0, next.year, calType);
    if (Number(next.day) > cap) next.day = cap;
    onChange(next);
  }

  return (
    <div>
      <div className={`grid gap-2 ${special ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <FormField label="Year">
          <input
            type="number" min={1} className={CLS} placeholder="—"
            value={value?.year ?? ''}
            onChange={(e) => set({ year: e.target.value })}
          />
        </FormField>
        <FormField label={calType === 'harptos' ? 'Month / festival' : 'Month'}>
          <select
            className={CLS} value={unset ? '' : value.midx}
            onChange={(e) => set({ midx: Number(e.target.value) })}
          >
            {unset && <option value="">—</option>}
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </FormField>
        {/* A festival is the whole day. Offering "day 1 of 1" would be a
            control that cannot do anything. */}
        {!special && (
          <FormField label="Day">
            <select
              className={CLS} value={unset ? '' : value.day}
              onChange={(e) => set({ day: Number(e.target.value) })}
            >
              {unset && <option value="">—</option>}
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </FormField>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        {hint && <p className="text-[0.65rem] text-text-muted flex-1">{hint}</p>}
        {clearable && value && (
          <button
            type="button" onClick={() => onChange(null)}
            className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted hover:text-gold"
          >
            Clear {label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}
