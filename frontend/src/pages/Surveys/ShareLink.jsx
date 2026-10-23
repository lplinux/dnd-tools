/**
 * pages/Surveys/ShareLink.jsx
 *
 * The link to one asking, with a Copy button that still works when the
 * clipboard does not.
 *
 * `navigator.clipboard` exists only in a SECURE context — HTTPS, or
 * localhost. Opening the app over plain HTTP on a LAN address (a laptop at
 * the table, a phone on the same wifi) leaves it undefined, and a button
 * that silently does nothing there is worse than no button. So the URL is
 * always visible in a read-only box, selected on focus, and Copy falls back
 * to selecting it and saying "press Ctrl/⌘+C".
 */
import { useRef, useState } from 'react';

import { Button } from '@/components/ui';

/**
 * The absolute URL for a run. Absolute, because it is going into a chat.
 *
 * Built from the address THIS browser is on, like every other share link in
 * the app — so a DM on http://localhost gets a localhost link, which no
 * player can open. The dialog says so rather than leaving it to be found out.
 */
export const surveyUrl = (token) => `${window.location.origin}/survey/${token}`;

/** True when the link would only ever work on this machine. */
const isLocalOnly = () => /^(localhost$|127\.|\[?::1\]?$)/.test(window.location.hostname);

export default function ShareLink({ token }) {
  const ref = useRef(null);
  const [said, setSaid] = useState('');
  const url = surveyUrl(token);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url);
      setSaid('Copied');
    } catch {
      ref.current?.focus();
      ref.current?.select();
      setSaid('Selected — press Ctrl/⌘+C');
    }
    setTimeout(() => setSaid(''), 3000);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          ref={ref}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label="Survey link"
          className="flex-1 min-w-0 bg-surface2 border border-border2 text-text px-2 py-1.5
                     rounded-sm text-xs font-mono focus:outline-none focus:border-[var(--gold-dim)]"
        />
        <Button variant="accent" onClick={copy}>🔗 Copy</Button>
      </div>
      <p className="text-[0.68rem] text-text-muted min-h-[1em]">
        {said || 'Players need to be signed in; anyone else who opens it is turned away.'}
      </p>
      {isLocalOnly() && (
        <p className="text-[0.7rem] text-[#d49f9f]">
          This link points at <code>{window.location.hostname}</code>, which only works on
          this computer. To test with a player on another device, open the app at this
          machine&rsquo;s network address (e.g. <code>http://192.168…:3080</code>) and copy it from there.
        </p>
      )}
    </div>
  );
}
