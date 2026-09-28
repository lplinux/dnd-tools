/**
 * pages/ItemCards/index.jsx
 *
 * Magic Item Card Creator — fully migrated from the legacy item-cards.html.
 * No API calls; purely client-side.
 *
 * Features:
 *   - Item type selector that resets type-specific fields on change (TODO fix from backlog)
 *   - Rich-text editor for special abilities (Bold / Italic / Bullets)
 *   - Live card preview that mirrors the form in real time
 *   - Download card as PNG via html2canvas (loaded from CDN as a script tag)
 *   - Clear form button
 */

import { useEffect, useRef, useState } from 'react';

import AppHeader      from '@/components/layout/AppHeader';
import { Button, FormField } from '@/components/ui';
import SrdCombobox    from '@/components/SrdCombobox';
import { getMagicItem, loadEntries } from '@/api/srd';
import {
  loadMagicItems as loadOpen5eMagicItems,
  getMagicItem as getOpen5eMagicItem,
} from '@/api/open5e';
import { magicItemToCard } from '@/data/srdMap';

import {
  ITEM_TYPES, RARITIES, ARMOR_TYPES,
  WEAPON_TYPES, ARMOR_TYPES_TRIGGER, CONSUMABLE_TYPES,
  defaultForm,
} from './constants';
import RichTextEditor  from './RichTextEditor';
import ItemCardPreview from './ItemCardPreview';
import ItemCardPrint   from './ItemCardPrint';

// ─────────────────────────────────────────────────────────────────────────────
// Shared input style
// ─────────────────────────────────────────────────────────────────────────────
const INPUT_CLS = [
  'w-full bg-surface2 border border-border2 text-text',
  'px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
  'transition-colors',
].join(' ');

const LABEL_CLS = 'font-display uppercase tracking-wider text-text-dim text-[0.6rem]';

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
const TRAY_KEY = 'ic-print-tray';

export default function ItemCards() {
  const [form, setForm] = useState(defaultForm);
  const previewRef = useRef(null);

  // ── Print "set": temporarily saved cards, batch-printed double-sided ──
  const [tray, setTray] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TRAY_KEY)) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(TRAY_KEY, JSON.stringify(tray)); } catch { /* quota — ignore */ }
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
      type,
    }));
  }

  function handleClear() {
    setForm(defaultForm());
  }

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

  /** Download the card as a 300-dpi PNG using html2canvas from CDN */
  async function handleDownload() {
    const el = previewRef.current;
    if (!el || !window.html2canvas) {
      alert('html2canvas is still loading. Try again in a moment.');
      return;
    }
    const TARGET_PX = 591; // 5cm @ 300 dpi
    const scale = TARGET_PX / el.offsetWidth;
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface2').trim() || '#272015';

    const canvas = await window.html2canvas(el, { backgroundColor: bg, scale, logging: false });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = (form.name || 'item-card').replace(/\s+/g, '-').toLowerCase() + '.png';
    link.click();
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

            <Field label="Item Type">
              <select value={form.type} onChange={handleTypeChange} className={INPUT_CLS}>
                <option value="">Select item Type</option>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Rarity">
              <select value={form.rarity} onChange={set('rarity')} className={INPUT_CLS}>
                {RARITIES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>

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
                  <input type="text" value={form.damageType} onChange={set('damageType')} placeholder="e.g., Slashing"  className={INPUT_CLS} />
                </Field>
                <Field label="Properties">
                  <input type="text" value={form.properties} onChange={set('properties')} placeholder="e.g., Light, Finesse" className={INPUT_CLS} />
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
              <Button variant="accent"  onClick={handleDownload}>💾 Download PNG</Button>
              <Button variant="default" onClick={printSingle}>🖨 Print (front / back)</Button>
              <Button variant="default" onClick={addToTray}>➕ Add to print set</Button>
              <Button variant="default" onClick={handleClear}>Clear</Button>
            </div>
            <p className="text-[0.7rem] text-text-muted -mt-2">
              Print produces fixed-size cards — Front, then Back, plus Continuation cards if the text
              overflows (the font auto-shrinks first). Enable “Background graphics” and disable headers/footers
              in your browser’s print dialog for best results.
            </p>

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
                  Use <strong>➕ Add to print set</strong> to collect several cards, then print them all at once,
                  ordered for double-sided printing.
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
                  <p className="text-[0.7rem] text-text-muted">
                    Up to <strong>9 cards per A4</strong> (3×3). Each sheet prints a page of Fronts then a page of
                    Backs, with the backs mirrored so they line up when flipped. Set your printer to
                    <strong> Two-sided</strong>, <strong>flip on the long edge</strong>, and 100% scale (no
                    “fit to page”). Or “Save as PDF” to keep the set. Cut along the card borders.
                  </p>
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
