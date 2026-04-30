/**
 * header-component.js
 * - User menu (name, role, change password, logout)
 * - Theme switcher (dark / light / slate)
 * - Floating back button (bottom-right)
 * Call: initHeaderComponent(mountId, { backHref, hideBack })
 */

(function () {
  /* ── Themes ── */
  const THEMES = [
    { id: 'dark', label: '◐', title: 'Dark' },
    { id: 'light', label: '◯', title: 'Light' },
    { id: 'slate', label: '◭', title: 'Slate' },
  ];

  function getTheme() { return localStorage.getItem('hc-theme') || 'dark'; }
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('hc-theme', t); }

  /* ── Styles ── */
  const CSS = `
    .hc-wrap { display:flex; align-items:center; gap:8px; position:relative; }

    /* Theme switcher */
    .hc-theme-sw { display:flex; gap:3px; align-items:center; }
    .hc-theme-btn {
      width:18px; height:18px; border-radius:50%;
      border:2px solid transparent; cursor:pointer;
      transition:border-color .15s, transform .1s; flex-shrink:0;
      padding:0; background:none;
    }
    .hc-theme-btn:hover { transform:scale(1.25); }
    .hc-theme-btn.act   { border-color:var(--gold,#c9a84c) !important; }
    .hc-theme-btn[data-t="dark"]  { background:#272015; border-color:#554428; }
    .hc-theme-btn[data-t="light"] { background:#f0ece0; border-color:#b8a888; }
    .hc-theme-btn[data-t="slate"] { background:#1c2128; border-color:#444c56; }

    /* Account button & dropdown */
    .hc-btn {
      background:var(--surface2,#272015); border:1px solid var(--border2,#554428);
      color:var(--text,#e8dcc0); padding:5px 11px; border-radius:2px; cursor:pointer;
      font-family:var(--fd,'Cinzel','Georgia',serif); font-size:.65rem;
      letter-spacing:.05em; text-transform:uppercase; transition:background .15s; white-space:nowrap;
    }
    .hc-btn:hover { background:var(--gold-dim,#7a6030); }
    .hc-btn.danger { border-color:#8b3a3a; }
    .hc-btn.danger:hover { background:#8b3a3a; }

    .hc-menu {
      position:absolute; top:calc(100% + 6px); right:0; z-index:500;
      background:var(--surface,#1e1810); border:1px solid var(--border2,#554428);
      border-radius:2px; min-width:240px; box-shadow:0 4px 20px rgba(0,0,0,.6);
      display:none; flex-direction:column; padding:8px; gap:6px;
    }
    .hc-menu.open { display:flex; }
    .hc-menu-title {
      font-family:var(--fd,'Cinzel','Georgia',serif); font-size:.65rem;
      letter-spacing:.08em; text-transform:uppercase; color:var(--gold,#c9a84c);
      padding:2px 4px 6px; border-bottom:1px solid var(--border,#3d3220); margin-bottom:2px;
    }
    .hc-role {
      font-size:10px; font-family:var(--fd,'Cinzel','Georgia',serif);
      letter-spacing:.06em; text-transform:uppercase;
      background:var(--gold-dim,#7a6030); color:var(--text,#e8dcc0);
      padding:2px 7px; border-radius:2px; margin-left:6px;
    }
    .hc-menu label {
      font-size:.65rem; font-family:var(--fd,'Cinzel','Georgia',serif);
      letter-spacing:.05em; color:var(--text-dim,#a09070); text-transform:uppercase;
      display:block; margin-bottom:2px;
    }
    /* KEY FIX: stop click inside .hc-menu from propagating to document
       so typing in inputs doesn't close the dropdown */
    .hc-menu input {
      width:100%; background:var(--surface2,#272015); border:1px solid var(--border2,#554428);
      color:var(--text,#e8dcc0); padding:5px 7px; border-radius:2px;
      font-size:13px; font-family:inherit;
    }
    .hc-menu input:focus { outline:none; border-color:var(--gold-dim,#7a6030); }
    .hc-msg { font-size:11px; padding:3px 4px; border-radius:2px; display:none; }
    .hc-msg.ok  { background:#1f3d1a; color:#9fd49f; display:block; }
    .hc-msg.err { background:#3d1f1f; color:#d49f9f; display:block; }

    /* Floating back button */
    .hc-back-fab {
      position:fixed; bottom:20px; right:20px; z-index:400;
      background:var(--gold-dim,#7a6030); color:var(--text,#e8dcc0);
      border:none; border-radius:50%; width:46px; height:46px;
      font-size:18px; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex; align-items:center; justify-content:center;
      transition:background .15s, transform .1s;
      font-family:sans-serif; line-height:1;
    }
    .hc-back-fab:hover { background:var(--gold,#c9a84c); color:var(--bg,#13100b); transform:scale(1.08); }
    .hc-back-fab title { display:none; }
  `;

  function injectStyles() {
    if (document.getElementById('hc-styles')) return;
    const s = document.createElement('style');
    s.id = 'hc-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Build theme switcher ── */
  function buildThemeSw() {
    const wrap = document.createElement('div');
    wrap.className = 'hc-theme-sw';
    const cur = getTheme();
    THEMES.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'hc-theme-btn' + (t.id === cur ? ' act' : '');
      btn.dataset.t = t.id;
      btn.title = t.title;
      btn.textContent = t.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTheme(t.id);
        wrap.querySelectorAll('.hc-theme-btn').forEach(b => b.classList.toggle('act', b.dataset.t === t.id));
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  /* ── Build account widget ── */
  function buildWidget(user) {
    const wrap = document.createElement('div');
    wrap.className = 'hc-wrap';
    wrap.id = 'hc-root';

    const btn = document.createElement('button');
    btn.className = 'hc-btn';
    btn.id = 'hc-menu-btn';
    btn.textContent = '▾ Account';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('hc-menu');
      if (menu) menu.classList.toggle('open');
    });

    const menu = document.createElement('div');
    menu.className = 'hc-menu';
    menu.id = 'hc-menu';

    // KEY FIX: stop ALL clicks inside the menu from bubbling to document
    // so the "close on outside click" handler never fires while inside
    menu.addEventListener('click', (e) => e.stopPropagation());

    menu.innerHTML = `
      <div class="hc-menu-title">👤 ${esc(user.username)}<span class="hc-role">${esc(user.role)}</span></div>
      <div>
        <label>New Password</label>
        <input type="password" id="hc-pw1" placeholder="New password…" autocomplete="new-password">
      </div>
      <div>
        <label>Confirm Password</label>
        <input type="password" id="hc-pw2" placeholder="Confirm…" autocomplete="new-password">
      </div>
      <div id="hc-pw-msg" class="hc-msg"></div>
      <button class="hc-btn" id="hc-chpw-btn">🔑 Change Password</button>
      <button class="hc-btn danger" id="hc-logout-btn">⏻ Logout</button>
    `;

    menu.querySelector('#hc-chpw-btn').addEventListener('click', hcChangePassword);
    menu.querySelector('#hc-logout-btn').addEventListener('click', hcLogout);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  /* ── Global handlers ── */
  async function hcChangePassword() {
    const pw1 = document.getElementById('hc-pw1').value;
    const pw2 = document.getElementById('hc-pw2').value;
    const msg = document.getElementById('hc-pw-msg');
    msg.className = 'hc-msg';
    if (!pw1) { msg.textContent = 'Enter a new password.'; msg.className = 'hc-msg err'; return; }
    if (pw1 !== pw2) { msg.textContent = 'Passwords do not match.'; msg.className = 'hc-msg err'; return; }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw1 })
      });
      const data = await res.json();
      if (res.ok) {
        msg.textContent = '✓ Password changed.'; msg.className = 'hc-msg ok';
        document.getElementById('hc-pw1').value = '';
        document.getElementById('hc-pw2').value = '';
        setTimeout(() => msg.className = 'hc-msg', 2500);
      } else {
        msg.textContent = data.error || 'Error changing password.'; msg.className = 'hc-msg err';
      }
    } catch (e) { msg.textContent = e.message; msg.className = 'hc-msg err'; }
  }
  // Expose for legacy inline onclick calls (some pages still use hcChangePassword())
  window.hcChangePassword = hcChangePassword;

  async function hcLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  }
  window.hcLogout = hcLogout;

  // Keep for backward compatibility
  window.hcToggleMenu = function (e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('hc-menu');
    if (m) m.classList.toggle('open');
  };

  /* ── Close menu on outside click ── */
  document.addEventListener('click', () => {
    const m = document.getElementById('hc-menu');
    if (m) m.classList.remove('open');
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', (e) => {
    // Enter in pw fields → change password
    if (e.key === 'Enter' && (e.target.id === 'hc-pw1' || e.target.id === 'hc-pw2')) {
      hcChangePassword();
    }
    // Esc → close menu
    if (e.key === 'Escape') {
      const m = document.getElementById('hc-menu');
      if (m) m.classList.remove('open');
    }
  });

  /* ── Floating back button ── */
  function injectBackButton(href) {
    if (href === false) return; // explicitly disabled
    const target = href || '/';
    const fab = document.createElement('button');
    fab.className = 'hc-back-fab';
    fab.title = 'Back to Home';
    fab.innerHTML = '⌂';
    fab.addEventListener('click', () => location.href = target);
    document.body.appendChild(fab);
  }

  /* ── Main init ── */
  window.initHeaderComponent = async function (mountId, opts = {}) {
    injectStyles();

    // Apply saved theme immediately
    applyTheme(getTheme());

    try {
      const res = await fetch('/api/auth/user');
      const data = await res.json();

      const mount = document.getElementById(mountId || 'userMenuMount');
      if (!mount) return null;

      // Always inject theme switcher
      // mount.appendChild(buildThemeSw());

      if (data.user) {
        mount.appendChild(buildWidget(data.user));
        if (!opts.hideBack) injectBackButton(opts.backHref);
        return data.user;
      } else {
        // Not logged in — show login link
        const a = document.createElement('a');
        a.href = '/';
        a.style.cssText = 'color:var(--gold-dim,#7a6030);font-family:var(--fd,"Cinzel","Georgia",serif);font-size:.65rem;letter-spacing:.06em;text-decoration:none;';
        a.textContent = 'Login →';
        mount.appendChild(a);
        if (!opts.hideBack) injectBackButton(opts.backHref);
        return null;
      }
    } catch (e) {
      console.warn('header-component: could not load user', e);
      return null;
    }
  };
})();
