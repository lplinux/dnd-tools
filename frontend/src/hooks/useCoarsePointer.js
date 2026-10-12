/**
 * hooks/useCoarsePointer.js
 *
 * True when the primary input is a finger rather than a mouse.
 *
 * This is the app's first and only input-modality seam — before it there was no
 * `matchMedia`, no `pointer: coarse`, nothing. Three separate problems hang off
 * it, and all three are invisible on a desktop:
 *
 *   - **Hover does not exist.** Journey-map pin labels, and the Timeline,
 *     character-tree and relationship-graph tooltips are all revealed on
 *     mouseenter, so on a tablet they are simply unreachable.
 *   - **Fingers are imprecise.** The map's bend handles are 8x8 px and its
 *     region vertices r=5. Both need a larger transparent hit area.
 *   - **Fingers wobble.** Timeline's 5 px drag-vs-click threshold is below
 *     normal finger jitter, so a tap registers as a drag and never fires onClick.
 *
 * `(pointer: coarse)` describes the PRIMARY pointer, which is the right question
 * here: a tablet with a keyboard case attached still reports coarse, and that is
 * what we want, because the screen is still the thing being touched.
 */

import { useEffect, useState } from 'react';

const QUERY = '(pointer: coarse)';

/** Read once, outside React, so the first render is already correct. */
function initial() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(initial);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setCoarse(e.matches);
    // addListener is the pre-2020 Safari spelling; still worth keeping, since
    // an old iPad is exactly the device this feature exists for.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return coarse;
}
