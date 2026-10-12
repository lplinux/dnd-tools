# 🗡️ Item Cards

A browser-based magic item card creator for D&D 5e. Generate formatted cards styled like official rulebook handouts.

## Features

- **Load from SRD** — fill a whole card from a published magic item (see below)
- Item name, type, rarity, and attunement toggle
- Type-specific stats — weapon (damage / type / properties), armour (AC / type), consumable/potion (uses)
- Flavour text and a rich-text **Special Abilities** editor — **bold, italic, underline, bullet list, numbered list, highlight** (gold), and clear-formatting
- Live card preview as you type
- **Saved library** (signed in) — keep cards on the server, reopen them to edit, export/import as JSON,
  with search and a rarity filter once the list grows past five
- **Evolving items** (signed in) — a card can be a later tier of another, so an item can grow over
  a campaign without the players knowing there is more to come (see below)
- **Weight** — optional, in pounds, beside Rarity. Feeds the carry-weight total on a character's
  Inventory tab when the card is granted to them. Blank means *unweighed*, which the inventory
  reports separately rather than treating as weightless
- **Download PNG** — the preview card as a 300-dpi image
- **Print** — fixed-size two-sided cards laid out for printing:
  - Each card has two faces: **Front** (name / type / rarity / stats / flavour) and **Back** (special abilities). The font on each face **auto-fits** (shrinks between 14 px and 6 px) to fit the card.
  - Cards are a fixed **63 × 88 mm** (poker/MTG size). A single card prints one per page; a **set** prints **up to 9 cards per A4** (3 × 3).
  - Designed for **double-sided** printing: a page of Fronts is followed by a page of Backs whose cells are **mirrored per row** so each back lands behind its front when you flip on the long edge. Cut along the card borders.
  - The card **border and a top accent bar are coloured by rarity** (grey / green / blue / purple / gold / theme gold — see the table below), matching the on-screen preview and the 5e rulebook convention.

## Usage

Open `/item-cards` in your browser after starting the server.

Fill in the form on the left — the card preview on the right updates in real time.

### Load from SRD

The **Load from SRD** picker at the top of the form fills a card from a published magic item —
**262 items from the 2024 SRD plus roughly 1,600 from Open5e**. Type to filter, pick an entry, and
it fills:

| Card field | Filled from |
|---|---|
| Name | The item's name |
| Type | Mapped from its equipment category |
| Rarity | The item's rarity — left as-is when it isn't one of the six the card offers |
| Attunement | The item's attunement flag |
| Special Abilities | Its description text, one paragraph per line |

Everything stays editable afterwards — the lookup is a starting point, not a lock. Fields the item
doesn't specify keep whatever you already typed.

Entries outside the current edition carry a small badge naming their source, so third-party and
older material is obvious. Content comes from SRD 5.2 (CC-BY-4.0, via dnd5eapi.co) and Open5e
(OGL / CC-BY / ORC).

### Downloading a PNG

Click **💾 Download PNG** to save the preview card as a 300-dpi transparent image (≈5 cm wide), handy for VTTs or Discord.

### Printing a single card (front / back)

1. Click **🖨 Print (front / back)** (or use `Ctrl+P` / `Cmd+P`)
2. In the print dialog, **enable “Background graphics”**, **disable headers/footers**, and use **100 % scale** (no "fit to page")
3. Two pages print — the **Front** then the **Back**, each 63 × 88 mm, one per page
4. Print **double-sided, flip on the long edge** to get Front + Back on the two sides of one card, then cut it out

> Only the card(s) print — the app chrome and form are hidden automatically. A footer on each face shows the item name and Front/Back. The on-screen live preview is shown at the same 63 mm width as the printed card.
>
> Because a physical card has only two sides, very long ability text auto-shrinks to the minimum
> font (6 px, about 1.5 mm — readable held close, not across a table) and is then **clipped** to
> fit the back. There are no continuation cards. Keep abilities concise, or use **Download PNG**
> for a single tall card.

### Printing several cards at once (a "print set", up to 9 per A4)

To batch-print many items efficiently:

1. Build a card, then click **➕ Add to print set**. Repeat for each item — the set is remembered in your browser (it survives a reload).
2. The **Print set** panel lists everything you've added (remove individual cards with ✕, or **Clear set**).
3. Click **🖨 Print set — double-sided**. Cards are packed **3 × 3 (up to 9 per A4)**. For every sheet the app prints a **page of Fronts** immediately followed by a **page of Backs**, and the backs are **mirrored left-to-right per row** so each card's back lines up behind its front.
4. In the print dialog choose **Two-sided**, **flip on the long edge**, **100 % scale**, and **enable background graphics**. (Or **Save as PDF** to keep the ordered set as a file.) Then cut along the borders.

> If your printer's front/back alignment comes out mirrored the wrong way, your driver may be flipping on the *short* edge — switch it to **long edge**.
>
> The print set belongs to **one sitting**: it is held in `sessionStorage`, so it survives a reload
> and moving between pages mid-batch, and is **cleared when you close the tab**. It is a *queue*,
> not a library — a card in the set can be removed but not edited. For cards you want to keep, use
> **My library** below.
>
> It used to persist indefinitely, which meant a set assembled weeks ago, or by a logged-out
> visitor, was still sitting there afterwards looking like something you had queued today.

### My library — saving cards (requires signing in)

Item Cards works without an account, and always will: everything above is available to anyone who
opens the page. Signing in adds one thing — a **library stored on the server**, so your cards are
still there on another machine.

| Button | Effect |
|---|---|
| **💾 Save to library** | Stores the card under your account. |
| **💾 Update card** | Replaces the card you currently have open (the button changes to this once a saved card is loaded). |
| **Save as new** | Keeps the original and stores a copy — the quick way to make a variant. |
| **New card** | Clears the form and stops editing the saved card. |

Click a card in the **My library** list to load it back into the form. That is the thing the print
set cannot do; a card in the set is a snapshot you can only delete and retype.

**Export / Import.** *Export* downloads your whole library as
`item-cards-<you>-<date>.json`, matching the naming convention every other module uses. *Import*
**adds** the cards in a bundle to your library — it never replaces or deletes what is already
there, so importing the same file twice gives you two copies of everything.

If you built cards before signing in, the library panel offers once to move your print set into
your account.

**A note on the abilities editor.** The Special Abilities field stores formatted HTML. Anything
saved to the server is cleaned first, keeping only what the toolbar can produce — bold, italic,
underline, lists and the highlight colour. Scripts, links, images and event handlers are stripped.
This matters mainly for imports: a bundle from someone else cannot smuggle active content onto
your page.

### Granting cards to players

A saved card is a **template**. As a DM you can hand one to a character from the PC Sheet's
**🎒 Inventory** tab → *＋ Grant from library*, which creates the card's one instance in that
campaign.

- **Reusable across campaigns, once within each.** The same Sword of Kas card can appear in
  Leruhy and in another campaign, but not twice in Leruhy. Granting it again there returns a
  conflict until it is removed.
- **No quantities.** A granted item is an artifact. Consumables belong in the player's free-text
  *Carried gear* instead.
- **Players can pass items on** to another character in the same campaign, but never grant
  themselves one, and only the DM can take one back.
- **A card in play cannot be deleted.** Deleting it is refused with a message naming the
  characters holding it — otherwise tidying your library would silently strip a player's magic
  item.

Holding a granted item does not give a player any access to your library: the card's details are
copied into the inventory response, and the `/api/item-cards` routes remain strictly owner-only.

### Items that evolve

An item that grows over a campaign is written as **several cards in a chain**, not as one card you
edit as it changes. Set **Evolves from** on a card to make it a later tier of another.

Write all the tiers in advance. Each is an ordinary card, so each gets its own name, stats,
abilities, artwork and printed version — the Drowned Tidecaller can have different damage, a
different rarity and a different back face from the one the party found.

**Granting and advancing.** Grant the base tier as usual. On the character's Inventory tab a
granted item with a chain gains **▴** and **▾** beside its other controls:

- **▴** advances it to the next tier,
- **▾** drops it back,
- both are disabled at the ends of the chain.

They are a *move*, not a step: nothing is transformed, so putting an item back exactly undoes
advancing it. The row keeps its id, so the item stays the same item — its transfer trail survives
a bump, and so does whatever it has been through.

Nothing resets on its own. If an item changes hands and you want it to start again from the base
tier, drop it back yourself.

**Players are told nothing.** They see the card for the tier they are holding and nothing else —
not the tier number, not that a chain exists, not what is coming. This is enforced in the query
that serves their inventory rather than in the interface, so it holds for anything reading the
API, not just the sheet. The tier position (`2/3`) appears in exactly one place: your own library
list, which no one else can read.

A few rules worth knowing:

- **A card cannot evolve from itself, from a later tier of itself, or from another user's card.**
  The picker will not offer the first two, and the server refuses all three.
- **Shortening a chain is allowed** — re-pointing tier 3 at tier 1 drops the middle tier out.
- **Deleting a middle tier closes the gap** rather than splitting the chain in two: whatever
  evolved from it is re-pointed at its parent.
- **Two characters in one campaign cannot hold the same tier**, the same rule that stops a card
  being granted twice. Advancing into a tier someone else is holding is refused and says so.
- **Export and import keep the chain.** Links travel as positions within the bundle rather than
  ids, so importing into another account rebuilds them correctly.

### Rarity colours

Cards are colour-coded by rarity following the D&D 5e convention:

| Rarity | Colour |
|---|---|
| Common | Grey |
| Uncommon | Green |
| Rare | Blue |
| Very Rare | Purple |
| Legendary | Gold (`#ffd700`) |
| Artifact | Theme gold (`var(--gold)`, follows the active theme) |

## Notes

**Signed out**, the module is entirely client-side: the card you are editing is not kept at all, and
the print set lives only in this tab's `sessionStorage`. To keep a card, use **Download PNG**,
**Print → Save as PDF**, or sign in and save it to your library.

**Signed in**, saved cards live in the `item_cards` table and are scoped to your account. They are
not shared, not tied to a campaign, and not visible to anyone else — including a DM. Deleting your
user account removes them with it.

The SRD lookup is unchanged either way: it still runs in the browser against dnd5eapi.co and
Open5e, and nothing about it is stored. The library persists the *result* of a lookup, not the
lookup.

## API reference

All endpoints require a session (`requireAuth`) and operate only on the calling user's own cards.
There is no sharing route and no campaign scoping.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/item-cards` | List your saved cards, most recently updated first |
| `POST` | `/api/item-cards` | Save a new card |
| `PUT` | `/api/item-cards/:id` | Update one of your cards |
| `DELETE` | `/api/item-cards/:id` | Delete one of your cards |
| `GET` | `/api/item-cards/export` | Your whole library as an `item-cards` bundle |
| `POST` | `/api/item-cards/import` | **Add** the cards in a bundle to your library (max 500, transactional) |

One more lives on the PC sheet rather than here, because it acts on an inventory row:

| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/pc/:playerId/inventory/:itemId/card` | Move a granted item to another tier of its own chain. DM only. |

### Bundle format

```json
{
  "type": "item-cards",
  "version": 2,
  "exported_at": "2026-10-04T09:30:00.000Z",
  "cards": [
    {
      "name": "Sword of Dragonslaying", "type": "Weapon", "rarity": "legendary",
      "flavor": "…", "abilities": "<p>…</p>", "attunement": true,
      "damage": "1d8+2", "damage_type": "Slashing", "properties": "Finesse, Light",
      "ac_bonus": null, "armor_type": null, "uses": null, "weight": 3
    },
    {
      "name": "Sword of Dragonslaying, Awoken", "evolves_from_ref": 0
    }
  ]
}
```

Ids and user ids are deliberately omitted — a bundle describes cards, not rows, so importing it
into another account works without collisions. `abilities` is re-sanitised on import regardless of
what the file contains.

`evolves_from_ref` is a card's parent, given as a **position in this bundle's own `cards` array**
rather than a database id, since the bundle has no ids to refer to. Import runs in two passes:
every card is inserted first, then the links are applied, because a card may name one that
appears later in the array. The raw `evolves_from` column is never read from a bundle — a
hand-edited file claiming `evolves_from: 2` would otherwise attach the imported card to whatever
card 2 happens to be in the importing library.

**Version 2** added that field. A v1 bundle imports as a set of unchained cards, and a v1 reader
handed a v2 bundle ignores the unknown key and does the same — both lose the chain rather than
failing.
