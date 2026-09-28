/**
 * components/map/MapStage.jsx
 *
 * Renders a pan/zoomable background image with an overlaid SVG whose contents
 * are supplied via a render-prop (in image-pixel coordinates). Pan/zoom state
 * lives in a `useMapViewport` instance passed in by the caller, so the editor
 * can share one viewport between this renderer and `useMapInteraction`.
 *
 * - Read-only callers (public view) pass just a viewport → built-in drag pans.
 * - Editor callers pass an `interaction` (raw mouse handlers) and a
 *   `cursorClass`; the interaction decides pan vs. tool behaviour.
 *
 * @param {object}  viewport     A useMapViewport() instance (required).
 * @param {string|null} imageSrc Background image (data URL or URL).
 * @param {object}  [interaction] { onMouseDown, onMouseMove, onMouseUp, onDoubleClick }.
 * @param {string}  [cursorClass] Tailwind cursor class for the map area.
 * @param {string}  [emptyMessage]
 * @param {(size:{iw,ih}) => React.ReactNode} children  Render-prop for SVG layers.
 */

import { useEffect, useRef } from 'react';

function ZoomBtn({ onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center bg-surface border border-border2 text-text rounded-sm text-base hover:bg-surface3 hover:border-[var(--gold-dim)] transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export default function MapStage({
  viewport,
  imageSrc,
  interaction,
  cursorClass = 'cursor-grab active:cursor-grabbing',
  emptyMessage = 'No map image uploaded.',
  overlay,
  children,
}) {
  const {
    areaRef, viewportRef, scale, offset, imgSize, loaded,
    onImageLoad, resetLoaded, zoomBy, zoomAt, fit, panTo, offsetRef,
  } = viewport;
  const { iw, ih } = imgSize;
  const imgRef = useRef(null);

  // Reset the loaded flag when the source changes so layers wait for new dims.
  // A cached or data-URL image can already be decoded before React attaches the
  // onLoad handler, so onLoad never fires and the layers (gated on `loaded`)
  // stay hidden while the image itself shows — sync manually when complete.
  useEffect(() => {
    resetLoaded();
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth) {
      onImageLoad({ currentTarget: img });
    }
  }, [imageSrc, resetLoaded, onImageLoad]);

  // React's onWheel is passive → use a native non-passive listener to zoom.
  useEffect(() => {
    const a = areaRef.current;
    if (!a) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9); };
    a.addEventListener('wheel', onWheel, { passive: false });
    return () => a.removeEventListener('wheel', onWheel);
  }, [areaRef, zoomAt]);

  // Built-in pan for read-only callers (no interaction supplied).
  const panRef = useRef(null);
  const builtin = {
    onMouseDown: (e) => {
      if (e.button !== 0) return;
      panRef.current = { px: e.clientX, py: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
    },
    onMouseMove: (e) => {
      if (!panRef.current) return;
      const { px, py, ox, oy } = panRef.current;
      panTo(ox + (e.clientX - px), oy + (e.clientY - py));
    },
    onMouseUp: () => { panRef.current = null; },
    onDoubleClick: undefined,
  };
  const h = interaction ?? builtin;
  const drawLayers = loaded || !imageSrc;

  return (
    <div
      ref={areaRef}
      className={`relative overflow-hidden bg-[#0a0807] outline-none ${cursorClass}`}
      tabIndex={0}
      onMouseDown={h.onMouseDown}
      onMouseMove={h.onMouseMove}
      onMouseUp={h.onMouseUp}
      onMouseLeave={h.onMouseUp}
      onDoubleClick={h.onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={viewportRef}
        className="absolute origin-top-left"
        style={{ transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})`, width: iw, height: ih }}
      >
        {imageSrc && (
          <img
            ref={imgRef}
            src={imageSrc}
            alt="map"
            onLoad={onImageLoad}
            draggable={false}
            className="block select-none pointer-events-none"
          />
        )}
        <svg className="absolute top-0 left-0 overflow-visible" width={iw} height={ih}>
          <defs>
            <marker id="jm-arrowhead" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 8 2.5, 0 5" fill="currentColor" opacity=".6" />
            </marker>
          </defs>
          {drawLayers && children?.({ iw, ih })}
        </svg>
      </div>

      {!imageSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted pointer-events-none">
          <div className="text-5xl opacity-30">🗺️</div>
          <p className="font-display text-sm tracking-wider opacity-40">{emptyMessage}</p>
        </div>
      )}

      <div className="absolute bottom-3.5 right-3.5 flex flex-col gap-[3px] z-10">
        <ZoomBtn onClick={() => zoomBy(1.2)}>+</ZoomBtn>
        <ZoomBtn onClick={() => zoomBy(0.8)}>−</ZoomBtn>
        <ZoomBtn onClick={() => fit(iw, ih)} className="text-[11px]">⊡</ZoomBtn>
      </div>

      {overlay}
    </div>
  );
}
