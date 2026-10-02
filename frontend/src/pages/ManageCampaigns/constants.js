/**
 * pages/ManageCampaigns/constants.js
 *
 * Static data for the Manage Campaigns module.
 */

/** Harptos calendar month definitions */
export const HARPTOS = [
  { name: 'Hammer',        sd: 1,   days: 30, sp: false },
  { name: 'Midwinter',     sd: 31,  days: 1,  sp: true  },
  { name: 'Alturiak',      sd: 32,  days: 30, sp: false },
  { name: 'Ches',          sd: 62,  days: 30, sp: false },
  { name: 'Tarsakh',       sd: 92,  days: 30, sp: false },
  { name: 'Greengrass',    sd: 122, days: 1,  sp: true  },
  { name: 'Mirtul',        sd: 123, days: 30, sp: false },
  { name: 'Kythorn',       sd: 153, days: 30, sp: false },
  { name: 'Flamerule',     sd: 183, days: 30, sp: false },
  { name: 'Midsummer',     sd: 213, days: 1,  sp: true  },
  { name: 'Elesias',       sd: 214, days: 30, sp: false },
  { name: 'Eleint',        sd: 244, days: 30, sp: false },
  { name: 'Highharvestide',sd: 274, days: 1,  sp: true  },
  { name: 'Marpenoth',     sd: 275, days: 30, sp: false },
  { name: 'Uktar',         sd: 305, days: 30, sp: false },
  { name: 'Feast of Moon', sd: 335, days: 1,  sp: true  },
  { name: 'Nightal',       sd: 336, days: 30, sp: false },
];

export const LOCATION_SIZE_TYPES = [
  'Big','Huge','Inn','Landmark','Medium',
  'Neighborhood','Post','Region','Small','Village','Other',
];

export const TABS = [
  { id: 'players',   label: '👤 Players',   count: true  },
  { id: 'locations', label: '📍 Locations', count: true  },
  { id: 'npcs',      label: '🧟 NPCs',      count: true  },
  { id: 'timelines', label: '📜 Timelines', count: true  },
  { id: 'chartree',  label: '🌳 Char Tree', count: false },
  { id: 'settings',  label: '⚙️ Settings',  count: false },
];

// ── Calendar helpers ────────────────────────────────────────────────────────

export function absDay(year, doy) {
  return (year - 1) * 365 + doy;
}

export function harptDayToPeriod(doy) {
  for (const p of HARPTOS) {
    if (doy >= p.sd && doy < p.sd + p.days) {
      return { period: p, dayInPeriod: doy - p.sd + 1 };
    }
  }
  return null;
}

export function doyFromForm(midx, day, calType) {
  if (calType === 'gregorian') {
    const months = [31,28,31,30,31,30,31,31,30,31,30,31];
    return months.slice(0, midx).reduce((s, d) => s + d, 0) + day;
  }
  const p = HARPTOS[midx];
  return p ? p.sd + day - 1 : 1;
}

export function formatAbsDay(absD, calType) {
  if (!absD) return '—';
  const year = Math.floor((absD - 1) / 365) + 1;
  const doy  = ((absD - 1) % 365) + 1;
  if (calType === 'gregorian') {
    const months = [31,28,31,30,31,30,31,31,30,31,30,31];
    const names  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let rem = doy - 1;
    for (let i = 0; i < months.length; i++) {
      if (rem < months[i]) return `${names[i]} ${rem + 1}, ${year}`;
      rem -= months[i];
    }
    return `Day ${doy}, ${year}`;
  }
  const info = harptDayToPeriod(doy);
  if (!info) return `Day ${doy}, Year ${year}`;
  return info.period.sp
    ? `${info.period.name}, Year ${year}`
    : `${info.period.name} ${info.dayInPeriod}, Year ${year}`;
}
