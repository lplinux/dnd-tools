/**
 * hooks/usePdfViewer.js
 *
 * Manages all pdf.js state for the PDF Viewer page.
 * pdf.js is loaded from CDN via a <script> tag in the page component;
 * this hook reads `window.pdfjsLib` once it's available.
 *
 * Returned shape:
 *   pdfs          string[]        — list of filenames from /api/pdfs
 *   pdfsLoading   boolean
 *   pdfsError     string | null
 *
 *   currentFile   string | null   — active PDF filename
 *   loadPdf       (filename) => void
 *
 *   pageNum       number          — current page (1-based)
 *   numPages      number
 *   scale         number          — current zoom scale (1.0 = 100%)
 *   status        string          — human-readable page status
 *   rendering     boolean
 *
 *   canvasRef     ref             — attach to the <canvas> element
 *   fsCanvasRef   ref             — attach to the fullscreen <canvas> element
 *
 *   nextPage      () => void
 *   prevPage      () => void
 *   goToPage      (n) => void
 *   setScale      (n) => void
 *   zoomStep      (delta) => void
 *   fitWidth      (containerWidth) => void
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const PDFJS_CDN     = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export function usePdfViewer() {
  // ── PDF list ─────────────────────────────────────────────────────────────
  const [pdfs,        setPdfs]        = useState([]);
  const [pdfsLoading, setPdfsLoading] = useState(true);
  const [pdfsError,   setPdfsError]   = useState(null);

  // ── PDF document state ────────────────────────────────────────────────────
  const [currentFile, setCurrentFile] = useState(null);
  const [pageNum,     setPageNum]      = useState(1);
  const [numPages,    setNumPages]     = useState(0);
  const [scale,       setScaleState]   = useState(1.0);
  const [rendering,   setRendering]    = useState(false);
  const [status,      setStatus]       = useState('No PDF loaded');

  const pdfDocRef   = useRef(null);
  const canvasRef   = useRef(null);
  const fsCanvasRef = useRef(null);
  const fsMode      = useRef(false);  // current render target

  // ── Load pdf.js from CDN ──────────────────────────────────────────────────
  useEffect(() => {
    if (window.pdfjsLib) return;
    const script = document.createElement('script');
    script.src = PDFJS_CDN;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    };
    document.head.appendChild(script);
  }, []);

  // ── Fetch PDF list ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/pdfs')
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => { setPdfs(Array.isArray(data) ? data : []); setPdfsLoading(false); })
      .catch(e  => { setPdfsError(e.message); setPdfsLoading(false); });
  }, []);

  // ── Render page ───────────────────────────────────────────────────────────
  const renderPage = useCallback(async (num, targetScale, fs = false) => {
    const doc = pdfDocRef.current;
    if (!doc || rendering) return;

    const target = fs ? fsCanvasRef.current : canvasRef.current;
    if (!target) return;

    setRendering(true);
    try {
      const page      = await doc.getPage(num);
      const viewport  = page.getViewport({ scale: targetScale });
      const dpr       = window.devicePixelRatio || 1;

      target.width  = viewport.width  * dpr;
      target.height = viewport.height * dpr;
      target.style.width  = viewport.width  + 'px';
      target.style.height = viewport.height + 'px';

      const ctx = target.getContext('2d');
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const s = `Page ${num} / ${doc.numPages}`;
      setStatus(s);
      setPageNum(num);
    } catch (e) {
      console.error('PDF render error:', e);
    } finally {
      setRendering(false);
    }
  }, [rendering]);

  // ── Public controls ───────────────────────────────────────────────────────
  const loadPdf = useCallback(async (filename) => {
    if (!window.pdfjsLib) {
      // Wait a tick for pdfjsLib to finish loading
      await new Promise(r => setTimeout(r, 300));
      if (!window.pdfjsLib) { console.error('pdf.js not loaded yet'); return; }
    }
    try {
      const doc = await window.pdfjsLib.getDocument(`/pdfs/${encodeURIComponent(filename)}`).promise;
      pdfDocRef.current = doc;
      setCurrentFile(filename);
      setNumPages(doc.numPages);
      setPageNum(1);
      // Fit to width immediately
      if (canvasRef.current) {
        const page = await doc.getPage(1);
        const vp   = page.getViewport({ scale: 1 });
        const containerW = canvasRef.current.parentElement?.clientWidth ?? 800;
        const fitted = (containerW - 40) / vp.width;
        setScaleState(fitted);
        renderPage(1, fitted, false);
      } else {
        renderPage(1, scale, false);
      }
    } catch (e) {
      console.error('Error loading PDF:', e);
      setStatus('Could not load PDF');
    }
  }, [scale, renderPage]);

  const nextPage = useCallback(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const next = Math.min(pageNum + 1, doc.numPages);
    if (next !== pageNum) renderPage(next, scale, fsMode.current);
  }, [pageNum, scale, renderPage]);

  const prevPage = useCallback(() => {
    const prev = Math.max(pageNum - 1, 1);
    if (prev !== pageNum) renderPage(prev, scale, fsMode.current);
  }, [pageNum, scale, renderPage]);

  const goToPage = useCallback((n) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const clamped = Math.max(1, Math.min(n, doc.numPages));
    renderPage(clamped, scale, fsMode.current);
  }, [scale, renderPage]);

  const setScale = useCallback((s) => {
    const clamped = Math.max(0.4, Math.min(3, s));
    setScaleState(clamped);
    renderPage(pageNum, clamped, fsMode.current);
  }, [pageNum, renderPage]);

  const zoomStep = useCallback((delta) => {
    setScale(scale + delta);
  }, [scale, setScale]);

  const fitWidth = useCallback((containerWidth) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    doc.getPage(pageNum).then(page => {
      const vp = page.getViewport({ scale: 1 });
      const fitted = (containerWidth - 40) / vp.width;
      setScaleState(fitted);
      renderPage(pageNum, fitted, fsMode.current);
    });
  }, [pageNum, renderPage]);

  /** Call before rendering to fullscreen target */
  const setFsMode = useCallback((fs) => { fsMode.current = fs; }, []);

  return {
    pdfs, pdfsLoading, pdfsError,
    currentFile, loadPdf,
    pageNum, numPages, scale, status, rendering,
    canvasRef, fsCanvasRef,
    nextPage, prevPage, goToPage, setScale, zoomStep, fitWidth,
    setFsMode,
    renderPage,
  };
}
