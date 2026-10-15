/**
 * data/printDoc.js
 *
 * The shared plumbing behind every "print this as a document" button.
 *
 * WHY A SEPARATE WINDOW rather than an off-canvas print block in the app:
 * Vite leaves a lazily loaded route's stylesheet in the document after you
 * navigate away, so an `@page` rule written for one page becomes GLOBAL after
 * a single visit and silently changes the margins of the PC and NPC sheets.
 * Naming the page to confine it re-introduces the blank-page bug this project
 * has already fixed twice (see pc-print.css and npc-sheet.css). A document of
 * its own has its own page context and cannot leak.
 *
 * It also sidesteps three traps for free: no theme tokens are in scope, so
 * nothing prints as a dark block; no dependence on the positional
 * `#root > div` un-clip chain in globals.css; and no component mounts twice
 * with live side effects.
 *
 * This file was lifted out of pages/Diary/printBook.js when the Journal and a
 * player's Diary wanted the same treatment. Each document keeps its own
 * stylesheet and its own layout — only the parts that are genuinely identical
 * live here.
 */

/** The two webfonts every printed document in this app uses. */
export const PRINT_FONTS =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap';

/**
 * Escape for element content.
 *
 * Everything passed through here is user text that is NOT markdown — titles,
 * names, category labels. Markdown bodies go through `renderMd`, which does
 * its own escaping; running both over the same string would double-encode it.
 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Open a complete HTML document in its own window and print it.
 *
 * Returns false when the popup was blocked, so the caller can say so — a
 * print button that silently does nothing is the worst version of this.
 */
export function openPrintWindow(html) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();

  // Wait for the webfonts rather than guessing with a timeout: they load from
  // Google with `display=swap`, so printing too early renders the whole
  // document in Georgia. `document.fonts.ready` resolves once swapping is done.
  const go = () => { win.focus(); win.print(); };
  if (win.document.fonts?.ready) win.document.fonts.ready.then(go).catch(go);
  else win.addEventListener('load', go);
  return true;
}
