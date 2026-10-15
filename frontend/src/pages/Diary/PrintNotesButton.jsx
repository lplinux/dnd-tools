/**
 * pages/Diary/PrintNotesButton.jsx
 *
 * "Print" for a diary, wherever one is shown. There are three such places —
 * the PC Sheet's Diary tab, the /diary page's own player view, and the DM
 * reading a player's diary — and they are three separate components by
 * history rather than by design, so the button lives here instead of being
 * written out three times.
 *
 * Drop it in GroupedEntries' `toolbar` as a function and it receives the
 * grouped, filtered list: what prints is then what is on screen.
 *
 * Notes, not the book in printBook.js. That shape is for the campaign diary's
 * long session write-ups, one per page with a drop cap; a player's diary is a
 * pile of short entries and would come out as a ream of mostly-empty sheets.
 */

import { Button } from '@/components/ui';
import { openNotesPrint } from './printNotes';

/**
 * The same two facts EntryList puts under a title, as a plain string — the
 * print document never loads React, so the on-screen node is no use here.
 */
export function diaryMetaText(e) {
  const bits = [];
  if (e.session_no != null) bits.push(`Session ${e.session_no}`);
  if (e.session_date) {
    const d = new Date(e.session_date);
    if (!Number.isNaN(d.getTime())) {
      bits.push(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    }
  }
  return bits.join(' · ');
}

export default function PrintNotesButton({
  groups, query, title, subtitle, label = 'Print as shown', meta = diaryMetaText,
  ungroupedLabel = 'Uncategorised',
}) {
  function print() {
    const ok = openNotesPrint({
      title: title || 'Campaign',
      subtitle,
      groups,
      ungroupedLabel,
      meta,
      // Said on the paper, or a filtered printout reads as the whole diary
      // with entries mysteriously missing.
      note: query ? `matching “${query}”` : '',
    });
    if (!ok) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
    }
  }

  return <Button variant="default" onClick={print} title={label}>🖨 Print</Button>;
}
