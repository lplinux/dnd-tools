/**
 * hooks/useItemCards.js
 *
 * The saved-card library for the Item Card Creator.
 *
 * Item Cards is a public tool — no login, no route guard — and that stays true.
 * A guest gets exactly the page they always had: build a card, print it, keep a
 * print set that lasts the sitting. This hook adds the layer a signed-in user gets on
 * top, so cards outlive a cleared browser or a change of device.
 *
 * Everything here is inert when `user` is null: `enabled` is false, no request
 * is made, and the page hides the library panel. That is deliberate — reaching
 * these endpoints as a guest would only produce 401s in the console.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAsync }  from '@/hooks/useAsync';
import { useAuth }   from '@/hooks/useAuth';
import { useToast }  from '@/hooks/useToast';
import { itemCardsApi } from '@/api/itemCards';
import { downloadBundle } from '@/api/downloadBundle';
import { defaultForm } from '@/pages/ItemCards/constants';

/**
 * A database row -> the shape the form holds.
 *
 * The column names are snake_case and the form is camelCase, the same split
 * collectSheet/populateSheet bridge on the NPC sheet. NULL becomes '' because
 * every form field is a controlled input and React warns on null values.
 */
export function rowToForm(row) {
  if (!row) return defaultForm();
  return {
    ...defaultForm(),
    name:       row.name ?? '',
    type:       row.type ?? '',
    rarity:     row.rarity ?? 'rare',
    flavor:     row.flavor ?? '',
    abilities:  row.abilities ?? '',
    attunement: !!row.attunement,
    damage:     row.damage ?? '',
    damageType: row.damage_type ?? '',
    properties: row.properties ?? '',
    acBonus:    row.ac_bonus ?? '',
    armorType:  row.armor_type ?? '',
    uses:       row.uses === null || row.uses === undefined ? '' : String(row.uses),
    weight:     row.weight === null || row.weight === undefined ? '' : String(row.weight),
    // Without this line the chain link resets to null on every edit round-trip:
    // open a tier-2 card, change one word, save, and it silently becomes a
    // base tier. This function maps named fields only, so a new column that is
    // not listed here does not survive a load.
    evolvesFrom: row.evolves_from ?? null,
  };
}

export function useItemCards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const signedIn = !!user;

  // The card currently open for editing, or null for "this is a new card".
  // Holding the id here is what makes Save mean "update that one" rather than
  // "add another" — the gap the print set could never close.
  const [editingId, setEditingId] = useState(null);

  const {
    data: cards = [],
    loading,
    run: reload,
    setData: setCards,
  } = useAsync(itemCardsApi.list, { autoRun: signedIn, deps: [signedIn] });

  // Signing out mid-session must not leave another user's titles on screen.
  useEffect(() => {
    if (!signedIn) { setCards([]); setEditingId(null); }
  }, [signedIn, setCards]);

  const saveNew = useCallback(async (form) => {
    const row = await itemCardsApi.create(form);
    // Prepend rather than refetch: the list is ordered by updated_at DESC and a
    // brand-new card is by definition the most recent, so the order is known.
    setCards((prev) => [row, ...(prev ?? [])]);
    setEditingId(row.id);
    toast(`Saved "${row.name}".`);
    return row;
  }, [setCards, toast]);

  const saveExisting = useCallback(async (id, form) => {
    const row = await itemCardsApi.update(id, form);
    setCards((prev) => [row, ...(prev ?? []).filter((c) => c.id !== id)]);
    toast(`Updated "${row.name}".`);
    return row;
  }, [setCards, toast]);

  /** Save is update-or-create depending on whether a card is open. */
  const save = useCallback(
    (form) => (editingId ? saveExisting(editingId, form) : saveNew(form)),
    [editingId, saveExisting, saveNew],
  );

  /**
   * Delete a card. `force` also removes it from every inventory holding it.
   *
   * Throws the 409 through untouched so the caller can read `holders` off it
   * and ask. Deleting a card that is in play is a real loss for a player, so
   * the refusal is the feature — forcing is the informed second step.
   */
  const remove = useCallback(async (id, force) => {
    const r = await itemCardsApi.remove(id, force);
    setCards((prev) => (prev ?? []).filter((c) => c.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
    toast(r?.removedFrom?.length
      ? `Card deleted, and taken from ${r.removedFrom.join(', ')}.`
      : 'Card deleted.');
  }, [setCards, toast]);

  /** Empty the library. Same two-step shape as a single delete. */
  const clearAll = useCallback(async (force) => {
    const r = await itemCardsApi.clearAll(force);
    setCards([]);
    setEditingId(null);
    toast(`Library cleared — ${r?.deleted ?? 0} card${r?.deleted === 1 ? '' : 's'} deleted.`);
  }, [setCards, toast]);

  /**
   * Download a bundle that has already been built — a selection, rather than
   * the whole library. Kept here so the filename convention lives in one place
   * alongside exportAll rather than being reinvented at the call site.
   */
  const exportBundle = useCallback((bundle, suffix) => {
    downloadBundle(bundle, {
      module: 'item-cards',
      name: suffix ? `${user?.username ?? 'cards'}-${suffix}` : user?.username,
    });
  }, [user]);

  const exportAll = useCallback(async () => {
    const bundle = await itemCardsApi.exportAll();
    downloadBundle(bundle, { module: 'item-cards', name: user?.username });
  }, [user]);

  const importBundle = useCallback(async (bundle) => {
    const r = await itemCardsApi.importAll(bundle);
    await reload();
    toast(`Imported ${r.added} card${r.added === 1 ? '' : 's'}.`);
  }, [reload, toast]);

  return {
    signedIn,
    // For naming downloaded files. The hook already holds the user; reaching
    // for useAuth again at the call site would be a second source of truth.
    username: user?.username ?? null,
    cards, loading,
    editingId, setEditingId,
    save, saveNew, remove, clearAll,
    exportAll, exportBundle, importBundle,
    reload,
  };
}
