/**
 * components/StatsSheetFrame.jsx
 *
 * The stat-block sheet (`/npc-sheet`) embedded in an iframe, with the
 * postMessage bridge that loads a saved blob into it and collects one back.
 *
 * Extracted from the PC sheet's Stats tab when NPCs grew sheets of their own.
 * The two owners differ only in where the blob is stored — a character's
 * `pc_char_stats` row or an NPC's `npc_sheets` row — so everything else lives
 * here once. The bridge has enough sharp edges (see below) that a second copy
 * would have drifted from this one within a release.
 *
 * The bridge is same-origin in both directions: the iframe's src is a route in
 * this very app. Both sides therefore name `window.location.origin` explicitly
 * rather than using `'*'`, and both ignore anything arriving from somewhere
 * else. `'*'` on a send means "deliver this to whatever document is in that
 * frame, whoever it belongs to" — and a whole stat block goes across it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { useConfirm } from '@/contexts/ConfirmContext';

/** Both documents are served by this app, so this is the only valid peer. */
const BRIDGE_ORIGIN = window.location.origin;

/**
 * @param {object}   stats     the saved blob to push in; `{}` for a new sheet
 * @param {Function} onSave    (payload) => Promise, resolving when stored
 * @param {string}   frameId   query suffix identifying the owner, e.g. "npc=7"
 * @param {string}   [title]   iframe title, for screen readers
 * @param {boolean}  [autoHeight]  grow the frame to the sheet's own height
 */
export default function StatsSheetFrame({
  stats, onSave, frameId, title = 'Stat sheet', autoHeight = true,
}) {
  const confirm = useConfirm();
  const iframeRef = useRef(null);
  const [ready, setReady]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  /*
   * Height of the embedded sheet, driven by its own IFRAME_RESIZE message.
   * Without this the iframe sat at a fixed 900px, and since an iframe prints
   * only its own box, everything past ~one viewport was missing from the PDF.
   */
  const [frameH, setFrameH] = useState(900);

  useEffect(() => {
    function onMessage(e) {
      // Anything not from this app is not part of the bridge.
      if (e.origin !== BRIDGE_ORIGIN) return;
      if (!e.data || typeof e.data !== 'object') return;
      /*
       * Only listen to OUR iframe. While printing there are two frames
       * mounted (the on-screen one and the print copy), and without this
       * each reacted to the other's — the print copy's NPC_READY made the
       * on-screen one re-push LOAD_STATS over unsaved edits.
       */
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data.type === 'IFRAME_RESIZE' && Number.isFinite(e.data.height)) {
        setFrameH(Math.max(400, Math.ceil(e.data.height)));
      }
      if (e.data.type === 'NPC_READY') {
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'LOAD_STATS', payload: stats ?? {} }, BRIDGE_ORIGIN,
        );
      }
      if (e.data.type === 'STATS_DATA') {
        onSave(e.data.payload).then(() => {
          setSaving(false);
          setMsg('✓ Saved');
          setTimeout(() => setMsg(''), 2500);
        }).catch((err) => {
          setSaving(false);
          setMsg('✗ ' + err.message);
        });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [stats, onSave]);

  /*
   * NPC_READY fires once, when the iframe mounts. If the blob arrives after
   * that — the usual case, the fetch still being in flight — nothing would
   * ever push it, so re-send whenever it changes while the frame is ready.
   */
  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'LOAD_STATS', payload: stats ?? {} }, BRIDGE_ORIGIN,
    );
  }, [ready, stats]);

  const handleSave = useCallback(() => {
    if (!ready) return;
    setSaving(true);
    iframeRef.current?.contentWindow?.postMessage({ type: 'COLLECT_STATS' }, BRIDGE_ORIGIN);
  }, [ready]);

  /**
   * Print the stat block alone, by printing the iframe's OWN document.
   *
   * That keeps the parchment design: the embedded sheet carries the stylesheet
   * it was built with, including its print rules — which swap each textarea
   * for a plain text mirror, drop empty fields and keep labels with their
   * boxes. Rendering it as a plain document instead was tried and looked
   * worse; the parchment is the point.
   */
  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  async function handleClear() {
    if (!await confirm('Clear the stats sheet?', { title: 'Clear stats', confirmLabel: 'Clear' })) return;
    /*
     * Not LOAD_STATS with an empty payload: populateSheet bails on `{}` (it
     * has to, or an empty save would wipe a sheet), so that was a silent
     * no-op. CLEAR_STATS calls the sheet's own clearSheet() instead.
     */
    iframeRef.current?.contentWindow?.postMessage({ type: 'CLEAR_STATS' }, BRIDGE_ORIGIN);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 bg-surface2 border-b border-border flex-shrink-0">
        <span className="text-text-dim text-xs flex-1">{msg}</span>
        <Button variant="accent" loading={saving} onClick={handleSave} disabled={!ready}>
          💾 Save
        </Button>
        <Button variant="default" onClick={handlePrint} disabled={!ready}>
          🖨 Print
        </Button>
        <Button variant="danger" onClick={handleClear} disabled={!ready}>
          🗑 Clear
        </Button>
      </div>

      {/* min-h-full on the frame, not just a pixel height: a short sheet left
          the rest of the scroll container showing the app's dark background as
          a black band under the parchment. The wrapper carries the parchment
          colour too, so the band cannot come back during the frame's reflow. */}
      <div className="flex-1 overflow-y-auto bg-[#f7f0dc]">
        <iframe
          ref={iframeRef}
          src={`/npc-sheet?embedded=1&${frameId}`}
          title={title}
          className="w-full border-0 block"
          style={{ height: autoHeight ? frameH : '100%', minHeight: '100%' }}
          scrolling="no"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
