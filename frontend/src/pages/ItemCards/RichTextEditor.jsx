/**
 * pages/ItemCards/RichTextEditor.jsx
 *
 * Minimal rich-text editor built on a contenteditable div.
 * Toolbar: Bold | Italic | Underline | Bullet list | Numbered list | Highlight | Clear.
 *
 * The HTML string is lifted out on every change via `onChange(htmlString)`.
 * The parent stores it and passes it back as `value` so the preview mirrors
 * exactly what the editor contains.
 *
 * Note: `document.execCommand` is deprecated but still the only reliable
 * cross-browser API for this pattern without pulling in a full editor lib.
 * It works in all modern browsers and is fine for this use-case.
 *
 * Props:
 *   value     string   — current inner HTML (controlled)
 *   onChange  (html: string) => void
 *   placeholder string
 */

import { useEffect, useRef } from 'react';

const BTN = 'w-6 h-[22px] rounded-sm flex items-center justify-center text-xs cursor-pointer ' +
            'bg-transparent border border-transparent text-text-dim hover:bg-border2 ' +
            'hover:text-gold transition-colors';

const BTN_ACTIVE = BTN + ' bg-[var(--gold-dim)] text-text border-[var(--gold-dim)]';

export default function RichTextEditor({ value, onChange, placeholder = 'List special powers and effects…' }) {
  const editorRef  = useRef(null);
  const skipUpdate = useRef(false); // prevent cursor-jump on controlled update

  // Sync external value → DOM only when it differs (avoids cursor reset on every keystroke)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      skipUpdate.current = true;
      el.innerHTML = value;
    }
  }, [value]);

  function emit() {
    onChange(editorRef.current?.innerHTML ?? '');
  }

  function cmd(command) {
    editorRef.current?.focus();
    document.execCommand(command, false, null);
    emit();
  }

  function handleList(kind) {
    editorRef.current?.focus();
    document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList', false, null);
    emit();
  }

  // Highlight = gold background + dark text, so it stays legible on the dark editor/
  // preview AND on the white printed card.
  function handleHighlight() {
    editorRef.current?.focus();
    document.execCommand('hiliteColor', false, '#ffe08a') || document.execCommand('backColor', false, '#ffe08a');
    document.execCommand('foreColor', false, '#1a1a1a');
    emit();
  }

  function handleClear() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('removeFormat', false, null);
    // Strip residual UL/LI tags by replacing with plain text
    document.execCommand('insertText', false,
      el.innerText.replace(/\n{3,}/g, '\n\n').trim());
    emit();
  }

  function isBold()      { return document.queryCommandState('bold'); }
  function isItalic()    { return document.queryCommandState('italic'); }
  function isUnderline() { return document.queryCommandState('underline'); }

  return (
    <div className="border border-border2 rounded-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-px bg-surface3 border-b border-border px-1 py-0.5">
        <button type="button" title="Bold (Ctrl+B)"   className={isBold()   ? BTN_ACTIVE : BTN} onMouseDown={e => { e.preventDefault(); cmd('bold'); }}>
          <b>B</b>
        </button>
        <button type="button" title="Italic (Ctrl+I)" className={isItalic() ? BTN_ACTIVE : BTN} onMouseDown={e => { e.preventDefault(); cmd('italic'); }}>
          <i>I</i>
        </button>
        <button type="button" title="Underline (Ctrl+U)" className={isUnderline() ? BTN_ACTIVE : BTN} onMouseDown={e => { e.preventDefault(); cmd('underline'); }}>
          <u>U</u>
        </button>
        <div className="w-px bg-border mx-1 my-0.5" />
        <button type="button" title="Bullet list"       className={BTN} onMouseDown={e => { e.preventDefault(); handleList('bullet'); }}>
          •≡
        </button>
        <button type="button" title="Numbered list"      className={BTN} onMouseDown={e => { e.preventDefault(); handleList('ordered'); }}>
          1.
        </button>
        <div className="w-px bg-border mx-1 my-0.5" />
        <button type="button" title="Highlight"          className={BTN} onMouseDown={e => { e.preventDefault(); handleHighlight(); }}>
          🖍
        </button>
        <div className="w-px bg-border mx-1 my-0.5" />
        <button type="button" title="Clear formatting"  className={BTN} onMouseDown={e => { e.preventDefault(); handleClear(); }}>
          ✕
        </button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder={placeholder}
        className={[
          'min-h-[90px] max-h-[220px] overflow-y-auto',
          'bg-surface2 text-text px-2 py-1.5 text-sm font-body leading-relaxed',
          'focus:outline-none',
          // Placeholder via CSS attr()
          'empty:before:content-[attr(data-placeholder)] empty:before:text-text-muted empty:before:pointer-events-none',
          // List styles inside editor
          '[&_ul]:pl-5 [&_ul]:my-0.5 [&_ul]:list-disc [&_ol]:pl-5 [&_ol]:my-0.5 [&_ol]:list-decimal [&_li]:my-px',
          '[&_b]:text-gold [&_strong]:text-gold [&_i]:text-text-dim [&_em]:text-text-dim',
        ].join(' ')}
        onInput={emit}
        onKeyUp={emit}
        onMouseUp={emit}
      />
    </div>
  );
}
