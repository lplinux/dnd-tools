/**
 * pages/ManageCampaigns/ExportPartsDialog.jsx
 *
 * Choosing which parts of a campaign to export — the world for a new table,
 * one group's history, the surveys without their answers.
 *
 * The list comes from the server (`/campaign-export-parts`), so the dialog,
 * the route and any curl command agree on what the parts are called.
 *
 * Dependencies are applied HERE, as you tick, not discovered in the file
 * afterwards: ticking Survey results ticks Survey questions, and unticking
 * Players unticks everything that hangs off a seat. The server resolves
 * them again regardless, so a hand-written `?parts=` is just as safe.
 */
import { useEffect, useMemo, useState } from 'react';

import { Button, Modal, Spinner } from '@/components/ui';
import { campaignsApi } from '@/api/campaigns';
import { useToast } from '@/hooks/useToast';

const GROUPS = [
  { id: 'world',   title: 'The world',      blurb: 'What a new table or a new edition can reuse.' },
  { id: 'table',   title: 'This table',     blurb: 'The players and what each of them carries.' },
  { id: 'history', title: 'What happened',  blurb: 'The record of this group playing it.' },
];

/** Everything `id` needs, transitively. */
function requirementsOf(id, byId, seen = new Set()) {
  for (const r of byId.get(id)?.requires ?? []) {
    if (!seen.has(r)) { seen.add(r); requirementsOf(r, byId, seen); }
  }
  return seen;
}

export default function ExportPartsDialog({ open, onClose, onExport }) {
  const { toast } = useToast();
  const [catalogue, setCatalogue] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || catalogue) return;
    campaignsApi.exportParts()
      .then((c) => { setCatalogue(c ?? []); setChosen(new Set((c ?? []).map((p) => p.id))); })
      .catch((e) => { toast(e.message, 'error'); onClose(); });
  }, [open, catalogue, toast, onClose]);

  const byId = useMemo(() => new Map((catalogue ?? []).map((p) => [p.id, p])), [catalogue]);

  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Unticking a part takes everything that needs it — a character
        // sheet with no seat to hang off is not something an import can
        // build.
        next.delete(id);
        for (const p of catalogue) if (requirementsOf(p.id, byId).has(id)) next.delete(p.id);
      } else {
        next.add(id);
        for (const r of requirementsOf(id, byId)) next.add(r);
      }
      return next;
    });
  }

  const preset = (ids) => setChosen(new Set(ids));
  const all = (catalogue ?? []).map((p) => p.id);
  const world = (catalogue ?? []).filter((p) => p.group === 'world').map((p) => p.id);

  async function run() {
    setBusy(true);
    try {
      // Everything ticked is a plain full export: same file, same name.
      await onExport(chosen.size === all.length ? null : [...chosen]);
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const peopleLeft = chosen.size > 0 && !chosen.has('players');

  return (
    <Modal open={open} onClose={onClose} title="💾 Export part of the campaign"
      className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
      {open && (!catalogue ? (
        <div className="py-10 text-center"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Start from:</span>
            <Button variant="ghost" onClick={() => preset(all)}>Everything</Button>
            <Button variant="ghost" onClick={() => preset(world)}>The world only — for a new table</Button>
            <Button variant="ghost" onClick={() => preset([])}>Nothing</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {GROUPS.map((g) => (
              <section key={g.id} className="border border-border rounded-sm p-3 bg-surface2">
                <h4 className="font-display text-gold uppercase tracking-wider text-xs">{g.title}</h4>
                <p className="text-[0.7rem] text-text-muted mb-2">{g.blurb}</p>
                <ul className="flex flex-col gap-1.5">
                  {catalogue.filter((p) => p.group === g.id).map((p) => (
                    <li key={p.id}>
                      <label className="flex items-start gap-2 text-sm text-text cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={chosen.has(p.id)}
                          onChange={() => toggle(p.id)} />
                        <span>
                          {p.label}
                          {p.requires?.length > 0 && (
                            <span className="text-[0.65rem] text-text-muted">
                              {' '}· needs {p.requires.map((r) => byId.get(r)?.label ?? r).join(', ')}
                            </span>
                          )}
                          {p.hint && (
                            <span className="block text-[0.68rem] text-text-muted">{p.hint}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* The one consequence worth saying before the file exists. */}
          {peopleLeft && (
            <p className="text-[0.75rem] text-text-dim border-l-2 border-[var(--gold-dim)] pl-2">
              Without <strong>Players</strong>, the file names no one: survey answers keep their
              numbers but not who gave them, journal entries lose their authors, and timeline
              entries drop the characters in them. Places and NPCs keep their names, so importing
              into a campaign that already has them links them back up.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-text-muted">
              {chosen.size} of {all.length} parts
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="accent" loading={busy} disabled={!chosen.size} onClick={run}>
                Export
              </Button>
            </div>
          </div>
        </div>
      ))}
    </Modal>
  );
}
