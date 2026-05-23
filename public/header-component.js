/**
 * header-component.js — D&D Campaign Tools
 *
 * Provides a standard application header for every module:
 *
 *   [Icon] [Module Name]  |  [Module-specific slot]  →  [← Back] [▾ Account ▾]
 *
 * The Account menu contains:
 *   - Username + role badge
 *   - Theme selector (Dark / Light / Slate)
 *   - Change Password form
 *   - Logout button
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY API
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   initAppHeader(options)
 *
 *   options = {
 *     // Required: the element that wraps the header (class or id selector,
 *     // or the element itself).  Defaults to '.app-header'.
 *     headerEl:  '.app-header',
 *
 *     // Module icon (emoji or short string) prepended to the title.
 *     // If omitted the existing .app-title / .app-header__icon text is kept.
 *     icon:  '🗺️',
 *
 *     // Module name shown after the icon.
 *     // If omitted the existing .app-title / .app-header__name text is kept.
 *     name:  'Journey Path Map',
 *
 *     // href for the ← Back button. Defaults to '/'.
 *     // Set to false to hide the button entirely.
 *     backHref: '/',
 *
 *     // Explicitly hide the back button (same as backHref: false).
 *     hideBack: false,
 *   }
 *
 *   Returns a Promise<user|null>.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODULE SLOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Any element inside .app-header that is NOT the left section or the right
 * section is considered "module-specific content" and is wrapped in
 * .app-header__module automatically.
 *
 * The simplest pattern in HTML:
 *
 *   <div class="app-header">
 *     <!-- your module controls go here -->
 *     <select id="campaignSel">...</select>
 *     <button class="hdr-btn" onclick="newMap()">+ New Map</button>
 *   </div>
 *
 * initAppHeader() then prepends the [icon][name][sep] and appends [back][account].
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LEGACY API  (backward-compatible)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   initHeaderComponent(mountId, { backHref, hideBack })
 *
 * This still works for pages not yet refactored to initAppHeader().
 * It mounts only the account widget + back FAB into #mountId (old behaviour).
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     THEMES
  ══════════════════════════════════════════════ */
  const THEMES = [
    { id: 'dark', label: '◐', title: 'Dark', swatch: '#272015' },
    { id: 'light', label: '◯', title: 'Light', swatch: '#f0ece0' },
    { id: 'slate', label: '◭', title: 'Slate', swatch: '#1c2128' },
  ];

  function getTheme() { return localStorage.getItem('hc-theme') || 'dark'; }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('hc-theme', t);
  }

  /* ══════════════════════════════════════════════
     SCOPED STYLES  (only header-component internals)
     Shared layout styles live in app.css.
  ══════════════════════════════════════════════ */
  const COMPONENT_CSS = `
    /* ── Account button ── */
    .hc-btn {
      background: var(--surface2);
      border: 1px solid var(--border2);
      color: var(--text);
      padding: 5px 11px;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      font-size: .65rem;
      letter-spacing: .05em;
      text-transform: uppercase;
      transition: background .15s;
      white-space: nowrap;
    }
    .hc-btn:hover { background: var(--gold-dim, #7a6030); }
    .hc-btn.danger { border-color: var(--red, #8b3a3a); }
    .hc-btn.danger:hover { background: var(--red, #8b3a3a); }

    /* ── Dropdown wrapper ── */
    .hc-wrap { display: flex; align-items: center; gap: 8px; position: relative; }

    /* ── Dropdown menu ── */
    .hc-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 500;
      background: var(--surface, #1e1810);
      border: 1px solid var(--border2, #554428);
      border-radius: 2px;
      min-width: 260px;
      box-shadow: 0 4px 20px rgba(0,0,0,.6);
      display: none;
      flex-direction: column;
      padding: 10px;
      gap: 8px;
    }
    .hc-menu.open { display: flex; }

    .hc-menu-title {
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      font-size: .65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--gold, #c9a84c);
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border, #3d3220);
    }
    .hc-role {
      font-size: 10px;
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      letter-spacing: .06em;
      text-transform: uppercase;
      background: var(--gold-dim, #7a6030);
      color: var(--text, #e8dcc0);
      padding: 2px 7px;
      border-radius: 2px;
      margin-left: 7px;
    }

    /* ── Theme section inside menu ── */
    .hc-section-label {
      font-size: .6rem;
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      letter-spacing: .06em;
      color: var(--text-dim, #a09070);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .hc-theme-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .hc-theme-opt {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      flex: 1;
      padding: 5px 4px;
      border-radius: 2px;
      border: 1px solid var(--border2, #554428);
      background: var(--surface2, #272015);
      transition: border-color .15s, background .15s;
    }
    .hc-theme-opt:hover { border-color: var(--gold-dim, #7a6030); }
    .hc-theme-opt.act   { border-color: var(--gold, #c9a84c); background: var(--surface3, #30281a); }
    .hc-theme-swatch {
      width: 20px; height: 20px;
      border-radius: 50%;
      border: 2px solid var(--border2, #554428);
      flex-shrink: 0;
    }
    .hc-theme-opt.act .hc-theme-swatch { border-color: var(--gold, #c9a84c); }
    .hc-theme-lbl {
      font-size: .55rem;
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      letter-spacing: .05em;
      color: var(--text-dim, #a09070);
      text-transform: uppercase;
    }
    .hc-theme-opt.act .hc-theme-lbl { color: var(--gold, #c9a84c); }

    /* ── Password section ── */
    .hc-menu label {
      font-size: .6rem;
      font-family: var(--fd, 'Cinzel', 'Georgia', serif);
      letter-spacing: .05em;
      color: var(--text-dim, #a09070);
      text-transform: uppercase;
      display: block;
      margin-bottom: 3px;
    }
    .hc-menu input {
      width: 100%;
      background: var(--surface2, #272015);
      border: 1px solid var(--border2, #554428);
      color: var(--text, #e8dcc0);
      padding: 5px 8px;
      border-radius: 2px;
      font-size: 13px;
      font-family: inherit;
    }
    .hc-menu input:focus { outline: none; border-color: var(--gold-dim, #7a6030); }

    .hc-divider {
      height: 1px;
      background: var(--border, #3d3220);
    }

    .hc-msg { font-size: 11px; padding: 4px 6px; border-radius: 2px; display: none; }
    .hc-msg.ok  { background: #1f3d1a; color: #9fd49f; display: block; }
    .hc-msg.err { background: #3d1f1f; color: #d49f9f; display: block; }
  `;

  function injectStyles() {
    if (document.getElementById('hc-styles')) return;
    const s = document.createElement('style');
    s.id = 'hc-styles';
    s.textContent = COMPONENT_CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ══════════════════════════════════════════════
     BUILD: Theme selector (row of swatches)
  ══════════════════════════════════════════════ */
  function buildThemeSection() {
    const wrap = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'hc-section-label';
    label.textContent = 'Theme';
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.className = 'hc-theme-row';
    wrap.appendChild(row);

    const cur = getTheme();
    THEMES.forEach(t => {
      const opt = document.createElement('button');
      opt.className = 'hc-theme-opt' + (t.id === cur ? ' act' : '');
      opt.dataset.t = t.id;
      opt.title = t.title;

      const sw = document.createElement('div');
      sw.className = 'hc-theme-swatch';
      sw.style.background = t.swatch;

      const lbl = document.createElement('span');
      lbl.className = 'hc-theme-lbl';
      lbl.textContent = t.title;

      opt.appendChild(sw);
      opt.appendChild(lbl);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTheme(t.id);
        row.querySelectorAll('.hc-theme-opt').forEach(b => {
          b.classList.toggle('act', b.dataset.t === t.id);
        });
      });
      row.appendChild(opt);
    });

    return wrap;
  }

  /* ══════════════════════════════════════════════
     BUILD: Account widget (button + dropdown)
  ══════════════════════════════════════════════ */
  function buildAccountWidget(user) {
    const wrap = document.createElement('div');
    wrap.className = 'hc-wrap';
    wrap.id = 'hc-root';

    /* ── Trigger button ── */
    const btn = document.createElement('button');
    btn.className = 'hc-btn';
    btn.id = 'hc-menu-btn';
    btn.textContent = '▾ Account';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('hc-menu');
      if (menu) menu.classList.toggle('open');
    });

    /* ── Dropdown ── */
    const menu = document.createElement('div');
    menu.className = 'hc-menu';
    menu.id = 'hc-menu';

    // Prevent clicks inside from bubbling up to the document close handler
    menu.addEventListener('click', (e) => e.stopPropagation());

    /* Header row */
    const titleRow = document.createElement('div');
    titleRow.className = 'hc-menu-title';
    titleRow.innerHTML = `👤 ${esc(user.username)}<span class="hc-role">${esc(user.role)}</span>`;
    menu.appendChild(titleRow);

    /* Theme section */
    menu.appendChild(buildThemeSection());

    /* Divider */
    const div1 = document.createElement('div');
    div1.className = 'hc-divider';
    menu.appendChild(div1);

    /* Password fields */
    const pwSection = document.createElement('div');
    pwSection.style.display = 'flex';
    pwSection.style.flexDirection = 'column';
    pwSection.style.gap = '6px';
    pwSection.innerHTML = `
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
    `;
    menu.appendChild(pwSection);

    /* Divider */
    const div2 = document.createElement('div');
    div2.className = 'hc-divider';
    menu.appendChild(div2);

    /* Logout */
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'hc-btn danger';
    logoutBtn.id = 'hc-logout-btn';
    logoutBtn.textContent = '⏻ Logout';
    logoutBtn.addEventListener('click', hcLogout);
    menu.appendChild(logoutBtn);

    /* Wire up change-password */
    menu.querySelector('#hc-chpw-btn').addEventListener('click', hcChangePassword);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  /* ══════════════════════════════════════════════
     BUILD: Not-logged-in fallback
  ══════════════════════════════════════════════ */
  function buildLoginLink(onClick) {
    const btn = document.createElement('button');
    btn.className = 'hdr-btn accent';
    btn.id = 'hc-login-btn';
    btn.textContent = '🔐 Login';
    if (typeof onClick === 'function') {
      btn.addEventListener('click', onClick);
    } else {
      btn.addEventListener('click', () => { location.href = '/'; });
    }
    return btn;
  }

  /* ══════════════════════════════════════════════
     GLOBAL HANDLERS
  ══════════════════════════════════════════════ */
  async function hcChangePassword() {
    const pw1 = document.getElementById('hc-pw1').value;
    const pw2 = document.getElementById('hc-pw2').value;
    const msg = document.getElementById('hc-pw-msg');
    msg.className = 'hc-msg';
    if (!pw1) { msg.textContent = 'Enter a new password.'; msg.className = 'hc-msg err'; return; }
    if (pw1 !== pw2) { msg.textContent = 'Passwords do not match.'; msg.className = 'hc-msg err'; return; }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw1 }),
      });
      const data = await res.json();
      if (res.ok) {
        msg.textContent = '✓ Password changed.';
        msg.className = 'hc-msg ok';
        document.getElementById('hc-pw1').value = '';
        document.getElementById('hc-pw2').value = '';
        setTimeout(() => { msg.className = 'hc-msg'; }, 2500);
      } else {
        msg.textContent = data.error || 'Error changing password.';
        msg.className = 'hc-msg err';
      }
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'hc-msg err';
    }
  }
  window.hcChangePassword = hcChangePassword;

  async function hcLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  }
  window.hcLogout = hcLogout;

  window.hcToggleMenu = function (e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('hc-menu');
    if (m) m.classList.toggle('open');
  };

  /* Close on outside click */
  document.addEventListener('click', () => {
    const m = document.getElementById('hc-menu');
    if (m) m.classList.remove('open');
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.id === 'hc-pw1' || e.target.id === 'hc-pw2')) {
      hcChangePassword();
    }
    if (e.key === 'Escape') {
      const m = document.getElementById('hc-menu');
      if (m) m.classList.remove('open');
    }
  });

  /* ══════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════ */

  /** Build the [icon][name] left section element */
  function buildLeftSection(icon, name) {
    const left = document.createElement('div');
    left.className = 'app-header__left';
    left.id = 'hc-left';

    if (icon) {
      const ic = document.createElement('span');
      ic.className = 'app-header__icon';
      ic.textContent = icon;
      left.appendChild(ic);
    }

    if (name) {
      const nm = document.createElement('span');
      nm.className = 'app-header__name';
      nm.textContent = name;
      left.appendChild(nm);
    }

    return left;
  }

  /** Build separator */
  function buildSep() {
    const sep = document.createElement('div');
    sep.className = 'hdr-sep';
    return sep;
  }

  /** Build the right section (back + account) */
  function buildRightSection(user, backHref, hideBack, loginClick) {
    const right = document.createElement('div');
    right.className = 'app-header__right';
    right.id = 'hc-right';

    // Back button
    if (!hideBack && backHref !== false) {
      const back = document.createElement('button');
      back.className = 'back-btn';
      back.textContent = '← Back';
      back.addEventListener('click', () => { location.href = backHref || '/'; });
      right.appendChild(back);
    }

    // Account widget or login button
    if (user) {
      right.appendChild(buildAccountWidget(user));
    } else {
      right.appendChild(buildLoginLink(loginClick));
    }

    return right;
  }

  /* ══════════════════════════════════════════════
     PRIMARY API — initAppHeader(opts)
  ══════════════════════════════════════════════ */
  /**
   * Enhances an existing .app-header element with the standard left and right
   * sections, leaving module-specific inner content in place (wrapped in
   * .app-header__module for consistent flex layout).
   *
   * @param {Object} opts
   * @param {string|Element} [opts.headerEl='.app-header'] - selector or element
   * @param {string}  [opts.icon]       - emoji / short string for the module icon
   * @param {string}  [opts.name]       - module display name
   * @param {string}  [opts.backHref='/'] - href for the ← Back button
   * @param {boolean} [opts.hideBack=false]
   * @param {Function} [opts.loginClick] - click handler for the Login button
   *   when user is not authenticated. Omit to default to navigating to '/'.
   * @returns {Promise<user|null>}
   */
  window.initAppHeader = async function (opts = {}) {
    injectStyles();
    applyTheme(getTheme());

    // Resolve header element
    let headerEl = opts.headerEl || '.app-header';
    if (typeof headerEl === 'string') {
      headerEl = document.querySelector(headerEl);
    }
    if (!headerEl) {
      console.warn('header-component: no header element found');
      return null;
    }

    // Parse icon and name from opts — if not given, try to read from existing .app-title
    let icon = opts.icon;
    let name = opts.name;

    if (!icon && !name) {
      const existingTitle = headerEl.querySelector('.app-title, .app-header__name');
      if (existingTitle) {
        // Leave existing title in place (backwards compat — don't inject a new left section)
        icon = null;
        name = null;
      }
    }

    // If already initialized (re-call after login/logout), just swap out the right section
    const existingRight = document.getElementById('hc-right');
    if (existingRight) {
      const backHref = opts.backHref !== undefined ? opts.backHref : '/';
      const hideBack = opts.hideBack || false;
      try {
        const res = await fetch('/api/auth/user');
        const data = await res.json();
        const user = data.user || null;
        existingRight.replaceWith(buildRightSection(user, backHref, hideBack, opts.loginClick));
        return user;
      } catch (e) {
        existingRight.replaceWith(buildRightSection(null, backHref, hideBack, opts.loginClick));
        return null;
      }
    }

    // Snapshot existing inner content (the module-specific slot)
    const moduleChildren = Array.from(headerEl.childNodes);

    // Clear and rebuild
    headerEl.innerHTML = '';

    // 1. Left section (icon + name), only when provided
    if (icon || name) {
      headerEl.appendChild(buildLeftSection(icon, name));
      headerEl.appendChild(buildSep());
    } else if (moduleChildren.length) {
      // If no icon/name given but there is existing content, still add a sep
      // after we restore the existing content.
    }

    // 2. Module slot — wrap existing children
    const moduleWrap = document.createElement('div');
    moduleWrap.className = 'app-header__module';
    moduleChildren.forEach(node => moduleWrap.appendChild(node));
    headerEl.appendChild(moduleWrap);

    // 3. Fetch user + build right section
    try {
      const res = await fetch('/api/auth/user');
      const data = await res.json();
      const user = data.user || null;

      const backHref = opts.backHref !== undefined ? opts.backHref : '/';
      const hideBack = opts.hideBack || false;
      headerEl.appendChild(buildRightSection(user, backHref, hideBack, opts.loginClick));

      return user;
    } catch (e) {
      console.warn('header-component: could not load user', e);
      headerEl.appendChild(buildRightSection(null, opts.backHref || '/', opts.hideBack, opts.loginClick));
      return null;
    }
  };

  /* ══════════════════════════════════════════════
     LEGACY API — initHeaderComponent(mountId, opts)
     Kept for backward compatibility.
     Mounts the account widget into a specific #mountId element,
     and optionally adds a floating back FAB.
  ══════════════════════════════════════════════ */
  window.initHeaderComponent = async function (mountId, opts = {}) {
    injectStyles();
    applyTheme(getTheme());

    try {
      const res = await fetch('/api/auth/user');
      const data = await res.json();

      const mount = document.getElementById(mountId || 'userMenuMount');
      if (!mount) return null;

      if (data.user) {
        mount.appendChild(buildAccountWidget(data.user));
        if (!opts.hideBack) _injectBackFAB(opts.backHref);
        return data.user;
      } else {
        mount.appendChild(buildLoginLink());
        if (!opts.hideBack) _injectBackFAB(opts.backHref);
        return null;
      }
    } catch (e) {
      console.warn('header-component: could not load user', e);
      return null;
    }
  };

  /** Legacy floating back button (FAB) used by initHeaderComponent */
  function _injectBackFAB(href) {
    if (href === false) return;
    if (document.getElementById('hc-back-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'hc-back-fab';
    fab.title = 'Back to Home';
    fab.innerHTML = '⌂';
    fab.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:400;
      background:var(--gold-dim,#7a6030); color:var(--text,#e8dcc0);
      border:none; border-radius:50%; width:46px; height:46px;
      font-size:18px; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex; align-items:center; justify-content:center;
      transition:background .15s, transform .1s;
      font-family:sans-serif; line-height:1;
    `;
    fab.addEventListener('mouseenter', () => {
      fab.style.background = 'var(--gold,#c9a84c)';
      fab.style.color = 'var(--bg,#13100b)';
      fab.style.transform = 'scale(1.08)';
    });
    fab.addEventListener('mouseleave', () => {
      fab.style.background = 'var(--gold-dim,#7a6030)';
      fab.style.color = 'var(--text,#e8dcc0)';
      fab.style.transform = '';
    });
    fab.addEventListener('click', () => { location.href = href || '/'; });
    document.body.appendChild(fab);
  }

})();
