/**
 * pages/Evolution/PathCard.jsx
 *
 * One card in a character's evolution notes, and its sub-cards.
 *
 * Close kin of the session-prep card, and deliberately so — the DM writes
 * both as a bullet tree and should not have to learn two ways of reading
 * one. It is a separate component rather than a shared one because the two
 * differ in what they are allowed to do: there is no drag here, no section
 * to cross, and a different set of states.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';

import { Markdown } from '@/components/ui';
import { STATES, stateOf } from './constants';

/** The state chip, which is also the state menu. */
function StateChip({ state, onPick }) {
  const [open, setOpen] = useState(false);
  const s = stateOf(state);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change state"
        className={`text-[0.6rem] px-1.5 py-0.5 rounded-sm border ${s.cls} hover:border-[var(--gold)]`}
      >
        {s.icon} {s.label}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <span className="absolute left-0 top-full mt-1 z-50 flex flex-col bg-surface2
                           border border-border2 rounded-sm shadow-card min-w-[7rem]">
            {STATES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setOpen(false); if (o.id !== state) onPick(o.id); }}
                className={`text-left text-[0.65rem] px-2 py-1 hover:bg-surface
                            ${o.id === state ? 'text-gold' : 'text-text-dim'}`}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

export default function PathCard({
  item, depth = 0, links, onLinkClick, actions, isOpen, onToggle,
}) {
  const kids = item.children ?? [];
  const open = kids.length > 0 && isOpen(item.id);
  /*
   * Done recedes, and only the TEXT fades — dimming the whole card takes
   * the state menu with it and makes it see-through, which is the bug the
   * session cards already hit.
   */
  const spent = item.state === 'done';

  return (
    <div style={{ marginLeft: depth ? 16 : 0 }} className={depth ? 'border-l border-border pl-3' : ''}>
      <div className="bg-surface2 border border-border rounded-sm p-2.5 mb-2
                      flex flex-col gap-1.5 hover:border-border2 transition-colors">
        <div className="flex items-start gap-2 flex-wrap">
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              aria-expanded={open}
              aria-label={open ? 'Collapse' : `Expand ${kids.length} sub-cards`}
              className="text-text-muted hover:text-gold mt-0.5 flex-shrink-0"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : <span className="w-3 flex-shrink-0" aria-hidden="true" />}

          <strong className={`flex-1 min-w-0 text-sm ${spent ? 'text-text-muted line-through' : 'text-text'}`}>
            {item.title || <span className="italic text-text-muted">(untitled)</span>}
            {kids.length > 0 && !open && (
              <span className="text-text-muted font-normal text-[0.7rem] ml-1.5 no-underline">
                +{kids.length}
              </span>
            )}
          </strong>

          <StateChip state={item.state} onPick={(next) => actions.setState(item, next)} />
          <span className="flex gap-1 flex-shrink-0">
            <button type="button" onClick={() => actions.addChild(item)}
              title="Add a sub-card" className="text-text-muted hover:text-gold"><Plus size={12} /></button>
            <button type="button" onClick={() => actions.edit(item)}
              title="Edit" className="text-text-muted hover:text-gold"><Pencil size={12} /></button>
            <button type="button" onClick={() => actions.remove(item)}
              title="Delete" className="text-text-muted hover:text-danger"><Trash2 size={12} /></button>
          </span>
        </div>

        {item.body && (
          <div className={`text-[0.78rem] ${spent ? 'text-text-muted' : 'text-text-dim'}`}>
            <Markdown links={links} onLinkClick={onLinkClick}>{item.body}</Markdown>
          </div>
        )}
      </div>

      {open && kids.map((c) => (
        <PathCard
          key={c.id} item={c} depth={depth + 1}
          links={links} onLinkClick={onLinkClick} actions={actions}
          isOpen={isOpen} onToggle={onToggle}
        />
      ))}
    </div>
  );
}
