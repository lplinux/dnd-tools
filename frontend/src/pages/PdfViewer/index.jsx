/**
 * pages/PdfViewer/index.jsx
 *
 * PDF Viewer — fully migrated from the legacy pdf-viewer.html.
 * DM only (access guard in App.jsx).
 *
 * Features:
 *   - PDF list fetched from /api/pdfs, displayed in a collapsible sidebar
 *   - Page-by-page rendering via pdf.js (loaded from CDN)
 *   - Zoom: slider, +/− buttons, "Fit to width"
 *   - Direct page number input
 *   - Keyboard navigation: ← → ↑ ↓ arrows, +/−, F for fullscreen, Escape to close
 *   - Fullscreen overlay with its own canvas + controls bar
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';

import AppHeader from '@/components/layout/AppHeader';
import { Spinner } from '@/components/ui';
import { usePdfViewer } from '@/hooks/usePdfViewer';

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable control button
// ─────────────────────────────────────────────────────────────────────────────
function CtrlBtn({ onClick, disabled, title, children, active = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'flex items-center justify-center px-2 py-1 rounded-sm text-xs font-display',
        'border transition-colors whitespace-nowrap flex-shrink-0',
        active
          ? 'bg-[var(--gold-dim)] text-bg border-[var(--gold-dim)]'
          : 'bg-surface3 border-border2 text-text hover:bg-[var(--gold-dim)] hover:text-bg',
        disabled ? 'opacity-40 cursor-default pointer-events-none' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Controls bar (reused in normal and fullscreen mode)
// ─────────────────────────────────────────────────────────────────────────────
function ControlsBar({ viewer, containerRef, dark = false, onFullscreen, onCloseFullscreen }) {
  const { pageNum, numPages, scale, status, nextPage, prevPage, goToPage, zoomStep, setScale, fitWidth } = viewer;
  const hasPdf = numPages > 0;

  function handleFitWidth() {
    const w = containerRef?.current?.clientWidth ?? 800;
    fitWidth(w);
  }

  const barCls = dark
    ? 'flex items-center gap-2 flex-wrap px-4 py-1.5 flex-shrink-0 bg-black/85 border-t border-white/10'
    : 'flex items-center gap-2 flex-wrap px-3 py-1.5 flex-shrink-0 bg-surface2 border-b border-border';

  return (
    <div className={barCls}>
      <CtrlBtn onClick={prevPage}  disabled={!hasPdf || pageNum <= 1}           title="Previous (←)"><ChevronLeft  size={13} /></CtrlBtn>

      <input
        type="number"
        min={1} max={numPages || 1}
        value={pageNum}
        disabled={!hasPdf}
        onChange={e => goToPage(parseInt(e.target.value) || 1)}
        className="w-12 text-center text-xs bg-surface3 border border-border2 text-text rounded-sm px-1 py-1 focus:outline-none focus:border-[var(--gold-dim)]"
        title="Page number"
      />

      <span className={`text-xs flex-1 text-center min-w-[80px] ${dark ? 'text-white/60' : 'text-text-dim'}`}>
        {status}
      </span>

      <CtrlBtn onClick={nextPage}  disabled={!hasPdf || pageNum >= numPages}    title="Next (→)"><ChevronRight size={13} /></CtrlBtn>

      <CtrlBtn onClick={() => zoomStep(-0.15)} disabled={!hasPdf} title="Zoom out (−)">−</CtrlBtn>

      <input
        type="range"
        min={40} max={300}
        value={Math.round(scale * 100)}
        disabled={!hasPdf}
        onChange={e => setScale(e.target.value / 100)}
        className="w-20 accent-[var(--gold-dim)] cursor-pointer"
        title="Zoom"
      />

      <CtrlBtn onClick={() => zoomStep(0.15)}  disabled={!hasPdf} title="Zoom in (+)">+</CtrlBtn>

      <span className={`text-[10px] min-w-[36px] text-right ${dark ? 'text-white/60' : 'text-text-dim'}`}>
        {Math.round(scale * 100)}%
      </span>

      <CtrlBtn onClick={handleFitWidth} disabled={!hasPdf} title="Fit to width">⇔ Fit</CtrlBtn>

      {onFullscreen && (
        <CtrlBtn onClick={onFullscreen} disabled={!hasPdf} title="Fullscreen (F)">
          <Maximize2 size={12} />
        </CtrlBtn>
      )}
      {onCloseFullscreen && (
        <CtrlBtn onClick={onCloseFullscreen} title="Close fullscreen (Esc)">
          <X size={12} /> Close
        </CtrlBtn>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fullscreen overlay
// ─────────────────────────────────────────────────────────────────────────────
function FullscreenOverlay({ open, viewer, onClose }) {
  const { fsCanvasRef, rendering } = viewer;

  // Render the current page into the fullscreen canvas when the overlay opens,
  // and reset fs-mode on close. Intentionally keyed only on `open`: `viewer` is
  // a new object every render, so depending on it would re-fire continuously.
  // Page/zoom changes while open are handled by the ControlsBar calling viewer
  // methods directly.
  useEffect(() => {
    if (!open) return undefined;
    viewer.setFsMode(true);
    viewer.renderPage(viewer.pageNum, viewer.scale, true);
    return () => viewer.setFsMode(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Canvas area */}
      <div className="flex-1 overflow-auto flex flex-col items-center">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <canvas ref={fsCanvasRef} className="block my-3 shadow-2xl rounded-sm" />
      </div>

      {/* Controls bar */}
      <ControlsBar
        viewer={viewer}
        containerRef={null}
        dark
        onCloseFullscreen={onClose}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function PdfViewer() {
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [fullscreen,   setFullscreen]   = useState(false);
  const viewerContainerRef = useRef(null);

  const viewer = usePdfViewer();
  const { pdfs, pdfsLoading, pdfsError, currentFile, loadPdf, canvasRef, rendering, nextPage, prevPage, zoomStep, setFsMode } = viewer;

  // Open fullscreen
  function openFullscreen() {
    setFullscreen(true);
  }
  function closeFullscreen() {
    setFullscreen(false);
    setFsMode(false);
    // Re-render in normal canvas
    viewer.renderPage(viewer.pageNum, viewer.scale, false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPage();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevPage();
      if (e.key === 'Escape' && fullscreen)    closeFullscreen();
      if ((e.key === '+' || e.key === '='))    zoomStep(0.15);
      if (e.key === '-')                       zoomStep(-0.15);
      if ((e.key === 'f' || e.key === 'F') && !fullscreen) openFullscreen();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // open/closeFullscreen are omitted on purpose: the only mutable state they
    // close over is `fullscreen`, which is already a dep, so the listener is
    // re-bound with fresh closures whenever it changes (no stale closure).
  }, [nextPage, prevPage, zoomStep, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <AppHeader icon="📖" name="PDF Viewer" />

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Sidebar toggle ── */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="flex-shrink-0 w-[18px] bg-surface2 border-r border-border2 flex items-center justify-center text-text-muted hover:bg-border2 hover:text-gold transition-colors text-[0.55rem] writing-mode-vertical order-first"
          title="Toggle sidebar"
          style={{ writingMode: 'vertical-rl', letterSpacing: '0.06em' }}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>

        {/* ── Sidebar ── */}
        <div
          className={[
            'flex-shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden',
            'transition-all duration-200',
            sidebarOpen ? 'w-60' : 'w-0',
          ].join(' ')}
        >
          <div className="font-display text-gold text-[0.7rem] uppercase tracking-widest px-3 py-2.5 border-b border-border flex-shrink-0">
            📚 Available PDFs
          </div>

          <div className="flex-1 overflow-y-auto">
            {pdfsLoading && (
              <div className="flex justify-center py-6"><Spinner /></div>
            )}
            {pdfsError && (
              <p className="p-3 text-danger text-xs italic">
                {pdfsError.includes('401') || pdfsError.includes('403') || pdfsError.toLowerCase().includes('unauthorized') || pdfsError.toLowerCase().includes('access')
                  ? 'Access denied. Make sure you are logged in as DM.'
                  : pdfsError}
              </p>
            )}
            {!pdfsLoading && !pdfsError && pdfs.length === 0 && (
              <p className="p-3 text-text-dim text-xs italic text-center">
                No PDFs found.<br />Add .pdf files to the /pdfs folder.
              </p>
            )}
            {[...pdfs].sort((a, b) => a.localeCompare(b)).map(pdf => (
              <div
                key={pdf}
                onClick={() => loadPdf(pdf)}
                className={[
                  'px-3 py-2 border-b border-border cursor-pointer text-sm font-body',
                  'truncate transition-colors',
                  currentFile === pdf
                    ? 'bg-surface2 border-l-[3px] border-l-gold pl-[9px] text-gold'
                    : 'text-text hover:bg-surface2 hover:text-gold',
                ].join(' ')}
                title={pdf}
              >
                {pdf}
              </div>
            ))}
          </div>
        </div>

        {/* ── Viewer ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface min-w-0">

          <ControlsBar
            viewer={viewer}
            containerRef={viewerContainerRef}
            onFullscreen={openFullscreen}
          />

          {/* Canvas area */}
          <div
            ref={viewerContainerRef}
            className="flex-1 overflow-auto flex flex-col items-center bg-bg relative"
          >
            {!currentFile ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-dim italic text-sm">
                <span className="text-4xl">📖</span>
                <p>Select a PDF from the sidebar to begin</p>
              </div>
            ) : (
              <>
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg/50 z-10">
                    <Spinner />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="block my-4 shadow-card rounded-sm"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen overlay */}
      <FullscreenOverlay
        open={fullscreen}
        viewer={viewer}
        onClose={closeFullscreen}
      />
    </>
  );
}
