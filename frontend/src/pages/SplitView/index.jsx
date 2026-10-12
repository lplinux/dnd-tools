/**
 * pages/SplitView/index.jsx
 *
 * Multi-frame split view — fully migrated from the legacy split-view.html.
 *
 * Features:
 *   - Named profiles stored in localStorage
 *   - Three layout modes: 2×2 (4 frames), 1-tall + 2 (3a), 1-wide + 2 (3b)
 *   - URL inputs per frame; "Load" commits the URL to the iframe
 *   - Show/hide control overlay (also via keyboard H)
 *   - Keyboard shortcuts: Ctrl/⌘+1/2/3 to switch layout
 *
 * No AppHeader — the controls overlay floats above the fullscreen grid,
 * consistent with the original design (adding a header bar wastes vertical space).
 */

import { useEffect, useState } from 'react';
import { useSplitViewProfiles } from '@/hooks/useSplitViewProfiles';
import { useConfirm } from '@/contexts/ConfirmContext';

// ─────────────────────────────────────────────────────────────────────────────
// Layout definitions
// ─────────────────────────────────────────────────────────────────────────────
const LAYOUTS = [
  { id: '4',  label: '4 Frames (2×2)' },
  { id: '3a', label: '3 Frames (1 tall + 2)' },
  { id: '3b', label: '3 Frames (1 wide + 2)' },
];

/** CSS grid styles for each layout */
function gridStyle(layout) {
  if (layout === '4')  return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
  if (layout === '3a') return { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' };
  if (layout === '3b') return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '2fr 1fr' };
  return {};
}

/** Per-frame grid placement style */
function frameStyle(index, layout) {
  if (layout === '3a' && index === 0) return { gridRow: '1 / span 2' };
  if (layout === '3b' && index === 0) return { gridColumn: '1 / span 2' };
  return {};
}

/** Whether a frame slot is visible for the given layout */
function isFrameVisible(index, layout) {
  if (layout !== '4' && index === 3) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controls overlay
// ─────────────────────────────────────────────────────────────────────────────
function ControlsOverlay({
  visible, profileNames, current, layout, urls,
  onSelectProfile, onNewProfile, onDeleteProfile,
  onLayoutChange, onUrlChange, onLoad,
}) {
  const confirm = useConfirm();
  const inputCls = 'bg-white/90 border border-gray-300 text-gray-800 text-sm px-2 py-1 rounded w-52 focus:outline-none focus:border-blue-400';
  const btnCls   = 'bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded transition-colors';

  function handleNewProfile() {
    const name = window.prompt('New profile name:');
    if (name) onNewProfile(name);
  }

  async function handleDelete() {
    if (await confirm(`Delete profile "${current}"?`, { title: 'Delete profile', confirmLabel: 'Delete' })) onDeleteProfile();
  }

  return (
    <div
      className={[
        'fixed top-2 left-2 z-50 bg-white/90 backdrop-blur-sm rounded-lg p-3',
        'shadow-lg text-sm transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none',
      ].join(' ')}
    >
      {/* Profile row */}
      <div className="flex items-center gap-1.5 mb-2">
        <label className="text-gray-600 text-xs">Profile:</label>
        <select
          value={current}
          onChange={e => onSelectProfile(e.target.value)}
          className="bg-white border border-gray-300 text-gray-800 text-xs px-1.5 py-1 rounded"
        >
          {profileNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={handleNewProfile} className={btnCls} title="New profile">➕</button>
        <button onClick={handleDelete}     className={btnCls} title="Delete profile">🗑</button>
      </div>

      {/* Layout row */}
      <div className="flex items-center gap-1.5 mb-2">
        <label className="text-gray-600 text-xs">Layout:</label>
        <select
          value={layout}
          onChange={e => onLayoutChange(e.target.value)}
          className="bg-white border border-gray-300 text-gray-800 text-xs px-1.5 py-1 rounded"
        >
          {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>

      {/* URL inputs */}
      <div className="flex flex-col gap-1">
        {urls.map((url, i) => {
          if (!isFrameVisible(i, layout)) return null;
          return (
            <div key={i} className="flex gap-1">
              <input
                type="text"
                value={url}
                placeholder={`URL ${i + 1}`}
                className={inputCls}
                onChange={e => onUrlChange(i, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onLoad(i)}
              />
              <button onClick={() => onLoad(i)} className={btnCls}>Load</button>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p className="text-gray-400 text-[10px] mt-2">
        ⌨ Ctrl/⌘+1 = 2×2 · +2 = 3a · +3 = 3b · H = toggle
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function SplitView() {
  const [controlsVisible, setControlsVisible] = useState(true);

  const {
    profileNames, current, layout, urls, frames,
    setUrl, loadUrl, setLayout,
    selectProfile, newProfile, deleteProfile,
  } = useSplitViewProfiles();

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'h' || e.key === 'H') {
        setControlsVisible(v => !v);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setLayout('4'); }
        if (e.key === '2') { e.preventDefault(); setLayout('3a'); }
        if (e.key === '3') { e.preventDefault(); setLayout('3b'); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setLayout]);

  return (
    // Full-viewport container — no AppHeader, same as the original
    <div className="fixed inset-0 bg-black overflow-hidden">

      {/* Toggle button */}
      <button
        onClick={() => setControlsVisible(v => !v)}
        className="fixed top-2 right-2 z-[51] bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
        title="Toggle controls (H)"
      >
        {controlsVisible ? 'Hide' : 'Show'} Controls
      </button>

      {/* Controls overlay */}
      <ControlsOverlay
        visible={controlsVisible}
        profileNames={profileNames}
        current={current}
        layout={layout}
        urls={urls}
        onSelectProfile={selectProfile}
        onNewProfile={newProfile}
        onDeleteProfile={deleteProfile}
        onLayoutChange={setLayout}
        onUrlChange={setUrl}
        onLoad={loadUrl}
      />

      {/* Frame grid */}
      <div
        className="absolute inset-0"
        style={{ display: 'grid', gap: 2, ...gridStyle(layout) }}
      >
        {frames.map((src, i) => {
          if (!isFrameVisible(i, layout)) return null;
          return (
            <iframe
              key={i}
              src={src || undefined}
              title={`Frame ${i + 1}`}
              className="w-full h-full border-0 bg-surface"
              style={frameStyle(i, layout)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          );
        })}
      </div>
    </div>
  );
}
