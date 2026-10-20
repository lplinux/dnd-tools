/**
 * pages/PcSheet/tabs/InventoryTab.jsx
 *
 * Laid out after a printed equipment sheet: a carry-weight header, an equipped
 * block, and four panels — Treasure, Potions & Poisons, Inventory, Misc.
 *
 * Two orthogonal distinctions, and keeping them apart is the whole design:
 *
 *   PROVENANCE — granted (an item card the DM assigned: unique in the campaign,
 *     quantity 1, DM-removable only) vs free-text gear the player owns. Shown
 *     as a gold marker, not as a grouping.
 *   CATEGORY — which of the four panels it sits in. A granted potion is still
 *     granted; it just belongs under Potions.
 *
 * The slot labels on the paper sheet (Head, Back, Neck…) are deliberately NOT
 * modelled: equipping is a flag, so the equipped block lists what is worn
 * rather than pinning each item to a named slot.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner, Modal, FormField } from '@/components/ui';
import { placeCard, CARD_GAP } from '@/data/placeCard';
import { useConfirm } from '@/contexts/ConfirmContext';
import SrdCombobox from '@/components/SrdCombobox';
import { loadEntries, getEquipment } from '@/api/srd';
import { equipmentToItem } from '@/data/srdMap';
import { RARITIES } from '@/pages/ItemCards/constants';
import { chainOf } from '@/pages/ItemCards/chain';
import ItemCardPreview from '@/pages/ItemCards/ItemCardPreview';
import { useItemDrag } from '@/hooks/useItemDrag';
import CoinPurse, { coinWeight } from './CoinPurse';

const INPUT_CLS = [
  'w-full bg-surface2 border border-border2 text-text',
  'px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

const CATEGORIES = [
  { id: 'treasure',  label: '💰 Treasure' },
  { id: 'potions',   label: '🧪 Potions & Poisons' },
  { id: 'inventory', label: '🎒 Inventory' },
  { id: 'misc',      label: '🪶 Miscellaneous' },
];

/**
 * The one grid template shared by every panel header and every row.
 *
 * All tracks fixed except the name, because a header and a row are separate
 * grid containers: an `auto` or content-sized track resolves independently in
 * each, so the # and lb columns drifted by however much the action group
 * differed. The last track is wide enough for the four-button case.
 */
const INV_GRID = 'grid-cols-[1.25rem_1.25rem_1fr_3rem_4rem_6rem]';

const rarityLabel = (id) => RARITIES.find((r) => r.id === id)?.label ?? id;

/** A row's effective weight — the card's for a granted item, its own otherwise. */
const rowWeight = (i) => {
  const w = i.item_card_id ? i.card_weight : i.weight;
  return w === null || w === undefined ? null : Number(w);
};
const rowName = (i) => (i.item_card_id ? i.card_name : i.name);
/** Requires attunement? A card-linked row inherits it from the card. */
const needsAttune = (i) => (i.item_card_id ? !!i.card_attunement : !!i.requires_attunement);

/**
 * The joined `card_*` columns, reshaped into the form ItemCardPreview expects.
 * Reusing that component means the popover is the same card you would print,
 * rather than a second rendering that can drift from it.
 */
const cardFormOf = (i) => ({
  name: i.card_name ?? '', type: i.card_type ?? '', rarity: i.card_rarity ?? 'rare',
  flavor: i.card_flavor ?? '', abilities: i.card_abilities ?? '',
  attunement: !!i.card_attunement, damage: i.card_damage ?? '',
  damageType: i.card_damage_type ?? '', properties: i.card_properties ?? '',
  acBonus: i.card_ac_bonus ?? '', armorType: i.card_armor_type ?? '',
  uses: i.card_uses ?? '', weight: i.card_weight ?? '',
});

/**
 * Details for a row with no item card — SRD gear and anything hand-typed.
 *
 * Needed because "show me the item" should work for every row, not only the
 * ones the DM granted: a free-text row's notes are truncated to one line in
 * the list, so an SRD description was effectively unreadable.
 */
function PlainDetails({ item }) {
  const w = rowWeight(item);
  return (
    <div className="bg-surface border-2 border-[var(--gold-dim)] rounded-sm shadow-card p-4 w-[20rem] max-w-[85vw]">
      <h4 className="font-display text-gold text-base mb-1">{item.name || '(unnamed)'}</h4>
      <p className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted mb-2">
        {CATEGORIES.find((c) => c.id === (item.category ?? 'inventory'))?.label}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
        <dt className="text-text-muted">Quantity</dt><dd className="text-text tabular-nums">{item.quantity ?? 1}</dd>
        <dt className="text-text-muted">Weight each</dt>
        <dd className="text-text tabular-nums">{w === null ? '—' : `${w} lb`}</dd>
        {w !== null && (item.quantity ?? 1) > 1 && (
          <>
            <dt className="text-text-muted">Total</dt>
            <dd className="text-text tabular-nums">{Math.round(w * item.quantity * 100) / 100} lb</dd>
          </>
        )}
      </dl>
      {item.notes
        ? <p className="text-sm text-text-dim whitespace-pre-wrap border-t border-border pt-2">{item.notes}</p>
        : <p className="text-sm text-text-muted italic border-t border-border pt-2">No description.</p>}
    </div>
  );
}

/** 5e's cap. Mirrored from ATTUNEMENT_LIMIT in app.js, which does the enforcing. */
const ATTUNEMENT_LIMIT = 3;

/**
 * A complete PUT body for a row, with `patch` applied on top.
 *
 * The edit route replaces every column it knows about, so sending a partial
 * body silently resets the rest — toggling "equipped" with a three-key payload
 * would have un-attuned the item and blanked its notes. Building from the row
 * means a one-field change stays a one-field change.
 */
const itemPayload = (i, patch = {}) => ({
  name: i.name,
  quantity: i.quantity,
  notes: i.notes,
  equipped: !!i.equipped,
  category: i.category ?? 'inventory',
  weight: i.weight,
  attuned: !!i.attuned,
  requires_attunement: !!i.requires_attunement,
  ...patch,
});

/** Total carried weight. Unweighed rows contribute nothing and are counted separately. */
function carriedTotal(items) {
  let total = 0, unweighed = 0;
  for (const i of items) {
    const w = rowWeight(i);
    if (w === null) { unweighed += 1; continue; }
    total += w * (i.quantity ?? 1);
  }
  return { total: Math.round(total * 100) / 100, unweighed };
}

// ─────────────────────────────────────────────────────────────────────────────

function ItemRow({ item, isDM, players, atAttuneLimit, dragHandle, dragging, chain,
  onToggleEquip, onToggleAttune, onEdit, onDelete, onGive, onShowCard, onSetCard }) {
  const confirm = useConfirm();
  const granted = !!item.item_card_id;
  const name = rowName(item);
  const w = rowWeight(item);
  const [giving, setGiving] = useState(false);
  const canDelete = isDM || !granted;
  // 1-based position in the chain; 0 when this item has no chain at all.
  const tier = chain ? chain.findIndex((c) => c.id === item.item_card_id) + 1 : 0;

  // Consumables are used, not worn. An equip checkbox on a potion is a control
  // with no meaning, and it also made no sense alongside attunement.
  const equippable = (item.category ?? 'inventory') !== 'potions';

  // Equipping an attunable item attunes it, so at the cap the equip is blocked
  // too — the server returns 409 either way; this is so the reason is on screen
  // before the click rather than arriving as an error afterwards.
  const attuneBlocked = needsAttune(item) && atAttuneLimit && !item.attuned;
  const blockedWhy = `Already attuned to ${ATTUNEMENT_LIMIT} items — un-attune one first.`;

  return (
    <li className={[
      // A grid, not a flex row. The # and lb columns have to line up with the
      // panel header above them, and with each other across rows — which they
      // did not when every row's action group was a different width.
      'grid items-start gap-x-2 px-3 py-1.5 border-b border-dotted border-border last:border-0',
      // EVERY track fixed except the name. The header and each row are separate
      // grid containers, so an `auto` track resolves to each one's own content
      // — one ＋ button in the header, two to four in a row — and the columns
      // could never line up. Fixed widths are what makes them agree.
      INV_GRID,
      granted ? 'bg-[var(--gold-dim)]/5' : '',
      dragging ? 'opacity-40' : '',
    ].join(' ')}>
      {/* Drag handle — moves the item between panels. */}
      <span {...dragHandle} className="text-text-muted hover:text-gold select-none text-center leading-5"
        title="Drag to another panel">⠿</span>

      {equippable ? (
        <input
          type="checkbox" checked={!!item.equipped}
          disabled={attuneBlocked}
          title={attuneBlocked ? blockedWhy : 'Equipped'}
          onChange={(e) => onToggleEquip(item, e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-[var(--gold)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
      ) : <span />}

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {/* Every row opens something: the item card for a granted item, a
              details panel for anything else. Previously only granted rows had
              a marker at all, so an SRD item's description was unreachable. */}
          <button
            type="button"
            className={`flex-shrink-0 text-sm hover:scale-125 transition-transform ${granted ? 'text-gold' : 'text-text-muted hover:text-gold'}`}
            title={granted ? 'Granted by the DM — show the item card' : 'Show details'}
            onMouseEnter={(e) => onShowCard(item, false, e)}
            onMouseLeave={() => onShowCard(null, false)}
            onClick={(e) => onShowCard(item, true, e)}
          >{granted ? '◆' : 'ⓘ'}</button>
          <span className={`truncate text-base ${item.equipped ? 'text-gold' : 'text-text'}`}>
            {name || <em className="text-text-muted">(unnamed)</em>}
          </span>
          {granted && (
            <span className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted flex-shrink-0">
              {rarityLabel(item.card_rarity)}
            </span>
          )}
          {/* Attunement is the thing players forget, and an unattuned magic
              item usually does nothing — so it is a button, not a quiet flag:
              amber when it needs attuning and has not been, green when it has. */}
          {needsAttune(item) && (
            <button
              type="button"
              disabled={attuneBlocked}
              onClick={() => onToggleAttune(item, !item.attuned)}
              title={attuneBlocked
                ? blockedWhy
                : item.attuned ? 'Attuned — click to un-attune' : 'Requires attunement — click to attune'}
              className={[
                'flex-shrink-0 text-[0.65rem] font-display uppercase tracking-wider px-1.5 py-px rounded-sm border',
                item.attuned
                  ? 'text-[#1d6b32] border-[#1d6b32]'
                  : 'text-[var(--gold)] border-[var(--gold-dim)]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {item.attuned ? '◈ Attuned' : '◇ Attune'}
            </button>
          )}
        </div>
        {item.notes && <p className="text-[0.78rem] text-text-muted truncate">{item.notes}</p>}
      </div>
      {/* The two columns the paper sheet heads with # and a weight glyph. The
          grid gives them their width, so they line up with the header and with
          every other row; `text-sm` because 0.7rem was unreadable at a glance. */}
      <span className="text-right text-base text-text-dim tabular-nums">
        {granted ? '' : (item.quantity ?? 1)}
      </span>
      <span className="text-right text-base text-text-dim tabular-nums">
        {w === null ? '—' : w * (granted ? 1 : (item.quantity ?? 1))}
      </span>
      <span className="flex gap-2 justify-end text-base">
        {/* Tier controls, DM-only and only for an item that actually has more
            than one tier. An ordinary magic item shows nothing new here, and a
            player sees nothing at all — which is the point: the chain must not
            be inferable from the UI any more than from the payload. */}
        {isDM && chain && chain.length > 1 && (
          <>
            <button
              type="button"
              disabled={tier <= 1}
              title={tier <= 1 ? 'Already at the base tier' : `Back to "${chain[tier - 2].name}"`}
              className="text-text-muted hover:text-gold disabled:opacity-25 disabled:hover:text-text-muted"
              onClick={() => onSetCard(item, chain[tier - 2])}
            >▾</button>
            <button
              type="button"
              disabled={tier >= chain.length}
              title={tier >= chain.length ? 'Already at the last tier' : `Advance to "${chain[tier].name}"`}
              className="text-gold hover:scale-125 transition-transform disabled:opacity-25 disabled:text-text-muted disabled:hover:scale-100"
              onClick={() => onSetCard(item, chain[tier])}
            >▴</button>
          </>
        )}
        {players.length > 1 && (
          <button type="button" onClick={() => setGiving(true)} title="Give to another character"
            className="text-text-muted hover:text-gold">↪</button>
        )}
        <button type="button" onClick={() => onEdit(item)} title="Edit"
          className="text-text-muted hover:text-gold">✎</button>
        {canDelete && (
          <button type="button" title={granted ? 'Remove granted item' : 'Delete'}
            className="text-text-muted hover:text-danger"
            onClick={async () => {
              if (!await confirm(`Remove "${name}" from this inventory?`,
                { title: 'Remove item', confirmLabel: 'Remove' })) return;
              onDelete(item);
            }}>✕</button>
        )}
      </span>

      <Modal open={giving} onClose={() => setGiving(false)} title={`↪ Give "${name}"`}>
        <p className="text-[0.75rem] text-text-dim mb-3">
          Hand this to another character in the campaign. It moves immediately and arrives
          unequipped; the DM can see that it changed hands.
        </p>
        <div className="flex flex-col gap-2">
          {players.filter((p) => Number(p.id) !== Number(item.player_id)).map((p) => (
            <Button key={p.id} variant="default"
              onClick={() => { setGiving(false); onGive(item, p); }}>{p.player_name}</Button>
          ))}
        </div>
      </Modal>
    </li>
  );
}

/** One of the four lined panels, framed like the boxes on the printed sheet. */
/**
 * `data-inv-category` is what the drag hook's elementFromPoint looks for, so
 * the whole panel — header, body and footer — is the drop zone.
 *
 * The header repeats the row grid exactly. It has to: the # and lb columns are
 * only "columns" if the header and every row agree on their width, and
 * previously the header ended with one ＋ button while rows ended with two to
 * four, so nothing lined up.
 */
function Panel({ id, label, items, onAdd, dropActive, extra, children }) {
  const { total } = carriedTotal(items);
  return (
    <section
      data-inv-category={id}
      className={[
        'border-2 rounded-sm bg-surface flex flex-col min-h-0 transition-colors',
        dropActive ? 'border-[var(--gold)]' : 'border-border',
      ].join(' ')}
    >
      <header className={`grid items-center gap-x-2 px-3 py-1.5 bg-surface2 border-b-2 border-border ${INV_GRID}`}>
        <span /><span />
        <h3 className="font-display uppercase tracking-wider text-gold text-[0.8rem]">{label}</h3>
        <span className="text-right text-[0.7rem] text-text-muted">#</span>
        <span className="text-right text-[0.7rem] text-text-muted">lb</span>
        <button type="button" onClick={onAdd} title="Add an item"
          className="text-text-muted hover:text-gold text-lg leading-none text-right">＋</button>
      </header>
      {extra}
      {items.length === 0 ? (
        <p className="px-3 py-3 text-[0.8rem] text-text-muted italic">{children}</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">{items.map((i) => i.node)}</ul>
      )}
      {(items.length > 0 || total > 0) && (
        <footer className="px-3 py-1 border-t border-border text-right text-[0.78rem] text-text-muted tabular-nums">
          {Math.round(total * 100) / 100} lb
        </footer>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InventoryTab({
  inventory, players, isDM, loading, myCards, charData, actions,
}) {
  const [form, setForm]     = useState(null);
  const [assign, setAssign] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [gearOpts, setGearOpts] = useState([]);
  // { item, pinned, x, y } — hover sets it unpinned beside the pointer, a tap
  // on ◆ pins it so touch users (who have no hover) can open and dismiss the
  // card deliberately. A pinned card is centred instead: on a phone the finger
  // is sitting on top of wherever it was tapped.
  const [card, setCard] = useState(null);
  const cardRef = useRef(null);
  const [cardPos, setCardPos] = useState(null);

  const showCard = (item, pinned, e) => {
    setCardPos(null);
    setCard(item
      ? { item, pinned, x: e?.clientX ?? 0, y: e?.clientY ?? 0 }
      : (c) => (c?.pinned ? c : null));
  };

  /**
   * Escape closes a pinned card.
   *
   * It has a backdrop and takes clicks, so it is a dialog in everything but
   * name and Escape is what people try first. Only when PINNED: the hover
   * card is dismissed by moving the pointer, and binding a global key for it
   * would fight every other Escape on the sheet.
   */
  useEffect(() => {
    if (!card?.pinned) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setCard(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card?.pinned]);

  /**
   * Place the hover card next to the pointer, inside the viewport.
   *
   * The box is measured rather than assumed: the two card bodies are different
   * components with different widths, and ItemCardPreview's height depends on
   * how much the DM wrote. useLayoutEffect so the clamp lands before paint —
   * reading the box in a plain effect would show one frame at the unclamped
   * position, which is a visible jump.
   */
  useLayoutEffect(() => {
    if (!card || card.pinned || !cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    setCardPos(placeCard({
      x: card.x, y: card.y, width, height,
      vw: window.innerWidth, vh: window.innerHeight,
    }));
  }, [card]);

  /**
   * The chain a granted item belongs to, or null.
   *
   * Built from `myCards`, which `usePcSheet` only fetches for a DM — a player's
   * `myCards` is `[]`, so this returns null for every row and the tier controls
   * never render. That is not a UI preference: it is the same containment as
   * the server's, arrived at from the other end.
   */
  const chainFor = (item) => {
    if (!isDM || !item.item_card_id || !myCards?.length) return null;
    const chain = chainOf(myCards, item.item_card_id);
    return chain.length > 1 ? chain : null;
  };

  // Moving an item between panels. The non-drag path — the Panel selector in
  // the edit dialog — stays, because a drag is awkward with one hand at a table.
  const dnd = useItemDrag((item, category) =>
    actions.editItem(item.id, itemPayload(item, { category })));

  // The SRD equipment index, for the "add gear" picker. Fails open to an empty
  // list — the field stays typeable if the API is unreachable.
  useEffect(() => {
    let alive = true;
    loadEntries('equipment').then((e) => {
      if (alive) setGearOpts((e?.names ?? []).map((n) => ({ name: n })));
    });
    return () => { alive = false; };
  }, []);

  const base = useMemo(() => carriedTotal(inventory), [inventory]);
  // Coins have weight in 5e — fifty to the pound — so a thousand gold pieces is
  // twenty pounds and belongs in the total like anything else.
  const purse = coinWeight(charData);
  const total = Math.round((base.total + purse) * 100) / 100;
  const unweighed = base.unweighed;

  // 5e: a character can carry STR x 15 lb. Overridable, because plenty of
  // tables ignore encumbrance entirely.
  const str = Number(charData?.stats?.abilities?.str?.score);
  const derivedMax = Number.isFinite(str) && str > 0 ? str * 15 : null;
  const maxCarry = derivedMax;
  const over = maxCarry !== null && total > maxCarry;

  const equipped = inventory.filter((i) => i.equipped);
  // 5e allows three attuned items. Worth surfacing: it is the limit players
  // most often lose track of, and an over-limit sheet is not legal.
  const attunedCount = inventory.filter((i) => i.attuned).length;
  const atAttuneLimit = attunedCount >= ATTUNEMENT_LIMIT;

  async function submitForm(e) {
    e?.preventDefault?.();
    if (!form.name?.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
        notes: form.notes || null,
        equipped: !!form.equipped,
        category: form.category,
        weight: form.weight === '' ? null : form.weight,
        attuned: !!form.attuned,
        // Ignored by the server for a card-linked row, where the card decides.
        requires_attunement: !!form.requiresAttunement,
      };
      if (form.id) await actions.editItem(form.id, payload);
      else await actions.addItem(payload);
      setForm(null);
    } finally { setBusy(false); }
  }

  /** SRD pick fills name, weight and a notes line; the player edits from there. */
  async function pickGear(name) {
    const body = await getEquipment(name);
    const patch = equipmentToItem(body);
    if (!patch) { setForm((f) => ({ ...f, name })); return; }
    setForm((f) => ({
      ...f,
      name: patch.name || name,
      weight: patch.weight ?? f.weight ?? '',
      notes: patch.notes ?? f.notes ?? '',
      category: f.id ? f.category : patch.category,
    }));
  }

  const openAdd = (category) =>
    setForm({ name: '', quantity: 1, notes: '', equipped: false, category, weight: '',
      attuned: false, requiresAttunement: false });

  function rowsFor(category) {
    return inventory.filter((i) => (i.category ?? 'inventory') === category).map((i) => ({
      id: i.id,
      quantity: i.quantity,
      item_card_id: i.item_card_id,
      card_weight: i.card_weight,
      weight: i.weight,
      node: (
        <ItemRow key={i.id} item={i} isDM={isDM} players={players} atAttuneLimit={atAttuneLimit}
          dragHandle={dnd.handleProps(i)}
          dragging={dnd.drag?.item?.id === i.id}
          chain={chainFor(i)}
          onShowCard={showCard}
          onSetCard={(it, card) => actions.setItemCard(it.id, card.id, card.name)}
          onToggleEquip={(it, v) => actions.editItem(it.id, itemPayload(it, { equipped: v }))}
          onToggleAttune={(it, v) => actions.editItem(it.id, itemPayload(it, { attuned: v }))}
          onEdit={(it) => setForm({
            id: it.id, name: rowName(it), quantity: it.quantity, notes: it.notes ?? '',
            equipped: it.equipped, category: it.category ?? 'inventory',
            weight: it.item_card_id ? '' : (it.weight ?? ''),
            attuned: !!it.attuned, requiresAttunement: needsAttune(it),
            locked: !!it.item_card_id,
          })}
          onDelete={(it) => actions.removeItem(it.id)}
          onGive={(it, p) => actions.giveItem(it.id, p.id, p.player_name)} />
      ),
    }));
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-3">

      {/* ── Carry weight header ── */}
      <div className="flex items-stretch gap-3 flex-wrap">
        <div className="border-2 border-border rounded-sm px-3 py-1.5 bg-surface text-center">
          <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">Current carry weight</p>
          <p className={`font-display text-xl tabular-nums ${over ? 'text-danger' : 'text-text'}`}>{total}</p>
        </div>
        <div className="border-2 border-border rounded-sm px-3 py-1.5 bg-surface text-center">
          <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">Attuned</p>
          <p className={`font-display text-xl tabular-nums ${atAttuneLimit ? 'text-gold' : 'text-text'}`}>
            {attunedCount}<span className="text-[0.7rem] text-text-muted">/{ATTUNEMENT_LIMIT}</span>
          </p>
        </div>
        <div className="border-2 border-border rounded-sm px-3 py-1.5 bg-surface text-center">
          <p className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">Maximum</p>
          {/* Derived, not editable. It is STR × 15 and nothing else — a second,
              hand-set copy of the same number is only a way for the two to
              disagree. Change STR on the Stats Sheet and this follows. */}
          <p className="font-display text-xl tabular-nums text-text">{maxCarry ?? '—'}</p>
        </div>
        <div className="flex-1 min-w-[12rem] flex flex-col justify-center text-[0.7rem] text-text-muted">
          {maxCarry === null
            ? 'Fill in STR on the Stats Sheet to get a maximum (the 5e rule is STR × 15).'
            : `STR ${str} × 15.`}
          {over && <span className="text-danger"> Over capacity.</span>}
          {/* Gold, not red: being at the cap is a normal state, and the server
              now makes going over it unreachable. */}
          {atAttuneLimit && (
            <span className="text-gold"> At the {ATTUNEMENT_LIMIT}-item attunement limit.</span>
          )}
          {/* Named explicitly: an unweighed item contributes nothing, so without
              this the total silently understates what the character is carrying. */}
          {unweighed > 0 && <span> {unweighed} item{unweighed === 1 ? '' : 's'} with no weight set.</span>}
        </div>
      </div>

      {/* ── Equipped ── */}
      <section className="border-2 border-border rounded-sm bg-surface">
        <header className="flex items-center gap-2 px-2 py-1 bg-surface2 border-b-2 border-border">
          <h3 className="flex-1 font-display uppercase tracking-wider text-gold text-[0.65rem]">
            ⚔️ Equipped ({equipped.length})
          </h3>
          {isDM && (
            <Button variant="accent" className="text-[0.7rem] px-1.5 py-0.5"
              onClick={() => setAssign(true)}>＋ Grant from library</Button>
          )}
        </header>
        {equipped.length === 0 ? (
          <p className="px-2 py-3 text-[0.7rem] text-text-muted italic">
            Nothing equipped. Tick an item below to wear or wield it.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 px-2 py-1.5">
            {equipped.map((i) => (
              <li key={i.id}>
                {/* This was a plain span, so hovering the ◆ here did nothing —
                    and the Equipped strip is the most visible place granted
                    items appear, so it is where people reach for the card. */}
                <button
                  type="button"
                  className="text-base text-gold flex items-center gap-1 hover:underline"
                  title={i.item_card_id ? 'Show the item card' : 'Show details'}
                  onMouseEnter={(e) => showCard(i, false, e)}
                  onMouseLeave={() => showCard(null, false)}
                  onClick={(e) => showCard(i, true, e)}
                >
                  {i.item_card_id && <span className="text-xs">◆</span>}{rowName(i)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── The four panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {CATEGORIES.map((c) => (
          <Panel
            key={c.id}
            id={c.id}
            label={c.label}
            items={rowsFor(c.id)}
            onAdd={() => openAdd(c.id)}
            dropActive={dnd.over === c.id && dnd.drag?.from !== c.id}
            extra={c.id === 'treasure'
              ? <CoinPurse charData={charData} onSave={actions.setCoins} />
              : null}
          >
            {c.id === 'treasure'  && 'Coin, gems, art objects.'}
            {c.id === 'potions'   && 'Potions, poisons, anything you drink or apply.'}
            {c.id === 'inventory' && 'Rope, rations, tools — your everyday kit.'}
            {c.id === 'misc'      && 'Everything that fits nowhere else.'}
          </Panel>
        ))}
      </div>

      <p className="text-[0.65rem] text-text-muted">
        ◆ marks an item granted by the DM — unique to this campaign, and only the DM can take it
        back. Hover or tap it to see the card. Drag ⠿ to move an item to another panel.
      </p>

      {/*
        The card preview. Fixed-position rather than anchored to the row,
        because the panels scroll and a popover clipped by `overflow-y-auto`
        would be worse than none — but fixed to the POINTER, not to a corner.
        It used to sit at `right-6 bottom-6`, which on a tall sheet put the card
        a screen away from the item it described. Pinned (tapped) centres it and
        adds a backdrop to dismiss; hovered just follows the mouse out.
      */}
      {card && (
        <>
          {card.pinned && (
            <button
              type="button"
              aria-label="Close card"
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setCard(null)}
            />
          )}
          <div
            ref={cardRef}
            className={[
              'fixed z-50',
              // The hover card follows the pointer and must not intercept it,
              // or it would steal the hover from the row underneath and
              // flicker. A PINNED card is a thing you came to read, so it
              // takes clicks — which is what makes the rules terms inside it
              // reachable at all.
              card.pinned ? 'pointer-events-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                : 'pointer-events-none',
            ].join(' ')}
            // Before the measuring pass lands, sit at the raw pointer offset —
            // close enough that a mis-measured frame would still be beside the
            // cursor rather than in a corner.
            style={card.pinned ? undefined : (cardPos ?? { left: card.x + CARD_GAP, top: card.y + CARD_GAP })}
          >
            <div className="shadow-card rounded-sm overflow-hidden">
              {card.item.item_card_id
                ? <ItemCardPreview form={cardFormOf(card.item)} lookups={card.pinned} />
                : <PlainDetails item={card.item} />}
            </div>
          </div>
        </>
      )}

      {/* The dragged item, following the pointer. */}
      {dnd.drag && (
        <div
          className="fixed z-50 pointer-events-none bg-surface border border-[var(--gold-dim)] rounded-sm px-2 py-1 text-sm text-gold shadow-card"
          style={{ left: dnd.pos.x + 12, top: dnd.pos.y + 12 }}
        >
          {rowName(dnd.drag.item)}
          {dnd.over && dnd.over !== dnd.drag.from && (
            <span className="text-text-muted"> → {CATEGORIES.find((c) => c.id === dnd.over)?.label}</span>
          )}
        </div>
      )}

      {/* ── Add / edit ── */}
      <Modal open={!!form} onClose={() => setForm(null)} onSubmit={submitForm}
        title={form?.id ? '✎ Edit item' : '＋ Add item'}>
        {form && (
          <form onSubmit={submitForm} className="flex flex-col gap-3">
            {!form.id && (
              <FormField label="Load from SRD">
                <SrdCombobox
                  value="" onChange={() => {}} onPick={pickGear} options={gearOpts}
                  inputClassName={INPUT_CLS} placeholder="Search SRD equipment…"
                />
              </FormField>
            )}
            <FormField label="Name">
              <input className={INPUT_CLS} value={form.name} autoFocus disabled={form.locked}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            {form.locked && (
              <p className="text-[0.7rem] text-text-muted -mt-2">
                Name and weight come from the item card and are the DM&apos;s to change.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!form.locked && (
                <>
                  <FormField label="Quantity">
                    <input className={INPUT_CLS} type="number" min={1} value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </FormField>
                  <FormField label="Weight (lb, each)">
                    <input className={INPUT_CLS} type="number" min={0} step="0.1" value={form.weight}
                      placeholder="—"
                      onChange={(e) => setForm({ ...form, weight: e.target.value })} />
                  </FormField>
                </>
              )}
              <FormField label="Panel">
                <select className={INPUT_CLS} value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </FormField>
            </div>
            {/* Only for free-text gear: a granted item takes this from its
                card, so offering it here would be a control that does nothing. */}
            {!form.locked && (
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[var(--gold)]"
                  checked={!!form.requiresAttunement}
                  onChange={(e) => setForm({ ...form, requiresAttunement: e.target.checked })} />
                Requires attunement
              </label>
            )}
            {(form.requiresAttunement || form.locked) && (() => {
              // Same cap as the row badge. The server refuses either way; this
              // just says so before you tick it.
              const blocked = atAttuneLimit && !form.attuned;
              return (
                <label className={`flex items-center gap-2 text-sm ${blocked ? 'text-text-muted' : 'text-text cursor-pointer'}`}>
                  <input type="checkbox" className="w-4 h-4 accent-[var(--gold)] disabled:opacity-40"
                    disabled={blocked}
                    checked={!!form.attuned}
                    onChange={(e) => setForm({ ...form, attuned: e.target.checked })} />
                  Attuned to this character
                  {blocked && (
                    <span className="text-[0.7rem]">— at the {ATTUNEMENT_LIMIT}-item limit</span>
                  )}
                </label>
              );
            })()}
            <FormField label="Notes">
              <textarea className={INPUT_CLS + ' resize-y'} rows={3} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="accent" type="submit" loading={busy}>Save</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Grant from the DM's library ── */}
      <Modal open={assign} onClose={() => setAssign(false)} title="＋ Grant from library">
        {(() => {
          const inCampaign = new Set(inventory.filter(i => i.item_card_id).map(i => i.item_card_id));
          const assignable = (myCards ?? []).filter((c) => !inCampaign.has(c.id));
          if (assignable.length === 0) {
            return (
              <p className="text-[0.75rem] text-text-dim">
                {(myCards ?? []).length === 0
                  ? 'Your item-card library is empty. Build cards in the Item Cards module first.'
                  : 'Every card in your library is already in this campaign — an item can only exist once per campaign.'}
              </p>
            );
          }
          return (
            <ul className="space-y-1 max-h-80 overflow-y-auto">
              {assignable.map((c) => (
                <li key={c.id}>
                  <button type="button"
                    className="w-full text-left bg-surface2 border border-border rounded-sm px-2 py-1.5 hover:border-[var(--gold-dim)] hover:text-gold"
                    onClick={async () => { setAssign(false); await actions.assignCard(c.id); }}>
                    <span className="text-sm">{c.name}</span>
                    <span className="text-[0.7rem] text-text-muted">
                      {c.type ? ` · ${c.type}` : ''} · {rarityLabel(c.rarity)}
                      {c.weight ? ` · ${c.weight} lb` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          );
        })()}
      </Modal>
    </div>
  );
}
