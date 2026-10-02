/**
 * pages/PcPublic.jsx
 *
 * Read-only public view of a player character sheet, accessed via a hashed
 * share token (`/pc-public/:token`). Shows the character name, portrait and
 * the single "Public Information" block the player has chosen to share.
 *
 * Access: Public — no authentication required. The token resolves to a
 * player id server-side via `GET /api/pc-public/:token`, which returns
 * `{ name, picture_url, picture_data, public_info }` or 404.
 *
 * Faithful React port of the former `public/pc-public.html`.
 *
 * @see app.js  → GET /api/pc-public/:playerToken
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { pcApi } from '@/api/pc';
import { useAsync } from '@/hooks/useAsync';
import AppHeader from '@/components/layout/AppHeader';
import { Badge } from '@/components/ui';

/** Portrait box — image when available, otherwise an elf emoji placeholder. */
function Portrait({ src }) {
  // Track load failures so a broken image URL falls back to the emoji.
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;

  return (
    <div className="flex-shrink-0 w-[120px] h-[160px] flex items-center justify-center overflow-hidden rounded-sm border-2 border-border2 bg-surface2 text-5xl">
      {showImg ? (
        <img
          src={src}
          alt="portrait"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        '🧝'
      )}
    </div>
  );
}

/** Centered status panel used for loading / not-found / error states. */
function StatusPanel({ icon, children }) {
  return (
    <div className="text-center py-16 px-5 text-text-dim italic">
      <span className="block text-5xl mb-3">{icon}</span>
      {children}
    </div>
  );
}

export default function PcPublic() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get('print') === '1';
  const printedRef = useRef(false);
  const { data, loading, error } = useAsync(
    () => pcApi.publicData(token),
    { autoRun: true, deps: [token] }
  );

  // Mirror the legacy page's dynamic <title> update.
  useEffect(() => {
    document.title = data?.name ? `${data.name} — Public Sheet` : 'Character Sheet — Public View';
  }, [data]);

  // When opened with ?print=1 (the Pc Sheet "PDF" button), print once the data
  // has rendered — not on initial load, which would print the loading state.
  useEffect(() => {
    if (!printMode || printedRef.current || loading || error || !data) return;
    printedRef.current = true;
    // Let the DOM paint the rendered sheet before opening the print dialog.
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [printMode, loading, error, data]);

  const portraitSrc = data?.picture_data || data?.picture_url || null;

  return (
    <>
      <AppHeader icon="🧝" name="Character Sheet" hideBack>
        <Badge variant="gold">📢 Public View</Badge>
      </AppHeader>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[740px] mx-auto px-4 pb-10 pt-7">
          {loading && (
            <StatusPanel icon="⏳">Loading…</StatusPanel>
          )}

          {!loading && error && (
            // A 404 from the API surfaces here too — the link is invalid or the
            // character has no public information yet.
            <StatusPanel icon="🎲">
              <p>Character not found or has no public information yet.</p>
            </StatusPanel>
          )}

          {!loading && !error && data && (
            <>
              {/* Banner: portrait + name */}
              <div className="flex gap-5 items-start bg-surface border border-border rounded-sm p-[18px] mb-5">
                <Portrait src={portraitSrc} />
                <div className="flex-1">
                  <div className="font-display text-[1.6rem] text-gold tracking-wide mb-1.5">
                    {data.name || 'Unnamed Character'}
                  </div>
                  <span className="inline-block font-display uppercase text-[10px] tracking-wider rounded-sm px-2 py-0.5 border border-[#3d5a3a] bg-[#1f3d1a] text-[#9fd49f]">
                    📢 Public Information
                  </span>
                </div>
              </div>

              {/* Public information section */}
              <div className="bg-surface border border-border rounded-sm mb-4">
                <div className="bg-surface2 border-b border-border px-3.5 py-2 font-display uppercase text-[0.7rem] text-gold tracking-wider">
                  📢 Public Information
                </div>
                {data.public_info ? (
                  <div className="px-3.5 py-3.5 leading-relaxed whitespace-pre-wrap text-sm">
                    {data.public_info}
                  </div>
                ) : (
                  <div className="px-3.5 py-3.5 text-text-dim italic text-[13px]">
                    No public information has been shared yet.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
