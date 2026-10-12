# 🧙 NPC Sheet

A fillable, browser-based character sheet designed for **Non-Player Characters** in D&D 5e campaigns.

## Features

- **Assisted entry from the SRD and Open5e** — see below; this is the fastest
  way to fill a sheet
- Class selection with spell-slot tracking based on caster type (Full, Half, Third, Warlock, Innate)
- Stats block (HP, AC, Speed, Proficiency). HP reads out as **current / max**.
  - **Current HP is editable directly in the bar, and only there** — it changes every round, so
    recording a hit costs no clicks. It holds the raw value, not current + temp. There is
    deliberately no second box for it in the dialog: one number, one place to change it.
  - The right half is the *effective* maximum: max **+** temp max.
  - **Temporary HP floats beside the HP label as a small blue number**, and only while there is
    some. It is a separate pool in the rules — absorbed first, never healed — so it reads as a
    separate number rather than as a tint on this one. It overlays rather than taking up space,
    so the stats bar is exactly as tall with temporary HP as without. **Click it** to open the
    dialog on the value it is showing. A temporary *maximum* still turns the right half
    **green**.
  - **⟳ clears HP**: drops every temporary value and heals to full. It is on the stat rather
    than in the dialog, because it is the end of a long rest — the most routine HP change there
    is. It heals to the **base** maximum, since the temporary one is being cleared on the same
    action. It only appears when it would actually change something.
  - **Max HP, Temp HP and Temp Max HP** live in the **✎ Manage HP** dialog. They used to have
    their own columns in the stats bar, which meant two usually-empty boxes on every sheet.
  - Lowering Max HP or applying a negative Temp Max **pulls current HP down to match**, so the
    sheet never reads `38 / 20`. This happens when you leave the field, not as you type — and
    never while Max HP is blank, which is how every SRD-imported monster arrives
- **You overwrite the stat boxes, you do not edit them.** Current HP, AC, Speed and the six
  ability scores clear when you click into them, and the value being replaced drops to a grey
  hint you can still read while typing over it. These numbers are replaced outright — a hit, a
  buff, a rolled score — so select-all-then-type was the real interaction, and on a phone a
  caret landing inside `18` produced `118`.
  - Click in and leave without typing and nothing changes: focusing a field is not a decision.
  - Type something and delete it back to empty and the box **does** clear: that one you meant.
  - An unset box shows its own grey hint, so a blank sheet reads as a form waiting for numbers
    rather than as a set of zeroes.
- Ability scores (STR, DEX, CON, INT, WIS, CHA) with automatic modifier display
- Tag pickers for damage resistances / immunities / vulnerabilities and condition immunities
- Attacks, bonus actions, legendary and lair actions
- Spell list with level groupings and per-spell rules lookup. Each level shows its spells as a
  list with an ⓘ lookup beside any name the SRD knows; **click the list to edit it** as plain
  comma-separated text, and click away (or press Enter) to go back. Printing always shows the
  list, never the editor
- Auto-resizing text areas
- Embedded mode (`?embedded=1`) — this is the sheet the PC Sheet's **Stats** tab hosts

## Usage

Open `/npc-sheet` in your browser after starting the server.

Fill in any field — all fields are editable inline. The sheet is designed to be used during a session as a quick reference card for DMs.

### Printing

Use your browser's Print function (`Ctrl+P` / `Cmd+P`). The layout is optimised for A4 / Letter paper in portrait orientation.

### Caster types

| Type | Spell slots |
|---|---|
| Full Caster | Levels 1–9 (Wizard, Cleric, Druid, Bard, Sorcerer) |
| Half Caster | Levels 1–5 (Paladin, Ranger) |
| Third Caster | Levels 1–4 (Eldritch Knight, Arcane Trickster) |
| Warlock | Pact Magic slots (short-rest recovery) |
| Innate | No slots — uses/day tracked in the notes |

## Assisted entry (SRD 5.2 + Open5e)

Several fields offer suggestions rather than free typing alone. Everything is a
**suggestion, never a restriction** — you can always type your own value, which
matters because the licensed data is only a subset of the published books.

| Control | Source | What it does |
|---|---|---|
| **Load from SRD** | 341 SRD monsters + ~3,200 Open5e | Fills the whole stat block from one pick — AC, HP, CR, speed, senses, languages, ability scores, actions, tags. Asks before overwriting a sheet that already has content |
| **Race** | 9 SRD species | Fills speed and trait names; offers the lineage (Drow / High Elf / Wood Elf) where one exists |
| **Subclass** | Official PHB/XGE/TCE list + SRD + ~110 Open5e | Scoped to the chosen class. Inserts the subclass's features, with levels, where rules text is licensed |
| **Languages** | 19 SRD languages | Appends to the comma-separated list |
| **Special Traits / spells / damage + condition tags** | SRD | An ⓘ next to each recognised name opens its rules text |

Entries that are not current-edition carry a small badge — `2014 · XGE`,
`2014 · Tome of Heroes` — so third-party and older material is obvious.

**What the lookups cannot give you:** rules text for subclasses outside the SRD.
Assassin, Battle Master, Hexblade and the rest are in the picker by name only —
that text is copyrighted and appears in no licensed dataset. Content comes from
SRD 5.2 (CC-BY-4.0, via dnd5eapi.co) and Open5e (OGL / CC-BY / ORC).

## Notes

Data is not automatically saved. To preserve a sheet, use your browser's **Print to PDF** feature or copy the values to your campaign notes.
