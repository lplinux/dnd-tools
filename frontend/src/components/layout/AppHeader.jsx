/**
 * components/layout/AppHeader.jsx
 *
 * Standard application header used by every page.
 *
 * Layout:
 *   [Icon + Name] | [module slot (children)] → [▦ Tools] [← Back] [▾ Account]
 *
 * The Tools menu lists every module this user can open, grouped as on the
 * home page, so moving between tools does not mean going back to the index.
 * Not shown on the home page itself, which is that list.
 *
 * The Account dropdown contains:
 *   - Username + role badge
 *   - Theme selector (Dark / Light / Slate swatches)
 *   - Change Password form
 *   - API tokens (opens a dialog — the dropdown is 260px and the panel is a
 *     form plus a list, so it would not fit and should not be cramped into
 *     a menu either)
 *   - Logout button
 *
 * Props:
 *   @param {string}        icon      - Emoji icon for the module
 *   @param {string}        name      - Module display name
 *   @param {string|false}  backHref  - URL for ← Back button. false = hide. Default "/"
 *   @param {boolean}       hideBack  - Hides the back button AND the Tools menu (home, share pages)
 *   @param {React.ReactNode} children - Module-specific controls (selects, buttons, etc.)
 */

import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, KeyRound, ArrowLeft, Terminal, LayoutGrid } from 'lucide-react';

import { useAuth }  from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Button, Badge, FormField, Modal } from '@/components/ui';
import ApiTokensPanel from '@/components/ApiTokensPanel';
import { groupsFor } from '@/data/modules';

/** Theme swatch button used inside the account dropdown */
function ThemeSwatch({ id, label, swatch, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(id)}
      title={label}
      className={[
        'flex flex-col items-center gap-1 flex-1 py-1.5 px-1 rounded-sm border transition-colors',
        active
          ? 'border-gold bg-surface3'
          : 'border-border2 bg-surface2 hover:border-[var(--gold-dim)]',
      ].join(' ')}
    >
      <span
        className="w-5 h-5 rounded-full border-2"
        style={{
          background: swatch,
          borderColor: active ? 'var(--gold)' : 'var(--border2)',
        }}
      />
      <span className="font-display uppercase text-[0.65rem] tracking-wider text-text-dim">
        {label}
      </span>
    </button>
  );
}

/** Account dropdown rendered as a floating panel */
function AccountMenu({ user, onClose, onOpenTokens }) {
  const { logout, changePassword } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const navigate = useNavigate();

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleLogout() {
    await logout();
    onClose();
    navigate('/');
  }

  async function handleChangePassword() {
    setPwErr('');
    setPwOk(false);
    if (!pw1) { setPwErr('Enter a new password.'); return; }
    // Mirrors PASSWORD_MIN in app.js, which does the enforcing — this only
    // saves a round trip to be told the same thing.
    if (pw1.length < 8) { setPwErr('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { setPwErr('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await changePassword(pw1);
      setPwOk(true);
      setPw1(''); setPw2('');
      setTimeout(() => setPwOk(false), 2500);
    } catch (e) {
      setPwErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute top-[calc(100%+6px)] right-0 z-50 bg-surface border border-border2 rounded-sm shadow-card min-w-[260px] flex flex-col gap-2 p-3">
      {/* Identity */}
      <div className="font-display uppercase tracking-wider text-gold text-[0.65rem] pb-2 border-b border-border flex items-center gap-2">
        👤 {user.username}
        <Badge variant="gold">{user.role}</Badge>
      </div>

      {/* Theme */}
      <div>
        <p className="font-display uppercase tracking-wider text-text-dim text-[0.65rem] mb-1.5">Theme</p>
        <div className="flex gap-1.5">
          {themes.map((t) => (
            <ThemeSwatch
              key={t.id}
              {...t}
              active={theme === t.id}
              onSelect={(id) => { setTheme(id); }}
            />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Change password */}
      <div className="flex flex-col gap-1.5">
        <FormField label="New Password">
          <input
            type="password"
            value={pw1}
            onChange={e => setPw1(e.target.value)}
            placeholder="New password — 8 characters or more…"
            autoComplete="new-password"
            className="w-full bg-surface2 border border-border2 text-text px-2 py-1 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
          />
        </FormField>
        <FormField label="Confirm Password">
          <input
            type="password"
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            placeholder="Confirm…"
            autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            className="w-full bg-surface2 border border-border2 text-text px-2 py-1 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
          />
        </FormField>
        {pwErr && <p className="text-[0.65rem] text-danger">{pwErr}</p>}
        {pwOk  && <p className="text-[0.65rem] text-green-400">✓ Password changed.</p>}
        <Button variant="default" loading={saving} onClick={handleChangePassword}>
          <KeyRound size={12} className="inline mr-1" />
          Change Password
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* API tokens. A dialog rather than more of this panel: it is a form
          and a list, and this menu is 260px wide. */}
      <Button variant="default" onClick={() => { onClose(); onOpenTokens(); }}>
        <Terminal size={12} className="inline mr-1" />
        API Tokens
      </Button>

      <div className="h-px bg-border" />

      {/* Logout */}
      <Button variant="danger" onClick={handleLogout}>
        <LogOut size={12} className="inline mr-1" />
        Logout
      </Button>
    </div>
  );
}

/** Every module this user can open, grouped as on the home page. */
function ToolsMenu({ user, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="absolute top-[calc(100%+6px)] right-0 z-50 bg-surface border border-border2 rounded-sm shadow-card min-w-[220px] max-h-[80vh] overflow-y-auto flex flex-col p-2">
      {groupsFor(user).map((g) => (
        <div key={g.id} className="flex flex-col py-1 first:pt-0">
          <p className="font-display uppercase tracking-wider text-text-muted text-[0.65rem] px-1.5 pb-1">{g.title}</p>
          {g.modules.map((m) => {
            const here = pathname === m.url;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => { onClose(); if (!here) navigate(m.url); }}
                aria-current={here ? 'page' : undefined}
                className={`flex items-center gap-2 text-left text-sm px-1.5 py-1 rounded-sm transition-colors
                            ${here ? 'text-gold bg-surface3' : 'text-text-dim hover:text-gold hover:bg-surface2'}`}
              >
                <span className="w-5 text-center">{m.icon}</span>
                {m.title}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function AppHeader({
  icon,
  name,
  backHref = '/',
  hideBack = false,
  children,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const wrapRef = useRef(null);

  function handleBack() {
    if (backHref === false) return;
    if (typeof backHref === 'string') navigate(backHref);
    else navigate('/');
  }

  return (
    <header className="bg-surface border-b-2 border-[var(--gold-dim)] px-3.5 py-1.5 flex items-center gap-2 flex-shrink-0 shadow-header flex-wrap relative z-10">
      {/* Left: icon + name */}
      {(icon || name) && (
        <>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {icon && <span className="text-base leading-none">{icon}</span>}
            {name && (
              <span className="font-display text-gold text-header whitespace-nowrap">
                {name}
              </span>
            )}
          </div>
          <div className="hdr-sep" />
        </>
      )}

      {/* Module slot */}
      <div className="flex items-center gap-2 flex-wrap flex-1">
        {children}
      </div>

      {/* Right: back + account */}
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        {!hideBack && (
          <div className="relative">
            <Button variant="default" onClick={() => setToolsOpen((o) => !o)} title="Go to another tool">
              <LayoutGrid size={12} className="inline mr-1" />
              Tools
            </Button>
            {toolsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                <ToolsMenu user={user} onClose={() => setToolsOpen(false)} />
              </>
            )}
          </div>
        )}
        {!hideBack && backHref !== false && (
          <Button variant="accent" onClick={handleBack}>
            <ArrowLeft size={12} className="inline mr-1" />
            Back
          </Button>
        )}

        {user ? (
          <div className="relative" ref={wrapRef}>
            <Button
              variant="default"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <ChevronDown size={12} className="inline mr-1" />
              Account
            </Button>
            {menuOpen && (
              <>
                {/* Click-away overlay */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <AccountMenu
                  user={user}
                  onClose={() => setMenuOpen(false)}
                  onOpenTokens={() => setTokensOpen(true)}
                />
              </>
            )}
          </div>
        ) : (
          /* Login button — navigates to home with ?login=1 so the modal auto-opens */
          <Button variant="accent" onClick={() => navigate('/?login=1')}>
            🔐 Login
          </Button>
        )}
      </div>

      {/* Account-level, so it hangs off the header rather than any one page.
          Mounted on every page but rendered only when open. */}
      <Modal
        open={tokensOpen}
        onClose={() => setTokensOpen(false)}
        title="🔑 API Tokens"
        className="max-w-2xl"
      >
        <ApiTokensPanel />
      </Modal>
    </header>
  );
}
