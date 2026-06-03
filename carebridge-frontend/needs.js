/* ═══════════════════════════════════
   NEEDS PAGE LOGIC
═══════════════════════════════════ */
const API_BASE = 'https://carebridge-dxrd.onrender.com/api';
let needs = [];
const urgencyOrder = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function mapApiNeed(item) {
  return {
    id: String(item.id),
    name: item.facility_name || item.title || 'Unknown Facility',
    verified: item.facility_status === 'verified',
    category: item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Other',
    items: item.items || [],
    cash: Math.round(parseFloat(item.cash_equivalent) || 0),
    urgency: item.urgency || 'medium',
    children: item.children_count || 0,
    posted: item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'Unknown',
    desc: item.description || item.title || 'No description available',
    location: [item.city, item.country].filter(Boolean).join(', ') || 'Unknown Location'
  };
}

function needCardHTML(need, action) {
  const urgencyLabel = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
  }[need.urgency] || 'MEDIUM';

  return `
    <div class="card need-card" onclick="${action}('${need.id}')">
      <div class="need-card-head">
        <div>
          <div class="need-card-title">
            <h3>${need.name}</h3>
            ${need.verified ? '<span class="need-verified">✓</span>' : ''}
          </div>
          <div class="need-location"><span class="need-location-pin">📍</span>${need.location}</div>
        </div>
        <span class="badge badge-${need.urgency}">${urgencyLabel}</span>
      </div>
      <div class="need-category">${need.category.toLowerCase()}</div>
      <ul class="need-items">
        ${need.items.map(item => `<li>${item}</li>`).join('')}
      </ul>
      <div class="need-stat-row">
        <span>${need.children} children impacted</span>
        <span>${need.posted}</span>
      </div>
      <div class="need-divider"></div>
      <div class="need-bottom-row">
        <div>
          <div class="need-price-label">Cash equivalent</div>
          <div class="need-price">₦${need.cash.toFixed(2)}</div>
        </div>
        <div class="need-card-actions">
          <button class="btn btn-fund" type="button" onclick="event.stopPropagation(); openDetail('${need.id}')">Fund</button>
          <button class="btn btn-detail" type="button" onclick="event.stopPropagation(); openDetail('${need.id}')">Details</button>
        </div>
      </div>
    </div>`;
}

function openDetail(id) {
  const need = needs.find(item => item.id === String(id));
  if (!need) return;

  const avatar = document.getElementById('detail-avatar');
  const nameEl = document.getElementById('detail-name');
  const locationEl = document.getElementById('detail-location');
  const tagsEl = document.getElementById('detail-tags');
  const itemsTitle = document.getElementById('detail-items-title');
  const descEl = document.getElementById('detail-desc');
  const deliverArea = document.getElementById('deliver-area-display');
  const amountGrid = document.getElementById('amount-grid');

  if (avatar) {
    const initials = need.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
    avatar.textContent = initials || 'NA';
  }
  if (nameEl) nameEl.textContent = need.name;
  if (locationEl) locationEl.textContent = need.location;
  if (descEl) descEl.textContent = need.desc;
  if (deliverArea) deliverArea.textContent = need.location;
  if (itemsTitle) itemsTitle.textContent = `Need items (${need.items.length})`;
  if (tagsEl) {
    tagsEl.innerHTML = `
      <span class="tag">${need.category}</span>
      <span class="tag">${need.urgency}</span>
      <span class="tag">${need.children} children</span>
    `;
  }
  if (amountGrid) {
    amountGrid.innerHTML = [5000, 10000, 20000, 50000]
      .map(amount => `
        <button class="amount-btn" type="button" onclick="document.getElementById('custom-amount').value=${amount}; updateSummary();">
          ₦${amount.toLocaleString()}
        </button>
      `)
      .join('');
  }

  showPage('page-detail');
}

function renderLandingNeeds() {
  return; // no landing grid in this page
}

async function fetchNeeds(category) {
  const query = category ? `?category=${encodeURIComponent(category.toLowerCase())}` : '';
  const response = await fetch(`${API_BASE}/needs${query}`);
  if (!response.ok) {
    throw new Error(`Failed to load needs (${response.status})`);
  }
  const data = await response.json();
  needs = data.map(mapApiNeed);
  return needs;
}

async function loadNeeds() {
  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = 'Loading needs…';
  try {
    await fetchNeeds();
    if (document.getElementById('needs-grid')) renderDashboard();
    if (document.getElementById('landing-needs-grid')) renderLandingNeeds();
  } catch (err) {
    console.error(err);
    const grid = document.getElementById('needs-grid');
    const empty = document.getElementById('empty-state');
    if (grid) grid.innerHTML = '';
    if (empty) {
      empty.textContent = 'Unable to load needs. Please try again later.';
      empty.style.display = 'block';
    }
  }
}

function filterNeeds() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const cat = document.getElementById('cat-filter').value;
  const urg = document.getElementById('urg-filter').value;
  const filtered = needs
    .filter(n => {
      const matchQ = n.name.toLowerCase().includes(q) || n.items.some(i => i.toLowerCase().includes(q));
      const matchC = cat === 'All' || n.category === cat;
      const matchU = urg === 'All' || n.urgency === urg;
      return matchQ && matchC && matchU;
    })
    .sort((a,b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const grid = document.getElementById('needs-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('filter-count');
  count.innerHTML = `Showing <strong>${filtered.length}</strong> of <strong>${needs.length}</strong> needs`;

  if(filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtered.map(n => needCardHTML(n,'openDetail')).join('');
  }
}

function renderDashboard() {
  filterNeeds();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('needs-grid') || document.getElementById('landing-needs-grid')) {
    loadNeeds();
  }
});
