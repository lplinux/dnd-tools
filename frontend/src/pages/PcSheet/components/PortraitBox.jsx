/**
 * pages/PcSheet/components/PortraitBox.jsx
 *
 * Portrait image display with upload / URL / clear controls.
 * Validates size (500 KB) and dimensions (412×544) before uploading.
 */

import { useRef, useState } from 'react';

export default function PortraitBox({ charData, playerId, onUpload, onUrlChange, onClear }) {
  const fileRef  = useRef(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const portraitSrc = charData?.picture_data || charData?.picture_url || '';

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      setMsg('✗ Image exceeds 500 KB. Please resize and try again.'); setMsgType('error');
      e.target.value = ''; return;
    }

    setMsg('⏳ Uploading…'); setMsgType('');
    try {
      await onUpload(file);
      setMsg('✓ Portrait saved!'); setMsgType('ok');
    } catch (err) {
      setMsg('✗ ' + err.message); setMsgType('error');
    }
    e.target.value = '';
  }

  const inputCls = 'bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)] w-full';

  return (
    <div className="flex gap-4 flex-wrap">
      {/* Portrait image */}
      <div
        className="w-[100px] h-[132px] flex-shrink-0 border border-border2 rounded-sm overflow-hidden flex items-center justify-center bg-surface3 cursor-pointer text-4xl"
        title="Click to upload image"
        onClick={() => fileRef.current?.click()}
      >
        {portraitSrc ? (
          <img src={portraitSrc} alt="portrait"
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display='none'; e.target.parentElement.textContent='🧝'; }} />
        ) : '🧝'}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
        <div className="font-display text-text-dim text-[0.6rem] uppercase tracking-wider">Portrait</div>

        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="hdr-btn text-xs"
            title="Upload an image (Max 412×544 px · 500 KB)"
          >
            📁 Upload
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden" onChange={handleFile} />
          <span className="text-text-dim text-xs self-center">or</span>
        </div>

        <input
          type="url"
          placeholder="https://… (image URL)"
          defaultValue={charData?.picture_url || ''}
          onBlur={e => onUrlChange(e.target.value)}
          className={inputCls}
        />

        <button
          onClick={onClear}
          className="hdr-btn-danger text-xs self-start"
          title="Remove portrait"
        >
          ✕ Clear
        </button>

        {msg && (
          <p className={`text-xs ${msgType === 'error' ? 'text-danger' : msgType === 'ok' ? 'text-green-400' : 'text-text-dim'}`}>
            {msg}
          </p>
        )}
        <p className="text-text-muted text-[10px]">Max 412×544 px · 500 KB · JPEG/PNG/GIF/WebP</p>
      </div>
    </div>
  );
}
