# ⚙️ User Panel

The admin control panel for managing user accounts and roles. Only users with the `admin` role can access this page.

**Access:** Admin only — `/user-panel`

---

## First steps (admin onboarding)

Before a DM can build their world, an **admin** should do the groundwork. Recommended order:

1. **Create the accounts.** There is no self-registration — the admin creates every user in
   **Create User** (username + password + role). Create one account per real person: your DMs and your
   players.
2. **Assign roles.** Give world-builders the **`dm`** role and everyone else **`player`**. Keep the
   **`admin`** role to yourself (and maybe one backup). See the capability matrix below.
3. **(Optional) Set global assets.** In **Location Pin Defaults** (this page), upload a default map-pin
   image per location type (city / town / village / …). These are shared by every campaign, so setting
   them once gives all future maps a consistent look. DMs can still override per location later.
4. **Hand off to the DM.** A DM then, in **Manage Campaigns**, creates a campaign and:
   - adds **players** (the characters), **locations**, and **NPCs**;
   - **assigns each campaign character to a user account** (this is what lets that player log in and see
     *their* PC sheet and timeline — an unassigned character is DM-only);
   - builds journey maps, timelines, and the character-relationship tree.
5. **Players log in.** Each player signs in with the account you made and sees only the character(s)
   assigned to them.

> **Least privilege:** most world-building is a **DM** capability, not admin. You only need `admin` for
> the things in "What only an admin can do" below — so hand out `dm`, not `admin`, to your world-builders.

### Capability matrix

| Capability | player | dm | admin |
|---|:--:|:--:|:--:|
| Own PC sheet + own timeline | ✅ | ✅ | ✅ |
| View a shared (public) journey map / timeline link | ✅ | ✅ | ✅ |
| Create/manage campaigns, players, locations, NPCs | | ✅ | ✅ |
| Build journey maps, timelines, character tree | | ✅ | ✅ |
| Assign characters to user accounts | | ✅ | ✅ |
| Per-location custom pin images, export/import a campaign | | ✅ | ✅ |
| **Create/delete users, change roles, reset passwords** | | | ✅ |
| **Set global Location Pin Defaults** | | | ✅ |

### What only an admin can do

- Manage user accounts (create, delete, change role, reset password).
- Set the **global** default pin images by location type.

Everything else about "building a world" (campaigns, maps, timelines, NPCs, relationships, per-location
images) is available to any **DM** — so a DM doesn't need an admin account to run their game.

---

## Overview

The page is split into three sections:

- **Create User** — form to add a new account
- **Users** — table listing all existing accounts with management actions
- **Location Pin Defaults** — global default map-pin images per location type

---

## User roles

| Role | What they can access |
|---|---|
| `admin` | Everything — user management, all DM tools, all player tools |
| `dm` | Campaign tools — manage campaigns, journey maps, timelines, PC sheets (all players), PDF viewer |
| `player` | Their own PC sheet and their own timeline entries |

Roles can be changed at any time. The change takes effect on the user's next page load (their session is not immediately invalidated).

---

## Creating a user

Fill in the **Create User** form:

| Field | Required | Notes |
|---|---|---|
| Username | Yes | Must be unique |
| Email | No | Informational only, not used for login |
| Password | Yes | Stored as a bcrypt hash |
| Role | Yes | `player`, `dm`, or `admin` |

Click **Create User**. The new account appears immediately in the table below.

---

## Managing existing users

Each row in the Users table has three action buttons:

### Change Role

Cycles the user's role through `player → dm → admin → player`. A confirmation prompt shows the new role before applying. Use this to promote a player to DM or to revoke admin access.

### Reset Password

Prompts for a new password and updates it immediately. The user can continue using any active sessions — they are not logged out automatically.

### Delete

Permanently removes the user account. A confirmation prompt is shown first. Deleting a user does **not** delete campaign or character data associated with them — player characters and timeline entries are linked to `campaign_players`, not directly to `users`.

---

## Notes

- There is no self-service registration flow. All accounts must be created by an admin.
- Admins cannot delete their own account from this panel (the delete button will return an error from the server).
- Passwords are hashed with `bcryptjs` and are never stored in plain text.

---

## Location Pin Defaults

A grid with one row per location **type** (Huge, Big, Medium, Small, Village, Neighborhood, Inn,
Landmark, Post, Port, Region, Other). For each type you can **Upload** a default image or **Clear** it.

- These defaults are **global** — shared by every campaign you run.
- On the Journey Map, a location's pin resolves in this order: its **own image** (set per-location in
  Manage Campaigns) → the **type default** here → the built-in vector icon.
- Set a handful of type defaults once and every matching location inherits the look automatically —
  no need to edit each location.
- Images are compressed to a small (~256 px) thumbnail. They are **not** part of a campaign export
  (they're a system-wide asset); per-location custom images still export with the campaign.

---

## API reference

User-management endpoints require the `admin` role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List all users (also accessible by `dm` for the player dropdown in Manage Campaigns) |
| `POST` | `/api/users` | Create a new user |
| `PUT` | `/api/users/:id/role` | Change a user's role |
| `PUT` | `/api/users/:id/password` | Reset a user's password |
| `DELETE` | `/api/users/:id` | Delete a user |
| `GET` | `/api/location-type-images` | Get the `{ size_type: image }` default-pin map (any authenticated user) |
| `PUT` | `/api/location-type-images/:sizeType` | Set (base64) or clear (`null`) a type's default image (admin) |
