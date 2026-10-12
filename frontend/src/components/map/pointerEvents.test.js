/**
 * Guards on the mouse→pointer conversion.
 *
 * These read the source as text, like the backend suites. That is crude, but
 * the alternative here is nothing: jsdom has no usable PointerEvent support and
 * does not implement setPointerCapture, so the behaviour cannot be exercised
 * without a real browser — which this project has no harness for.
 *
 * Each assertion maps to a specific way a tablet breaks, and in one case to a
 * way the database gets corrupted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

/** Every file that handles a drag, a zoom, or a focus-preserving press. */
const CONVERTED = [
  'components/map/MapStage.jsx',
  'components/map/MapLabel.jsx',
  'components/SrdCombobox.jsx',
  'components/SrdInfo.jsx',
  'pages/JourneyMap/useMapInteraction.js',
  'pages/JourneyMap/EditorLayers.jsx',
  'pages/Timeline/TimelineCanvas.jsx',
  'pages/Timeline/Sidebar.jsx',
  'pages/PcSheet/components/RelGraph.jsx',
  'pages/ManageCampaigns/tabs/CharTreeTab.jsx',
  'pages/NpcSheet/TagInput.jsx',
  'pages/ItemCards/RichTextEditor.jsx',
];

/** Comments stripped — several files explain the conversion in prose. */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/**
 * Mouse handlers that are correct to keep, because they are enhancements that
 * only make sense with a cursor — not drags. Listed explicitly so a new one
 * cannot slip in unnoticed.
 */
const MOUSE_ONLY_BY_DESIGN = {
  // Makes the event tooltip follow the cursor. Touch has no cursor; it opens
  // the tooltip on tap instead and leaves it where the finger was.
  'pages/Timeline/TimelineCanvas.jsx': ['onMouseMove'],
  // Hides the hover tooltip when the cursor leaves the canvas.
  'pages/ManageCampaigns/tabs/CharTreeTab.jsx': ['onMouseLeave'],
};

describe('no converted surface still listens for mouse drags', () => {
  it.each(CONVERTED)('%s', (rel) => {
    const src = code(rel);
    const allowed = MOUSE_ONLY_BY_DESIGN[rel] ?? [];
    for (const h of ['onMouseDown', 'onMouseMove', 'onMouseUp']) {
      if (allowed.includes(h)) continue;
      expect(src, `${rel} still uses ${h}`).not.toContain(`${h}=`);
    }
    // window.addEventListener('mousemove'|'mouseup') is the other shape.
    expect(src, `${rel} still binds a window mouse listener`)
      .not.toMatch(/addEventListener\(\s*'mouse(move|up|down)'/);
  });
});

describe('pointercancel is handled wherever a release persists', () => {
  /**
   * THE important one. Every onPointerUp branch in useMapInteraction both
   * clears its drag ref and writes to the server (saveLocGeometry,
   * saveWaypoints, saveLabelPos). Touch gets cancelled by the OS routinely —
   * a system swipe, an incoming call, a second finger. With no cancel path the
   * ref stays non-null and the NEXT finger-move teleports the pin, then saves
   * it. So: a cancel handler must exist, and it must not save.
   */
  it('useMapInteraction clears every drag ref on cancel, without saving', () => {
    const src = code('pages/JourneyMap/useMapInteraction.js');
    const m = /function onPointerCancel\(\)\s*\{([\s\S]*?)\n {2}\}/.exec(src);
    expect(m, 'onPointerCancel is missing').toBeTruthy();
    const body = m[1];

    // Every ref the move handler dispatches on must be cleared here.
    for (const ref of ['pan', 'pinDrag', 'wpDrag', 'curveDrag', 'labelDrag', 'regionDrag', 'vertexDrag']) {
      expect(body, `${ref} is not cleared on cancel`).toContain(`${ref}.current = null`);
    }
    // And nothing may be persisted — a cancelled drag is not a committed one.
    for (const save of ['saveLocGeometry', 'saveWaypoints', 'saveLabelPos']) {
      expect(body, `cancel must not call ${save}`).not.toContain(save);
    }
  });

  it('useMapInteraction exports the cancel handler to MapStage', () => {
    expect(code('pages/JourneyMap/useMapInteraction.js')).toMatch(/onPointerCancel[,\s}]/);
  });

  it('MapStage wires onPointerCancel on the stage element', () => {
    expect(code('components/map/MapStage.jsx')).toContain('onPointerCancel=');
  });

  it('the Timeline drag drops the reschedule on cancel', () => {
    const src = code('pages/Timeline/TimelineCanvas.jsx');
    expect(src).toMatch(/addEventListener\('pointercancel'/);
    // The cancel path must not call the update that reschedules the event.
    const m = /const onCancel = \(\) => \{([\s\S]*?)\};/.exec(src);
    expect(m, 'onCancel is missing').toBeTruthy();
    expect(m[1]).not.toContain('updateEvent');
  });
});

describe('touch-action is set wherever a drag competes with native scrolling', () => {
  it.each([
    ['components/map/MapStage.jsx', 'the map stage'],
    ['pages/PcSheet/components/RelGraph.jsx', 'the relationship graph'],
    ['pages/ManageCampaigns/tabs/CharTreeTab.jsx', 'the character-tree canvas'],
    ['pages/Timeline/TimelineCanvas.jsx', 'the timeline event circles'],
  ])('%s — %s', (rel) => {
    expect(code(rel)).toMatch(/touchAction:\s*'none'/);
  });

  it('Timeline applies it to the circles, NOT the scrolling container', () => {
    const src = code('pages/Timeline/TimelineCanvas.jsx');
    // `.tl-body` scrolls vertically; touch-action:none there would kill that.
    const bodyLine = src.split('\n').find((l) => l.includes('className="tl-body"'));
    expect(bodyLine, 'tl-body not found').toBeTruthy();
    expect(bodyLine).not.toContain('touchAction');
  });
});

describe('affordances that only exist on hover have a touch path', () => {
  it.each([
    'pages/JourneyMap/EditorLayers.jsx',
    'pages/JourneyMapPublic/MapLayers.jsx',
  ])('%s reveals pin labels on a coarse pointer', (rel) => {
    const src = code(rel);
    expect(src).toContain('useCoarsePointer');
    expect(src, 'showLabel must not depend on hover alone').toMatch(/showLabel = .*coarse/);
  });

  it('the Timeline tooltip opens on tap', () => {
    expect(code('pages/Timeline/TimelineCanvas.jsx')).toContain('useCoarsePointer');
  });
});

describe('reordering works without drag-and-drop', () => {
  /**
   * HTML5 DnD does not work on iOS Safari or Android Chrome at all, and
   * Pointer Events cannot fix it — it is a separate API. The buttons are the
   * path that works everywhere; the drag stays for mouse users.
   */
  it('the Timeline sidebar offers button reordering alongside the drag', () => {
    const src = code('pages/Timeline/Sidebar.jsx');
    expect(src).toContain('moveLoc(i, i - 1)');
    expect(src).toContain('moveLoc(i, i + 1)');
  });
});
