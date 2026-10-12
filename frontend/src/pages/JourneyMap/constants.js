/**
 * pages/JourneyMap/constants.js
 *
 * Static config for the journey-map editor: tools, tool hints, map scopes.
 */

/** Editor tools, in sidebar order. `key` is the keyboard shortcut. */
export const TOOLS = [
  { id: 'select',  icon: '↖',  label: 'Select / Move',     key: 'V' },
  { id: 'pan',     icon: '🤚', label: 'Pan',                key: 'H' },
  { id: 'place',   icon: '📍', label: 'Place Location',     key: 'P' },
  { id: 'region',  icon: '🗾', label: 'Draw Region',        key: 'R' },
  { id: 'draw',    icon: '✏️', label: 'Draw/Extend Route',  key: 'D' },
  { id: 'measure', icon: '📐', label: 'Measure',            key: 'M' },
  { id: 'delete',  icon: '✂️', label: 'Delete',             key: 'X' },
];

export const TOOL_HINTS = {
  select:  'Click to select. Drag location pins or region vertices to reposition.',
  pan:     'Click and drag to pan. Scroll to zoom.',
  place:   'Click map to place the selected location at that position.',
  region:  'Select a region location, then click to draw its boundary polygon. Double-click or Enter to finish.',
  draw:    'Click to add waypoints, building a route from sections. Double-click or Enter to finish. With a route selected, activates Extend mode.',
  measure: 'Click pinned locations to measure. Distance is calculated from stored location distances.',
  delete:  'Click any pin, region or route to delete it.',
};

/** Map scope options for the New Map modal. */
export const MAP_SCOPES = [
  { id: 'continent', label: '🌍 Continent — all locations' },
  { id: 'city',      label: '🏙️ City / Area — locations inside a place' },
];

/** Location size types that are drawn as polygon regions rather than pins. */
export const REGION_SIZE_TYPES = ['region', 'neighborhood'];
