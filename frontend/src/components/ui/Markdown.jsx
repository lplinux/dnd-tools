/**
 * components/ui/Markdown.jsx
 * Renders the markdown subset in `./renderMarkdown`. See that file for why this is
 * safe to pass to dangerouslySetInnerHTML.
 */
import { renderMd } from './renderMarkdown';

export default function Markdown({ children, className = '' }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMd(children) }} />;
}
