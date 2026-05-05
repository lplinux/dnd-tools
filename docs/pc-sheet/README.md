# 🧝 PC Character Sheet

A full character sheet for Player Characters, stored in the database and accessible by both the player and the DM. The sheet is organised into tabs, each covering a different aspect of the character. DMs have additional tabs not visible to players.

**Access:** DM, Player — `/pc-sheet`

---

## Getting started

1. Log in and open `/pc-sheet`
2. Select a **Campaign** from the header dropdown
3. Select a **Player** from the second dropdown

The sheet loads immediately. All changes are saved per-section with the **💾 Save** button in each tab.

> **DMs** can view and edit any player's sheet in any of their campaigns. **Players** can only see and edit their own character.

---

## Tabs

### ⚔️ Character

| Field | Description |
|---|---|
| Character Name | The character's full name |
| Portrait | Upload an image file (JPEG/PNG/GIF/WebP, max 500 KB) or enter a URL |
| Story | Free-text backstory |
| Traits | Personality traits |
| Flaws | Character flaws |
| Goals | Goals and motivations |

**Portrait upload** stores the image as base64 in the database. Once uploaded, the URL field is ignored.

---

### 🎲 Stats Sheet

An embedded NPC Sheet form used as a D&D 5e stat block. Tracks ability scores, HP, AC, speed, skills, attacks, spell slots, and more. See [NPC Sheet documentation](../npc-sheet/README.md) for all fields.

---

### 🌳 Relationships

A relationship tracker with two views:

- **List view** — table of all relationships
- **Graph view** — SVG diagram separating family (left) from social (right) connections. Re-renders automatically when the tab is opened or the panel is resized.

#### Relationship types

| Type | Branch |
|---|---|
| Grandparent, Parent, Sibling, Child, Grandchild | Family |
| Mentor, Ally, Friend, Rival, Enemy, Other | Social |

---

### 📢 Public Info

Shown on the character's public share page (`/pc-public/:token`) — accessible without login.

---

### 🔒 Private Info *(player and DM only)*

Private notes for the player's eyes only. Never shown on the public share page.

---

### 📜 DM Notes *(DM and admin only)*

Per-note visibility toggle:

| State | Player sees it |
|---|---|
| 👁 Visible | Yes |
| 🙈 Hidden | No |

---

## Export / Import

### Who can export

| Role | What is included |
|---|---|
| DM / Admin | All fields including `private_info` and all DM notes (hidden + visible) |
| Player | `private_info` omitted; only `dm_visible: true` notes included |

### Who can import

**DM and Admin only.**

**What happens on import:**

| Data | Behaviour |
|---|---|
| Character fields | Overwritten |
| Relationships | Replaced entirely |
| Stats sheet | Overwritten |
| DM notes | Appended — existing notes preserved |
| Portrait (base64) | Not restored — re-upload manually |

---

## JSON schema

```json
{
  "version": 1,
  "exported_at": "ISO 8601 timestamp",
  "type": "pc-sheet",

  "player_name": "string — informational only, not used on import",

  "character": {
    "name":         "string",
    "picture_url":  "string — external URL only; base64 is never exported",
    "story":        "string",
    "traits":       "string",
    "flaws":        "string",
    "goals":        "string",
    "public_info":  "string",
    "private_info": "string — omitted from player exports"
  },

  "relationships": [
    {
      "name":          "string — required",
      "relation_type": "Grandparent | Parent | Sibling | Child | Grandchild | Mentor | Ally | Friend | Rival | Enemy | Other",
      "link":          "string — optional URL or reference",
      "is_family":     "boolean"
    }
  ],

  "stats": {
    "char_name":     "string",
    "char_class":    "string",
    "subclass":      "string",
    "race":          "string",
    "sex":           "string",
    "alignment":     "string",
    "level":         "string or number",
    "cr":            "string — leave blank for PCs",
    "caster_type":   "none | full | half | third | warlock",
    "spell_ability": "int | wis | cha",
    "slot_reset":    "Long Rest | Short Rest",

    "hp":     "string or number",
    "ac":     "string or number",
    "speed":  "string",
    "senses": "string",
    "langs":  "string",

    "abilities": {
      "str": { "score": "number", "st_prof": "boolean" },
      "dex": { "score": "number", "st_prof": "boolean" },
      "con": { "score": "number", "st_prof": "boolean" },
      "int": { "score": "number", "st_prof": "boolean" },
      "wis": { "score": "number", "st_prof": "boolean" },
      "cha": { "score": "number", "st_prof": "boolean" }
    },

    "skill_profs": {
      "Acrobatics":      "0 | 1 | 2",
      "Animal Handling": "0 | 1 | 2",
      "Arcana":          "0 | 1 | 2",
      "Athletics":       "0 | 1 | 2",
      "Deception":       "0 | 1 | 2",
      "History":         "0 | 1 | 2",
      "Insight":         "0 | 1 | 2",
      "Intimidation":    "0 | 1 | 2",
      "Investigation":   "0 | 1 | 2",
      "Medicine":        "0 | 1 | 2",
      "Nature":          "0 | 1 | 2",
      "Perception":      "0 | 1 | 2",
      "Performance":     "0 | 1 | 2",
      "Persuasion":      "0 | 1 | 2",
      "Religion":        "0 | 1 | 2",
      "Sleight of Hand": "0 | 1 | 2",
      "Stealth":         "0 | 1 | 2",
      "Survival":        "0 | 1 | 2"
    },

    "tags": {
      "resist":     ["string"],
      "immune":     ["string"],
      "vuln":       ["string"],
      "condimmune": ["string"],
      "damagetype": ["string"]
    },

    "personality":       "string",
    "spec_traits":       "string",
    "features":          "string",
    "equipment":         "string",
    "actions":           "string",
    "bonus_actions":     "string",
    "legendary_res":     "[boolean, boolean, boolean, boolean, boolean]",
    "leg_actions":       "string",
    "lair_actions":      "string",
    "special_abilities": "string",
    "dm_notes":          "string — stat-block inline note, separate from the DM Notes tab",

    "spell_names": {
      "1": ["string"],
      "2": ["string"],
      "3": ["string"],
      "4": ["string"],
      "5": ["string"],
      "6": ["string"],
      "7": ["string"],
      "8": ["string"],
      "9": ["string"]
    }
  },

  "dm_notes": [
    {
      "content":    "string — required",
      "dm_visible": "boolean — true = player can see this note"
    }
  ]
}
```

---

## Full example

```json
{
  "version": 1,
  "exported_at": "2025-03-14T10:00:00.000Z",
  "type": "pc-sheet",
  "player_name": "Thorn Ashwick",

  "character": {
    "name": "Thorn Ashwick",
    "picture_url": "https://i.imgur.com/XZQ8Jk2.png",
    "story": "A former Neverwinter City Watch sergeant, discharged after refusing orders during the Harbour District purge. Drifted south as a caravan guard before a chance meeting with Gundren Rockseeker set him on the road to Phandalin.",
    "traits": "Honest to a fault. Speaks plainly and expects the same from others. Polishes his shield when anxious.",
    "flaws": "Cannot trust authority figures, assuming corruption until proven otherwise. Carries survivor's guilt from a bandit ambush that killed two guards under his command.",
    "goals": "Find the person who sold his patrol route to the bandits. Clear his name with the Neverwinter Watch.",
    "public_info": "A grizzled veteran with a scar from eyebrow to jaw. Carries a battered kite shield bearing a faded Neverwinter emblem.",
    "private_info": "Suspects Halia Thornton is in contact with his former commander, Captain Veldris. Has not told the party."
  },

  "relationships": [
    { "name": "Jorin Ashwick",     "relation_type": "Parent",  "link": "", "is_family": true  },
    { "name": "Sera Ashwick",      "relation_type": "Sibling", "link": "", "is_family": true  },
    { "name": "Sildar Hallwinter", "relation_type": "Mentor",  "link": "", "is_family": false },
    { "name": "Gundren Rockseeker","relation_type": "Ally",    "link": "", "is_family": false },
    { "name": "Captain Veldris",   "relation_type": "Enemy",   "link": "", "is_family": false },
    { "name": "Halia Thornton",    "relation_type": "Rival",   "link": "", "is_family": false }
  ],

  "stats": {
    "char_name":  "Thorn Ashwick",
    "char_class": "Fighter",
    "subclass":   "Battle Master",
    "race":       "Human (Variant)",
    "sex":        "Male",
    "alignment":  "Lawful Neutral",
    "level":      "5",
    "cr":         "",
    "caster_type":   "none",
    "spell_ability": "",
    "slot_reset":    "Long Rest",

    "hp": "45", "ac": "17", "speed": "30 ft.",
    "senses": "Passive Perception 13",
    "langs":  "Common, Elvish (basic)",

    "abilities": {
      "str": { "score": 17, "st_prof": true  },
      "dex": { "score": 12, "st_prof": false },
      "con": { "score": 15, "st_prof": true  },
      "int": { "score": 10, "st_prof": false },
      "wis": { "score": 12, "st_prof": false },
      "cha": { "score":  9, "st_prof": false }
    },

    "skill_profs": {
      "Acrobatics": 0, "Animal Handling": 0, "Arcana": 0,
      "Athletics": 2, "Deception": 0, "History": 1,
      "Insight": 1, "Intimidation": 1, "Investigation": 0,
      "Medicine": 0, "Nature": 0, "Perception": 1,
      "Performance": 0, "Persuasion": 0, "Religion": 0,
      "Sleight of Hand": 0, "Stealth": 0, "Survival": 1
    },

    "tags": {
      "resist": [], "immune": [], "vuln": [],
      "condimmune": [], "damagetype": []
    },

    "personality":   "Direct and no-nonsense. Dislikes small talk.",
    "spec_traits":   "Second Wind (1/short rest, 1d10+5 HP)\nAction Surge (1/short rest)\nBattle Master: 5d8 superiority dice\nManoeuvres: Riposte, Disarming Strike, Rally, Precision Attack, Menacing Attack",
    "features":      "Fighting Style: Defence (+1 AC in armour)\nExtra Attack (2 per Attack action)\nAlert (feat): +5 initiative, cannot be surprised\nTough (feat): +10 max HP",
    "equipment":     "Chain Mail +1, Kite Shield, Longsword, 2× Hand Axe, Explorer's Pack, 38 gp",
    "actions":       "Longsword: +6 to hit, 1d8+3 slashing (versatile 1d10+3)\nHand Axe (thrown): +6 to hit, range 20/60, 1d6+3 slashing",
    "bonus_actions": "Second Wind\nRally manoeuvre: ally gains superiority die + CHA mod as temp HP",
    "legendary_res": [false, false, false, false, false],
    "leg_actions":   "",
    "lair_actions":  "",
    "special_abilities": "Alert: +5 initiative; cannot be surprised while conscious.\nTough: +2 HP per level.",
    "dm_notes": "",
    "spell_names": {}
  },

  "dm_notes": [
    {
      "content": "Thorn intercepted a letter signed with a broken wax seal — handwriting matches Glasstaff. Connects his backstory to the Redbrand plot. Reveal in Session 4 or 5.",
      "dm_visible": false
    },
    {
      "content": "Disadvantage on Charisma checks against Neverwinter Watch members due to his discharge record.",
      "dm_visible": true
    },
    {
      "content": "If Thorn faces Captain Veldris in combat: DC 14 Wisdom save or Frightened for 1 round.",
      "dm_visible": false
    }
  ]
}
```

---

## API reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/pc/:playerId` | auth | Load full sheet data |
| `PUT` | `/api/pc/:playerId` | auth | Save narrative sections |
| `POST` | `/api/pc/:playerId/portrait` | auth | Upload portrait image |
| `PUT` | `/api/pc/:playerId/stats` | auth | Save stats sheet |
| `GET` | `/api/pc/:playerId/stats` | auth | Load stats sheet |
| `GET` | `/api/pc/:playerId/relationships` | auth | List relationships |
| `POST` | `/api/pc/:playerId/relationships` | auth | Add a relationship |
| `DELETE` | `/api/pc/:playerId/relationships/:rid` | auth | Delete a relationship |
| `GET` | `/api/pc/:playerId/dm-notes` | auth | List DM notes (visibility-filtered for players) |
| `POST` | `/api/pc/:playerId/dm-notes` | dm | Add a DM note |
| `PUT` | `/api/pc/:playerId/dm-notes/:nid` | dm | Toggle visibility or edit |
| `DELETE` | `/api/pc/:playerId/dm-notes/:nid` | dm | Delete a DM note |
| `GET` | `/api/pc/:playerId/export` | auth | Export sheet (visibility rules apply per role) |
| `POST` | `/api/pc/:playerId/import` | dm | Import sheet from JSON |
| `GET` | `/api/pc/:playerId/public-token` | auth | Get or create the public share token |
| `GET` | `/api/pc-public/:token` | public | Load public-facing sheet data |

---

## Data model

```
campaign_players
  id, campaign_id, player_name, is_dm_player (bool)

pc_characters
  id, player_id → campaign_players.id
  name, picture_url, picture_data (base64), story, traits,
  flaws, goals, public_info, private_info, updated_at

pc_char_stats
  player_id → campaign_players.id  (unique)
  stats_json JSONB, updated_at

pc_relationships
  id, character_id → pc_characters.id
  name, relation_type, link, is_family (bool), created_at

pc_dm_notes
  id, character_id → pc_characters.id
  content, dm_visible (bool), created_at

pc_public_tokens
  player_id → campaign_players.id  (unique)
  token, created_at
```
