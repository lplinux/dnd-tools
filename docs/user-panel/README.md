# ⚙️ User Panel

The admin control panel for managing user accounts and roles. Only users with the `admin` role can access this page.

**Access:** Admin only — `/user-panel`

---

## Overview

The page is split into two sections:

- **Create User** — form to add a new account
- **Users** — table listing all existing accounts with management actions

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

## API reference

All endpoints require the `admin` role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List all users (also accessible by `dm` for the player dropdown in Manage Campaigns) |
| `POST` | `/api/users` | Create a new user |
| `PUT` | `/api/users/:id/role` | Change a user's role |
| `PUT` | `/api/users/:id/password` | Reset a user's password |
| `DELETE` | `/api/users/:id` | Delete a user |
