/**
 * pages/UserPanel.jsx
 *
 * User & role management panel. Admin only.
 *
 * Features migrated from the legacy user-panel.html:
 *   - List all users (id, username, email, role, created_at)
 *   - Create a new user (username, email, password, role)
 *   - Change a user's role (cycles admin → dm → player → admin)
 *   - Reset a user's password
 *   - Delete a user (with confirmation)
 *
 * Differences from the vanilla version:
 *   - Uses React state instead of innerHTML mutation
 *   - Uses Modal for role-change, password reset, and delete instead of
 *     browser confirm/prompt (which block the thread and look terrible)
 *   - All API calls go through src/api/users.js
 *   - Error and success feedback via useToast instead of injected HTML
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, KeyRound, Trash2, UserPlus, RefreshCw } from 'lucide-react';

import AppHeader                               from '@/components/layout/AppHeader';
import { Button, Badge, Modal, FormField, Spinner } from '@/components/ui';
import { useAsync }  from '@/hooks/useAsync';
import { useToast }  from '@/hooks/useToast';
import { useAuth }   from '@/hooks/useAuth';
import { usersApi }  from '@/api/users';
import { locationTypeImagesApi } from '@/api/locationTypeImages';
import { compressImage } from '@/components/map/compressImage';
import { SIZE_TYPE_KEYS, SIZE_TYPE_LABELS } from '@/components/map/pinIcons';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ROLES      = ['admin', 'dm', 'player'];
const NEXT_ROLE  = { admin: 'dm', dm: 'player', player: 'admin' };

/** Maps role → Badge variant */
const ROLE_VARIANT = { admin: 'danger', dm: 'gold', player: 'default' };

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Inline form for creating a new user */
function CreateUserForm({ onCreated }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'player' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password) {
      setError('Username and password are required.');
      return;
    }
    setSaving(true);
    try {
      await usersApi.create(form);
      toast(`User "${form.username}" created.`);
      setForm({ username: '', email: '', password: '', role: 'player' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  return (
    <section className="bg-surface2 border border-border rounded-sm p-4">
      <h2 className="font-display uppercase tracking-widest text-gold text-sm mb-4">
        Create User
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <FormField label="Username">
            <input
              type="text"
              value={form.username}
              onChange={set('username')}
              autoComplete="off"
              className={inputCls}
              required
            />
          </FormField>

          <FormField label="Email (optional)">
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="off"
              className={inputCls}
            />
          </FormField>

          <FormField label="Password">
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              className={inputCls}
              required
            />
          </FormField>

          <FormField label="Role">
            <select
              value={form.role}
              onChange={set('role')}
              className="hdr-sel w-full max-w-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </FormField>
        </div>

        {error && <p className="text-danger text-sm mb-3">{error}</p>}

        <Button type="submit" variant="accent" loading={saving}>
          <UserPlus size={13} className="inline mr-1.5" />
          Create User
        </Button>
      </form>
    </section>
  );
}

/** Confirmation modal for destructive / input actions */
function ActionModal({ open, onClose, title, children, onConfirm, confirmLabel = 'Confirm', confirmVariant = 'accent', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {children}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** The users table */
function UserTable({ users, currentUserId, onRoleChange, onResetPassword, onDelete }) {
  if (!users.length) {
    return (
      <p className="text-text-dim text-sm py-6 text-center font-body">No users found.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-body border-collapse">
        <thead>
          <tr className="border-b border-border">
            {['Username', 'Email', 'Role', 'Created', 'Actions'].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 font-display uppercase tracking-wider text-text-dim text-[0.6rem]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...users].sort((a, b) => (a.username || '').localeCompare(b.username || '')).map((u) => (
            <tr key={u.id} className="border-b border-border hover:bg-surface2 transition-colors">
              <td className="px-3 py-2.5 font-semibold text-text">
                {u.username}
                {u.id === currentUserId && (
                  <span className="ml-2 text-[0.55rem] text-text-muted font-display uppercase tracking-wider">(you)</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-text-dim">{u.email || '—'}</td>
              <td className="px-3 py-2.5">
                <Badge variant={ROLE_VARIANT[u.role] ?? 'default'}>
                  {u.role}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-text-dim">
                {new Date(u.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    variant="default"
                    onClick={() => onRoleChange(u)}
                    title={`Change role (currently ${u.role})`}
                    className="gap-1"
                  >
                    <Pencil size={11} className="inline" />
                    Role
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => onResetPassword(u)}
                    title="Reset password"
                  >
                    <KeyRound size={11} className="inline" />
                    Password
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => onDelete(u)}
                    disabled={u.id === currentUserId}
                    title={u.id === currentUserId ? "You can't delete yourself" : 'Delete user'}
                  >
                    <Trash2 size={11} className="inline" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Global default map-pin images by location size_type (admin-managed). */
function LocationTypeImagesEditor() {
  const { toast } = useToast();
  const [imgs, setImgs] = useState({});   // { size_type: dataUrl }
  const [busy, setBusy] = useState(null); // size_type currently uploading/clearing
  const fileRefs = useRef({});

  useEffect(() => { locationTypeImagesApi.getAll().then(setImgs).catch(() => {}); }, []);

  const upload = useCallback(async (key, file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('File exceeds 20 MB — use a smaller image', 'error'); return; }
    setBusy(key);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error('Could not read file'));
        r.onload = (e) => resolve(e.target.result);
        r.readAsDataURL(file);
      });
      const compressed = await compressImage(dataUrl, { maxDim: 256, maxBytes: 256 * 1024 });
      await locationTypeImagesApi.set(key, compressed);
      setImgs((p) => ({ ...p, [key]: compressed }));
      toast(`Default image set for “${SIZE_TYPE_LABELS[key] || key}”.`);
    } catch (e) { toast(e.message || 'Upload failed', 'error'); }
    finally { setBusy(null); }
  }, [toast]);

  const clear = useCallback(async (key) => {
    setBusy(key);
    try {
      await locationTypeImagesApi.set(key, null);
      setImgs((p) => { const n = { ...p }; delete n[key]; return n; });
      toast('Default image removed.');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  }, [toast]);

  return (
    <section className="bg-surface2 border border-border rounded-sm p-4">
      <h2 className="font-display uppercase tracking-widest text-gold text-sm mb-1">Location Pin Defaults</h2>
      <p className="text-text-dim text-xs mb-4">
        Default Journey-Map pin image per location <em>type</em>. Applies to every campaign; a location's
        own image (set in Manage Campaigns) overrides it, and types left empty use the built-in icon.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SIZE_TYPE_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-3 border border-border rounded-sm p-2 bg-surface">
            <div className="w-[48px] h-[48px] rounded-full border border-border2 bg-surface3 overflow-hidden flex items-center justify-center flex-shrink-0">
              {imgs[key]
                ? <img src={imgs[key]} alt={key} className="w-full h-full object-cover" />
                : <span className="text-text-muted text-[9px]">icon</span>}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-text text-xs font-body truncate">{SIZE_TYPE_LABELS[key] || key}</span>
              <div className="flex gap-1">
                <Button variant="default" loading={busy === key} onClick={() => fileRefs.current[key]?.click()}>Upload</Button>
                {imgs[key] && <Button variant="danger" onClick={() => clear(key)}>Clear</Button>}
              </div>
              <input
                ref={(el) => { fileRefs.current[key] = el; }}
                type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(key, f); }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function UserPanel() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  // ── Data ──────────────────────────────────────────────────
  const {
    data: users,
    loading,
    error,
    run: reload,
  } = useAsync(usersApi.list, { autoRun: true, deps: [] });

  // ── Modal state ───────────────────────────────────────────
  const [roleModal,   setRoleModal]   = useState(null);  // user object | null
  const [passModal,   setPassModal]   = useState(null);  // user object | null
  const [deleteModal, setDeleteModal] = useState(null);  // user object | null
  const [actionLoading, setActionLoading] = useState(false);

  // Password-reset form state
  const [newPassword, setNewPassword] = useState('');
  const [passError,   setPassError]   = useState('');

  // ── Handlers ──────────────────────────────────────────────
  const handleRoleChange = useCallback(async () => {
    if (!roleModal) return;
    const nextRole = NEXT_ROLE[roleModal.role];
    setActionLoading(true);
    try {
      await usersApi.updateRole(roleModal.id, nextRole);
      toast(`${roleModal.username} is now ${nextRole}.`);
      setRoleModal(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }, [roleModal, reload, toast]);

  const handleResetPassword = useCallback(async () => {
    if (!passModal) return;
    setPassError('');
    if (!newPassword) { setPassError('Enter a new password.'); return; }
    setActionLoading(true);
    try {
      await usersApi.updatePassword(passModal.id, newPassword);
      toast(`Password updated for ${passModal.username}.`);
      setPassModal(null);
      setNewPassword('');
    } catch (e) {
      setPassError(e.message);
    } finally {
      setActionLoading(false);
    }
  }, [passModal, newPassword, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      await usersApi.remove(deleteModal.id);
      toast(`User "${deleteModal.username}" deleted.`);
      setDeleteModal(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }, [deleteModal, reload, toast]);

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      <AppHeader icon="⚙️" name="User Management" />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">

          {/* Create user form */}
          <CreateUserForm onCreated={reload} />

          {/* Users table */}
          <section className="bg-surface2 border border-border rounded-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display uppercase tracking-widest text-gold text-sm">
                Users
              </h2>
              <Button variant="ghost" onClick={reload} title="Refresh">
                <RefreshCw size={13} className="inline mr-1" />
                Refresh
              </Button>
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}
            {error && (
              <p className="text-danger text-sm py-4 text-center">{error}</p>
            )}
            {!loading && !error && (
              <UserTable
                users={users ?? []}
                currentUserId={currentUser?.id}
                onRoleChange={setRoleModal}
                onResetPassword={(u) => { setPassModal(u); setNewPassword(''); setPassError(''); }}
                onDelete={setDeleteModal}
              />
            )}
          </section>

          {/* Global default location-pin images (admin) */}
          <LocationTypeImagesEditor />
        </div>
      </main>

      {/* ── Role-change modal ── */}
      <ActionModal
        open={!!roleModal}
        onClose={() => setRoleModal(null)}
        title="Change Role"
        onConfirm={handleRoleChange}
        confirmLabel={`Set to ${roleModal ? NEXT_ROLE[roleModal.role] : ''}`}
        loading={actionLoading}
      >
        {roleModal && (
          <p className="text-text-dim font-body text-sm">
            Change <strong className="text-text">{roleModal.username}</strong>'s role from{' '}
            <Badge variant={ROLE_VARIANT[roleModal.role]}>{roleModal.role}</Badge>
            {' → '}
            <Badge variant={ROLE_VARIANT[NEXT_ROLE[roleModal.role]]}>{NEXT_ROLE[roleModal.role]}</Badge>?
          </p>
        )}
      </ActionModal>

      {/* ── Password-reset modal ── */}
      <ActionModal
        open={!!passModal}
        onClose={() => { setPassModal(null); setNewPassword(''); setPassError(''); }}
        title="Reset Password"
        onConfirm={handleResetPassword}
        confirmLabel="Update Password"
        loading={actionLoading}
      >
        {passModal && (
          <div className="flex flex-col gap-3">
            <p className="text-text-dim font-body text-sm">
              Set a new password for <strong className="text-text">{passModal.username}</strong>.
            </p>
            <FormField label="New Password" error={passError}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                autoFocus
                autoComplete="new-password"
                className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
              />
            </FormField>
          </div>
        )}
      </ActionModal>

      {/* ── Delete modal ── */}
      <ActionModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete User"
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={actionLoading}
      >
        {deleteModal && (
          <p className="text-text-dim font-body text-sm">
            Permanently delete <strong className="text-text">{deleteModal.username}</strong>?
            This cannot be undone.
          </p>
        )}
      </ActionModal>
    </>
  );
}
