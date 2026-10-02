# 📔 Diary

Session summaries for your campaign, in two halves with deliberately different privacy.

**Access:** DM only — `/diary` (**Campaign Diary** on the home screen, beside Manage Campaigns). **A player's own diary lives on their PC Sheet**, under the
📔 Diary tab — it is part of the character, and a player had no reason to visit a separate page
that showed them nothing else.

## Features

- **Campaign Diary (DM)** — your session write-ups. Players **cannot** see these in the app at
  all; they reach them only through a public share link, and only once you publish them.
- **Draft → Published** — a new entry is always a draft. Drafts are filtered out on the server, so
  an unpublished entry never reaches a reader's browser, not even hidden in the page.
- **One public link per campaign** — read-only, no login. The link is stable: pressing Share again
  gives you the same URL, so a link you pasted into Discord last month keeps working. Revoke is a
  separate, deliberate action.
- **Player diaries** — one per player, private to them. The campaign's DM can **read** them; no
  other player can, and nobody but the owner can edit or delete them.
- **Markdown** — headings, bold, italic, inline code, quotes, lists and links.
- **Session number and date** — both optional, and they drive the ordering.

## Usage

Open `/diary` and pick a campaign.

### As the DM

The **Campaign Diary** tab is your own write-up of each session. Press **＋ New entry**, give it a
title, optionally a session number and the date you played, and write the summary.

A new entry is a **draft**. Nobody outside the app can see it. When it is ready, press **Publish**
and it appears on the share link; **Unpublish** takes it back off.

Press **🔗 Share** to copy the public link. Send it to your players, post it wherever you like —
it shows published entries only, and nothing else from the campaign. **Revoke** invalidates it;
anyone holding the old URL then gets a "not valid" page, and generating a new link gives a
different URL.

The **Player Diaries** tab gives each player their own sub-tab, read-only. You can read them;
you cannot edit or delete them. You can also reach one player's diary from their PC Sheet's
📔 Diary tab.

### As a player

Your diary is on your character sheet: **PC Sheet → 📔 Diary**. Write up a session from your
character's point of view, keep notes between games — whatever you like. Your DM can read it. No
other player can, and nobody but you can edit it.

### Chapters and categories

Entries can be filed into groups, and the lists are grouped by them.

- **Campaign diary → Chapter.** An arc of sessions: *Act I — Landfall*, *The Buldamar Arc*,
  whatever you call it. The DM page and the public link both group by it.
- **Player diary → Category.** Whatever filing suits you: *Session notes*, *Theories*,
  *People we met*, *Loot*.

Groups **collapse**: click a group heading to fold it away, or use *Collapse all*. Entries
themselves show as compact cards — click one to read it in full.

Both are free text with a dropdown of what you have used before, so a new one is always one
keystroke away. Groups appear in the order their first entry does — your session ordering decides
the arc, not an alphabetical sort. Entries with no group collect at the end under *No chapter* /
*Uncategorised* rather than being hidden.

### Markdown

Write in a small subset of markdown:

- `## Heading` for a major break, **`### Heading` for a sub-heading inside an entry** — `###` is
  styled to sit clearly below the session title rather than compete with it
- `**bold**` for character names reads well in the book
- `**bold**`, `*italic*`, `` `code` ``
- `> a quote`
- `- bullet` and `1. numbered` lists
- `[link text](https://example.com)` or a link into the app, like `[the map](/journey-map)`

Press **👁 Preview** in the editor to see it rendered.

Links are restricted to `http://`, `https://` and site-relative paths beginning with `/`. Anything
else is shown as plain text rather than turned into a link, which is what keeps the public page
safe to open. Images are not supported.

## Export / Import

The campaign diary has its own file, independent of everything else.

- **⬇ Export** (Campaign Diary tab) downloads `campaign-diary-<campaign>-<date>.json` — every
  entry, draft and published alike, with their statuses.
- **⬆ Import** sits beside it, and replaces the selected campaign's diary from a file.
- The same file can also be imported from **Manage Campaigns → ⬆ Import** (the general hub), which
  is where you go if you are not already on the Diary page.

> **Importing a diary REPLACES the target campaign's diary.** It is a restore, not a merge: the
> entries already there are deleted and the file's entries take their place, keeping their
> draft/published status. That is what makes re-importing the same file twice safe — you get the
> same entries, not two copies — but it also means an accidental import loses your write-ups. The
> importer tells you exactly how many entries will be deleted and how many will arrive, and waits
> for you to confirm.

### The file format

A bundle is plain JSON, so you can write one by hand or generate it from notes you keep elsewhere:

```json
{
  "version": 1,
  "type": "campaign-diary",
  "campaign_name": "Lost Mines",
  "entries": [
    {
      "title": "The Sunless Citadel",
      "session_no": 1,
      "session_date": "2026-03-03",
      "status": "published",
      "body": "## What happened\n\nThe party **finally** reached the rift.\n\n- Thorn fell to the goblin ambush\n- Mira recovered the *Gulthias staff*\n\n> \"We should not have opened it.\""
    }
  ]
}
```

Only `title` is required. `session_no` and `session_date` are optional and drive the ordering;
`status` is `"draft"` or `"published"` and defaults to draft; `body` is markdown.

The **share token is never exported.** A link is bound to the campaign it was minted for, so an
imported diary starts with no live public link; press Share to mint a new one.

A full **campaign** export still carries the diary as well, so a campaign restore brings it back
with everything else. The standalone file is for moving a diary on its own.

## Printing — the book

The public link reads **one entry at a time**, like turning pages: numbered jump buttons across
the top, Previous/Next at the bottom, and the page in the URL so a reader can bookmark or share
the exact session being discussed.

**🖨 Print book** renders the diary as a book and opens your browser's print dialog, from which
"Save as PDF" gives you the file.

- **Published entries only**, on both the DM's page and the public link. The book is the finished
  narrative; drafts are working notes.
- The **title page credits the table** — the DM's name and the characters — and an **annex at the
  back** gives each character a portrait and their public bio. Both come from the campaign, so
  they are fetched only when you print; a failure there costs you the annex, not the book.
- A **title page** with the campaign name and session range, a **contents** page, then **one
  session per page**, set in Cinzel and Crimson Text with a drop cap opening each entry.
- An entry whose body starts with a single *italic line* has it lifted into the header as a
  subtitle, so the drop cap falls on the prose rather than on a date.
- Readers of the public link get the same button, so they can keep their own copy.

In the print dialog, choose **A4** and leave the scale at 100% — the page margins are part of the
document.

> **No page numbers.** Chrome cannot put page numbers or running headers into a PDF from CSS, so
> the book has none. Your browser's own "Headers and footers" option can add them, but it prints
> the URL and the date alongside, so it is off by default.

## Notes

- **The campaign diary is never visible to players inside the app** — not in a hidden tab, not in
  a request they could read. It leaves the server only through the share link, and only published
  entries do.
- **Deleting a player deletes their diary** along with their character sheet and timelines.
- **Reassigning a character to a different user hands over that character's diary too.** The diary
  belongs to the character, not to the account. Clear the entries first if that is not what you
  want.
- **Two ways to move a diary** — its own file (see Export / Import above), or inside a full
  campaign export, which carries both the campaign diary and every player's. Neither carries the
  share token.
