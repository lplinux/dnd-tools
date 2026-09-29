/**
 * pages/Home.jsx
 *
 * The landing page / module dashboard.
 *
 * - Shows all modules the current user can access as cards.
 * - Unauthenticated users see public modules + a Login button.
 * - Clicking the ℹ️ button fetches and renders the module's README.md.
 * - Login opens a modal; on success the module grid re-renders for the new role.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Info, ExternalLink } from 'lucide-react';

import AppHeader from '@/components/layout/AppHeader';
import { Button, Modal, Spinner, FormField } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { docsApi } from '@/api/docs';

// ─────────────────────────────────────────────────────────────────────────────
// Module definitions
// Keep in sync with the route declarations in App.jsx
// ─────────────────────────────────────────────────────────────────────────────
const MODULES = [
  {
    key: 'npc',
    icon: '🧙',
    title: 'NPC Sheet',
    desc: 'Create D&D 5e NPC stat blocks with automatic ability modifiers.',
    url: '/npc-sheet',
    access: 'public',
    docs: 'npc-sheet',
  },
  {
    key: 'items',
    icon: '🗡️',
    title: 'Item Cards',
    desc: 'Create magic item cards with rarities and special abilities.',
    url: '/item-cards',
    access: 'public',
    docs: 'item-cards',
  },
  {
    key: 'split',
    icon: '🪟',
    title: 'Split View',
    desc: 'View multiple tools side-by-side with custom layouts.',
    url: '/split-view',
    access: 'public',
    docs: 'split-view',
  },
  {
    key: 'timeline',
    icon: '📜',
    title: 'Timeline',
    desc: 'Track campaign events across multiple calendar systems.',
    url: '/timeline',
    access: ['dm', 'player'],
    docs: 'timeline',
  },
  {
    key: 'pdf',
    icon: '📖',
    title: 'PDF Viewer',
    desc: 'Access rulebooks and references with fullscreen support.',
    url: '/pdf-viewer',
    access: ['dm'],
    docs: 'pdf-viewer',
  },
  {
    key: 'pcsheet',
    icon: '🧝',
    title: 'PC Character Sheet',
    desc: 'Manage your player character — story, traits, relationships, and private notes.',
    url: '/pc-sheet',
    access: ['dm', 'player'],
    docs: 'pc-sheet',
  },
  {
    key: 'campaigns',
    icon: '🏰',
    title: 'Manage Campaigns',
    desc: 'Create and manage campaigns, players, and assignments.',
    url: '/manage-campaigns',
    access: ['dm'],
    docs: 'manage-campaigns',
  },
  {
    key: 'journeymap',
    icon: '🗺️',
    title: 'Journey Path Map',
    desc: 'Draw party routes on a map. Track groups, set distances and see travel times.',
    url: '/journey-map',
    access: ['dm'],
    docs: 'journey-map',
  },
  {
    key: 'userpanel',
    icon: '⚙️',
    title: 'User Panel',
    desc: 'Admin panel to manage users, roles, and permissions.',
    url: '/user-panel',
    access: ['admin'],
    docs: 'user-panel',
  },
];

/** Returns true if the module is accessible to the given user (or null = guest). */
function canAccess(mod, user) {
  if (mod.access === 'public') return true;
  if (!user) return false;
  if (Array.isArray(mod.access)) return mod.access.includes(user.role);
  return mod.access.split(',').includes(user.role);
}

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

  /** Very basic markdown → HTML: headings, bold, code, lists */
  function renderMd(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const html = escaped
      .replace(/^### (.+)$/gm, '<h3 class="font-display text-gold text-sm uppercase tracking-wider mt-4 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="font-display text-gold text-base uppercase tracking-wider mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="font-display text-gold text-lg uppercase tracking-wider mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text">$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-surface3 px-1 rounded text-xs font-mono text-[var(--special-fg)]">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-text-dim">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-text-dim">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/^/, '<p class="mb-2">')
      .replace(/$/, '</p>');

    return html;
  }

  return (
    <Modal open onClose={onClose} title={`${mod.icon} ${mod.title}`} className="max-w-lg">
      {loading && <div className="flex justify-center py-8"><Spinner /></div>}
      {err     && <p className="text-danger text-sm">{err}</p>}
      {md      && (
        <div
          className="text-text-dim text-sm leading-relaxed font-body"
          dangerouslySetInnerHTML={{ __html: renderMd(md) }}
        />
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoginModal
// ─────────────────────────────────────────────────────────────────────────────
function LoginModal({ onClose }) {
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
      onClose();
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
        <button
          onClick={() => onInfo(mod)}
          className="text-text-muted hover:text-gold transition-colors"
          title="Documentation"
          aria-label={`Info about ${mod.title}`}
        >
          <Info size={15} />
        </button>
      </div>

      {/* Description */}
      <p className="px-4 pb-3 text-text-dim font-body text-sm flex-1 leading-relaxed">
        {mod.desc}
      </p>

      {/* Access badge */}
      <div className="px-4 pb-3">
        {mod.access === 'public' ? (
          <span className="text-[0.6rem] font-display uppercase tracking-wider text-text-muted border border-border px-1.5 py-0.5 rounded-sm">
            🔓 Public
          </span>
        ) : (
          <span className="text-[0.6rem] font-display uppercase tracking-wider text-text-muted border border-border px-1.5 py-0.5 rounded-sm">
            🔐 {Array.isArray(mod.access) ? mod.access.join(' / ') : mod.access}
          </span>
        )}
      </div>

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
// Home page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loginOpen, setLoginOpen] = useState(false);
  const [docsModule, setDocsModule] = useState(null);

  // Auto-open login modal when navigated here with ?login=1
  // (triggered by the Login button in AppHeader on other pages)
  useEffect(() => {
    if (searchParams.get('login') === '1') {
      setLoginOpen(true);
      // Clean the param from the URL without a page reload
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const visibleModules = MODULES.filter((m) => canAccess(m, user));

  return (
    <>
      {/* Standard header — no back button on home; AppHeader shows the Login button when unauthenticated */}
      <AppHeader icon="🎲" name="D&D Tools" hideBack />

      {/* Module grid */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((mod) => (
            <ModuleCard key={mod.key} mod={mod} onInfo={setDocsModule} />
          ))}
        </div>
      </main>

      {/* Modals */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {docsModule && <DocsModal mod={docsModule} onClose={() => setDocsModule(null)} />}
    </>
  );
}
