/**
 * pages/Sessions/ItemCard.jsx
 *
 * One card in a session's notes, and its sub-cards.
 *
 * Recursive, because the DM's notes nest as deep as they nest and picking a
 * depth limit here would be picking it for them.
 *
 * Open/closed is NOT local state. The panel owns it, so "expand all" can
 * skip the cards that are done — a control that re-opened fifty finished
 * beats would be a control nobody presses twice.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';

import { Markdown } from '@/components/ui';
import { STATES, stateOf } from './constants';

function StateChip({ state, onPick }) {
  const [open, setOpen] = useState(false);
  const s = stateOf(state);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change state"
        className={`text-[0.7rem] px-1.5 py-0.5 rounded-sm border transition-colors hover:border-[var(--gold)] ${s.cls}`}
      >
        {s.icon} {s.label}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          {/* bg-surface2 is opaque, but it only LOOKS opaque if no ancestor
              has dimmed itself — which is why a finished card fades its own
              text rather than the whole box. See the wrapper below. */}
          <span className="absolute left-0 top-full mt-1 z-50 flex flex-col bg-surface2
                           border border-border2 rounded-sm shadow-xl min-w-[9rem]">
            {STATES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setOpen(false); if (o.id !== state) onPick(o.id); }}
                className={`text-left text-[0.7rem] px-2 py-1 hover:bg-surface3 hover:text-gold
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

/**
 * A drop strip: "put it here, among these siblings".
 *
 * Its own target rather than a top/bottom half of the card, because a card
 * is both a neighbour and a possible parent and halves make that a guess.
 * The strip reorders; the card itself adopts.
 */
function DropLine({ active, onDrop }) {
  const [over, setOver] = useState(false);
  if (!active) return null;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(); }}
      className={`transition-all ${over ? 'h-5 my-0.5 border-2 border-dashed border-[var(--gold)] rounded-sm bg-[var(--gold-glow)]' : 'h-1.5'}`}
      aria-hidden="true"
    />
  );
}

export default function ItemCard({
  item, index = 0, depth = 0, links, onLinkClick, actions, readOnly = false, origin = null,
  isOpen, onToggle,
  // `locked` freezes the state chip as well as the buttons — a played
  // session is a record, and editing it means marking it prepared again.
  locked = false,
  drag = null, onDragStart, onDragEnd, onMove,
}) {
  const kids = item.children ?? [];
  const [overCard, setOverCard] = useState(false);
  /*
   * A card cannot be dropped into itself. Sections DO mix: a beat that
   * actually happened belongs in What happened, and dragging it there is
   * the whole point of allowing it. The server moves the subtree with it.
   */
  const canDrop = !!drag && drag.id !== item.id;
  /*
   * "What happened" carries no state. These are things that actually
   * happened at the table — there is no preparing or skipping them after
   * the fact, so a status control would be a question with one answer. They
   * are not greyed either, for the same reason: nothing about them is spent.
   */
  const stateless = item.section === 'outcome';
  // Done and skipped recede, but only the TEXT fades. Dimming the whole box
  // would take the state menu with it, which is what made it see-through.
  const spent = !stateless && (item.state === 'done' || item.state === 'skipped');
  const open = kids.length > 0 && isOpen(item.id);
  // Kept only because a descendant matched the filter — the path to a hit,
  // not a hit.
  const context = !!item._context;

  return (
    <div style={{ marginLeft: depth ? 16 : 0 }} className={depth ? 'border-l border-border pl-3' : ''}>
      {/* A root-level strip has no parent to take its section from, so it
          names one; deeper down the parent decides and it is ignored. */}
      <DropLine active={canDrop}
        onDrop={() => onMove(drag.id, item.parent_id ?? null, index, item.section)} />
      <div
        draggable={!readOnly && !locked}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(item); }}
        onDragEnd={onDragEnd}
        onDragOver={canDrop ? (e) => { e.preventDefault(); e.stopPropagation(); setOverCard(true); } : undefined}
        onDragLeave={() => setOverCard(false)}
        onDrop={canDrop ? (e) => {
          e.preventDefault(); e.stopPropagation(); setOverCard(false);
          // Dropped ON a card: become its last child.
          onMove(drag.id, item.id, (item.children ?? []).length);
        } : undefined}
        className={`bg-surface2 border rounded-sm p-2.5 mb-2 flex flex-col gap-1.5 transition-colors
                    ${overCard ? 'border-[var(--gold)] bg-[var(--gold-glow)]' : 'border-border hover:border-border2'}
                    ${context ? 'opacity-70' : ''}
                    ${!readOnly && !locked ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        <div className="flex items-start gap-2 flex-wrap">
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              aria-expanded={open}
              aria-label={open ? 'Collapse' : `Expand ${kids.length} sub-items`}
              title={open ? 'Collapse' : `${kids.length} sub-item${kids.length === 1 ? '' : 's'}`}
              className="text-text-muted hover:text-gold mt-0.5 flex-shrink-0"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : <span className="w-3 flex-shrink-0" aria-hidden="true" />}

          <strong className={`flex-1 min-w-0 text-sm ${spent ? 'text-text-muted' : 'text-text'}`}>
            {item.title || <span className="italic text-text-muted">(untitled)</span>}
            {/* A closed card says how much is hidden under it, so a wall of
                collapsed beats is still navigable. */}
            {kids.length > 0 && !open && (
              <span className="text-text-muted font-normal text-[0.7rem] ml-1.5">
                +{kids.length}
              </span>
            )}
          </strong>

          {!stateless && (locked
            ? <span className={`text-[0.7rem] px-1.5 py-0.5 rounded-sm border ${stateOf(item.state).cls}`}>
                {stateOf(item.state).icon} {stateOf(item.state).label}
              </span>
            : <StateChip state={item.state} onPick={(next) => actions.setState(item, next)} />)}
          {!readOnly && (
            <span className="flex gap-1 flex-shrink-0">
              <button type="button" onClick={() => actions.addChild(item)}
                title="Add a sub-item" className="text-text-muted hover:text-gold"><Plus size={12} /></button>
              <button type="button" onClick={() => actions.edit(item)}
                title="Edit" className="text-text-muted hover:text-gold"><Pencil size={12} /></button>
              <button type="button" onClick={() => actions.remove(item)}
                title="Delete" className="text-text-muted hover:text-danger"><Trash2 size={12} /></button>
            </span>
          )}
        </div>

        {origin && (
          <p className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted">
            from {origin}
          </p>
        )}

        {item.body && (
          <div className={`text-[0.78rem] ${spent ? 'text-text-muted' : 'text-text-dim'}`}>
            <Markdown links={links} onLinkClick={onLinkClick}>{item.body}</Markdown>
          </div>
        )}
      </div>

      {open && kids.map((c, i) => (
        <ItemCard
          key={c.id} item={c} index={i} depth={depth + 1}
          links={links} onLinkClick={onLinkClick} actions={actions}
          readOnly={readOnly} locked={locked}
          isOpen={isOpen} onToggle={onToggle}
          drag={drag} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={onMove}
        />
      ))}
      {/* The tail of this card's own child list, so something can be dropped
          after the last sub-card rather than only before one. */}
      {open && kids.length > 0 && (
        <div style={{ marginLeft: 16 }} className="border-l border-border pl-3">
          <DropLine active={canDrop} onDrop={() => onMove(drag.id, item.id, kids.length)} />
        </div>
      )}
    </div>
  );
}
