/**
 * pages/Home.jsx
 *
 * The landing page / module dashboard.
 *
 * - Shows the modules the current user can access as cards, grouped by who
 *   they are for (DM, players, public, admin) — see data/modules.js.
 * - Each group folds away, and stays folded on this browser.
 * - Unauthenticated users see public modules + a Login button.
 * - Clicking the ℹ️ button fetches and renders the module's README.md.
 * - Login opens a modal; on success the module grid re-renders for the new role.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Info, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

import AppHeader from '@/components/layout/AppHeader';
import { Button, Modal, Spinner, FormField, Markdown } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { docsApi } from '@/api/docs';
import { safeNext } from '@/api/returnTo';
import { groupsFor } from '@/data/modules';

// ─────────────────────────────────────────────────────────────────────────────
// DocsModal
// ─────────────────────────────────────────────────────────────────────────────
function DocsModal({ mod, onClose }) {
  const [md, setMd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Fetch README on mount
  useEffect(() => {
    docsApi.getReadme(mod.docs)
      .then(text => { setMd(text); setLoading(false); })
      .catch(e  => { setErr(e.message); setLoading(false); });
  }, [mod.docs]);

  return (
    <Modal open onClose={onClose} title={`${mod.icon} ${mod.title}`} className="max-w-lg">
      {loading && <div className="flex justify-center py-8"><Spinner /></div>}
      {err     && <p className="text-danger text-sm">{err}</p>}
      {md      && (
        <Markdown className="text-text-dim text-sm leading-relaxed font-body">{md}</Markdown>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoginModal
// ─────────────────────────────────────────────────────────────────────────────
function LoginModal({ onClose, onLoggedIn }) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password, rememberMe);
      // Explicitly ask the browser's password manager to save these credentials.
      // SPA logins submit via fetch with no navigation, so Chrome's automatic
      // "save password?" heuristic often never fires — this prompts it directly.
      try {
        if (window.PasswordCredential && navigator.credentials?.store) {
          await navigator.credentials.store(
            new window.PasswordCredential({ id: username, password, name: username }),
          );
        }
      } catch { /* unsupported or user declined — ignore */ }
      toast('Logged in!');
      onLoggedIn ? onLoggedIn() : onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="🔐 Login">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField label="Username">
          <input
            type="text"
            name="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
          />
        </FormField>
        <FormField label="Password">
          <input
            type="password"
            name="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-text-dim select-none cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="accent-[var(--gold)]"
          />
          Remember me on this device
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button variant="accent" loading={loading} type="submit" className="mt-1">
          Login
        </Button>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCard
// ─────────────────────────────────────────────────────────────────────────────
function ModuleCard({ mod, onInfo }) {
  const navigate = useNavigate();

  return (
    <div className="bg-surface2 border border-border rounded-sm flex flex-col shadow-card hover:border-[var(--gold-dim)] transition-colors">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{mod.icon}</span>
          <h3 className="font-display uppercase tracking-wider text-gold text-sm">
            {mod.title}
          </h3>
        </div>
        {mod.docs && (
          <button
            onClick={() => onInfo(mod)}
            className="text-text-muted hover:text-gold transition-colors"
            title="Documentation"
            aria-label={`Info about ${mod.title}`}
          >
            <Info size={15} />
          </button>
        )}
      </div>

      {/* Description */}
      <p className="px-4 pb-3 text-text-dim font-body text-sm flex-1 leading-relaxed">
        {mod.desc}
      </p>

      {/* Open button */}
      <div className="px-4 pb-4">
        <Button variant="accent" onClick={() => navigate(mod.url)} className="flex items-center gap-1">
          <ExternalLink size={12} />
          Open
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folded groups — a convenience, so per browser and allowed to be missing
// ─────────────────────────────────────────────────────────────────────────────
const FOLDED_KEY = 'home-folded-groups';

function readFolded() {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Home page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loginOpen, setLoginOpen] = useState(false);
  const [docsModule, setDocsModule] = useState(null);
  // Where to go once they are in. Held in state rather than read back from the
  // URL at login time, because the effect below strips the params immediately.
  const [afterLogin, setAfterLogin] = useState(null);

  // Auto-open login modal when navigated here with ?login=1
  // (triggered by the Login button in AppHeader, and by a share page that
  // needs the visitor logged in before it can show them anything).
  useEffect(() => {
    if (searchParams.get('login') === '1') {
      setLoginOpen(true);
      // Validated, never trusted: `next` arrives in a URL anyone can write,
      // and an unchecked one turns this page into an open redirect.
      setAfterLogin(safeNext(searchParams.get('next')));
      // Clean the params from the URL without a page reload
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /**
   * Back to whatever sent them here. `replace`, so Back does not bounce them
   * through the login screen again.
   */
  function handleLoggedIn() {
    setLoginOpen(false);
    if (afterLogin) {
      const to = afterLogin;
      setAfterLogin(null);
      navigate(to, { replace: true });
    }
  }

  const groups = groupsFor(user);
  const [folded, setFolded] = useState(readFolded);
  function toggleGroup(id) {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* private window */ }
      return next;
    });
  }

  return (
    <>
      {/* Standard header — no back button on home; AppHeader shows the Login button when unauthenticated */}
      <AppHeader icon="🎲" name="D&D Tools" hideBack />

      {/* Module grid */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          {groups.map((g) => {
            // A guest has one group; a heading that folds it away would only
            // hide the whole page.
            const foldable = groups.length > 1;
            const open = !foldable || !folded.has(g.id);
            return (
              <section key={g.id} className="flex flex-col gap-3">
                {foldable && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={open}
                    className="flex items-baseline gap-2 text-left border-b border-[var(--gold-dim)] pb-1 group"
                  >
                    <span className="text-text-muted group-hover:text-gold self-center">
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <h2 className="font-display uppercase tracking-widest text-gold text-sm">{g.title}</h2>
                    <span className="text-text-muted text-xs font-body">
                      {open ? g.blurb : `${g.modules.length} tool${g.modules.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                )}
                {open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {g.modules.map((mod) => (
                      <ModuleCard key={mod.key} mod={mod} onInfo={setDocsModule} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* Modals */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLoggedIn={handleLoggedIn} />}
      {docsModule && <DocsModal mod={docsModule} onClose={() => setDocsModule(null)} />}
    </>
  );
}
