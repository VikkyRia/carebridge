/* ═══════════════════════════════════════════════════════════
   CareBridge OVC — Admin Portal
   Aligned to confirmed API endpoints (v1 docs, May 2026)
   
   ADMIN ENDPOINTS IN USE:
     GET  /facilities              → all facilities (any status)
     GET  /facilities/:id          → single facility
     PATCH /facilities/:id/verify  → approve facility (no body)
     PATCH /facilities/:id/suspend → suspend facility (no body)
     GET  /needs                   → all needs (?category ?urgency ?search)
     GET  /needs/:id               → need detail
     GET  /donations               → ALL donations (admin only)
     GET  /fulfillments            → impact gallery (verified + photos)
     PATCH /fulfillments/:id/verify→ mark fulfillment verified (no body)
     POST /auth/login              → { email, password } → { token, user }
     GET  /auth/me                 → current user profile
═══════════════════════════════════════════════════════════ */

const API_BASE = 'https://carebridge-dxrd.onrender.com/api';
let authToken = '';
let authUser  = '';
let authUserObj = null;
let facilities   = [];
let donations    = [];
let myDonations  = [];
let fulfillments = [];
let needs        = [];
let urgentNeeds  = [];
let authMode     = 'signin';
let isFacilityRegistrationSubmitting = false;

/* ── Restore session safely ── */
try {
  authToken   = localStorage.getItem('cb_admin_token') || '';
  authUser    = localStorage.getItem('cb_admin_user')  || '';
} catch (_) {}

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function getInitials(name) {
  if (!name) return 'G';
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'G';
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAge(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const h = Math.floor((Date.now() - dt.getTime()) / 3600000);
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCurrency(n) {
  const v = Number(n);
  if (n == null || n === '' || isNaN(v)) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(v);
}

function scoreClass(s) {
  const n = Number(s);
  if (!n) return 'score-low';
  return n >= 70 ? 'score-high' : n >= 40 ? 'score-med' : 'score-low';
}

function urgencyBadge(u) {
  const l = (u || '').toLowerCase();
  if (l === 'critical') return `<span class="badge b-red">Critical</span>`;
  if (l === 'high')     return `<span class="badge b-orange">High</span>`;
  if (l === 'medium')   return `<span class="badge b-amber">Medium</span>`;
  return `<span class="badge b-teal">Low</span>`;
}

function categoryBadge(c) {
  const l = (c || '').toLowerCase();
  const map = { food:'b-amber', medical:'b-red', education:'b-blue', shelter:'b-purple', clothing:'b-green' };
  return `<span class="badge ${map[l]||'b-teal'}">${escHtml(c||'General')}</span>`;
}

function statusBadge(s) {
  const l = (s || '').toLowerCase();
  if (l === 'verified' || l === 'active') return `<span class="badge b-green">${escHtml(s)}</span>`;
  if (l === 'pending' || l === 'open')   return `<span class="badge b-amber">Pending</span>`;
  if (l === 'matched')                   return `<span class="badge b-blue">Matched</span>`;
  if (l === 'fulfilled')                 return `<span class="badge b-teal">Fulfilled</span>`;
  if (l === 'suspended' || l === 'flagged' || l === 'blocked') return `<span class="badge b-red">Suspended</span>`;
  return `<span class="badge b-teal">${escHtml(s||'—')}</span>`;
}

function streakBadge(m) {
  const n = Number(m)||0;
  if (n >= 6) return `<span class="badge b-purple">Guardian</span>`;
  if (n >= 3) return `<span class="badge b-blue">Sustainer</span>`;
  if (n >= 1) return `<span class="badge b-green">Seedling</span>`;
  return '—';
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  const icon = type === 'error' ? '✕' : type === 'warning' ? '⚠' : '✓';
  t.innerHTML = `<span>${icon}</span><span>${escHtml(msg)}</span>`;
  t.style.background = type === 'error' ? 'var(--red)' : type === 'warning' ? '#92400e' : 'var(--g900)';
  t.style.transform  = 'translateY(0)';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.transform = 'translateY(100px)'; }, 3500);
}

function showLoadingRow(id, msg='Loading…', cols=6) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<tr><td colspan="${cols}" style="padding:28px;text-align:center;color:var(--g400);font-size:13px;">${escHtml(msg)}</td></tr>`;
}

function showTableMsg(id, msg, cols=6) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<tr><td colspan="${cols}" style="padding:28px;text-align:center;color:var(--g400);font-size:13px;">${escHtml(msg)}</td></tr>`;
}

/* ══════════════════════════════════════
   API LAYER
══════════════════════════════════════ */
function getHeaders(extra={}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

async function apiReq(path, opts={}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: getHeaders(opts.headers||{}),
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });

  /* for PATCH endpoints that return 204 or empty */
  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(_) { data = null; }

  if (!res.ok) {
    const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function updateAuthUI() {
  const authButton = document.getElementById('auth-button');
  const nameEl = document.getElementById('auth-name');
  const avatarEl = document.getElementById('auth-avatar');

  const isSignedIn = Boolean(authToken);
  const displayName = isSignedIn ? (authUser || 'CareBridge Admin') : 'Guest';

  if (nameEl) nameEl.textContent = displayName;
  if (avatarEl) avatarEl.textContent = isSignedIn ? getInitials(displayName) : 'G';
  if (authButton) authButton.textContent = isSignedIn ? 'Sign out' : 'Sign in';
}

function persistAuth(token, name) {
  authToken = token || '';
  authUser  = name  || '';
  try {
    if (authToken) {
      localStorage.setItem('cb_admin_token', authToken);
      localStorage.setItem('cb_admin_user', authUser);
    } else {
      localStorage.removeItem('cb_admin_token');
      localStorage.removeItem('cb_admin_user');
    }
  } catch (_) {}
  updateAuthUI();
}

function clearAuthFields() {
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const fullNameEl = document.getElementById('auth-full-name');
  if (emailEl) emailEl.value = '';
  if (passEl) passEl.value = '';
  if (fullNameEl) fullNameEl.value = '';
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.textContent = '';
}

function setAuthMode(mode) {
  authMode = mode === 'signup' ? 'signup' : 'signin';
  const titleEl = document.getElementById('auth-modal-title');
  const descEl = document.getElementById('auth-modal-desc');
  const fullNameWrap = document.getElementById('auth-full-name-wrap');
  const submitBtn = document.querySelector('#auth-modal .btn-primary');
  const toggleBtn = document.getElementById('auth-mode-toggle');

  if (titleEl) titleEl.textContent = authMode === 'signup' ? 'Create an account' : 'Admin Sign In';
  if (descEl) descEl.textContent = authMode === 'signup'
    ? 'Create a donor or facility account to access the new flows.'
    : 'Sign in to access donations data and admin actions.';
  if (fullNameWrap) fullNameWrap.style.display = authMode === 'signup' ? '' : 'none';
  if (submitBtn) {
    submitBtn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  }
  if (toggleBtn) {
    toggleBtn.textContent = authMode === 'signup'
      ? 'Already have an account? Sign in'
      : 'Need an account? Sign up';
  }
  clearAuthFields();
}

function openAuthModal(mode='signin') {
  setAuthMode(mode);
  const m = document.getElementById('auth-modal');
  m?.classList.add('open');
  setTimeout(() => document.getElementById('auth-email')?.focus(), 60);
}

function closeAuthModal() {
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-modal').classList.remove('open');
}

function toggleAuthModal() {
  if (authToken) {
    persistAuth('', '');
    authUserObj = null;
    donations = [];
    myDonations = [];
    fulfillments = [];
    renderAllProtected();
    renderDashboard();
    showToast('Signed out.');
    return;
  }
  const m = document.getElementById('auth-modal');
  if (m.classList.contains('open')) { closeAuthModal(); return; }
  openAuthModal('signin');
}

async function submitAuthLogin() {
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const fullNameEl = document.getElementById('auth-full-name');
  const errEl = document.getElementById('auth-error');
  const btn = document.querySelector('#auth-modal .btn-primary');

  const email = (emailEl?.value || '').trim();
  const password = passEl?.value || '';
  const fullName = (fullNameEl?.value || '').trim();

  if (!email || !password) {
    errEl.textContent = 'Please enter email and password.';
    return;
  }

  if (authMode === 'signup' && !fullName) {
    errEl.textContent = 'Please enter your full name.';
    return;
  }

  try {
    btn && (btn.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…');
    btn && (btn.disabled = true);

    const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
    const payload = authMode === 'signup'
      ? { full_name: fullName, email, password }
      : { email, password };

    const data = await apiReq(endpoint, {
      method: 'POST',
      body: payload,
    });

    const token = data?.token || data?.accessToken;
    if (!token) throw new Error('Server returned success but no token. Contact backend team.');

    const user = data?.user || data;
    const displayName = user?.full_name || user?.name || user?.email || 'CareBridge User';

    authUserObj = user;
    persistAuth(token, displayName);
    closeAuthModal();
    showToast(authMode === 'signup' ? `Welcome, ${displayName.split(' ')[0]}!` : `Welcome, ${displayName.split(' ')[0]}!`);
    await loadProtectedData();
  } catch (err) {
    errEl.textContent = err.message || 'Login failed.';
    if (err.status === 401 || err.status === 403) {
      errEl.textContent = 'Incorrect email or password.';
    }
    if (authMode === 'signup' && err.status === 409) {
      errEl.textContent = 'That email is already registered.';
    }
  } finally {
    if (btn) {
      btn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
      btn.disabled = false;
    }
  }
}

function switchAuthMode() {
  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
}

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
function nav(key) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${key}`)?.classList.add('active');

  document.querySelectorAll('.sidebar .sb-item').forEach(item => {
    const t = item.dataset.nav;
    item.classList.toggle('active', t === key);
  });

  ({
    dashboard:  () => renderDashboard(),
    facilities: () => { renderPendingFacilities(); renderVerifiedFacilities(); renderFlaggedFacilities(); },
    donors:     () => renderDonors(),
    needs:      () => { renderActiveNeeds(); renderFulfilled(); },
    finance:    () => renderTransactions(),
    system:     () => renderFullActivityLog(),
  }[key] || (() => {}))();
}

function setSubTab(section, key) {
  document.querySelectorAll(`#view-${section} .tab-strip button`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === key);
  });
  document.querySelectorAll(`#view-${section} .subview`).forEach(sv => {
    sv.classList.toggle('active', sv.id === `${section}-sub-${key}`);
  });
}

/* ══════════════════════════════════════
   TABLE UTILS
══════════════════════════════════════ */
function filterTable(tableId, q) {
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = (q && !row.textContent.toLowerCase().includes(q.toLowerCase())) ? 'none' : '';
  });
}

function filterTableBySelect(tableId, val, colIdx) {
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    const cell = row.cells[colIdx];
    row.style.display = (!val || (cell && cell.textContent.toLowerCase().includes(val.toLowerCase()))) ? '' : 'none';
  });
}

function filterActivityLog(q) {
  document.querySelectorAll('#full-activity-log .activity-item').forEach(item => {
    item.style.display = (q && !item.textContent.toLowerCase().includes(q.toLowerCase())) ? 'none' : '';
  });
}

/* ══════════════════════════════════════
   DATA FETCHING — mapped to real endpoints
══════════════════════════════════════ */

function mergeFacilities(serverList = []) {
  const server = Array.isArray(serverList) ? serverList : [];
  const byId = new Map();

  for (const item of server) {
    byId.set(Number(item.id), { ...(item || {}) });
  }

  for (const item of facilities) {
    if (!item || item.id == null) continue;
    const id = Number(item.id);
    if (!byId.has(id)) {
      byId.set(id, { ...(item || {}) });
      continue;
    }

    byId.set(id, {
      ...byId.get(id),
      ...item,
      status: item.status || byId.get(id).status,
      created_at: item.created_at || byId.get(id).created_at,
      createdAt: item.createdAt || byId.get(id).createdAt,
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
    const da = new Date(a.created_at || a.createdAt || 0).getTime();
    const db = new Date(b.created_at || b.createdAt || 0).getTime();
    return db - da;
  });
}

/* GET /facilities — server currently returns verified facilities only, so we keep local pending submissions until verification */
async function fetchFacilities() {
  showLoadingRow('pending-tbl-body',       'Loading facilities…', 7);
  showLoadingRow('verified-tbody',          'Loading facilities…', 7);
  showLoadingRow('dashboard-pending-tbody', 'Loading…', 4);
  try {
    const raw = await apiReq('/facilities');
    const server = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    facilities = mergeFacilities(server);
    renderFacilities();
    renderDashboard();
  } catch(err) {
    console.error('fetchFacilities:', err);
    ['pending-tbl-body','verified-tbody','dashboard-pending-tbody'].forEach(id =>
      showTableMsg(id, 'Could not load facilities. Check network.', 7)
    );
  }
}

/* GET /donations — admin only, all platform donations */
async function fetchDonations() {
  if (!authToken) {
    showTableMsg('donors-tbody', 'Sign in to view donor records.', 7);
    showTableMsg('txn-tbody', 'Sign in to view transactions.', 9);
    return;
  }
  showLoadingRow('donors-tbody', 'Loading donors…', 7);
  showLoadingRow('txn-tbody', 'Loading transactions…', 9);
  try {
    const raw = await apiReq('/donations');
    donations = Array.isArray(raw) ? raw : (raw?.data || raw?.donations || []);
    renderDonors();
    renderTransactions();
    renderDashboard();
  } catch(err) {
    donations = [];
    const msg = err.status === 401 ? 'Sign in to view donation records.' : 'Could not load donations.';
    showTableMsg('donors-tbody', msg, 7);
    showTableMsg('txn-tbody', msg, 9);
    console.error('fetchDonations:', err);
  }
}

/* GET /fulfillments — public, verified + photos only */
async function fetchFulfillments() {
  showLoadingRow('fulfilled-tbody', 'Loading fulfillments…', 7);
  try {
    const raw = await apiReq('/fulfillments');
    fulfillments = Array.isArray(raw) ? raw : (raw?.data || raw?.fulfillments || []);
    renderFulfilled();
    renderDashboard();
  } catch(err) {
    fulfillments = [];
    showTableMsg('fulfilled-tbody', 'Could not load fulfillments.', 7);
    console.error('fetchFulfillments:', err);
  }
}

/* GET /needs — supports ?category ?urgency ?search */
async function fetchNeeds(params={}) {
  showLoadingRow('active-needs-tbody', 'Loading needs…', 9);
  showLoadingRow('dash-needs-tbody',   'Loading needs…', 8);
  try {
    const qs = new URLSearchParams();
    if (params.category && params.category !== 'All') qs.set('category', params.category.toLowerCase());
    if (params.urgency  && params.urgency  !== 'All') qs.set('urgency',  params.urgency.toLowerCase());
    if (params.search)                                 qs.set('search',   params.search);
    const query = qs.toString() ? `?${qs}` : '';
    const raw = await apiReq(`/needs${query}`);
    needs = Array.isArray(raw) ? raw : (raw?.data || raw?.needs || []);
    renderActiveNeeds();
    renderDashboard();
  } catch(err) {
    needs = [];
    showTableMsg('active-needs-tbody', 'Could not load needs.', 9);
    showTableMsg('dash-needs-tbody',   'Could not load needs.', 8);
    console.error('fetchNeeds:', err);
  }
}

async function fetchUrgentNeeds() {
  try {
    const raw = await apiReq('/needs/urgent');
    urgentNeeds = Array.isArray(raw) ? raw : (raw?.data || raw?.needs || []);
    renderDashboard();
  } catch(err) {
    urgentNeeds = [];
    console.error('fetchUrgentNeeds:', err);
    renderDashboard();
  }
}

async function fetchMyDonations() {
  if (!authToken) {
    myDonations = [];
    return;
  }

  try {
    const raw = await apiReq('/donations/my');
    myDonations = Array.isArray(raw) ? raw : (raw?.data || raw?.donations || []);
  } catch(err) {
    myDonations = [];
    if (err.status !== 401) {
      console.error('fetchMyDonations:', err);
    }
  }
}

/* GET /auth/me — confirm admin role after login */
async function fetchMe() {
  if (!authToken) return;
  try {
    const data = await apiReq('/auth/me');
    const user = data?.user || data;
    authUserObj = user;
    const name = user?.full_name || user?.name || authUser;
    if (name && name !== authUser) {
      authUser = name;
      try { localStorage.setItem('cb_admin_user', name); } catch(_) {}
      updateAuthUI();
    }
  } catch(err) {
    if (err.status === 401) {
      /* token expired — clear session */
      persistAuth('', '');
      showToast('Session expired. Please sign in again.', 'warning');
    }
  }
}

async function loadProtectedData() {
  await fetchMe();
  await fetchMyDonations();
  await fetchDonations();
  /* fulfillments are public — always loaded */
}

function renderAllProtected() {
  renderDonors();
  renderTransactions();
}

/* ══════════════════════════════════════
   RENDER: DASHBOARD
══════════════════════════════════════ */
function renderDashboard() {
  const pending  = facilities.filter(f => ['pending','submitted','review'].includes((f.status||'').toLowerCase()));
  const verified = facilities.filter(f => (f.status||'').toLowerCase() === 'verified');
  const flagged  = facilities.filter(f => ['suspended','flagged','blocked'].includes((f.status||'').toLowerCase()));
  const urgent = urgentNeeds.length ? urgentNeeds : needs.filter(n => (n.status||'').toLowerCase() !== 'fulfilled');
  const totalDonated = donations.reduce((s, d) => s + (Number(d.amount)||0), 0);
  const fulfilledCount = fulfillments.length;
  const totalNeeds = needs.length;
  const rate = totalNeeds > 0 ? Math.round((fulfilledCount / totalNeeds) * 100) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('stat-verified-count', verified.length || '—');
  set('stat-verified-sub',   `${pending.length} pending · ${flagged.length} flagged`);
  set('stat-active-needs',   urgent.length || '—');
  set('stat-active-needs-sub',
    urgent.filter(n=>(n.urgency||'').toLowerCase()==='critical').length + ' critical · ' +
    urgent.filter(n=>(n.urgency||'').toLowerCase()==='high').length + ' high · ' +
    urgent.filter(n=>(n.urgency||'').toLowerCase()==='medium').length + ' medium'
  );
  set('stat-donations-total', authToken ? (donations.length ? formatCurrency(totalDonated) : '₦0') : '—');
  set('stat-donations-sub',   authToken ? `${donations.length} total transactions` : 'Sign in to view');
  set('stat-fulfillment-rate', `${rate}%`);
  set('stat-fulfillment-sub',  `${fulfilledCount} of ${totalNeeds} needs closed with proof`);
  set('dash-time', new Date().toLocaleString('en-NG'));

  /* review queue badge */
  const reviewBtn = document.querySelector('.hd-actions .btn-primary');
  if (reviewBtn) reviewBtn.textContent = `Review Queue (${pending.length})`;
  const sbBadge = document.getElementById('sb-pending-badge');
  if (sbBadge) { sbBadge.textContent = pending.length; sbBadge.style.display = pending.length ? '' : 'none'; }

  /* alert banners */
  const unmatchedOld = needs.filter(n => {
    const h = (Date.now() - new Date(n.created_at||n.createdAt||0).getTime()) / 3600000;
    return (n.status||'').toLowerCase() !== 'fulfilled' && h > 24;
  });
  set('alert-unmatched-text', `${unmatchedOld.length} need${unmatchedOld.length!==1?'s':''} unmatched for over 24 hours`);
  const overdueUnconfirmed = fulfillments.filter(f => !f.admin_verified && !f.verified).length;
  set('alert-overdue-text', `${overdueUnconfirmed} fulfillment${overdueUnconfirmed!==1?'s':''} awaiting admin verification`);

  /* pending queue table */
  if (pending.length) {
    document.getElementById('dashboard-pending-tbody').innerHTML = pending.slice(0,5).map(f => `
      <tr>
        <td>
          <div class="need-name">${escHtml(f.name)}</div>
          <div class="need-facility">${escHtml(f.contact_email||'')}</div>
        </td>
        <td>${escHtml([f.city,f.country].filter(Boolean).join(', ')||'—')}</td>
        <td>${formatDate(f.created_at||f.createdAt)}</td>
        <td><div class="tbl-actions">
          <button class="btn btn-success btn-sm" onclick="showFacilityDetails(${f.id})">Review</button>
        </div></td>
      </tr>`).join('');
  } else {
    showTableMsg('dashboard-pending-tbody', 'No pending verifications.', 4);
  }

  renderDashboardNeeds();
  renderActivityFeed();
  if (donations.length) updateFinanceStats();
}

function renderDashboardNeeds() {
  const tbody = document.getElementById('dash-needs-tbody');
  if (!tbody) return;
  const source = urgentNeeds.length ? urgentNeeds : needs.filter(n => (n.status||'').toLowerCase() !== 'fulfilled');
  const active = source
    .sort((a,b) => (Number(b.priority_score||b.score||0)) - (Number(a.priority_score||a.score||0)))
    .slice(0, 8);
  if (!active.length) { showTableMsg('dash-needs-tbody', 'No urgent needs right now.', 8); return; }
  tbody.innerHTML = active.map(n => {
    const score = n.priority_score || n.score || 0;
    return `<tr>
      <td><div class="score-ring ${scoreClass(score)}">${score||'—'}</div></td>
      <td>
        <div class="need-name">${escHtml(n.title||n.name||'Untitled')}</div>
        <div class="need-facility">${formatCurrency(n.amount||n.cash_equivalent)} · ${escHtml(String(n.children_count||'?'))} children</div>
      </td>
      <td>${escHtml(n.facility?.name||n.facility_name||n.facility_name||'—')}</td>
      <td>${categoryBadge(n.category)}</td>
      <td>${urgencyBadge(n.urgency)}</td>
      <td>${statusBadge(n.status)}</td>
      <td class="mono">${formatAge(n.created_at||n.createdAt)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="nav('needs');setSubTab('needs','active')">View</button></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════
   RENDER: ACTIVITY FEED
   (derived from real data — no /activity endpoint)
══════════════════════════════════════ */
function renderActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const events = [];

  /* recent donations */
  donations.slice(0,3).forEach(d => events.push({
    icon:'💳', bg:'var(--green-bg)',
    text:`<strong>${escHtml(d.donor_name||d.donorName||'A donor')}</strong> donated ${formatCurrency(d.amount)} to a ${escHtml(d.category||'need')} request`,
    time: d.created_at||d.createdAt,
  }));

  /* recent facility registrations */
  facilities.slice(0,3).forEach(f => events.push({
    icon:'🏠', bg:'var(--teal-bg)',
    text:`<strong>${escHtml(f.name)}</strong> registered — status: ${escHtml(f.status||'pending')}`,
    time: f.created_at||f.createdAt,
  }));

  /* recent fulfillments */
  fulfillments.slice(0,2).forEach(f => events.push({
    icon:'✅', bg:'var(--blue-bg)',
    text:`Fulfillment verified for <strong>${escHtml(f.facility?.name||f.facility_name||'a facility')}</strong>`,
    time: f.created_at||f.verified_at,
  }));

  events.sort((a,b) => new Date(b.time||0) - new Date(a.time||0));
  const display = events.slice(0,6);

  if (!display.length) {
    feed.innerHTML = '<div style="color:var(--g400);font-size:13px;padding:16px 0;">No recent activity.</div>';
    return;
  }

  feed.innerHTML = display.map(e => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${e.bg}">${e.icon}</div>
      <div class="activity-body">
        <div class="activity-text">${e.text}</div>
        <div class="activity-time">${formatDate(e.time)}</div>
      </div>
    </div>`).join('');
}

function renderFullActivityLog() {
  const el = document.getElementById('full-activity-log');
  if (!el) return;
  if (!authToken) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--g400);">Sign in to view the activity log.</div>';
    return;
  }
  /* derive from loaded data since no /activity endpoint */
  const events = [];
  donations.forEach(d => events.push({
    type:'donation', icon:'💳', bg:'var(--green-bg)',
    text:`<strong>${escHtml(d.donor_name||d.donorName||'Donor')}</strong> donated ${formatCurrency(d.amount)} — Need #${d.need_id||'?'}`,
    time: d.created_at||d.createdAt,
  }));
  facilities.forEach(f => events.push({
    type:'facility', icon:'🏠', bg:'var(--teal-bg)',
    text:`<strong>${escHtml(f.name)}</strong> registered (${escHtml(f.status||'pending')}) — ${escHtml([f.city,f.country].filter(Boolean).join(', ')||'—')}`,
    time: f.created_at||f.createdAt,
  }));
  fulfillments.forEach(f => events.push({
    type:'fulfillment', icon:'✅', bg:'var(--blue-bg)',
    text:`Fulfillment #${f.id} verified — ${escHtml(f.facility?.name||f.facility_name||'Facility')}`,
    time: f.created_at||f.verified_at,
  }));
  events.sort((a,b) => new Date(b.time||0) - new Date(a.time||0));
  if (!events.length) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--g400);">No events logged yet.</div>';
    return;
  }
  el.innerHTML = events.map(e => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${e.bg}">${e.icon}</div>
      <div class="activity-body">
        <div class="activity-text">${e.text}</div>
        <div class="activity-time">${formatDate(e.time)}</div>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════
   RENDER: FACILITIES
══════════════════════════════════════ */
function renderFacilities() {
  renderPendingFacilities();
  renderVerifiedFacilities();
  renderFlaggedFacilities();
}

function renderPendingFacilities() {
  const pending = facilities.filter(f => ['pending','submitted','review'].includes((f.status||'').toLowerCase()));
  if (!pending.length) {
    showTableMsg('pending-tbl-body', 'No facilities are currently awaiting verification.', 7);
    return;
  }

  document.getElementById('pending-tbl-body').innerHTML = pending.map(f => {
    const loc = [f.city, f.country].filter(Boolean).join(', ') || '—';
    const regNo = f.id ?? '—';
    const submitted = formatDate(f.created_at || f.createdAt);
    const fieldAgent = f.field_agent || f.assigned_agent || 'Unassigned';
    return `<tr>
      <td>
        <div class="need-name">${escHtml(f.name)}</div>
        <div class="need-facility">${escHtml(f.contact_email || 'No contact email')}</div>
      </td>
      <td>${escHtml(loc)}</td>
      <td>${escHtml(String(f.child_count ?? f.children_count ?? '—'))}</td>
      <td>${escHtml(String(regNo))}</td>
      <td>${escHtml(submitted)}</td>
      <td>${escHtml(fieldAgent)}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-primary btn-sm" onclick="showFacilityDetails(${f.id})">Review</button>
          <button class="btn btn-danger btn-sm" onclick="openFlagModal(${f.id})">Suspend</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderVerifiedFacilities() {
  const verified = facilities.filter(f => (f.status||'').toLowerCase() === 'verified');
  if (!verified.length) { showTableMsg('verified-tbody', 'No verified facilities yet.', 7); return; }
  document.getElementById('verified-tbody').innerHTML = verified.map(f => {
    const loc  = [f.city,f.country].filter(Boolean).join(', ') || '—';
    const rate = f.fulfillment_rate != null ? `${f.fulfillment_rate}%` : '—';
    return `<tr>
      <td>
        <div class="need-name">${escHtml(f.name)}</div>
        <div class="need-facility">${escHtml(f.contact_email||'')}</div>
      </td>
      <td>${escHtml(loc)}</td>
      <td>${escHtml(String(f.child_count||f.children_count||'—'))}</td>
      <td>${escHtml(String(f.needs_count||f.needsPosted||'—'))}</td>
      <td>
        ${rate !== '—' ? `<div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-bar" style="width:64px;flex-shrink:0;">
            <div class="progress-fill" style="width:${f.fulfillment_rate}%;background:var(--teal);"></div>
          </div>${rate}</div>` : '—'}
      </td>
      <td>${formatDate(f.last_active||f.updated_at||f.updatedAt)}</td>
      <td><div class="tbl-actions">
        <button class="btn btn-primary btn-sm" onclick="showFacilityDetails(${f.id})">View</button>
        <button class="btn btn-danger btn-sm"  onclick="openFlagModal(${f.id})">Suspend</button>
      </div></td>
    </tr>`;
  }).join('');
}

function renderFlaggedFacilities() {
  showTableMsg('flagged-tbody', 'Suspended facilities are not exposed by the current /facilities API.', 5);
}

/* ══════════════════════════════════════
   FACILITY DRAWER
══════════════════════════════════════ */
function showFacilityDetails(facilityId) {
  const f = facilities.find(x => Number(x.id) === Number(facilityId));
  if (!f) { showToast('Facility not found in loaded data.', 'error'); return; }

  const status     = (f.status||'pending').toLowerCase();
  const isPending  = ['pending','submitted','review'].includes(status);
  const isFlagged  = ['suspended','flagged','blocked'].includes(status);
  const isVerified = status === 'verified';
  const loc = [f.city, f.country].filter(Boolean).join(', ') || '—';

  const actions = isPending ? `
    <div class="verification-actions">
      <button class="verify-btn verify-approve" onclick="handleFacilityAction(${f.id},'verify');closeDrawer()">✓ Approve &amp; Verify</button>
      <button class="verify-btn verify-reject"  onclick="openFlagModal(${f.id});closeDrawer()">✕ Suspend</button>
    </div>` : isFlagged ? `
    <div class="verification-actions">
      <button class="verify-btn verify-approve" onclick="handleFacilityAction(${f.id},'verify');closeDrawer()">✓ Restore &amp; Re-verify</button>
    </div>` : isVerified ? `
    <div class="verification-actions" style="grid-template-columns:1fr;">
      <button class="verify-btn verify-reject" onclick="openFlagModal(${f.id});closeDrawer()">Suspend This Facility</button>
    </div>` : '';

  openDrawer(`
    <div class="facility-hero">
      <div class="avatar-lg">${getInitials(f.name)}</div>
      <div>
        <h3 style="font-size:16px;font-weight:800;color:var(--g900);">${escHtml(f.name)}</h3>
        <div style="font-size:13px;color:var(--g500);margin-top:3px;">${escHtml(loc)}</div>
        <div style="margin-top:6px;">${statusBadge(f.status)}</div>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Facility Info</div>
      <div class="detail-row"><span class="detail-label">Location</span><span class="detail-val">${escHtml(loc)}</span></div>
      <div class="detail-row"><span class="detail-label">Description</span><span class="detail-val" style="max-width:240px;text-align:right;font-size:12px;">${escHtml(f.description||'—')}</span></div>
      <div class="detail-row"><span class="detail-label">Registered</span><span class="detail-val">${formatDate(f.created_at||f.createdAt)}</span></div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Contact</div>
      <div class="detail-row"><span class="detail-label">Email</span><span class="detail-val">${escHtml(f.contact_email||'—')}</span></div>
      <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-val">${escHtml(f.contact_phone||'—')}</span></div>
    </div>

    ${actions}
  `, escHtml(f.name));
}

function openDrawer(html, title='Facility Review') {
  document.getElementById('drawer-title').textContent = title;
  document.getElementById('drawer-body').innerHTML = html;
  document.getElementById('facility-drawer').classList.add('open');
}
function closeDrawer() {
  document.getElementById('facility-drawer').classList.remove('open');
}

/* ══════════════════════════════════════
   FACILITY ACTIONS — PATCH (no body per API docs)
══════════════════════════════════════ */
async function handleFacilityAction(facilityId, action) {
  if (!authToken) { showToast('Sign in required.', 'error'); toggleAuthModal(); return; }
  const f = facilities.find(x => Number(x.id) === Number(facilityId));
  if (!f) { showToast('Facility not found.', 'error'); return; }

  const endpoint = action === 'verify' ? 'verify' : 'suspend';
  try {
    showToast(`${action === 'verify' ? 'Verifying' : 'Suspending'} ${f.name}…`);
    /* API: PATCH /facilities/:id/verify or /suspend — NO BODY */
    await apiReq(`/facilities/${facilityId}/${endpoint}`, { method: 'PATCH' });
    f.status = action === 'verify' ? 'verified' : 'suspended';
    renderFacilities();
    renderDashboard();
    showToast(`${f.name} ${action === 'verify' ? 'verified ✓' : 'suspended'}.`);
  } catch(err) {
    if (err.status === 401 || err.status === 403) {
      showToast('Admin access required.', 'error');
      toggleAuthModal();
      return;
    }
    showToast(err.message || 'Action failed.', 'error');
  }
}

/* ══════════════════════════════════════
   FLAG / SUSPEND MODAL
══════════════════════════════════════ */
function openFlagModal(facilityId) {
  const f = facilities.find(x => Number(x.id) === Number(facilityId));
  document.getElementById('flag-facility-name').value = f?.name || String(facilityId);
  document.getElementById('flag-facility-id').value   = facilityId;
  document.getElementById('flag-modal').classList.add('open');
}
function closeFlagModal() {
  document.getElementById('flag-modal').classList.remove('open');
}

async function submitFlag() {
  if (!authToken) { closeFlagModal(); showToast('Sign in required.', 'error'); toggleAuthModal(); return; }
  const facilityId = document.getElementById('flag-facility-id').value;
  const btn = document.querySelector('#flag-modal .btn-danger');
  try {
    if (btn) { btn.textContent = 'Suspending…'; btn.disabled = true; }
    /* API: PATCH /facilities/:id/suspend — NO BODY */
    await apiReq(`/facilities/${facilityId}/suspend`, { method: 'PATCH' });
    const f = facilities.find(x => Number(x.id) === Number(facilityId));
    if (f) f.status = 'suspended';
    closeFlagModal();
    renderFacilities();
    renderDashboard();
    showToast('Facility suspended.');
  } catch(err) {
    if (err.status === 401 || err.status === 403) {
      closeFlagModal();
      showToast('Admin access required.', 'error');
      toggleAuthModal();
      return;
    }
    /* optimistic fallback */
    const f = facilities.find(x => Number(x.id) === Number(facilityId));
    if (f) f.status = 'suspended';
    closeFlagModal();
    renderFacilities();
    renderDashboard();
    showToast('Suspended (local — sync pending).', 'warning');
  } finally {
    if (btn) { btn.textContent = 'Suspend Facility'; btn.disabled = false; }
  }
}

/* ══════════════════════════════════════
   FULFILLMENT VERIFY — PATCH /fulfillments/:id/verify (no body)
══════════════════════════════════════ */
async function verifyFulfillment(fulfillmentId) {
  if (!authToken) { showToast('Sign in required.', 'error'); toggleAuthModal(); return; }
  try {
    await apiReq(`/fulfillments/${fulfillmentId}/verify`, { method: 'PATCH' });
    const item = fulfillments.find(f => Number(f.id) === Number(fulfillmentId));
    if (item) item.admin_verified = true;
    renderFulfilled();
    showToast('Fulfillment verified ✓');
  } catch(err) {
    if (err.status === 401 || err.status === 403) { showToast('Admin access required.', 'error'); return; }
    showToast(err.message || 'Could not verify.', 'error');
  }
}

/* ══════════════════════════════════════
   RENDER: NEEDS
   Server-side filtering via API params
══════════════════════════════════════ */
function renderActiveNeeds() {
  const cat    = document.getElementById('needs-cat-filter')?.value  || 'All';
  const urg    = document.getElementById('needs-urg-filter')?.value  || 'All';
  const status = document.getElementById('needs-status-filter')?.value || 'All';

  let list = needs.filter(n => (n.status||'').toLowerCase() !== 'fulfilled');
  if (status !== 'All') list = list.filter(n => (n.status||'').toLowerCase() === status.toLowerCase());
  list.sort((a,b) => (Number(b.priority_score||b.score||0)) - (Number(a.priority_score||a.score||0)));

  if (!list.length) { showTableMsg('active-needs-tbody', 'No needs match the current filters.', 9); return; }

  document.getElementById('active-needs-tbody').innerHTML = list.map(n => {
    const score = n.priority_score || n.score || 0;
    const needType = n.need_type || n.type || 'Cash';
    return `<tr>
      <td><div class="score-ring ${scoreClass(score)}">${score||'—'}</div></td>
      <td>
        <div class="need-name">${escHtml(n.title||n.name||'Untitled')}</div>
        <div class="need-facility">${formatCurrency(n.amount||n.cash_equivalent)} · ${escHtml(String(n.children_count||'?'))} children</div>
      </td>
      <td>${escHtml(n.facility?.name||n.facility_name||'—')}</td>
      <td>${categoryBadge(n.category)}</td>
      <td>${urgencyBadge(n.urgency)}</td>
      <td><span class="badge b-teal">${escHtml(needType)}</span></td>
      <td>${statusBadge(n.status)}</td>
      <td class="mono">${formatAge(n.created_at||n.createdAt)}</td>
      <td><div class="tbl-actions">
        <button class="btn btn-outline btn-sm" onclick="showNeedDetail(${n.id})">Detail</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* re-fetch when filter changes (uses server-side params) */
function applyNeedFilters() {
  const cat = document.getElementById('needs-cat-filter')?.value || 'All';
  const urg = document.getElementById('needs-urg-filter')?.value || 'All';
  const q   = document.getElementById('needs-search')?.value || '';
  fetchNeeds({ category: cat, urgency: urg, search: q });
}

/* GET /needs/:id for drawer detail */
async function showNeedDetail(needId) {
  try {
    const n = await apiReq(`/needs/${needId}`);
    const facility = n.facility || {};
    openDrawer(`
      <div class="facility-hero">
        <div class="avatar-lg">${categoryBadge(n.category)}</div>
        <div>
          <h3 style="font-size:16px;font-weight:800;color:var(--g900);">${escHtml(n.title||n.name||'Need')}</h3>
          <div style="margin-top:4px;">${urgencyBadge(n.urgency)} ${statusBadge(n.status)}</div>
        </div>
      </div>
      <div class="drawer-section">
        <div class="drawer-section-title">Need Details</div>
        <div class="detail-row"><span class="detail-label">Category</span><span class="detail-val">${escHtml(n.category||'—')}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-val">${formatCurrency(n.amount||n.cash_equivalent)}</span></div>
        <div class="detail-row"><span class="detail-label">Children</span><span class="detail-val">${escHtml(String(n.children_count||'—'))}</span></div>
        <div class="detail-row"><span class="detail-label">Priority Score</span><span class="detail-val">${n.priority_score||n.score||'—'}</span></div>
        <div class="detail-row"><span class="detail-label">Total Donated</span><span class="detail-val">${formatCurrency(n.total_donated)}</span></div>
        <div class="detail-row"><span class="detail-label">Posted</span><span class="detail-val">${formatDate(n.created_at||n.createdAt)}</span></div>
      </div>
      <div class="drawer-section">
        <div class="drawer-section-title">Facility</div>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-val">${escHtml(facility.name||'—')}</span></div>
        <div class="detail-row"><span class="detail-label">City</span><span class="detail-val">${escHtml(facility.city||'—')}</span></div>
        <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-val">${escHtml(facility.contact_email||'—')}</span></div>
      </div>
      ${n.fulfillment_proof ? `<div class="drawer-section">
        <div class="drawer-section-title">Fulfillment Proof</div>
        <a href="${escHtml(n.fulfillment_proof)}" target="_blank" class="btn btn-outline btn-sm">View Photo →</a>
      </div>` : ''}
    `, escHtml(n.title||n.name||'Need Detail'));
  } catch(err) {
    showToast('Could not load need detail.', 'error');
  }
}

/* ══════════════════════════════════════
   RENDER: FULFILLED
══════════════════════════════════════ */
function renderFulfilled() {
  if (!fulfillments.length) {
    showTableMsg('fulfilled-tbody', 'No verified fulfillments yet.', 7);
    return;
  }
  document.getElementById('fulfilled-tbody').innerHTML = fulfillments.slice(0,40).map(item => {
    const proof = item.proof_url || item.proofUrl || item.photo_url || null;
    const isVerified = item.admin_verified || item.verified;
    return `<tr>
      <td>
        <div class="need-name">${escHtml(item.need?.title||item.need_title||item.description||'Need')}</div>
        <div class="need-facility">${item.need_id ? `#${item.need_id}` : ''}</div>
      </td>
      <td>${escHtml(item.facility?.name||item.facility_name||item.facility||'—')}</td>
      <td>${categoryBadge(item.category||item.need?.category)}</td>
      <td>${formatCurrency(item.amount||item.value||item.need?.amount)}</td>
      <td>${escHtml(item.donor_name||item.donorName||item.donor||'Anonymous')}</td>
      <td>${formatDate(item.fulfilled_at||item.fulfilledAt||item.created_at)}</td>
      <td><div class="tbl-actions">
        ${proof ? `<a href="${escHtml(proof)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">View Photo</a>` : '<span style="color:var(--g400);font-size:12px;">No photo</span>'}
        ${!isVerified
          ? `<button class="btn btn-success btn-sm" onclick="verifyFulfillment(${item.id})">Verify</button>`
          : `<span class="badge b-green">Admin Verified</span>`}
      </div></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════
   RENDER: DONORS
   Built from GET /donations (admin)
══════════════════════════════════════ */
function renderDonors() {
  if (!authToken) { showTableMsg('donors-tbody', 'Sign in to view donor records.', 7); return; }
  if (!donations.length) { showTableMsg('donors-tbody', 'No donations on record yet.', 7); return; }

  /* group by donor identity */
  const map = {};
  donations.forEach(d => {
    const key = d.donor_email || d.email || d.donor_name || d.donorName || `anon-${d.id}`;
    if (!map[key]) map[key] = { name: d.donor_name||d.donorName||'Anonymous', email: d.donor_email||d.email||'', type: d.donor_type||d.type||'Guest', total:0, count:0, last:null, streak: d.streak_months||0 };
    map[key].total += Number(d.amount)||0;
    map[key].count += 1;
    const dt = new Date(d.created_at||d.createdAt||0);
    if (!map[key].last || dt > new Date(map[key].last)) map[key].last = d.created_at||d.createdAt;
  });

  document.getElementById('donors-tbody').innerHTML = Object.values(map).slice(0,50).map(d => `
    <tr>
      <td>
        <div class="need-name">${escHtml(d.name)}</div>
        <div class="need-facility">${escHtml(d.email)}</div>
      </td>
      <td><span class="badge ${d.type==='Guest'?'b-teal':'b-blue'}">${escHtml(d.type)}</span></td>
      <td>${formatCurrency(d.total)}</td>
      <td>${d.count}</td>
      <td>${formatDate(d.last)}</td>
      <td>${streakBadge(d.streak)}</td>
      <td class="tbl-actions"><button class="btn btn-outline btn-sm" disabled title="Donor detail — post-pilot">View</button></td>
    </tr>`).join('');
}

/* ══════════════════════════════════════
   RENDER: FINANCE TRANSACTIONS
══════════════════════════════════════ */
function renderTransactions() {
  if (!authToken) { showTableMsg('txn-tbody', 'Sign in to view transactions.', 9); updateFinanceStats(); return; }
  if (!donations.length) { showTableMsg('txn-tbody', 'No transactions yet.', 9); updateFinanceStats(); return; }

  document.getElementById('txn-tbody').innerHTML = donations.slice(0,50).map(d => {
    const gross  = Number(d.amount)||0;
    const fee    = Math.round(gross * 0.015);
    const net    = gross - fee;
    const s      = (d.status||d.payment_status||'completed').toLowerCase();
    const sBadge = s==='completed'||s==='success' ? '<span class="badge b-green">Success</span>'
                 : s==='pending' ? '<span class="badge b-amber">Pending</span>'
                 : '<span class="badge b-red">Failed</span>';
    return `<tr>
      <td class="mono" style="font-size:11px;">${escHtml(d.reference||d.ref||`TXN-${d.id}`)}</td>
      <td>${escHtml(d.donor_name||d.donorName||'Anonymous')}</td>
      <td>${escHtml(d.facility_name||d.facility?.name||'—')}</td>
      <td>${formatCurrency(gross)}</td>
      <td style="color:var(--g500);">${formatCurrency(fee)}</td>
      <td>${formatCurrency(net)}</td>
      <td><span class="badge b-teal">${escHtml(d.payment_method||d.method||'Card')}</span></td>
      <td>${sBadge}</td>
      <td>${formatDate(d.created_at||d.createdAt)}</td>
    </tr>`;
  }).join('');
  updateFinanceStats();
}

function updateFinanceStats() {
  const total   = donations.reduce((s,d) => s+(Number(d.amount)||0), 0);
  const fees    = Math.round(total * 0.015);
  const net     = total - fees;
  const avg     = donations.length ? Math.round(total/donations.length) : 0;
  const pending = donations.filter(d => (d.status||'').toLowerCase()==='pending');

  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('fin-total',       authToken ? formatCurrency(total) : '—');
  set('fin-fees',        authToken ? formatCurrency(fees)  : '—');
  set('fin-avg',         authToken ? formatCurrency(avg)   : '—');
  set('fin-avg-sub',     authToken ? `${donations.length} transactions` : 'Sign in to view');
  set('rev-fees',        authToken ? formatCurrency(fees)  : '—');
  set('rev-net',         authToken ? formatCurrency(net)   : '—');
  set('rev-pending',     authToken ? formatCurrency(pending.reduce((s,d)=>s+(Number(d.amount)||0),0)) : '—');
  set('rev-pending-sub', authToken ? `${pending.length} payments pending` : 'Sign in to view');

  /* revenue breakdown */
  const revTbody = document.getElementById('revenue-tbody');
  if (revTbody && authToken && donations.length) {
    revTbody.innerHTML = `
      <tr><td>Donor Contributions</td><td>${formatCurrency(total)}</td><td><span class="badge b-green">Pilot</span></td><td>Running total for pilot period</td></tr>
      <tr><td>Platform Fees (1.5%)</td><td>${formatCurrency(fees)}</td><td><span class="badge b-blue">Stable</span></td><td>CareBridge operational income</td></tr>
      <tr><td>Facility Transfers</td><td>${formatCurrency(net)}</td><td><span class="badge b-green">Processed</span></td><td>Net delivered to verified orphanages</td></tr>`;
  } else if (revTbody && !authToken) {
    revTbody.innerHTML = `<tr><td colspan="4" style="padding:28px;text-align:center;color:var(--g400);">Sign in to view revenue breakdown.</td></tr>`;
  }
}

/* ══════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════ */
function openFacilityRegistrationModal() {
  const modal = document.getElementById('facility-registration-modal');
  ['facility-reg-name','facility-reg-city','facility-reg-country','facility-reg-email','facility-reg-phone','facility-reg-description'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  isFacilityRegistrationSubmitting = false;
  const submitBtn = document.querySelector('#facility-registration-modal .btn-primary');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Registration';
  }
  modal?.classList.add('open');
}

function closeFacilityRegistrationModal() {
  document.getElementById('facility-registration-modal')?.classList.remove('open');
}

async function submitFacilityRegistration() {
  if (isFacilityRegistrationSubmitting) {
    return;
  }

  const payload = {
    name: document.getElementById('facility-reg-name')?.value?.trim() || '',
    city: document.getElementById('facility-reg-city')?.value?.trim() || '',
    country: document.getElementById('facility-reg-country')?.value?.trim() || '',
    contact_email: document.getElementById('facility-reg-email')?.value?.trim() || '',
    contact_phone: document.getElementById('facility-reg-phone')?.value?.trim() || '',
    description: document.getElementById('facility-reg-description')?.value?.trim() || '',
  };

  if (!payload.name || !payload.city || !payload.country || !payload.contact_email || !payload.contact_phone) {
    showToast('Complete the required facility fields.', 'warning');
    return;
  }

  const submitBtn = document.querySelector('#facility-registration-modal .btn-primary');
  isFacilityRegistrationSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  }

  try {
    const created = await apiReq('/facilities/register', { method: 'POST', body: payload });
    const createdFacility = created?.facility || created || payload;
    facilities = mergeFacilities([...(facilities || []), {
      ...createdFacility,
      status: createdFacility.status || 'pending',
      created_at: createdFacility.created_at || new Date().toISOString(),
      createdAt: createdFacility.createdAt || createdFacility.created_at || new Date().toISOString(),
    }]);
    closeFacilityRegistrationModal();
    renderFacilities();
    renderDashboard();
    showToast('Facility submitted for verification and added to the pending queue.');
  } catch (err) {
    showToast(err.message || 'Facility registration failed.', 'error');
  } finally {
    isFacilityRegistrationSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Registration';
    }
  }
}

async function openDonationModal() {
  if (!authToken) {
    showToast('Please sign in to submit a donation.', 'warning');
    openAuthModal('signin');
    return;
  }

  if (!needs.length) {
    await fetchNeeds();
  }

  const select = document.getElementById('donation-need-id');
  if (!select) return;

  const options = needs
    .filter(n => (n.status||'').toLowerCase() !== 'fulfilled')
    .slice(0, 50)
    .map(n => `<option value="${n.id}">${escHtml(n.title||n.name||`Need #${n.id}`)}</option>`)
    .join('');

  select.innerHTML = options || '<option value="">No open needs available</option>';
  document.getElementById('donation-amount').value = '';
  document.getElementById('donation-modal')?.classList.add('open');
}

function closeDonationModal() {
  document.getElementById('donation-modal')?.classList.remove('open');
}

async function submitDonation() {
  if (!authToken) {
    showToast('Please sign in to submit a donation.', 'warning');
    openAuthModal('signin');
    return;
  }

  const needId = document.getElementById('donation-need-id')?.value;
  const amount = Number(document.getElementById('donation-amount')?.value);
  const paymentMethod = document.getElementById('donation-payment-method')?.value || 'card';

  if (!needId) {
    showToast('Choose a need before donating.', 'warning');
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Enter a valid donation amount.', 'warning');
    return;
  }

  try {
    await apiReq('/donations', {
      method: 'POST',
      body: {
        need_id: Number(needId),
        amount,
        payment_method: paymentMethod,
      },
    });
    closeDonationModal();
    showToast('Donation submitted successfully.');
    await fetchMyDonations();
    await fetchDonations();
  } catch (err) {
    showToast(err.message || 'Donation submission failed.', 'error');
  }
}

/* ══════════════════════════════════════
   ALERTS PANEL
══════════════════════════════════════ */
function showAlert() {
  const pending   = facilities.filter(f => ['pending','submitted','review'].includes((f.status||'').toLowerCase()));
  const unmatched = needs.filter(n => (Date.now()-new Date(n.created_at||n.createdAt||0).getTime()) > 86400000 && (n.status||'').toLowerCase()!=='fulfilled');
  const unverif   = fulfillments.filter(f => !f.admin_verified && !f.verified);
  const msgs = [];
  if (pending.length)   msgs.push(`${pending.length} facility registration${pending.length!==1?'s':''} pending verification`);
  if (unmatched.length) msgs.push(`${unmatched.length} need${unmatched.length!==1?'s':''} unmatched >24h`);
  if (unverif.length)   msgs.push(`${unverif.length} fulfillment${unverif.length!==1?'s':''} awaiting admin verification`);
  if (!msgs.length)     msgs.push('All clear — no actions required.');
  showToast(msgs.join(' · '), msgs.length > 1 || msgs[0] !== 'All clear — no actions required.' ? 'warning' : 'success');
}

/* ══════════════════════════════════════
   EXPORT STUBS
══════════════════════════════════════ */
function exportReport() { showToast('Export feature — post-pilot build.', 'warning'); }
function exportLog()    { showToast('Log export — post-pilot build.',    'warning'); }

/* ══════════════════════════════════════
   CLOCK
══════════════════════════════════════ */
function initClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
    const dt = document.getElementById('dash-time');
    if (dt && document.getElementById('view-dashboard')?.classList.contains('active'))
      dt.textContent = new Date().toLocaleString('en-NG');
  };
  tick();
  setInterval(tick, 60000);
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
async function init() {
  updateAuthUI();
  initClock();

  /* public data — no auth needed */
  await Promise.all([fetchFacilities(), fetchNeeds(), fetchFulfillments(), fetchUrgentNeeds()]);

  if (authToken) {
    await loadProtectedData();
  } else {
    renderDonors();
    renderTransactions();
    updateFinanceStats();
  }
}

/* ── Global exports ── */
Object.assign(window, {
  toggleAuthModal, closeAuthModal, openAuthModal, submitAuthLogin,
  nav, setSubTab,
  filterTable, filterTableBySelect, filterActivityLog,
  showAlert,
  closeDrawer, showFacilityDetails, showNeedDetail,
  openFlagModal, closeFlagModal, submitFlag,
  handleFacilityAction, verifyFulfillment,
  renderActiveNeeds, applyNeedFilters,
  exportReport, exportLog,
  showToast,
  openDonationModal, submitDonation,
  openFacilityRegistrationModal, submitFacilityRegistration,
  switchAuthMode,
  setAuthToken: window.setAuthToken,
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuthLogin();
  });
  document.getElementById('auth-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-password')?.focus();
  });
  init();
});
