# 🧙 NPC Sheet

A fillable, browser-based character sheet designed for **Non-Player Characters** in D&D 5e campaigns.

## Features

- **Assisted entry from the SRD and Open5e** — see below; this is the fastest
  way to fill a sheet
- Class selection with spell-slot tracking based on caster type (Full, Half, Third, Warlock, Innate)
- Stats block (HP, AC, Speed, Proficiency). HP reads out as **current / max**, with **Temp HP**
  and **Temp Max HP** beside it. The figures shown are the *effective* ones — current **+** temp
  over max **+** temp max — and each half turns **green** while a temporary value is affecting it,
  so the number is never quietly wrong. All four are edited together in the **✎ Manage HP** dialog,
  which keeps a single place to change a value rather than two that can disagree
- Ability scores (STR, DEX, CON, INT, WIS, CHA) with automatic modifier display
- Tag pickers for damage resistances / immunities / vulnerabilities and condition immunities
- Attacks, bonus actions, legendary and lair actions
- Spell list with level groupings and per-spell rules lookup
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
