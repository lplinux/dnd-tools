/**
 * header-component.js
 * Injects a shared user-menu widget (name, role, change password, logout)
 * into every page. Call initHeaderComponent() on DOMContentLoaded.
 *
 * Expects a container with id="userMenuMount" in the page header,
 * OR call injectUserMenu(containerEl) manually.
 */

(function () {
  const CSS = `
    .hc-wrap { display:flex; align-items:center; gap:8px; position:relative; }
    .hc-info  { font-size:12px; color:var(--text-dim,#a09070); font-family:var(--fb,'Georgia',serif); }
    .hc-name  { font-weight:bold; color:var(--gold,#c9a84c); font-size:13px; }
    .hc-role  { font-size:10px; font-family:var(--fd,'Cinzel','Georgia',serif);
                letter-spacing:.06em; text-transform:uppercase;
                background:var(--gold-dim,#7a6030); color:var(--text,#e8dcc0);
                padding:2px 7px; border-radius:2px; }
    .hc-btn   { background:var(--surface2,#272015); border:1px solid var(--border2,#554428);
                color:var(--text,#e8dcc0); padding:5px 11px; border-radius:2px; cursor:pointer;
                font-family:var(--fd,'Cinzel','Georgia',serif); font-size:.65rem;
                letter-spacing:.05em; text-transform:uppercase; transition:background .15s; white-space:nowrap; }
    .hc-btn:hover { background:var(--gold-dim,#7a6030); }
    .hc-btn.danger { border-color:#8b3a3a; }
    .hc-btn.danger:hover { background:#8b3a3a; }

    /* dropdown */
    .hc-menu { position:absolute; top:calc(100% + 6px); right:0; z-index:500;
               background:var(--surface,#1e1810); border:1px solid var(--border2,#554428);
               border-radius:2px; min-width:230px; box-shadow:0 4px 20px rgba(0,0,0,.6);
               display:none; flex-direction:column; padding:8px; gap:6px; }
    .hc-menu.open { display:flex; }
    .hc-menu-title { font-family:var(--fd,'Cinzel','Georgia',serif); font-size:.65rem;
                     letter-spacing:.08em; text-transform:uppercase; color:var(--gold,#c9a84c);
                     padding:2px 4px 6px; border-bottom:1px solid var(--border,#3d3220); margin-bottom:2px; }
    .hc-menu label { font-size:.65rem; font-family:var(--fd,'Cinzel','Georgia',serif);
                     letter-spacing:.05em; color:var(--text-dim,#a09070); text-transform:uppercase;
                     display:block; margin-bottom:2px; }
    .hc-menu input { width:100%; background:var(--surface2,#272015); border:1px solid var(--border2,#554428);
                     color:var(--text,#e8dcc0); padding:5px 7px; border-radius:2px;
                     font-size:13px; font-family:inherit; }
    .hc-menu input:focus { outline:none; border-color:var(--gold-dim,#7a6030); }
    .hc-msg { font-size:11px; padding:3px 4px; border-radius:2px; display:none; }
    .hc-msg.ok  { background:#1f3d1a; color:#9fd49f; display:block; }
    .hc-msg.err { background:#3d1f1f; color:#d49f9f; display:block; }
  `;

  function injectStyles() {
    if (document.getElementById('hc-styles')) return;
    const s = document.createElement('style');
    s.id = 'hc-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildWidget(user) {
    const wrap = document.createElement('div');
    wrap.className = 'hc-wrap';
    wrap.id = 'hc-root';
    wrap.innerHTML = `
      <button class="hc-btn" id="hc-menu-btn" onclick="hcToggleMenu(event)">▾ Account</button>
      <div class="hc-menu" id="hc-menu">
        <div class="hc-menu-title">👤 ${esc(user.username)} <span class="hc-role">${esc(user.role)}</span></div>
        <div>
          <label>New Password</label>
          <input type="password" id="hc-pw1" placeholder="New password…">
        </div>
        <div>
          <label>Confirm Password</label>
          <input type="password" id="hc-pw2" placeholder="Confirm…">
        </div>
        <div id="hc-pw-msg" class="hc-msg"></div>
        <button class="hc-btn" onclick="hcChangePassword()">🔑 Change Password</button>
        <button class="hc-btn danger" onclick="hcLogout()">⏻ Logout</button>
      </div>
    `;
    return wrap;
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Globals used by inline onclick handlers
  window.hcToggleMenu = function (e) {
    e.stopPropagation();
    document.getElementById('hc-menu').classList.toggle('open');
  };

  window.hcChangePassword = async function () {
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
        body: JSON.stringify({ password: pw1 })
      });
      const data = await res.json();
      if (res.ok) {
        msg.textContent = '✓ Password changed.';
        msg.className = 'hc-msg ok';
        document.getElementById('hc-pw1').value = '';
        document.getElementById('hc-pw2').value = '';
        setTimeout(() => msg.className = 'hc-msg', 2500);
      } else {
        msg.textContent = data.error || 'Error changing password.';
        msg.className = 'hc-msg err';
      }
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'hc-msg err';
    }
  };

  window.hcLogout = async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  };

  // Close menu on outside click
  document.addEventListener('click', () => {
    const m = document.getElementById('hc-menu');
    if (m) m.classList.remove('open');
  });

  // Enter key inside pw fields triggers change
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'hc-pw1' || e.target.id === 'hc-pw2')) {
      hcChangePassword();
    }
  });

  window.initHeaderComponent = async function (mountId) {
    injectStyles();
    try {
      const res = await fetch('/api/auth/user');
      const data = await res.json();
      if (!data.user) return; // not logged in — no widget
      const mount = document.getElementById(mountId || 'userMenuMount');
      if (!mount) return;
      mount.appendChild(buildWidget(data.user));
      return data.user;
    } catch (e) {
      console.warn('header-component: could not load user', e);
    }
  };
})();
