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
 *
 * `highlight` is a list of folded search terms to mark in the rendered text.
 * It is applied by walking TEXT NODES after render, never by rewriting the
 * HTML string: a search for "div" must mark the word, not the tags. That path
 * sets `innerHTML` from an effect instead of using dangerouslySetInnerHTML,
 * so the baseline is re-established on every change and running twice cannot
 * nest one mark inside another.
 */
import { useEffect, useRef } from 'react';

import { renderMd } from './renderMarkdown';
import { highlightElement } from '@/data/highlight';

export default function Markdown({
  children, className = '', links = null, onLinkClick, highlight = null,
}) {
  const ref = useRef(null);
  const html = renderMd(children, links);
  const marking = !!highlight?.length;
  // A stable dependency: the array identity changes on every parent render.
  const termKey = marking ? highlight.join('\u0000') : '';

  useEffect(() => {
    if (!marking || !ref.current) return;
    ref.current.innerHTML = html;
    highlightElement(ref.current, termKey.split('\u0000').filter(Boolean));
  }, [marking, html, termKey]);

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
      ref={ref}
      className={className}
      onClick={onLinkClick ? handleClick : undefined}
      onKeyDown={onLinkClick ? handleKeyDown : undefined}
      // When marking, the effect owns the content — React must not also write
      // it, or the two fight over the same node on every render.
      dangerouslySetInnerHTML={marking ? undefined : { __html: html }}
    />
  );
}
