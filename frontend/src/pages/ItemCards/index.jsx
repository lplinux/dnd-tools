/**
 * pages/ItemCards/index.jsx
 *
 * Magic Item Card Creator.
 *
 * Still a PUBLIC tool: no login, no route guard. A guest gets exactly the page
 * that has always been here — build a card, print it, keep a print set for the
 * sitting. Signing in adds a saved library on the server (useItemCards),
 * so cards survive a cleared browser or a different device.
 *
 * Features:
 *   - Item type selector that resets type-specific fields on change
 *   - Rich-text editor for special abilities (Bold / Italic / Bullets)
 *   - Live card preview that mirrors the form in real time
 *   - Download card as PNG via html2canvas (loaded from CDN as a script tag)
 *   - Saved library with export / import — signed in only
 *   - Print set (sessionStorage, dies with the tab) for batch double-sided
 *     printing — everyone
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import AppHeader      from '@/components/layout/AppHeader';
import { Button } from '@/components/ui';
import SrdCombobox    from '@/components/SrdCombobox';
import TagInput from '@/pages/NpcSheet/TagInput';
import { splitList, joinList, removeOne } from '@/data/listValue';
import { useSrdNames } from '@/hooks/useSrdNames';
import { useItemCards, rowToForm } from '@/hooks/useItemCards';
import { saveBlob, slugify } from '@/api/downloadBundle';
import { useConfirm } from '@/contexts/ConfirmContext';
import { getMagicItem, loadEntries } from '@/api/srd';
import {
  loadMagicItems as loadOpen5eMagicItems,
  getMagicItem as getOpen5eMagicItem,
} from '@/api/open5e';
import { magicItemToCard } from '@/data/srdMap';

import {
  ITEM_TYPES, RARITIES, ARMOR_TYPES,
  WEAPON_TYPES, ARMOR_TYPES_TRIGGER, CONSUMABLE_TYPES,
  defaultForm, isFormDirty,
} from './constants';
import RichTextEditor  from './RichTextEditor';
import ItemCardPreview, { CARD_WIDTH } from './ItemCardPreview';
import ItemCardPrint   from './ItemCardPrint';
import { parentOptions, libraryGroups, buildExportBundle, pngNames } from './chain';

// ─────────────────────────────────────────────────────────────────────────────
// Shared input style
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The look of a field, WITHOUT a width.
 *
 * Kept separate because `w-full` cannot simply be overridden by appending
 * another width: Tailwind emits `.w-full` after `.w-28`, the specificity is
 * equal, so the later rule wins no matter which order the class names are
 * written in. A control that needs its own width has to not receive `w-full`
 * in the first place — which is why the search row below uses this and the
 * rest of the form uses INPUT_CLS.
 */
const FIELD_CLS = [
  'bg-surface2 border border-border2 text-text',
  'px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
  'transition-colors',
].join(' ');

const INPUT_CLS = `w-full ${FIELD_CLS}`;

const LABEL_CLS = 'font-display uppercase tracking-wider text-text-dim text-[0.7rem]';

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={LABEL_CLS}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The print set, in sessionStorage — it dies with the browser tab.
 *
 * It used to live in localStorage, where it outlived the sitting that created
 * it: a set assembled weeks ago, or by a logged-out visitor, was still sitting
 * there afterwards looking like something you had queued today. A print queue
 * is not a library; it belongs to one sitting.
 *
 * sessionStorage rather than plain state because the set has to survive a
 * reload and moving between pages mid-batch — including the trip to sign in,
 * which is what makes the "rescue it into your library" offer below possible
 * at all.
 */
const TRAY_KEY = 'ic-print-tray';
// Remembers that the "move your print set into your library" offer was answered,
// so it is made once rather than on every visit.
const MIGRATED_KEY = 'ic-migrated';

export default function ItemCards() {
  const [form, setForm] = useState(defaultForm);
  // The ten SRD weapon properties, for the comma-separated field below.
  const weaponProperties = useSrdNames('weapon-properties');
  const previewRef = useRef(null);
  const importRef  = useRef(null);
  const confirm    = useConfirm();

  const {
    signedIn, username, cards, editingId, setEditingId,
    save, saveNew, remove, clearAll, exportAll, exportBundle, importBundle,
  } = useItemCards();
  const [saving, setSaving] = useState(false);

  // ── Library filtering ──
  // Client-side: the whole library arrives in one unpaginated request, so
  // there is nothing to ask the server for. A plain substring over name and
  // type, which is what the list shows.
  const [query, setQuery]   = useState('');
  const [rarity, setRarity] = useState('');

  /**
   * Which library cards are ticked.
   *
   * By id rather than by index, so the set survives searching, filtering and
   * collapsing a group — a selection that silently changed meaning when you
   * typed in the search box would be worse than none.
   */
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // The offscreen card being captured, and how far the batch has got.
  const [batchCard, setBatchCard] = useState(null);
  const [batchDone, setBatchDone] = useState(null);   // { done, total } | null
  const batchRef = useRef(null);
  const cancelBatch = useRef(false);

  // Which rarity groups and which chains are open. Collapsed is the default
  // for both: a chain is one item, and its tiers are detail you ask for.
  const [openGroups, setOpenGroups] = useState({});
  const [openChains, setOpenChains] = useState({});
  const toggle = (set) => (key) => set((o) => ({ ...o, [key]: !o[key] }));

  /** The library as rarity groups, one entry per item (a chain is one item). */
  const groups = useMemo(
    () => libraryGroups(cards, { query, rarity }, RARITIES.map((r) => r.id)),
    [cards, query, rarity],
  );

  /**
   * Every card id currently on screen, tiers included.
   *
   * "All" means all VISIBLE, not all owned — ticking All while a search is
   * active should select what you are looking at, not quietly sweep in the
   * sixty cards the filter is hiding.
   */
  const visibleIds = useMemo(() => groups.flatMap(
    (g) => g.items.flatMap(({ base, tiers }) => [base.id, ...tiers.map((t) => t.id)]),
  ), [groups]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  // A group is open unless explicitly closed, EXCEPT while filtering — a
  // search that returned matches should show them, not a row of closed
  // headings you then have to click through.
  const filtering = !!(query.trim() || rarity);
  const groupOpen = (id) => (filtering ? true : openGroups[id] !== false);

  /** Cards this one may evolve from — never itself or anything downstream. */
  const chainChoices = useMemo(
    () => parentOptions(cards, editingId), [cards, editingId],
  );

  // ── Print "set": temporarily saved cards, batch-printed double-sided ──
  const [tray, setTray] = useState(() => {
    try {
      // One-time cleanup of the old home. Anything left in localStorage is by
      // definition from a previous sitting, which is exactly what should not
      // come back — so it is dropped rather than carried over.
      localStorage.removeItem(TRAY_KEY);
      return JSON.parse(sessionStorage.getItem(TRAY_KEY)) || [];
    } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(TRAY_KEY, JSON.stringify(tray)); } catch { /* quota — ignore */ }
  }, [tray]);

  // printMode picks what the (always-mounted) print sheet renders; a nonce bump
  // fires window.print() after the sheet has re-rendered + repaginated.
  const [printMode, setPrintMode] = useState('single'); // 'single' | 'tray'
  const [printNonce, setPrintNonce] = useState(0);
  useEffect(() => {
    if (!printNonce) return;
    const t = setTimeout(() => window.print(), 120);
    return () => clearTimeout(t);
  }, [printNonce]);

  const addToTray = () => setTray((t) => [...t, { ...form }]);
  const removeFromTray = (i) => setTray((t) => t.filter((_, idx) => idx !== i));
  const clearTray = () => setTray([]);
  const printSingle = () => { setPrintMode('single'); setPrintNonce((n) => n + 1); };
  const printTray = () => {
    if (!tray.length) { alert('Add at least one card to the print set first.'); return; }
    setPrintMode('tray'); setPrintNonce((n) => n + 1);
  };

  function set(key) {
    return (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  /** On type change — clear all type-specific fields (TODO item from backlog) */
  function handleTypeChange(e) {
    const type = e.target.value;
    setForm(prev => ({
      ...defaultForm(),
      // Preserve name, rarity, flavor, attunement and abilities — only type-specific stats reset
      name:       prev.name,
      rarity:     prev.rarity,
      flavor:     prev.flavor,
      attunement: prev.attunement,
      abilities:  prev.abilities,
      weight:     prev.weight,
      // The chain is a property of the item, not of its type. Leaving it out
      // of this allowlist would silently unlink a tier from its chain the
      // moment someone changed a sword into a staff.
      evolvesFrom: prev.evolvesFrom,
      type,
    }));
  }

  function handleClear() {
    setForm(defaultForm());
    setEditingId(null);
  }

  // ── Library actions (signed in only) ──────────────────────────────────────

  /** Save: updates the open card, or creates one if none is open. */
  async function handleSave() {
    if (!form.name.trim()) { toastless('Give the card a name first.'); return; }
    setSaving(true);
    try { await save(form); } finally { setSaving(false); }
  }

  /** Save as new: always creates, and leaves the copy open for editing. */
  async function handleSaveAsNew() {
    if (!form.name.trim()) { toastless('Give the card a name first.'); return; }
    setSaving(true);
    try { await saveNew(form); } finally { setSaving(false); }
  }

  /**
   * Choosing the card this one evolves from.
   *
   * Picking a parent also **copies it into the form**, because a later tier is
   * mostly the earlier one: same weapon, same flavour, a bigger die. Starting
   * from a copy and editing the differences is the whole job, and retyping a
   * card to change one number is not.
   *
   * Two things it will not do:
   *
   *   - **Overwrite a card you are editing.** If a saved card is open, this
   *     only sets the link. Copying the parent over it would replace that
   *     card's own content with another card's, which is never what changing
   *     a link means.
   *   - **Overwrite what you have typed without asking.** On a new card with
   *     anything in it, you get a prompt; declining links the cards without
   *     copying, so the choice is never all-or-nothing.
   */
  async function handleEvolvesFromChange(e) {
    const id = e.target.value ? Number(e.target.value) : null;
    const link = () => setForm((f) => ({ ...f, evolvesFrom: id }));
    if (!id) { link(); return; }

    const parent = cards.find((c) => c.id === id);
    if (!parent || editingId) { link(); return; }

    if (isFormDirty(form) && !await confirm(
      `Start this card as a copy of "${parent.name}"? Anything you have typed here will be replaced.`,
      { title: 'Copy the earlier tier', confirmLabel: 'Copy it' })) {
      link();
      return;
    }
    // rowToForm carries the PARENT's own parent, so the link has to be set
    // after it — otherwise picking tier 2 would make this a sibling of tier 2
    // rather than its successor.
    setForm({ ...rowToForm(parent), evolvesFrom: id });
  }

  /**
   * Load a saved card back into the form. This is the thing the print set could
   * never do — a card in it was a read-only snapshot, editable only by deleting
   * it and typing the whole thing again.
   */
  function handleLoad(row) {
    setForm(rowToForm(row));
    setEditingId(row.id);
  }

  /**
   * Delete a card, in two steps when it is in play.
   *
   * The server refuses a card someone is holding and answers with their names.
   * That refusal is the feature: it turns "delete this" into "delete this, and
   * take it off Iris in Leruhy", which is a different decision. Only after the
   * DM has read the names does the forced delete go through.
   */
  async function handleDelete(row) {
    if (!await confirm(`Delete "${row.name}" from your library? This cannot be undone.`,
      { title: 'Delete card', confirmLabel: 'Delete' })) return;
    try {
      await remove(row.id);
    } catch (e) {
      if (e?.code !== 'CARD_IN_PLAY') throw e;
      const who = (e.holders ?? []).join(', ');
      if (!await confirm(
        `"${row.name}" is in play — ${who || 'a character is holding it'}. `
        + 'Deleting it now will also take it out of their inventory.',
        { title: 'Item is in play', confirmLabel: 'Delete and remove it' })) return;
      await remove(row.id, true);
    }
  }

  /** Tick or clear every card the current filter is showing. */
  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  /** Put the ticked cards into the print set, in library order. */
  function addSelectedToTray() {
    const picked = cards.filter((c) => selected.has(c.id)).map(rowToForm);
    if (!picked.length) return;
    setTray((t) => [...t, ...picked]);
    setSelected(new Set());
  }

  /**
   * Download the ticked cards as an item-cards bundle.
   *
   * Built from what is already in memory rather than asking the server, and
   * chain-complete: ticking one tier exports all of them, or the far side gets
   * an orphan with no tier buttons.
   */
  function exportSelected() {
    const bundle = buildExportBundle(cards, selected);
    if (!bundle.cards.length) return;
    exportBundle(bundle, 'selection');
  }

  /**
   * Render every ticked card to a PNG and hand them over as one ZIP.
   *
   * One card at a time through a hidden host rather than mounting sixty-nine
   * previews at once. The host is fixed at CARD_WIDTH, so the card renders at
   * true card size and `handleDownload`'s pin-and-restore dance is not needed
   * here — and the same 591px (5cm at 300dpi) normalisation is applied, so a
   * card out of the ZIP is the same image as one downloaded on its own.
   *
   * JSZip is imported lazily: it is a few hundred KB that nobody who never
   * presses this button should have to fetch.
   */
  async function downloadSelectedPngs() {
    const picked = cards.filter((c) => selected.has(c.id));
    if (!picked.length) return;
    if (!window.html2canvas) { toastless('html2canvas is still loading. Try again in a moment.'); return; }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const names = pngNames(cards, picked, slugify);
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface2').trim() || '#272015';

    // Once, before the first capture. Without it the first card renders in a
    // fallback face and comes out looking unlike all the others.
    try { await document.fonts?.ready; } catch { /* no font API — carry on */ }

    cancelBatch.current = false;
    setBatchDone({ done: 0, total: picked.length });
    try {
      for (let i = 0; i < picked.length; i++) {
        if (cancelBatch.current) return;
        // flushSync so the card is in the DOM before the frame below, then two
        // frames so layout and fonts have actually settled.
        flushSync(() => setBatchCard(rowToForm(picked[i])));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = batchRef.current;
        if (!el) continue;
        const canvas = await window.html2canvas(el, {
          backgroundColor: bg, scale: 591 / el.offsetWidth, logging: false,
        });
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        if (blob) zip.file(names[i], blob);
        setBatchDone({ done: i + 1, total: picked.length });
      }
      const out = await zip.generateAsync({ type: 'blob' });
      saveBlob(out, { module: 'item-cards', name: username, ext: 'zip' });
      setSelected(new Set());
    } finally {
      setBatchCard(null);
      setBatchDone(null);
    }
  }

  /** Empty the library. Same two-step shape, because the stakes are larger. */
  async function handleClearAll() {
    if (!await confirm(
      `Delete all ${cards.length} cards from your library? This cannot be undone — `
      + 'export first if you want a copy.',
      { title: 'Clear library', confirmLabel: 'Delete everything' })) return;
    try {
      await clearAll();
    } catch (e) {
      if (e?.code !== 'CARD_IN_PLAY') throw e;
      const who = [...new Set(e.holders ?? [])].join(', ');
      if (!await confirm(
        `Some of these cards are in play — held by ${who || 'characters in your campaigns'}. `
        + 'Clearing the library will also take them out of those inventories.',
        { title: 'Items are in play', confirmLabel: 'Clear it all anyway' })) return;
      await clearAll(true);
    }
  }

  async function handleImportFile(file) {
    let bundle;
    try { bundle = JSON.parse(await file.text()); }
    catch { toastless('That file is not valid JSON.'); return; }
    await importBundle(bundle);
  }

  /**
   * One-time offer to move a guest's print set into the account they just
   * signed into. Cards built before logging in are otherwise stranded in
   * the tab, which is the whole problem this feature exists to fix.
   *
   * Dismissal is remembered so it cannot nag; the set itself is left alone
   * either way, since it is also a print queue and clearing it would lose the
   * user's current batch.
   */
  const [migrateDone, setMigrateDone] = useState(
    () => { try { return localStorage.getItem(MIGRATED_KEY) === '1'; } catch { return false; } },
  );
  function dismissMigrate() {
    setMigrateDone(true);
    try { localStorage.setItem(MIGRATED_KEY, '1'); } catch { /* ignore */ }
  }
  async function handleMigrate() {
    await importBundle({ type: 'item-cards', version: 1, cards: tray });
    dismissMigrate();
  }

  /** The page has no toast provider of its own; fall back to alert(). */
  function toastless(msg) { alert(msg); }

  /**
   * Magic-item options: 262 from the SRD plus ~1,600 from Open5e.
   *
   * Note Open5e's /v2/magicitems ignores every document filter (a nonsense value
   * returns all rows), so its pool can't be narrowed server-side by edition —
   * items port across 2014/2024 far more cleanly than subclasses, so they are
   * offered whole and simply badged.
   */
  const [itemOpts, setItemOpts] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all([loadEntries('magic-items'), loadOpen5eMagicItems()]).then(([srd, o5e]) => {
      if (!alive) return;
      setItemOpts([
        ...(srd?.names ?? []).map((n) => ({ name: n, edition: '2024' })),
        ...(o5e ?? []).map((i) => ({ name: i.name, key: i.key, edition: '2014', source: i.source })),
      ]);
    });
    return () => { alive = false; };
  }, []);

  /**
   * Fill the form from a magic item. Merged, not replaced — `rarity` is omitted
   * by the mapper when the source value isn't one the card offers, and the
   * weapon/armor/charge blocks have no API equivalent, so both keep what's there.
   */
  async function handleSrdPick(name, opt) {
    const body = opt?.key ? await getOpen5eMagicItem(opt.key) : await getMagicItem(name);
    const patch = magicItemToCard(body);
    if (!patch) return;
    setForm(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined && v !== '') next[k] = v;
      }
      return next;
    });
  }

  /**
   * Download the card as a 300-dpi PNG using html2canvas from CDN.
   *
   * The preview is drawn wider than a real card so it fills the panel, and that
   * width must not reach the image: line breaks follow the layout width, so
   * capturing the wide version would produce a differently-set card. The
   * element is pinned back to CARD_WIDTH for the duration of the capture and
   * restored afterwards — in a `finally`, so a failure cannot leave the preview
   * stuck at card size.
   *
   * There is a brief flicker while it captures. That is the honest trade for
   * the PNG being exactly what it was before the preview was widened.
   */
  async function handleDownload() {
    const el = previewRef.current;
    if (!el || !window.html2canvas) {
      alert('html2canvas is still loading. Try again in a moment.');
      return;
    }
    const TARGET_PX = 591; // 5cm @ 300 dpi
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface2').trim() || '#272015';

    const prevWidth = el.style.width;
    const prevMaxWidth = el.style.maxWidth;
    try {
      el.style.width = CARD_WIDTH;
      el.style.maxWidth = CARD_WIDTH;
      // Read after the write so the reflow has happened and offsetWidth is the
      // pinned width rather than the panel-filling one.
      const scale = TARGET_PX / el.offsetWidth;
      const canvas = await window.html2canvas(el, { backgroundColor: bg, scale, logging: false });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = (form.name || 'item-card').replace(/\s+/g, '-').toLowerCase() + '.png';
      link.click();
    } finally {
      el.style.width = prevWidth;
      el.style.maxWidth = prevMaxWidth;
    }
  }

  const showWeapon     = WEAPON_TYPES.includes(form.type);
  const showArmor      = ARMOR_TYPES_TRIGGER.includes(form.type);
  const showConsumable = CONSUMABLE_TYPES.includes(form.type);

  return (
    <>
      {/* html2canvas CDN — loaded once, non-blocking */}
      <script
        src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
        async
      />

      <AppHeader icon="🗡️" name="Item Card Creator" />

      {/* Two-column layout: form | preview */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0">

        {/* ── Form panel ── */}
        <div className="flex flex-col bg-surface border border-border rounded-sm shadow-card overflow-hidden min-h-0">
          <div className="px-4 py-2.5 bg-surface2 border-b border-border font-display text-gold text-xs uppercase tracking-widest flex-shrink-0">
            Edit Item
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <Field label="Load from SRD">
              <SrdCombobox
                value=""
                onChange={() => {}}
                onPick={handleSrdPick}
                options={itemOpts}
                inputClassName={INPUT_CLS}
                placeholder="Search SRD + Open5e magic items…"
              />
            </Field>

            <Field label="Item Name">
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g., Sword of Dragonslaying"
                className={INPUT_CLS}
              />
            </Field>

            {/* Evolving items. A plain <select> rather than SrdCombobox: that
                component dedups its options by lowercased name, so two tiers
                sharing a name would collapse into one choice — exactly the
                case this needs to handle. Signed-in only, because a guest has
                no library and so no card to point at. */}
            {signedIn && (
              <Field label="Evolves from">
                <select
                  value={form.evolvesFrom ?? ''}
                  onChange={handleEvolvesFromChange}
                  className={INPUT_CLS}
                  disabled={chainChoices.length === 0}
                >
                  <option value="">— Base tier (does not evolve from anything) —</option>
                  {chainChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.type ? ` · ${c.type}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[0.65rem] text-text-muted mt-1">
                  {chainChoices.length === 0
                    ? 'Save another card first — a tier needs an earlier one to evolve from.'
                    : editingId
                      ? 'Makes this a later tier of that item. Players only ever see the tier '
                        + 'they are holding — they are not told the others exist.'
                      : 'Makes this a later tier of that item, and starts it as a copy you can '
                        + 'edit. Players only ever see the tier they are holding.'}
                </p>
              </Field>
            )}

            <Field label="Item Type">
              <select value={form.type} onChange={handleTypeChange} className={INPUT_CLS}>
                <option value="">Select item Type</option>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Rarity">
                <select value={form.rarity} onChange={set('rarity')} className={INPUT_CLS}>
                  {RARITIES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
              {/* Carried through to a character's Inventory when this card is
                  granted, where it feeds the carry total. Blank is "unknown",
                  not zero. */}
              <Field label="Weight (lb)">
                <input type="number" min={0} step="0.1" value={form.weight}
                  onChange={set('weight')} placeholder="—" className={INPUT_CLS} />
              </Field>
            </div>

            <Field label="Flavor Text">
              <textarea
                value={form.flavor}
                onChange={set('flavor')}
                placeholder="Describe the item's appearance and lore..."
                rows={3}
                className={INPUT_CLS + ' resize-y'}
              />
            </Field>

            {/* Weapon fields */}
            {showWeapon && (
              <div className="space-y-3 pt-1 border-t border-border">
                <p className={LABEL_CLS + ' pt-1'}>Weapon Stats</p>
                <Field label="Damage">
                  <input type="text" value={form.damage}     onChange={set('damage')}     placeholder="e.g., 1d8+2"     className={INPUT_CLS} />
                </Field>
                <Field label="Damage Type">
                  {/* One value, so the whole-field combobox fits. 13 SRD
                      damage types, and still free text for a homebrew one.
                      No ⓘ: it sat outside the field's box, and the lookup
                      belongs on the card, where you read the item. */}
                  <SrdCombobox
                    value={form.damageType}
                    onChange={(v) => setForm((f) => ({ ...f, damageType: v }))}
                    srdResource="damage-types"
                    info={false}
                    placeholder="e.g., Slashing"
                    inputClassName={INPUT_CLS}
                  />
                </Field>
                <Field label="Properties">
                  {/* Chips, like the stat sheet's damage resistances. A
                      comma-separated text field was wrong on re-entry: the
                      caret landed at the end, inside the LAST entry, so
                      reopening a saved item read as editing "Finesse" and
                      offered it back. A chip is finished the moment it is
                      added, so there is no half-edited entry to land in.
                      Stored as a comma-separated string either way. */}
                  <TagInput
                    options={weaponProperties}
                    values={splitList(form.properties)}
                    onAdd={(v) => setForm((f) => ({
                      ...f, properties: joinList([...splitList(f.properties), v]),
                    }))}
                    onRemove={(v) => setForm((f) => ({
                      ...f, properties: joinList(removeOne(splitList(f.properties), v)),
                    }))}
                    srdResource="weapon-properties"
                    placeholder="Light, Finesse…"
                  />
                </Field>
              </div>
            )}

            {/* Armor fields */}
            {showArmor && (
              <div className="space-y-3 pt-1 border-t border-border">
                <p className={LABEL_CLS + ' pt-1'}>Armor Stats</p>
                <Field label="AC Bonus">
                  <input type="text" value={form.acBonus} onChange={set('acBonus')} placeholder="e.g., +1" className={INPUT_CLS} />
                </Field>
                <Field label="Armor Type">
                  <select value={form.armorType} onChange={set('armorType')} className={INPUT_CLS}>
                    <option value="">Select Armor Type</option>
                    {ARMOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* Consumable / Potion fields */}
            {showConsumable && (
              <div className="pt-1 border-t border-border">
                <Field label="Uses / Charges">
                  <input type="number" min={1} value={form.uses} onChange={set('uses')} placeholder="e.g., 3" className={INPUT_CLS} />
                </Field>
              </div>
            )}

            {/* Rich-text abilities */}
            <Field label="Special Abilities">
              <RichTextEditor
                value={form.abilities}
                onChange={html => setForm(prev => ({ ...prev, abilities: html }))}
              />
            </Field>

            {/* Attunement */}
            <label className="flex items-center gap-2 cursor-pointer border-t border-border pt-3">
              <input
                type="checkbox"
                checked={form.attunement}
                onChange={e => setForm(prev => ({ ...prev, attunement: e.target.checked }))}
                className="w-4 h-4 accent-[var(--gold)]"
              />
              <span className="text-sm font-body text-text">Requires Attunement</span>
            </label>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
              {signedIn && (
                <>
                  <Button variant="accent" loading={saving} onClick={handleSave}>
                    {editingId ? '💾 Update card' : '💾 Save to library'}
                  </Button>
                  {editingId && (
                    <Button variant="default" loading={saving} onClick={handleSaveAsNew}>
                      Save as new
                    </Button>
                  )}
                </>
              )}
              <Button variant={signedIn ? 'default' : 'accent'} onClick={handleDownload}>🖼 Download PNG</Button>
              <Button variant="default" onClick={printSingle}>🖨 Print (front / back)</Button>
              <Button variant="default" onClick={addToTray}>➕ Add to print set</Button>
              <Button variant="default" onClick={handleClear}>{editingId ? 'New card' : 'Clear'}</Button>
            </div>
            {editingId && (
              <p className="text-[0.7rem] text-gold -mt-2">
                Editing a saved card — <strong>Update</strong> overwrites it, <strong>Save as new</strong> keeps
                both, <strong>New card</strong> starts a fresh one.
              </p>
            )}
            <p className="text-[0.7rem] text-text-muted -mt-2">
              Print produces fixed-size cards — a Front and a Back per item. The font shrinks to fit
              (14px down to 6px); text that still does not fit at the smallest size is cut off, so keep
              long abilities short or use <strong>Download PNG</strong>. Enable “Background graphics” and
              disable headers/footers in your browser’s print dialog for best results.
            </p>

            {/* ── My Library — signed in only ── */}
            {signedIn && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={LABEL_CLS}>My library ({cards.length})</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={exportAll} disabled={!cards.length}
                      className="text-[0.7rem] text-text-muted hover:text-gold disabled:opacity-40 disabled:hover:text-text-muted">
                      Export
                    </button>
                    <button type="button" onClick={() => importRef.current?.click()}
                      className="text-[0.7rem] text-text-muted hover:text-gold">
                      Import
                    </button>
                    <button type="button" onClick={handleClearAll} disabled={!cards.length}
                      title="Delete every card in your library"
                      className="text-[0.7rem] text-text-muted hover:text-danger
                                 disabled:opacity-40 disabled:hover:text-text-muted">
                      Clear
                    </button>
                    <input
                      ref={importRef} type="file" accept=".json" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
                    />
                  </div>
                </div>

                {/* The offer to rescue cards built before signing in. */}
                {!migrateDone && tray.length > 0 && (
                  <div className="bg-surface2 border border-[var(--gold-dim)] rounded-sm p-2 space-y-1.5">
                    <p className="text-[0.7rem] text-text">
                      You have <strong>{tray.length}</strong> card{tray.length === 1 ? '' : 's'} in
                      the print set. Add {tray.length === 1 ? 'it' : 'them'} to your library so
                      {tray.length === 1 ? ' it is not lost' : ' they are not lost'} when you close this tab?
                    </p>
                    <div className="flex gap-2">
                      <Button variant="accent" className="text-[0.65rem] px-2 py-0.5" onClick={handleMigrate}>
                        Add to library
                      </Button>
                      <button type="button" onClick={dismissMigrate}
                        className="text-[0.7rem] text-text-muted hover:text-text">No thanks</button>
                    </div>
                  </div>
                )}

                {cards.length === 0 ? (
                  <p className="text-[0.7rem] text-text-muted">
                    Nothing saved yet. <strong>💾 Save to library</strong> keeps a card on the server, so it is
                    still here on another device.
                  </p>
                ) : (
                  <>
                    {/* Search appears once the list is long enough to need it —
                        a filter box above four cards is just clutter. The box
                        takes the room; the rarity select only ever shows one
                        of six fixed words and does not need to be as wide. */}
                    {cards.length > 5 && (
                      <div className="flex gap-2 items-stretch">
                        {/* FIELD_CLS, not INPUT_CLS: neither of these may carry
                            `w-full`, or the select pins itself to the full row
                            and squeezes the search box to nothing. */}
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search name or type…"
                          className={`${FIELD_CLS} flex-1 min-w-0 text-sm py-2`}
                        />
                        <select value={rarity} onChange={(e) => setRarity(e.target.value)}
                          aria-label="Filter by rarity"
                          className={`${FIELD_CLS} w-24 flex-none shrink-0 text-[0.7rem] px-1 py-2`}>
                          <option value="">All</option>
                          {RARITIES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Selection bar. The count says how many are ticked; the
                        actions appear only when there is something to act on,
                        so the row stays quiet until it is useful. */}
                    {groups.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap text-[0.7rem]">
                        <label className="flex items-center gap-1.5 cursor-pointer text-text-muted hover:text-gold">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            className="accent-[var(--gold)]"
                          />
                          {allVisibleSelected ? 'None' : 'All'}
                          {(query.trim() || rarity) && <span className="text-text-dim"> shown</span>}
                        </label>
                        {selected.size > 0 && (
                          <>
                            <span className="text-gold">{selected.size} selected</span>
                            <button type="button" onClick={addSelectedToTray}
                              className="text-text-muted hover:text-gold">
                              ＋ To print set
                            </button>
                            <button type="button" onClick={downloadSelectedPngs}
                              disabled={!!batchDone}
                              className="text-text-muted hover:text-gold disabled:opacity-50">
                              {batchDone
                                ? `Rendering ${batchDone.done} of ${batchDone.total}…`
                                : '🖼 Download PNGs'}
                            </button>
                            {batchDone && (
                              <button type="button" onClick={() => { cancelBatch.current = true; }}
                                className="text-text-muted hover:text-danger">Cancel</button>
                            )}
                            <button type="button" onClick={exportSelected}
                              className="text-text-muted hover:text-gold">
                              Export JSON
                            </button>
                            <button type="button" onClick={() => setSelected(new Set())}
                              className="text-text-muted hover:text-text">Clear</button>
                          </>
                        )}
                      </div>
                    )}

                    {groups.length === 0 ? (
                      <p className="text-[0.7rem] text-text-muted">No card matches that.</p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {groups.map((g) => {
                          const label = RARITIES.find((r) => r.id === g.rarity)?.label ?? 'Other';
                          const open = groupOpen(g.rarity);
                          return (
                            <div key={g.rarity ?? 'other'}>
                              <button
                                type="button"
                                onClick={() => toggle(setOpenGroups)(g.rarity)}
                                className="w-full flex items-center gap-1.5 text-left text-[0.7rem]
                                           font-display uppercase tracking-wider text-text-muted
                                           hover:text-gold py-0.5"
                                aria-expanded={open}
                              >
                                <span className="w-3 inline-block">{open ? '▾' : '▸'}</span>
                                <span style={{ color: RARITIES.find((r) => r.id === g.rarity)?.color }}>
                                  {label}
                                </span>
                                <span className="text-text-dim">({g.count})</span>
                              </button>

                              {open && (
                                <ul className="space-y-1 mt-1">
                                  {g.items.map(({ base, tiers }) => {
                                    const tiersOpen = !!openChains[base.id];
                                    return (
                                      <li key={base.id}>
                                        <div className={[
                                          'flex items-center gap-2 text-sm border rounded-sm px-2 py-1',
                                          base.id === editingId
                                            ? 'bg-surface3 border-[var(--gold-dim)]'
                                            : 'bg-surface2 border-border',
                                        ].join(' ')}>
                                          {/* A chain collapses to its base. The
                                              other tiers are detail you ask for,
                                              not three near-identical rows. */}
                                          <input
                                            type="checkbox"
                                            checked={selected.has(base.id)}
                                            onChange={() => toggleSelected(base.id)}
                                            aria-label={`Select ${base.name}`}
                                            className="accent-[var(--gold)] flex-none"
                                          />
                                          {tiers.length > 0 ? (
                                            <button
                                              type="button"
                                              onClick={() => toggle(setOpenChains)(base.id)}
                                              aria-expanded={tiersOpen}
                                              title={tiersOpen ? 'Hide tiers' : `Show ${tiers.length} more tier${tiers.length === 1 ? '' : 's'}`}
                                              className="text-text-muted hover:text-gold w-3 flex-none"
                                            >{tiersOpen ? '▾' : '▸'}</button>
                                          ) : <span className="w-3 flex-none" />}

                                          <button
                                            type="button"
                                            onClick={() => handleLoad(base)}
                                            className="flex-1 text-left truncate hover:text-gold"
                                            title="Open for editing"
                                          >
                                            {base.name}
                                            {base.type && <span className="text-text-muted text-[0.7rem]"> · {base.type}</span>}
                                          </button>

                                          {tiers.length > 0 && (
                                            <span className="text-[0.65rem] text-text-muted whitespace-nowrap"
                                              title={`${tiers.length + 1} tiers`}>
                                              {tiers.length + 1} tiers
                                            </span>
                                          )}
                                          <button type="button" onClick={() => handleDelete(base)}
                                            title="Delete from library"
                                            className="text-text-muted hover:text-danger">✕</button>
                                        </div>

                                        {tiersOpen && tiers.map((t, i) => (
                                          <div key={t.id} className={[
                                            'flex items-center gap-2 text-sm border rounded-sm px-2 py-1 ml-5 mt-1',
                                            t.id === editingId
                                              ? 'bg-surface3 border-[var(--gold-dim)]'
                                              : 'bg-surface2 border-border',
                                          ].join(' ')}>
                                            <input
                                              type="checkbox"
                                              checked={selected.has(t.id)}
                                              onChange={() => toggleSelected(t.id)}
                                              aria-label={`Select ${t.name}, tier ${i + 2}`}
                                              className="accent-[var(--gold)] flex-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleLoad(t)}
                                              className="flex-1 text-left truncate hover:text-gold"
                                              title="Open for editing"
                                            >
                                              {t.name}
                                              {t.type && <span className="text-text-muted text-[0.7rem]"> · {t.type}</span>}
                                            </button>
                                            {/* The only place a tier number is
                                                shown anywhere in the app, and it
                                                is behind signedIn in the author's
                                                own library. */}
                                            <span className="text-[0.65rem] text-text-muted whitespace-nowrap">
                                              {i + 2}/{tiers.length + 1}
                                            </span>
                                            <button type="button" onClick={() => handleDelete(t)}
                                              title="Delete from library"
                                              className="text-text-muted hover:text-danger">✕</button>
                                          </div>
                                        ))}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!signedIn && (
              <p className="text-[0.7rem] text-text-muted border-t border-border pt-3">
                <strong>Not signed in.</strong> Everything here works, but nothing is kept once you
                close the tab. Sign in to keep a saved library on the server.
              </p>
            )}

            {/* Print set (batch double-sided) */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className={LABEL_CLS}>Print set ({tray.length})</p>
                {tray.length > 0 && (
                  <button type="button" onClick={clearTray} className="text-[0.7rem] text-text-muted hover:text-danger">Clear set</button>
                )}
              </div>
              {tray.length === 0 ? (
                <p className="text-[0.7rem] text-text-muted">
                  Use <strong>➕ Add to print set</strong> to collect several cards, then print them all at
                  once, ordered for double-sided printing. The set is for this sitting — it is cleared when
                  you close the tab.
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {tray.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm bg-surface2 border border-border rounded-sm px-2 py-1">
                        <span className="flex-1 truncate">{c.name || `(untitled ${c.type || 'item'})`}</span>
                        <button type="button" onClick={() => removeFromTray(i)} title="Remove" className="text-text-muted hover:text-danger">✕</button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="accent" onClick={printTray}>🖨 Print set — double-sided ({tray.length})</Button>
                  <div className="text-[0.7rem] text-text-muted flex flex-col gap-1">
                    <p>
                      Up to <strong>9 cards per A4</strong> (3×3). Each sheet prints a page of Fronts then a
                      page of Backs, with the backs mirrored so they line up when flipped.
                    </p>
                    {/* Named exactly, because getting these wrong is what moves the
                        backs off the fronts — and the error is a few millimetres,
                        which you only discover after cutting. */}
                    <p>
                      In the print dialog: <strong>Margins → Default or None</strong> (both give the same
                      sheet — <em>not</em> Minimum, which adds your printer's own and shifts everything),
                      and <strong>Scale → 100%</strong>, not “Fit to printable area”.
                    </p>
                    <p>
                      Then <strong>Two-sided</strong>, <strong>flip on the long edge</strong>. The grid sits
                      centred with 7.5&nbsp;mm clear at the sides and 13.5&nbsp;mm top and bottom, so both
                      sides land in the same place. Or “Save as PDF” to keep the set. Cut along the borders.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Preview panel ── */}
        <div className="flex flex-col bg-surface border border-border rounded-sm shadow-card overflow-hidden min-h-0">
          <div className="px-4 py-2.5 bg-surface2 border-b border-border font-display text-gold text-xs uppercase tracking-widest flex-shrink-0">
            Live Preview
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ItemCardPreview ref={previewRef} form={form} />
          </div>
        </div>

      </div>

      {/*
        Offscreen host for batch PNG capture. Fixed at CARD_WIDTH so the card
        inside renders at true card size — ItemCardPreview is `width: 100%`
        with a 34rem cap, so a 63mm box gives it exactly 63mm, and the pin-and-
        restore that handleDownload needs for the live preview is unnecessary.
        Only ever holds one card: the loop swaps it and captures.
      */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', left: -99999, top: 0, width: CARD_WIDTH }}
      >
        {batchCard && <ItemCardPreview ref={batchRef} form={batchCard} />}
      </div>

      {/* Offscreen print sheet — revealed only by the browser's print (window.print()).
          Single card (1-up) or the whole set (3×3 = up to 9 per A4), always two-sided. */}
      <ItemCardPrint
        cards={printMode === 'tray' ? tray : [form]}
        cols={printMode === 'tray' ? 3 : 1}
        perPage={printMode === 'tray' ? 9 : 1}
      />
    </>
  );
}
