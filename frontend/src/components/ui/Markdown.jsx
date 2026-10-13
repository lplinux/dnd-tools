/**
 * components/ui/Markdown.jsx
 * Renders the markdown subset in `./renderMarkdown`. See that file for why this is
 * safe to pass to dangerouslySetInnerHTML.
 *
 * `links` is the cross-link index from `data/crossLinks.js`; without it a
 * `[[Name]]` renders as plain text, which is the right default and also what a
 * reader who may not resolve a name should see.
 *
 * `onLinkClick` receives `({ kind, id }, event)` for a resolved cross-link. One
 * delegated listener on the wrapper rather than a handler per link — the
 * markup comes from a string, so there is nothing to attach handlers to
 * individually, and a diary page can hold a hundred of them.
 */
import { renderMd } from './renderMarkdown';

export default function Markdown({ children, className = '', links = null, onLinkClick }) {
  function handleClick(e) {
    if (!onLinkClick) return;
    const el = e.target.closest?.('a.xlink[data-xlink]');
    if (!el) return;
    const [kind, id] = String(el.dataset.xlink).split(':');
    if (!kind || !id) return;
    e.preventDefault();
    onLinkClick({ kind, id: Number(id) }, e);
  }

  // Enter/Space on a focused link, since these are role="button" not hrefs.
  function handleKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.closest?.('a.xlink[data-xlink]')) return;
    handleClick(e);
  }

  return (
    <div
      className={className}
      onClick={onLinkClick ? handleClick : undefined}
      onKeyDown={onLinkClick ? handleKeyDown : undefined}
      dangerouslySetInnerHTML={{ __html: renderMd(children, links) }}
    />
  );
}
