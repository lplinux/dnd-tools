# 🗡️ Item Cards

A browser-based magic item card creator for D&D 5e. Generate formatted cards styled like official rulebook handouts.

## Features

- **Load from SRD** — fill a whole card from a published magic item (see below)
- Item name, type, rarity, and attunement toggle
- Type-specific stats — weapon (damage / type / properties), armour (AC / type), consumable/potion (uses)
- Flavour text and a rich-text **Special Abilities** editor — **bold, italic, underline, bullet list, numbered list, highlight** (gold), and clear-formatting
- Live card preview as you type
- **Download PNG** — the preview card as a 300-dpi image
- **Print** — fixed-size two-sided cards laid out for printing:
  - Each card has two faces: **Front** (name / type / rarity / stats / flavour) and **Back** (special abilities). The font on each face **auto-fits** (shrinks between 14 px and 8 px) to fit the card.
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
> Because a physical card has only two sides, very long ability text auto-shrinks to the minimum font and is then clipped to fit the back — keep abilities concise, or use **Download PNG** for a single tall card.

### Printing several cards at once (a "print set", up to 9 per A4)

To batch-print many items efficiently:

1. Build a card, then click **➕ Add to print set**. Repeat for each item — the set is remembered in your browser (it survives a reload).
2. The **Print set** panel lists everything you've added (remove individual cards with ✕, or **Clear set**).
3. Click **🖨 Print set — double-sided**. Cards are packed **3 × 3 (up to 9 per A4)**. For every sheet the app prints a **page of Fronts** immediately followed by a **page of Backs**, and the backs are **mirrored left-to-right per row** so each card's back lines up behind its front.
4. In the print dialog choose **Two-sided**, **flip on the long edge**, **100 % scale**, and **enable background graphics**. (Or **Save as PDF** to keep the ordered set as a file.) Then cut along the borders.

> If your printer's front/back alignment comes out mirrored the wrong way, your driver may be flipping on the *short* edge — switch it to **long edge**.
>
> The set is stored only in your own browser (localStorage) — it isn't shared or saved to the server.

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

Item Cards is entirely client-side — there is no backend or database, and **data is not saved between
sessions**. To keep a card, use **Download PNG**, or **Print → Save as PDF** for a print-sized copy.
