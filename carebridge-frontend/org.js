/* ══════════════════════════════════════════════════════════
   CareBridge OVC — Organisation Module (GTCo)
   Completely self-contained. Zero dependencies on script.js.

   Owns:
     ORG.data     — all org-specific data
     ORG.state    — all org UI state
     ORG.router   — intercepts #/org/* routes, delegates rest
     ORG.pages    — auth, dashboard, needs, finances, profile
     ORG.handlers — fund, commit, deliver, wallet
   ══════════════════════════════════════════════════════════ */

const ORG = (() => {

const API_BASE = "https://carebridge-dxrd.onrender.com/api";
const DEFAULT_WALLET_BALANCE = 3100000;
const DEFAULT_SIGNUP_STATE = {
  step: 0,
  orgName: "",
  email: "",
  password: "",
  budget: "",
  categories: [],
  walletAmount: "",
  country: "",
  state_: "",
  city: "",
  customLocation: "",
};
const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    signup: "/auth/signup",
    me: "/auth/me",
  },
  needs: {
    urgent: "/needs/urgent",
    all: "/needs",
    byId: (id) => `/needs/${id}`,
  },
  donations: {
    create: "/donations",
    my: "/donations/my",
    all: "/donations",
  },
  facilities: {
    all: "/facilities",
    register: "/facilities/register",
    byId: (id) => `/facilities/${id}`,
    verify: (id) => `/facilities/${id}/verify`,
    suspend: (id) => `/facilities/${id}/suspend`,
  },
  fulfillments: {
    all: "/fulfillments",
    verify: (id) => `/fulfillments/${id}/verify`,
  },
};

function getToken() {
  return localStorage.getItem("carebridge_token");
}

function setToken(token) {
  localStorage.setItem("carebridge_token", token);
}

function removeToken() {
  localStorage.removeItem("carebridge_token");
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem("carebridge_user");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    localStorage.removeItem("carebridge_user");
    return null;
  }
}

function saveStoredUser(user) {
  if (!user) {
    localStorage.removeItem("carebridge_user");
    return;
  }

  localStorage.setItem("carebridge_user", JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem("carebridge_user");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJSONResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (response.status === 204) {
    return null;
  }

  return response.text().then((text) => {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  });
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await parseJSONResponse(response);

  if (!response.ok) {
    const message = isPlainObject(data)
      ? data.error || data.message || "Something went wrong"
      : data || "Something went wrong";

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function safeRequest(executor, fallback = null) {
  try {
    return await executor();
  } catch (error) {
    console.warn("[ORG] API request failed.", error?.message || error);
    return fallback;
  }
}

async function optionalRequest(endpoint, options = {}, fallback = null) {
  return safeRequest(() => apiFetch(endpoint, options), fallback);
}

function normalizeUser(user = {}) {
  return {
    id: user.id || user.user_id || user.uuid || null,
    email: user.email || user.user_email || "",
    full_name: user.full_name || user.name || user.org_name || "",
    role: user.role || "organisation",
    ...user,
  };
}

function normalizeNeed(need = {}) {
  const fallbackList = Array.isArray(need.items) ? need.items : [];
  const normalizedItems = Array.isArray(need.items)
    ? need.items
    : typeof need.items === "string"
      ? need.items.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  return {
    id: String(need.id ?? need.need_id ?? need.needId ?? ""),
    orphanageName: need.orphanageName || need.facility_name || need.name || "Verified Care Facility",
    verified: Boolean(need.verified ?? need.is_verified ?? false),
    category: need.category || need.need_category || need.type || "Other",
    items: normalizedItems.length ? normalizedItems : fallbackList,
    cashEquivalent: Number(need.cashEquivalent ?? need.cash_equivalent ?? need.amount ?? need.target_amount ?? 0) || 0,
    urgency: String(need.urgency || need.priority || "medium").toLowerCase(),
    childrenImpacted: Number(need.childrenImpacted ?? need.children_count ?? need.children_impacted ?? need.children ?? 0) || 0,
    // keep the original timestamp value and a canonical createdAt for relative formatting
    createdAt: need.created_at || need.createdAt || need.time_posted || need.posted_at || null,
    timePosted: need.timePosted || null,
    description: need.description || need.details || "Community support request",
    location: need.location || need.city || need.country || "To be confirmed",
    deliveryAddress: need.deliveryAddress || need.address || "Delivery details pending",
    contactPerson: need.contactPerson || need.contact_name || "CareBridge team",
    contactPhone: need.contactPhone || need.contact_phone || "To be confirmed",
  };
}

function formatTransactionDate(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA");
}

function formatTransactionTime(value = new Date()) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(input) {
  if (!input) return "Just now";
  const date = (input instanceof Date) ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  return date.toLocaleDateString();
}

function normalizeDonation(donation = {}) {
  const createdAt = donation.created_at || donation.createdAt || donation.date || new Date();
  const amount = Number(donation.amount ?? donation.total_amount ?? 0) || 0;
  const id = String(donation.id ?? donation.donation_id ?? donation.transaction_id ?? `don-${Date.now()}`);
  const needId = String(donation.need_id ?? donation.needId ?? donation.need ?? "");
  const category = donation.category || donation.need_category || donation.needCategory || donation.category_name || "Other";

  return {
    id,
    type: amount >= 0 ? "credit" : "debit",
    description: donation.description || donation.note || `Donation for need #${needId || "current"}`,
    amount,
    date: formatTransactionDate(createdAt),
    time: formatTransactionTime(createdAt),
    facility: donation.facility || donation.orphanage_name || donation.need_name || "CareBridge partner",
    needId,
    category,
    raw: donation,
  };
}

function normalizeFulfillment(fulfillment = {}) {
  const deliveredAt = fulfillment.delivered_at || fulfillment.deliveredAt || fulfillment.created_at || fulfillment.createdAt || new Date();
  return {
    id: String(fulfillment.id ?? fulfillment.fulfillment_id ?? fulfillment.uuid ?? `ful-${Date.now()}`),
    title: fulfillment.title || fulfillment.name || fulfillment.activity || fulfillment.description || "Fulfillment update",
    status: fulfillment.status || fulfillment.state || (fulfillment.verified ? "verified" : "pending"),
    verified: Boolean(fulfillment.verified ?? false),
    amount: Number(fulfillment.amount ?? fulfillment.value ?? 0) || 0,
    deliveredAt,
    details: fulfillment.details || fulfillment.note || "",
    facility: fulfillment.facility || fulfillment.orphanage_name || "",
  };
}

function normalizeFacility(facility = {}, index = 0) {
  const amount = Number(facility.amount ?? facility.allocated_amount ?? facility.target_amount ?? 0) || 0;
  const rawStatus = facility.status || facility.state || "Active";
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();

  return {
    id: String(facility.id ?? facility.facility_id ?? facility.uuid ?? `facility-${index}`),
    facility: facility.name || facility.facility_name || facility.organization_name || `Facility ${index + 1}`,
    category: facility.category || facility.support_type || facility.primary_need || "Other",
    amount,
    status,
    location: facility.location || facility.city || facility.country || "To be confirmed",
    verified: Boolean(facility.verified ?? facility.is_verified ?? false),
    description: facility.description || "Facility details synced from CareBridge.",
  };
}

async function loadCurrentUser() {
  const storedUser = getStoredUser();
  state.currentUser = storedUser ? normalizeUser(storedUser) : null;

  if (!getToken()) {
    state.apiStatus.user = "fallback";
    return;
  }

  const remoteUser = await optionalRequest(API_ENDPOINTS.auth.me, { method: "GET" }, null);

  if (remoteUser) {
    const normalized = normalizeUser(remoteUser);
    state.currentUser = normalized;
    if (typeof remoteUser.walletBalance === "number" || typeof remoteUser.wallet_balance === "number") {
      state.walletBalance = Number(remoteUser.walletBalance ?? remoteUser.wallet_balance) || state.walletBalance;
    }
    saveStoredUser(normalized);
    state.apiStatus.user = "live";
    return;
  }

  state.apiStatus.user = "fallback";
}

async function loadNeeds() {
  const remoteNeeds = await safeRequest(async () => {
    const urgent = await optionalRequest(API_ENDPOINTS.needs.urgent, { method: "GET" }, null);

    if (Array.isArray(urgent)) {
      return urgent;
    }

    const all = await optionalRequest(API_ENDPOINTS.needs.all, { method: "GET" }, null);
    return Array.isArray(all) ? all : null;
  }, null);

  if (Array.isArray(remoteNeeds)) {
    data.needs = remoteNeeds.map(normalizeNeed);
    state.apiStatus.needs = "live";
    return;
  }

  state.apiStatus.needs = "fallback";
}

async function loadDonationHistory() {
  const remoteDonations = await optionalRequest(API_ENDPOINTS.donations.my, { method: "GET" }, null);

  if (Array.isArray(remoteDonations)) {
    data.transactions = remoteDonations.map(normalizeDonation);
    state.apiStatus.donations = "live";
    return;
  }

  state.apiStatus.donations = "fallback";
}

async function loadFulfillments() {
  const remoteFulfillments = await optionalRequest(API_ENDPOINTS.fulfillments.all, { method: "GET" }, null);

  if (Array.isArray(remoteFulfillments)) {
    data.fulfillments = remoteFulfillments.map(normalizeFulfillment);
    state.apiStatus.fulfillments = "live";
    return;
  }

  state.apiStatus.fulfillments = "fallback";
}

async function loadNeedDetail(needId) {
  if (!needId) {
    return null;
  }

  if (data.needDetails && data.needDetails[needId]) {
    return data.needDetails[needId];
  }

  const remoteNeed = await optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null);
  if (remoteNeed && typeof remoteNeed === "object") {
    data.needDetails = data.needDetails || {};
    data.needDetails[needId] = normalizeNeed(remoteNeed);
    state.apiStatus.needs = "live";
    return data.needDetails[needId];
  }

  return null;
}

async function prefetchPortfolioNeedDetails(limit = 5) {
  try {
    if (!Array.isArray(data.portfolio) || !Array.isArray(data.needs)) return;
    const toFetch = [];
    for (const item of data.portfolio) {
      // try to match a need by category first, fallback to first needs
      const matched = data.needs.find(n => n.category === item.category) || data.needs[0];
      if (matched && matched.id && !data.needDetails[matched.id]) {
        toFetch.push(matched.id);
      }
      if (toFetch.length >= limit) break;
    }

    await Promise.all(toFetch.map(id => loadNeedDetail(id)));
  } catch (e) {
    console.warn("[ORG] prefetchPortfolioNeedDetails failed", e?.message || e);
  }
}

async function _refreshNeed(needId) {
  if (!needId) return false;
  try {
    state.pendingNeedId = needId;
    const remoteNeed = await safeRequest(() => apiFetch(API_ENDPOINTS.needs.byId(needId), { method: "GET" }), null);
    if (remoteNeed) {
      data.needDetails = data.needDetails || {};
      data.needDetails[needId] = normalizeNeed(remoteNeed);
      // recompute dashboard metrics since details may affect counts
      deriveDashboardMetrics();
      state.pendingNeedId = null;
      _rerender();
      return true;
    }
  } catch (err) {
    console.warn("[ORG] refresh need failed", err?.message || err);
  }
  state.pendingNeedId = null;
  state.needFetchFailedId = needId;
  _rerender();
  return false;
}

function deriveDashboardMetrics() {
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const fulfillments = Array.isArray(data.fulfillments) ? data.fulfillments : [];
  const needs = Array.isArray(data.needs) ? data.needs : [];

  const fundedDonations = transactions.filter((t) => t.type === "debit");
  const totalDonated = fundedDonations.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const needsFunded = fundedDonations.length;

  const childrenReached = fundedDonations.reduce((sum, t) => {
    const matchedNeed = needs.find((n) => String(n.id) === String(t.needId));
    return sum + (matchedNeed?.childrenImpacted || 0);
  }, 0);

  const fulfilledCount = fulfillments.filter((f) => f.verified || /fulfilled|verified/i.test(f.status)).length;
  const fulfillmentRate = fulfillments.length ? Math.round((fulfilledCount / fulfillments.length) * 100) : 0;

  const spendByCategoryMap = fundedDonations.reduce((map, donation) => {
    const category = donation.category || donation.raw?.category || donation.raw?.need_category || donation.raw?.category_name || "Other";
    const key = category || "Other";
    map[key] = (map[key] || 0) + Math.abs(donation.amount);
    return map;
  }, {});

  const spendByCategoryTotal = Object.values(spendByCategoryMap).reduce((sum, amount) => sum + amount, 0) || 1;

  const spendByCategory = Object.entries(spendByCategoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, amount], index) => ({
      label,
      amount: `₦${fmt(amount)}`,
      percent: Math.min(100, Math.round((amount / spendByCategoryTotal) * 100)),
      color: ["bg-teal-500", "bg-rose-500", "bg-sky-600", "bg-violet-500", "bg-amber-400"][index] || "bg-gray-400",
    }));

  const recentFromDonations = transactions
    .slice()
    .sort((a, b) => new Date(b.raw?.created_at || b.raw?.createdAt || b.raw?.date || 0) - new Date(a.raw?.created_at || a.raw?.createdAt || a.raw?.date || 0))
    .slice(0, 3)
    .map((t) => ({
      icon: t.type === "credit" ? "💰" : "🪙",
      title: t.type === "credit" ? `Wallet funded: ${t.facility}` : `Funded: ${t.facility}`,
      time: t.date,
      detail: `${t.type === "credit" ? "+" : "-"}₦${fmt(Math.abs(t.amount))} ${t.type === "credit" ? "wallet top-up" : "payment confirmed"}`,
    }));

  const recentFromFulfillments = fulfillments
    .slice()
    .sort((a, b) => new Date(b.deliveredAt) - new Date(a.deliveredAt))
    .slice(0, 2)
    .map((f) => ({
      icon: "✅",
      title: f.title,
      time: formatTransactionDate(f.deliveredAt),
      detail: f.details || `Status: ${f.status}`,
    }));

  data.dashboardMetrics = {
    totalDonated,
    needsFunded,
    childrenReached,
    fulfillmentRate,
    spendByCategory: spendByCategory.length ? spendByCategory : data.spendByCategory,
    recentActivity: recentFromDonations.concat(recentFromFulfillments).slice(0, 4),
  };
}

async function loadFacilities() {
  const remoteFacilities = await optionalRequest(API_ENDPOINTS.facilities.all, { method: "GET" }, null);

  if (Array.isArray(remoteFacilities) && remoteFacilities.length) {
    data.portfolio = remoteFacilities.map((facility, index) => normalizeFacility(facility, index));
    state.apiStatus.facilities = "live";
    return;
  }

  state.apiStatus.facilities = "fallback";
}

async function bootstrapRemoteData() {
  await Promise.allSettled([loadCurrentUser(), loadNeeds(), loadDonationHistory(), loadFacilities(), loadFulfillments()]);
  deriveDashboardMetrics();
  // prefetch details for portfolio-linked needs to make detail view snappy
  try { await prefetchPortfolioNeedDetails(5); } catch (e) { /* ignore */ }
  state.bootstrapped = true;
}

function setApiStatus(key, value) {
  if (!state.apiStatus) {
    state.apiStatus = {};
  }

  state.apiStatus[key] = value;
}


  /* ═══════════════════════════════════════
     DATA — all org-specific mock data
  ═══════════════════════════════════════ */
  const data = {
    orgName:  "GTCo Foundation",
    orgInitials: "GT",
    orgEmail: "csr@gtco.org",
    dashboardMetrics: {},
    needDetails: {},

    needs: [
      { id:"1", orphanageName:"Hope Children's Home", verified:true, category:"Food", items:["Rice (50kg)","Cooking Oil (10L)","Beans (25kg)"], cashEquivalent:150000, urgency:"critical", childrenImpacted:32, timePosted:"2 hours ago", description:"Running critically low on food. Essentials to feed 32 children for two weeks.", location:"Ibadan, Nigeria", deliveryAddress:"23 Ajayi Road, Ibadan, Oyo State", contactPerson:"Amina Bello", contactPhone:"0803 123 4567" },
      { id:"2", orphanageName:"St. Mary's Orphanage", verified:true, category:"Education", items:["School Uniforms (15)","Textbooks (Math & English)","Backpacks (15)"], cashEquivalent:220000, urgency:"high", childrenImpacted:15, timePosted:"5 hours ago", description:"15 children need school supplies to start the new term.", location:"Lagos, Nigeria", deliveryAddress:"14 Bishop Road, Lagos", contactPerson:"Rev. Sister Chika Nwosu", contactPhone:"0812 987 6543" },
      { id:"3", orphanageName:"Little Angels Care", verified:true, category:"Medical", items:["First Aid Supplies","Fever Medication","Bandages & Antiseptic"], cashEquivalent:85000, urgency:"critical", childrenImpacted:22, timePosted:"1 hour ago", description:"Medical supplies urgently needed. Several children have fallen ill.", location:"Lagos, Nigeria", deliveryAddress:"7 Oduyemi Close, Surulere, Lagos", contactPerson:"Mrs. Tolu Adeyemi", contactPhone:"0909 321 0987" },
      { id:"4", orphanageName:"Sunshine Home for Children", verified:true, category:"Clothing", items:["Winter Blankets (20)","Warm Clothing (assorted)","Shoes (sizes 10–5)"], cashEquivalent:180000, urgency:"high", childrenImpacted:28, timePosted:"1 day ago", description:"Winter is approaching and many children lack warm clothing.", location:"Ibadan, Nigeria", deliveryAddress:"89 Muri Okunola, Victoria Island, Lagos", contactPerson:"Mr. Samuel Okonkwo", contactPhone:"0807 445 1122" },
      { id:"5", orphanageName:"Grace Orphanage", verified:true, category:"Shelter", items:["Mattresses (10)","Bed Frames (10)","Bedding Sets (10)"], cashEquivalent:420000, urgency:"medium", childrenImpacted:20, timePosted:"3 days ago", description:"10 new children welcomed — beds urgently needed.", location:"Ibadan, Nigeria", deliveryAddress:"54 Adetokunbo Street, Ibadan", contactPerson:"Mr. Dele Ogunleye", contactPhone:"0811 556 6789" },
      { id:"6", orphanageName:"Rainbow Children's Center", verified:true, category:"Food", items:["Fresh Vegetables","Milk Powder (5kg)","Eggs (10 trays)"], cashEquivalent:95000, urgency:"high", childrenImpacted:18, timePosted:"6 hours ago", description:"Nutritious food for balanced meals for one week.", location:"Lagos, Nigeria", deliveryAddress:"22 Finney Street, Accra", contactPerson:"Ms. Esi Mensah", contactPhone:"0233 555 6677" },
    ],

    portfolio: [
      { id:"p1", facility:"Graceland Home, Ibadan",  category:"Food",     amount:45000,  status:"Active" },
      { id:"p2", facility:"House of Hope, Lagos",    category:"Medical",  amount:22000,  status:"Matched" },
      { id:"p3", facility:"Bethel Rest Home, Ibadan",category:"Shelter",  amount:180000, status:"Active" },
      { id:"p4", facility:"New Dawn Care Home",      category:"Clothing", amount:36000,  status:"Fulfilled" },
      { id:"p5", facility:"Covenant Care OVC",       category:"Food",     amount:28000,  status:"Fulfilled" },
    ],

    transactions: [
      { id:"t1", type:"debit",  description:"Funded: Graceland Home – Food Need",     amount:-45000,   date:"2026-04-28", time:"14:32", facility:"Graceland Home" },
      { id:"t2", type:"credit", description:"Wallet funding via Mobile Money",         amount:1000000,  date:"2026-04-27", time:"09:15" },
      { id:"t3", type:"debit",  description:"Funded: House of Hope – Medical Need",    amount:-22000,   date:"2026-04-26", time:"16:45", facility:"House of Hope" },
      { id:"t4", type:"debit",  description:"Funded: Bethel Rest Home – Shelter Need", amount:-180000,  date:"2026-04-25", time:"11:20", facility:"Bethel Rest Home" },
      { id:"t5", type:"credit", description:"Wallet funding via Mobile Money",         amount:500000,   date:"2026-04-20", time:"08:30" },
    ],

    spendByCategory: [
      { label:"Food",      percent:38, amount:"₦1.9M", color:"bg-teal-500" },
      { label:"Medical",   percent:26, amount:"₦1.3M", color:"bg-rose-500" },
      { label:"Education", percent:20, amount:"₦1.0M", color:"bg-sky-600" },
      { label:"Shelter",   percent:10, amount:"₦500k", color:"bg-violet-500" },
      { label:"Clothing",  percent:6,  amount:"₦300k", color:"bg-amber-400" },
    ],

    recentActivity: [
      { icon:"🪙", title:"Food need funded for Hope Children's Home",   time:"2 hours ago",  detail:"₦45,000 · payment confirmed" },
      { icon:"📷", title:"Proof received from St. Mary's Orphanage",    time:"5 hours ago",  detail:"Photo evidence uploaded" },
      { icon:"💊", title:"Medical need matched for Little Angels",       time:"Yesterday",    detail:"Delivery scheduled for tomorrow" },
      { icon:"📄", title:"Q1 ESG report generated",                     time:"3 days ago",   detail:"12 pages · ready to export" },
    ],

    countries: ["Nigeria","Kenya","Ghana","South Africa","Uganda"],
    statesByCountry: {
      Nigeria: ["Lagos","Abuja","Kano","Rivers","Oyo"],
      Kenya:   ["Nairobi","Mombasa","Kisumu","Nakuru"],
      Ghana:   ["Accra","Kumasi","Tamale"],
      "South Africa": ["Gauteng","Cape Town","KwaZulu-Natal"],
      Uganda:  ["Kampala","Entebbe","Jinja"],
    },
    citiesByState: {
      Lagos:   ["Ikeja","Victoria Island","Lekki","Surulere","Yaba"],
      Nairobi: ["Westlands","Parklands","Karen","Kibera"],
      Accra:   ["Osu","Labone","Madina","Tema"],
    },
    categories: [
      { id:"food",       label:"Food & Nutrition" },
      { id:"medical",    label:"Medical & Healthcare" },
      { id:"education",  label:"Education & Books" },
      { id:"shelter",    label:"Shelter & Infrastructure" },
      { id:"clothing",   label:"Clothing & Essentials" },
      { id:"recreation", label:"Recreation & Activities" },
    ],
  };

  /* ═══════════════════════════════════════
     STATE — all org UI state in one place
  ═══════════════════════════════════════ */
  const state = {
    /* auth */
    authMode: "login",   // "login" | "signup"
    signup: JSON.parse(JSON.stringify(DEFAULT_SIGNUP_STATE)),
    currentUser: getStoredUser() ? normalizeUser(getStoredUser()) : null,

    /* dashboard */
    walletBalance: DEFAULT_WALLET_BALANCE,
    activeTab: "dashboard",

    /* needs */
    needsFilter: { category:"All", urgency:"All", search:"" },
    showMoreNeeds: false,
    autoFundSimilar: false,
    hiddenPortfolioIds: [],
    pendingNeedId: null,
    needFetchFailedId: null,

    /* need operations */
    customAmounts: {},    // { needId: amountString }
    commitments: {},      // { needId: commitment object }

    /* finances */
    showFundWalletModal: false,

    /* integration */
    apiStatus: {
      auth: "idle",
      needs: "idle",
      donations: "idle",
      facilities: "idle",
      user: "idle",
    },
    bootstrapped: false,
    lastSyncError: null,
  };

  /* ═══════════════════════════════════════
     UTILS — self-contained helpers
  ═══════════════════════════════════════ */
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function fmt(n) { return Number(n).toLocaleString("en-NG"); }

  const categoryColors = {
    Food:"from-teal-400 to-teal-500", Medical:"from-orange-400 to-orange-500",
    Education:"from-blue-400 to-blue-500", Shelter:"from-purple-400 to-purple-500",
    Clothing:"from-pink-400 to-pink-500",
  };
  const categoryIcons = { Food:"🍚", Medical:"❤️", Education:"📚", Shelter:"🏠", Clothing:"👕" };
  const statusBadgeClass = { Active:"bg-teal-50 text-teal-700", Matched:"bg-blue-50 text-blue-700", Fulfilled:"bg-gray-100 text-gray-600" };
  const urgencyOrder = { critical:0, high:1, medium:2 };

  function verifiedBadge(size="w-5 h-5", color="text-teal-600") {
    return `<svg class="${size} ${color} flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
    </svg>`;
  }
  function urgencyBadge(u) {
    const cls = { critical:"bg-red-100 text-red-800 border-red-200", high:"bg-orange-100 text-orange-800 border-orange-200", medium:"bg-yellow-100 text-yellow-800 border-yellow-200" };
    return `<span class="px-3 py-1 rounded-full text-xs font-medium border ${cls[u]||""}">${(u||"").toUpperCase()}</span>`;
  }

  function getCommitment(needId) {
    return state.commitments[needId] || { mode:"fund", funded:false, committed:false, inTransit:false, delivered:false, fulfilled:false, fundedAmount:0 };
  }
  function getSelectedAmount(needId, fallback) {
    const raw = state.customAmounts[needId];
    const parsed = raw === undefined || raw === null || raw === "" ? fallback : parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
  function formatTransactionDate(date = new Date()) {
    return date.toLocaleDateString("en-CA");
  }
  function formatTransactionTime(date = new Date()) {
    return date.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  }
  function addTransaction(description, amount, facility) {
    data.transactions.unshift({
      id: `tx-${Date.now()}`,
      type: amount >= 0 ? "credit" : "debit",
      description,
      amount,
      date: formatTransactionDate(),
      time: formatTransactionTime(),
      facility,
    });
  }
  function setNeedAction(needId, mode) {
    const current = getCommitment(needId);
    state.commitments[needId] = {
      mode,
      funded: mode === "fund" ? current.funded : false,
      committed: mode === "delivery" ? current.committed : false,
      inTransit: mode === "delivery" ? current.inTransit : false,
      delivered: mode === "delivery" ? current.delivered : false,
      fulfilled: mode === "fund" ? current.fulfilled : false,
      fundedAmount: mode === "fund" ? current.fundedAmount : 0,
    };
  }

  /* ═══════════════════════════════════════
     SHELL — top bar + sidebar layout
  ═══════════════════════════════════════ */
  const nav = [
    { id:"dashboard", label:"Dashboard",           href:"#/org/dashboard", icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>` },
    { id:"needs",     label:"Needs",               href:"#/org/needs",     icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>` },
    { id:"finances",  label:"Finances",            href:"#/org/finances",  icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>` },
    { id:"profile",   label:"Profile",             href:"#/org/profile",   icon:`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>` },
  ];

  function topBar() {
    return `
      <header class="org-topbar bg-white border-b border-gray-200 sticky top-0 z-20">
        <div class="px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm">
              <span class="text-white font-bold text-lg">${esc((state.currentUser && state.currentUser.full_name) ? state.currentUser.full_name.slice(0,2).toUpperCase() : data.orgInitials)}</span>
            </div>
            <div>
              <p class="font-bold text-gray-900 leading-tight">${esc((state.currentUser && state.currentUser.full_name) ? state.currentUser.full_name : data.orgName)}</p>
              <p class="text-xs text-gray-500">CSR partner · verified dashboard</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="hidden sm:flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
              <span class="text-xs text-teal-700 font-medium">Wallet</span>
              <span class="font-bold text-teal-800 text-sm">₦${fmt(state.walletBalance)}</span>
            </div>
            <a href="#/org/needs"     class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">View Needs</a>
            <a href="#/org/finances"  class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">Finances</a>
            <button onclick="ORG.signOut()" class="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 text-sm">Sign out</button>
          </div>
        </div>
      </header>`;
  }

  function sidebar(activeId) {
    return `
      <aside class="org-sidebar w-64 flex-shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] p-4">
        <nav class="space-y-1">
          ${nav.map(item => `
            <a href="${item.href}" class="org-nav-item flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium
              ${activeId === item.id
                ? "bg-teal-50 text-teal-700 font-semibold border border-teal-100 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}">
              <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
              <span>${item.label}</span>
            </a>`).join("")}
        </nav>

        <div class="mt-6 pt-6 border-t border-gray-100">
          <div class="rounded-xl bg-teal-600 text-white p-4">
<p class="text-xs text-teal-100 mb-1">Annual budget used</p>
            ${(function() {
              const metrics = data.dashboardMetrics || {};
              const deployed = metrics.totalDonated || 0;
              const budget = (state.currentUser && state.currentUser.monthly_budget) ? Number(state.currentUser.monthly_budget) : 0;
              const pct = budget > 0 ? Math.min(100, Math.round((deployed / budget) * 100)) : 0;
              const pctLabel = budget > 0 ? pct + "%" : "—";
              const deployedLabel = deployed > 0 ? "₦" + fmt(deployed) : "₦0";
              const budgetLabel = budget > 0 ? "₦" + fmt(budget) : "Not set";
              return `
                <p class="text-2xl font-bold mb-1">${pctLabel}</p>
                <div class="h-1.5 bg-teal-500 rounded-full overflow-hidden">
                  <div class="h-full bg-white rounded-full" style="width:${pct}%"></div>
                </div>
                <p class="text-xs text-teal-100 mt-2">${deployedLabel} of ${budgetLabel} deployed</p>
              `;
            })()}
          </div>
        </div>
      </aside>`;
  }

  function shell(activeTab, content, modalHtml = "") {
    return `
      <div class="org-shell min-h-screen bg-gray-50">
        ${topBar()}
        <div class="flex">
          ${sidebar(activeTab)}
          <main class="flex-1 p-6 lg:p-8 min-w-0">${content}</main>
        </div>
        <div id="org-modal-container">${modalHtml}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════
     PAGE: ORG AUTH (login + 4-step signup)
  ═══════════════════════════════════════ */
  function renderAuthPage() {
    return state.authMode === "login" ? renderLogin() : renderSignup();
  }

  function renderLogin() {
    return `
      <div class="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div class="w-full max-w-md">

          <div class="text-center mb-8">
            <a href="#/" class="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm mb-6">
              ← Back to CareBridge
            </a>
            <div class="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span class="text-white font-bold text-2xl">GT</span>
            </div>
            <h1 class="text-3xl font-bold text-gray-900">Organisation Sign In</h1>
            <p class="text-gray-500 mt-2">CSR partner portal · GTCo Foundation</p>
          </div>

          <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div class="flex gap-2 bg-gray-100 rounded-xl p-1 mb-8">
              <button onclick="ORG._setAuthMode('login')"
                class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all bg-white text-gray-900 shadow-sm">
                Sign In
              </button>
              <button onclick="ORG._setAuthMode('signup')"
                class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all text-gray-500 hover:text-gray-700">
                Register Org
              </button>
            </div>

            <form onsubmit="ORG._loginSubmit(event)" class="space-y-5">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <input type="email" required placeholder="csr@yourorg.com"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 bg-gray-50" />
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <input type="password" required placeholder="••••••••"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
                <button type="button" class="text-sm text-teal-600 hover:text-teal-700 mt-2 font-medium">Forgot password?</button>
              </div>
              <button type="submit"
                class="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-base shadow-sm transition-colors">
                Sign In to Dashboard
              </button>
            </form>

            <div class="mt-6 pt-6 border-t border-gray-100 text-center">
              <p class="text-sm text-gray-600">
                No account?
                <button onclick="ORG._setAuthMode('signup')" class="text-teal-600 hover:text-teal-700 font-semibold ml-1">Register your organisation →</button>
              </p>
            </div>
          </div>

          <p class="text-center text-xs text-gray-400 mt-6">
            Individual donors →
            <a href="#/donor/auth" class="text-teal-600 hover:underline">donor login</a>
          </p>
        </div>
      </div>`;
  }

  function renderSignup() {
    const s = state.signup;
    const steps = [
      { label:"Organisation", icon:"🏢" },
      { label:"Support Setup", icon:"🎯" },
      { label:"Fund Wallet", icon:"💳" },
      { label:"Location", icon:"📍" },
    ];
    const pct = Math.round(((s.step + 1) / steps.length) * 100);

    function canProceed() {
      switch(s.step) {
        case 0: return s.orgName && s.email && s.password;
        case 1: return s.budget && s.categories.length > 0;
        case 2: return s.walletAmount && parseFloat(s.walletAmount) > 0;
        case 3: return s.country && (s.state_ || s.customLocation);
        default: return false;
      }
    }

    return `
      <div class="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div class="w-full max-w-2xl">

          <div class="text-center mb-6">
            <a href="#/org/auth" class="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-4">
              ← Back to sign in
            </a>
            <h1 class="text-3xl font-bold text-gray-900">Organisation Registration</h1>
            <p class="text-gray-500 mt-1">Set up your CareBridge CSR dashboard</p>
          </div>

          <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">

            <!-- Step indicators -->
            <div class="mb-8">
              <div class="flex items-center justify-between mb-4">
                ${steps.map((step, i) => `
                  <div class="flex flex-col items-center gap-1 flex-1">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all
                      ${i < s.step ? "bg-teal-600 text-white" : i === s.step ? "bg-teal-50 text-teal-700 border-2 border-teal-600" : "bg-gray-100 text-gray-400"}">
                      ${i < s.step ? "✓" : step.icon}
                    </div>
                    <span class="text-xs font-medium ${i === s.step ? "text-teal-700" : "text-gray-400"} hidden sm:block">${step.label}</span>
                  </div>
                  ${i < steps.length - 1 ? `<div class="flex-1 max-w-[40px] h-px mx-1 mt-[-20px] ${i < s.step ? "bg-teal-600" : "bg-gray-200"}"></div>` : ""}
                `).join("")}
              </div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-teal-600 rounded-full transition-all duration-300" style="width:${pct}%"></div>
              </div>
              <p class="text-right text-xs text-gray-400 mt-1">Step ${s.step + 1} of ${steps.length}</p>
            </div>

            <!-- Step content -->
            ${renderSignupStep(s.step)}

            <!-- Navigation -->
            <div class="flex gap-3 mt-8">
              ${s.step > 0 ? `
                <button onclick="ORG._signupBack()"
                  class="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold">
                  ← Back
                </button>` : ""}
              <button onclick="ORG._signupNext()" ${!canProceed() ? "disabled" : ""}
                class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors">
                ${s.step === steps.length - 1 ? "Complete Registration →" : "Continue →"}
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderSignupStep(step) {
    const s = state.signup;
    if (step === 0) return `
      <div class="space-y-5">
        <div><h2 class="text-xl font-bold text-gray-900">Basic Information</h2><p class="text-sm text-gray-500 mt-1">Tell us about your organisation</p></div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Organisation Name</label>
          <input type="text" placeholder="e.g. GTCo Foundation" value="${esc(s.orgName)}"
            oninput="ORG._signupField('orgName',this.value)"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Work Email</label>
          <input type="email" placeholder="csr@yourorg.com" value="${esc(s.email)}"
            oninput="ORG._signupField('email',this.value)"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
          <input type="password" placeholder="Minimum 8 characters" value="${esc(s.password)}"
            oninput="ORG._signupField('password',this.value)"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
        </div>
      </div>`;

    if (step === 1) return `
      <div class="space-y-5">
        <div><h2 class="text-xl font-bold text-gray-900">Support Setup</h2><p class="text-sm text-gray-500 mt-1">Define your giving parameters</p></div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Monthly Budget (₦)</label>
          <input type="number" placeholder="500000" value="${esc(s.budget)}"
            oninput="ORG._signupField('budget',this.value)"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          <p class="text-xs text-gray-400 mt-1">How much do you want to allocate monthly?</p>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">Categories of Needs to Support</label>
          <div class="grid grid-cols-2 gap-3">
            ${data.categories.map(cat => `
              <label class="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors
                ${s.categories.includes(cat.id) ? "border-teal-300 bg-teal-50" : ""}">
                <input type="checkbox" value="${cat.id}" ${s.categories.includes(cat.id) ? "checked" : ""}
                  onchange="ORG._toggleCategory('${cat.id}')"
                  class="w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                <span class="text-sm font-medium text-gray-700">${esc(cat.label)}</span>
              </label>`).join("")}
          </div>
        </div>
      </div>`;

    if (step === 2) {
      const walletAmt = parseFloat(s.walletAmount) || 0;
      const fee = walletAmt > 0 ? Math.round(walletAmt * 0.015) : 0;
      return `
        <div class="space-y-5">
          <div><h2 class="text-xl font-bold text-gray-900">Fund Your Wallet</h2><p class="text-sm text-gray-500 mt-1">Add initial funds to start supporting needs immediately</p></div>
          <div class="bg-teal-50 border border-teal-200 rounded-xl p-5">
            <div class="flex gap-3">
              <div class="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">ℹ️</div>
              <div>
                <p class="font-semibold text-teal-900">Why fund your wallet?</p>
                <p class="text-sm text-teal-700 mt-1">Pre-funded wallets let you instantly match and support needs without payment delays. Funds are secure and withdrawable anytime.</p>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Initial Wallet Amount (₦)</label>
            <div class="grid grid-cols-2 gap-2 mb-3">
              ${[500000,1000000,2500000,5000000].map(a => `
                <button type="button" onclick="ORG._signupField('walletAmount','${a}'); ORG._rerender()"
                  class="py-3 rounded-xl border-2 font-semibold text-sm transition-colors
                  ${s.walletAmount == a ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-700 hover:border-gray-300"}">
                  ₦${fmt(a)}
                </button>`).join("")}
            </div>
            <input type="number" placeholder="Or enter custom amount" value="${esc(s.walletAmount)}"
              oninput="ORG._signupField('walletAmount',this.value); ORG._rerender()"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
            <p class="text-xs text-gray-400 mt-1">Minimum: ₦10,000</p>
          </div>
          ${walletAmt > 0 ? `
            <div class="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200">
              <div class="flex justify-between text-sm"><span class="text-gray-600">Amount</span><span class="font-bold text-gray-900">₦${fmt(walletAmt)}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-600">Fee (1.5%)</span><span class="font-bold text-gray-900">₦${fmt(fee)}</span></div>
              <div class="border-t border-gray-200 pt-2 flex justify-between"><span class="font-bold text-gray-900">Total to pay</span><span class="text-lg font-bold text-teal-600">₦${fmt(walletAmt + fee)}</span></div>
            </div>` : ""}
        </div>`;
    }

    if (step === 3) {
      const stateList = (data.statesByCountry[s.country] || []);
      const cityList  = (data.citiesByState[s.state_] || []);
      return `
        <div class="space-y-5">
          <div><h2 class="text-xl font-bold text-gray-900">Location Targeting</h2><p class="text-sm text-gray-500 mt-1">Choose where to focus your support</p></div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Country</label>
            <select onchange="ORG._signupField('country',this.value); ORG._signupField('state_',''); ORG._signupField('city',''); ORG._rerender()"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
              <option value="">Select Country</option>
              ${data.countries.map(c => `<option value="${c}" ${s.country===c?"selected":""}>${c}</option>`).join("")}
            </select>
          </div>
          ${stateList.length ? `
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">State / Region</label>
              <select onchange="ORG._signupField('state_',this.value); ORG._signupField('city',''); ORG._rerender()"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
                <option value="">Select State</option>
                ${stateList.map(st => `<option value="${st}" ${s.state_===st?"selected":""}>${st}</option>`).join("")}
              </select>
            </div>` : ""}
          ${cityList.length ? `
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">City (optional)</label>
              <select onchange="ORG._signupField('city',this.value)"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50">
                <option value="">Select City</option>
                ${cityList.map(c => `<option value="${c}" ${s.city===c?"selected":""}>${c}</option>`).join("")}
              </select>
            </div>` : ""}
          <div class="relative flex items-center gap-3">
            <div class="flex-1 border-t border-gray-200"></div>
            <span class="text-xs text-gray-400 font-medium">OR</span>
            <div class="flex-1 border-t border-gray-200"></div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Custom Location</label>
            <input type="text" placeholder="e.g. West Africa, Northern Nigeria" value="${esc(s.customLocation)}"
              oninput="ORG._signupField('customLocation',this.value)"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
        </div>`;
    }
    return "";
  }

  /* ═══════════════════════════════════════
     PAGE: DASHBOARD
  ═══════════════════════════════════════ */
  function renderDashboard() {
    const portfolioCounts = {
      Active:    data.portfolio.filter(i => i.status==="Active").length,
      Matched:   data.portfolio.filter(i => i.status==="Matched").length,
      Fulfilled: data.portfolio.filter(i => i.status==="Fulfilled").length,
    };

    const dashboardMetrics = data.dashboardMetrics || {};
    const metricCards = [
      { label:"TOTAL DONATED", value: dashboardMetrics.totalDonated != null ? `₦${fmt(dashboardMetrics.totalDonated)}` : "₦4.2M", note:"↑18% vs Q1", accent:"border-teal-400" },
      { label:"NEEDS FUNDED", value: dashboardMetrics.needsFunded != null ? dashboardMetrics.needsFunded : "23", note:"+8 this quarter", accent:"border-sky-400" },
      { label:"CHILDREN REACHED", value: dashboardMetrics.childrenReached != null ? dashboardMetrics.childrenReached : "847", note:"11 facilities", accent:"border-amber-400" },
      { label:"FULFILLMENT RATE", value: dashboardMetrics.fulfillmentRate != null ? `${dashboardMetrics.fulfillmentRate}%` : "96%", note:"↑4% vs Q1", accent:"border-emerald-400" },
    ];

    const spendByCategory = dashboardMetrics.spendByCategory || data.spendByCategory;
    const spendByCategoryTotal = spendByCategory.reduce((sum, item) => {
      const amount = Number(String(item.amount).replace(/[^0-9.-]/g, "")) || 0;
      return sum + amount;
    }, 0);
    const spendTotalLabel = Array.isArray(dashboardMetrics.spendByCategory) && dashboardMetrics.spendByCategory.length
      ? `Total ₦${fmt(spendByCategoryTotal)}`
      : "Total ₦5M";

    const recentActivity = dashboardMetrics.recentActivity || data.recentActivity;

    const content = `
      <div class="space-y-8">

        <!-- Hero banner -->
        <div class="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-lg">
          <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div class="max-w-xl">
              <p class="text-xs text-teal-200 uppercase tracking-widest mb-2">Portfolio health</p>
              <h1 class="text-3xl font-bold">${esc(data.orgName)} Impact Dashboard</h1>
              <p class="mt-2 text-sm text-slate-200 leading-relaxed">Prioritize funding, monitor commitments, and confirm delivery progress — one clean workspace built for CSR operators.</p>
            </div>
            <div class="grid sm:grid-cols-2 gap-3 min-w-[280px]">
              <div class="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3">
                <p class="text-xs uppercase tracking-widest text-teal-200">Live pipeline</p>
                <p class="mt-2 text-2xl font-bold">${portfolioCounts.Active + portfolioCounts.Matched} active</p>
              </div>
              <div class="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3">
                <p class="text-xs uppercase tracking-widest text-teal-200">Wallet balance</p>
                <p class="mt-2 text-xl font-bold">₦${fmt(state.walletBalance)}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Stat cards -->
        <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          ${metricCards.map(s => `
            <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 border-t-4 ${s.accent}">
              <p class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">${s.label}</p>
              <p class="text-3xl font-bold text-gray-900">${s.value}</p>
              <p class="text-sm text-gray-500 mt-1">${s.note}</p>
            </div>`).join("")}
        </div>

        <div class="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">

          <!-- Spend by category -->
          <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <p class="text-sm text-gray-500">Spend by category</p>
                <h2 class="text-xl font-bold text-gray-900">Funding distribution</h2>
              </div>
              <span class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">${spendTotalLabel}</span>
            </div>
            <div class="space-y-4">
              ${spendByCategory.map(item => `
                <div>
                  <div class="flex items-center justify-between mb-1.5 text-sm">
                    <span class="font-semibold text-gray-900">${esc(item.label)}</span>
                    <span class="text-gray-500">${esc(item.amount)} · <span class="font-bold text-gray-900">${item.percent}%</span></span>
                  </div>
                  <div class="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div class="h-full ${item.color} rounded-full transition-all duration-500" style="width:${item.percent}%"></div>
                  </div>
                </div>`).join("")}
            </div>
          </section>

          <!-- Recent activity -->
          <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div class="flex items-center justify-between mb-5">
              <div>
                <p class="text-sm text-gray-500">What just happened</p>
                <h2 class="text-xl font-bold text-gray-900">Recent Activity</h2>
              </div>
              <span class="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-bold">● Live</span>
            </div>
            <div class="space-y-3">
              ${recentActivity.map(a => `
                <div class="flex gap-3 items-start rounded-xl bg-gray-50 p-3.5">
                  <span class="text-xl flex-shrink-0">${a.icon}</span>
                  <div>
                    <p class="text-sm font-semibold text-gray-900">${esc(a.title)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${esc(a.detail)}</p>
                    <p class="text-[11px] text-gray-400 mt-1.5">${esc(a.time)}</p>
                  </div>
                </div>`).join("")}
            </div>
          </section>
        </div>

        <!-- Active portfolio table -->
        <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <p class="text-sm text-gray-500">Active portfolio</p>
              <h2 class="text-xl font-bold text-gray-900">Current Funding Commitments</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-sm font-bold">${portfolioCounts.Active} Active</span>
              <span class="px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-sm font-bold">${portfolioCounts.Matched} Matched</span>
              <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-sm font-bold">${portfolioCounts.Fulfilled} Fulfilled</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[640px]">
              <thead>
                <tr class="border-b border-gray-200">
                  ${["Facility","Category","Amount","Status","Actions"].map(h => `
                    <th class="text-left py-3 px-4 text-xs font-bold uppercase tracking-widest text-gray-400">${h}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${data.portfolio.map(item => `
                  <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td class="py-4 px-4 font-semibold text-gray-900 text-sm">${esc(item.facility)}</td>
                    <td class="py-4 px-4"><span class="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">${esc(item.category)}</span></td>
                    <td class="py-4 px-4 font-bold text-gray-900 text-sm">₦${fmt(item.amount)}</td>
                    <td class="py-4 px-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadgeClass[item.status]||"bg-gray-100 text-gray-600"}">${esc(item.status)}</span></td>
                    <td class="py-4 px-4">
                      <div class="flex gap-2">
                        <a href="#/org/needs" class="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 border border-sky-200">View needs</a>
                        <a href="#/org/needs" class="px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold hover:bg-teal-100 border border-teal-200">Fund</a>
                      </div>
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>`;
    return shell("dashboard", content);
  }

  /* ═══════════════════════════════════════
     PAGE: NEEDS
  ═══════════════════════════════════════ */
  function renderNeeds() {
    const f = state.needsFilter;
    const urgOrd = { critical:0, high:1, medium:2 };

    const matchesFilter = n => {
      const catOk  = f.category === "All" || n.category === f.category;
      const urgOk  = f.urgency  === "All" || n.urgency === f.urgency.toLowerCase();
      const q      = f.search.toLowerCase();
      const text   = [n.orphanageName, n.location, n.description, ...n.items].join(" ").toLowerCase();
      return catOk && urgOk && (!q || text.includes(q));
    };

    // const portfolioNeeds = data.portfolio
    //   .map((item, idx) => {
    //     const matched = data.needs.find(n => n.category === item.category) || data.needs[idx % data.needs.length];
    //     return { ...matched, id: matched.id, facility: item.facility, portfolioStatus: item.status, portfolioAmount: item.amount };
    //   })
    //   .filter(n => !state.hiddenPortfolioIds.includes(n.id))
    //   .filter(matchesFilter);
    const portfolioNeeds = data.portfolio
      .filter(item => !state.hiddenPortfolioIds.includes(item.id))
      .filter(item => {
        const catOk = f.category === "All" || item.category === f.category;
        const q = f.search.toLowerCase();
        const text = [item.facility, item.category, item.location || ""].join(" ").toLowerCase();
        return catOk && (!q || text.includes(q));
      })
      .map(item => ({
        id: item.id,
        orphanageName: item.facility,
        category: item.category,
        location: item.location || "To be confirmed",
        verified: item.verified || false,
        description: item.description || "Facility details synced from CareBridge.",
        childrenImpacted: 0,
        cashEquivalent: item.amount,
        urgency: "medium",
        timePosted: "",
        items: [],
        portfolioStatus: item.status,
        portfolioAmount: item.amount,
      }));

    const discoveryNeeds = data.needs
      .filter(n => !portfolioNeeds.some(p => p.id === n.id))
      .filter(matchesFilter)
      .sort((a,b) => urgOrd[a.urgency] - urgOrd[b.urgency]);

    const cats = ["All","Food","Medical","Education","Shelter","Clothing"];
    const urgs = ["All","Critical","High","Medium"];

    const content = `
      <div class="space-y-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Needs / Opportunities</h1>
          <p class="text-gray-500 mt-1">Your active portfolio first, then discover new funding opportunities.</p>
        </div>

        <!-- Filters -->
        <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div class="grid md:grid-cols-3 gap-4">
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" value="${esc(f.search)}" placeholder="Search facility, need, or location…"
                oninput="ORG._setFilter('search',this.value)"
                class="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
            </div>
            <select onchange="ORG._setFilter('category',this.value)"
              class="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500">
              ${cats.map(c => `<option value="${c}" ${f.category===c?"selected":""}>${c==="All"?"All Categories":c}</option>`).join("")}
            </select>
            <select onchange="ORG._setFilter('urgency',this.value)"
              class="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500">
              ${urgs.map(u => `<option value="${u}" ${f.urgency===u?"selected":""}>${u==="All"?"All Urgency Levels":u}</option>`).join("")}
            </select>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-gray-100">
            <div class="flex flex-wrap gap-2">
              <span class="px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold rounded-full">${data.portfolio.filter(i=>i.status==="Active").length} Active</span>
              <span class="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-full">${data.portfolio.filter(i=>i.status==="Matched").length} Matched</span>
              <span class="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-200 text-xs font-bold rounded-full">${data.portfolio.filter(i=>i.status==="Fulfilled").length} Fulfilled</span>
            </div>
            <!-- Auto-fund toggle -->
            <label class="flex items-center gap-3 cursor-pointer">
              <span class="text-sm font-medium text-gray-700">Auto-fund similar needs</span>
              <div class="relative">
                <input type="checkbox" ${state.autoFundSimilar?"checked":""} onchange="ORG._toggleAutoFund(this.checked)" class="sr-only peer"/>
                <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal-600 transition-all"></div>
                <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
              </div>
              <span class="text-sm ${state.autoFundSimilar?"text-teal-700 font-semibold":"text-gray-400"}">${state.autoFundSimilar?"On":"Off"}</span>
            </label>
          </div>
          ${state.autoFundSimilar ? `<p class="text-sm text-teal-700 bg-teal-50 rounded-lg p-3 border border-teal-200">Auto-fund rules: same category, similar urgency, location within your active portfolio.</p>` : ""}
        </div>

        <!-- Portfolio needs -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-gray-900">Active Portfolio</h2>
              <p class="text-sm text-gray-500">${portfolioNeeds.length} tracked need${portfolioNeeds.length !== 1 ? "s" : ""} visible</p>
            </div>
            ${!state.showMoreNeeds ? `
              <button onclick="ORG._toggleShowMore(true)"
                class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-sm">
                Discover more needs
              </button>` : ""}
          </div>

          ${portfolioNeeds.length === 0 ? `
            <div class="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
              <p class="text-gray-500">No portfolio needs match your current filters.</p>
            </div>` : ""}

          <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            ${portfolioNeeds.map(n => renderPortfolioCard(n)).join("")}
          </div>
        </section>

        <!-- Discovery mode -->
        ${state.showMoreNeeds ? `
          <section class="space-y-4 border-t-2 border-dashed border-gray-200 pt-6">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-bold text-gray-900">Discover New Needs</h2>
                <p class="text-sm text-gray-500">Additional verified opportunities outside your current portfolio.</p>
              </div>
              <button onclick="ORG._toggleShowMore(false)"
                class="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium">
                Hide discovery
              </button>
            </div>
            ${discoveryNeeds.length === 0 ? `
              <div class="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
                <p class="text-gray-500">No additional needs match your filters right now.</p>
              </div>` : ""}
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              ${discoveryNeeds.map(n => renderDiscoveryCard(n)).join("")}
            </div>
          </section>` : ""}
      </div>`;
    return shell("needs", content);
  }

  function renderPortfolioCard(n) {
    return `
      <article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
        <div class="bg-gradient-to-br ${categoryColors[n.category]||"from-gray-400 to-gray-500"} h-24 flex items-center justify-center relative">
          <span class="text-5xl">${categoryIcons[n.category]||"📦"}</span>
          ${(n.portfolioStatus||n.status) === "Active"
            ? `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-teal-500 text-white text-xs font-bold rounded-full shadow">Active</span></div>`
            : `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-white/90 text-gray-700 text-xs font-bold rounded-full">${esc(n.portfolioStatus||n.status)}</span></div>`}
        </div>
        <div class="p-5 space-y-3">
          <div>
            <div class="flex items-center gap-1.5 mb-0.5">
              <h3 class="font-bold text-gray-900 truncate">${esc(n.orphanageName)}</h3>
              ${n.verified ? verifiedBadge("w-4 h-4","text-teal-600") : ""}
            </div>
            <p class="text-xs text-gray-500">${esc(n.location)}</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span class="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">${esc(n.category)}</span>
            ${urgencyBadge(n.urgency)}
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${esc(n.description)}</p>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-gray-50 rounded-lg p-2.5 text-center">
              <p class="text-xs text-gray-500">Tracked</p>
              <p class="font-bold text-gray-900 text-sm">₦${fmt(n.portfolioAmount || n.cashEquivalent)}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-2.5 text-center">
              <p class="text-xs text-gray-500">Children</p>
              <p class="font-bold text-gray-900 text-sm">${n.childrenImpacted}</p>
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <a href="#/org/needs" onclick="ORG._setFilter('category','${n.category}')" class="flex-1 py-2 text-center text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">View Needs</a>
            <a href="#/org/needs" onclick="ORG._setFilter('category','${n.category}')" class="flex-1 py-2 text-center text-sm font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700">Fund</a>
          </div>
        </div>
      </article>`;
  }

  function renderDiscoveryCard(n) {
    const fundedTx = data.transactions.filter(function(t) { return t.type === "debit" && t.facility === n.orphanageName; });
    const fundedTotal = fundedTx.reduce(function(sum, t) { return sum + Math.abs(t.amount); }, 0);
    const funded = fundedTotal;
    const fundedPct = n.cashEquivalent > 0 && funded > 0 ? Math.min(100, Math.round((funded / n.cashEquivalent) * 100)) : 0;
    return `
      <article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow hover:border-teal-200">
        <div class="bg-gradient-to-br ${categoryColors[n.category]||"from-gray-400 to-gray-500"} h-24 flex items-center justify-center relative">
          <span class="text-5xl">${categoryIcons[n.category]||"📦"}</span>
          ${n.urgency==="critical" ? `<div class="absolute top-3 right-3"><span class="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">CRITICAL</span></div>` : ""}
        </div>
        <div class="p-5 space-y-3">
          <div>
            <div class="flex items-center gap-1.5 mb-0.5">
              <h3 class="font-bold text-gray-900 truncate">${esc(n.orphanageName)}</h3>
              ${n.verified ? verifiedBadge("w-4 h-4","text-teal-600") : ""}
            </div>
            <p class="text-xs text-gray-500">${esc(n.location)}</p>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${esc(n.description)}</p>
          <div>
            <div class="flex justify-between text-xs mb-1.5">
            <span class="text-gray-500">₦${fmt(funded)} funded</span>
              <span class="font-bold text-teal-600">${fundedPct}%</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-teal-500 rounded-full" style="width:${fundedPct}%"></div>
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <a href="#/org/needs/${n.id}" class="flex-1 py-2 text-center text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">Details</a>
            <a href="#/org/needs/${n.id}" class="flex-1 py-2 text-center text-sm font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700">Fund Need</a>
          </div>
        </div>
      </article>`;
  }

  /* ═══════════════════════════════════════
     PAGE: NEED DETAIL
  ═══════════════════════════════════════ */
  function renderNeedDetail(needId) {
    const need = data.needDetails?.[needId] || data.needs.find(n => n.id === needId);

    if (!need) {
      if (state.needFetchFailedId === needId) {
        return shell("needs", `
          <div class="text-center py-20">
            <p class="text-2xl font-bold text-gray-900 mb-3">Need not found</p>
            <p class="text-sm text-gray-500 mb-4">We could not fetch that need from the server.</p>
            <a href="#/org/needs" class="text-teal-600 hover:underline font-medium">← Back to needs</a>
          </div>`);
      }

      if (!state.pendingNeedId) {
        state.pendingNeedId = needId;
        loadNeedDetail(needId).then((loaded) => {
          state.pendingNeedId = null;
          if (!loaded) {
            state.needFetchFailedId = needId;
          }
          _rerender();
        });
      }

      return shell("needs", `
        <div class="text-center py-20">
          <p class="text-2xl font-bold text-gray-900 mb-3">Loading need details…</p>
          <p class="text-sm text-gray-500">Please wait while we fetch the latest need information.</p>
          <a href="#/org/needs" class="mt-6 inline-block text-teal-600 hover:underline font-medium">← Back to needs</a>
        </div>`);
    }

    const commitment = getCommitment(needId);
    const mode = commitment.mode || "fund";
    const selected = getSelectedAmount(needId, need.cashEquivalent);
    const insufficient = selected > state.walletBalance;
    const walletAfterFunding = commitment.funded ? state.walletBalance : Math.max(0, state.walletBalance - selected);

    const fundTimeline = [
      { label:"Funded", done:commitment.funded, note: commitment.funded ? `₦${fmt(commitment.fundedAmount || selected)} deducted from wallet` : "Select an amount to fund this need" },
      { label:"Fulfilled", done:commitment.fulfilled, note: commitment.fulfilled ? "Awaiting proof of fulfillment" : "Proof will be requested after funding" },
    ];

    const deliveryTimeline = [
      { label:"Committed", done:commitment.committed, note: commitment.committed ? "Delivery commitment confirmed" : "Confirm the delivery commitment" },
      { label:"In Transit", done:commitment.inTransit, note: commitment.inTransit ? "Items are on the way" : "Prepare dispatch and logistics" },
      { label:"Delivered", done:commitment.delivered, note: commitment.delivered ? "Delivery complete · proof pending" : "Mark the delivery as complete after handoff" },
    ];

    const timelineSteps = mode === "delivery" ? deliveryTimeline : fundTimeline;

    const actionPanel = mode === "delivery" ? `
      <div class="space-y-4">
        <div class="rounded-2xl border border-teal-200 bg-teal-50 p-4">
        
          <p class="text-sm text-teal-700">Confirm a delivery commitment for the items below.</p>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 class="font-bold text-gray-900 mb-3">Facility address</h3>
          <p class="text-sm text-gray-700">${esc(need.deliveryAddress)}</p>
        </div>

        <div class="grid sm:grid-cols-2 gap-3">
          <div class="bg-white border border-gray-200 rounded-2xl p-4">
            <p class="text-xs text-gray-500 mb-1">Contact person</p>
            <p class="font-semibold text-gray-900">${esc(need.contactPerson)}</p>
          </div>
          <div class="bg-white border border-gray-200 rounded-2xl p-4">
            <p class="text-xs text-gray-500 mb-1">Phone</p>
            <p class="font-semibold text-gray-900">${esc(need.contactPhone)}</p>
          </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 class="font-bold text-gray-900 mb-3">Items and description</h3>
          <p class="text-sm text-gray-700 leading-relaxed mb-4">${esc(need.description)}</p>
          <ul class="space-y-2">
            ${need.items.map(item => `
              <li class="flex items-start gap-2 text-sm text-gray-700">
                <span class="text-teal-600 font-bold">✓</span>
                <span>${esc(item)}</span>
              </li>`).join("")}
          </ul>
        </div>

        ${!commitment.committed ? `
          <button onclick="ORG._commit('${need.id}')"
            class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">
            Confirm Commitment
          </button>` : ""}
        ${commitment.committed && !commitment.inTransit ? `
          <button onclick="ORG._advance('${need.id}','inTransit')"
            class="w-full py-3 border-2 border-teal-600 text-teal-700 hover:bg-teal-50 rounded-xl font-bold">
            Mark as in transit
          </button>` : ""}
        ${commitment.inTransit && !commitment.delivered ? `
          <button onclick="ORG._advance('${need.id}','delivered')"
            class="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold shadow-sm">
            Mark as delivered
          </button>` : ""}
        ${commitment.delivered ? `
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p class="text-emerald-800 font-bold">✓ Delivery complete</p>
            <p class="text-sm text-emerald-700 mt-0.5">Proof will be attached after handoff.</p>
          </div>` : ""}
      </div>` : `
      <div class="space-y-4">
        <div class="rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <p class="text-sm text-teal-700">Fund this need from your wallet.</p>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">Choose amount</label>
          <div class="grid grid-cols-2 gap-2">
            ${[1000, 10000, 25000, need.cashEquivalent].map(a => `
              <button type="button" onclick="ORG._setCustomAmount('${need.id}', '${a}'); ORG._rerender()"
                class="py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${selected === a ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-700 hover:border-gray-300"}">
                ₦${fmt(a)}
              </button>`).join("")}
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">Custom amount</label>
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₦</span>
            <input type="number" placeholder="${need.cashEquivalent}"
              value="${esc(state.customAmounts[need.id] || "") }"
              oninput="ORG._setCustomAmount('${need.id}', this.value); ORG._rerender()"
              class="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
          </div>
        </div>

        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex justify-between text-sm"><span class="text-gray-600">Selected</span><span class="font-bold text-gray-900">₦${fmt(selected)}</span></div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-600">Wallet after funding</span>
            <span class="font-bold ${insufficient ? "text-red-600" : "text-gray-900"}">₦${fmt(walletAfterFunding)}</span>
          </div>
        </div>

        ${insufficient ? `<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">Insufficient wallet balance. <a href="#/org/finances" class="underline font-semibold">Add funds →</a></p>` : ""}

        ${commitment.funded ? `
          <div class="bg-teal-50 border border-teal-200 rounded-xl p-4">
            <p class="text-sm font-bold text-teal-800">Funding confirmed</p>
            <p class="text-sm text-teal-700 mt-0.5">₦${fmt(commitment.fundedAmount || selected)} deducted and recorded in transactions.</p>
          </div>` : ""}

        ${!commitment.funded ? `
          <button onclick="ORG._fund('${need.id}', ${selected})" ${insufficient ? "disabled" : ""}
            class="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-sm">
            Fund This Need
          </button>` : ""}
      </div>`;

    const content = `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm text-gray-500">Operations view</p>
                <h1 class="text-3xl font-bold text-gray-900">${esc(need.orphanageName)}</h1>
              </div>
              <div class="flex items-center gap-3">
                <a href="#/org/needs" class="text-teal-600 hover:text-teal-700 font-semibold text-sm">← Back to Needs</a>
                <button onclick="ORG._refreshNeed('${need.id}')" class="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">Refresh</button>
              </div>
            </div>

        <div class="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div class="space-y-5">
            <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div class="bg-gradient-to-br ${categoryColors[need.category] || "from-gray-400 to-gray-500"} h-48 flex items-center justify-center relative">
                <span class="text-8xl">${categoryIcons[need.category] || "📦"}</span>
                <div class="absolute top-4 left-4"><span class="px-3 py-1 bg-white/90 text-gray-800 text-xs font-bold rounded-full shadow">Cash-in-Kind</span></div>
                ${need.urgency === "critical" ? `<div class="absolute top-4 right-4"><span class="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow">HIGH URGENCY</span></div>` : ""}
              </div>
              <div class="p-6">
                <div class="flex items-start gap-3 mb-4">
                  <div class="flex-1">
                    <p class="text-sm text-gray-500">${esc(need.location)} · verified March 2026</p>
                    <p class="text-gray-700 mt-2 leading-relaxed">${esc(need.description)}</p>
                  </div>
                  ${need.verified ? verifiedBadge("w-6 h-6", "text-teal-500") : ""}
                </div>
                <div class="grid grid-cols-3 gap-3 mb-5">
                  ${[
                    ["Children", need.childrenImpacted],
                    ["Need value", "₦" + fmt(need.cashEquivalent)],
                    ["Posted", (need.createdAt ? timeAgo(need.createdAt) : (need.timePosted || 'Just now'))],
                  ].map(([l, v]) => `
                    <div class="bg-gray-50 rounded-xl p-3 text-center">
                      <p class="text-xs text-gray-500">${l}</p>
                      <p class="font-bold text-gray-900 mt-0.5">${esc(String(v))}</p>
                    </div>`).join("")}
                </div>
                <div class="border-t border-gray-100 pt-4">
                  <p class="font-semibold text-gray-900 mb-2">Delivery requirements</p>
                  <ul class="space-y-1.5">
                    ${need.items.map(item => `
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-teal-600 flex-shrink-0 font-bold">✓</span>
                        <span class="text-gray-700">${esc(item)}</span>
                      </li>`).join("")}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-5">
            <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div class="mb-5">
                <p class="text-sm text-gray-500 mb-2">Choose one path</p>
                <div class="grid sm:grid-cols-2 gap-3">
                  <button type="button" onclick="ORG._setNeedAction('${need.id}', 'fund'); ORG._rerender()"
                    class="text-left rounded-2xl border-2 p-4 transition-colors ${mode === 'fund' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}">
                    <p class="font-bold text-gray-900">Fund from Wallet</p>
                   
                  </button>
                  <button type="button" onclick="ORG._setNeedAction('${need.id}', 'delivery'); ORG._rerender()"
                    class="text-left rounded-2xl border-2 p-4 transition-colors ${mode === 'delivery' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}">
                    <p class="font-bold text-gray-900">Commit to Deliver</p>

                  </button>
                </div>
              </div>

              ${actionPanel}
            </div>

            <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 class="font-bold text-gray-900 mb-5">${mode === 'delivery' ? 'Delivery timeline' : 'Funding timeline'}</h2>
              <div class="space-y-1">
                ${timelineSteps.map((step, i) => `
                  <div class="flex gap-4">
                    <div class="flex flex-col items-center">
                      <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step.done ? 'bg-teal-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}">
                        ${step.done ? '✓' : i + 1}
                      </div>
                      ${i < timelineSteps.length - 1 ? `<div class="w-0.5 flex-1 mt-1 mb-1 ${step.done ? 'bg-teal-300' : 'bg-gray-200'} min-h-[20px]"></div>` : ''}
                    </div>
                    <div class="pb-5 pt-1">
                      <p class="font-semibold text-gray-900 text-sm">${step.label}</p>
                      <p class="text-xs text-gray-500 mt-0.5">${step.note}</p>
                    </div>
                  </div>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    return shell("needs", content);
  }

  /* ═══════════════════════════════════════
     PAGE: FINANCES
  ═══════════════════════════════════════ */
  function renderFinances() {
    const content = `
      <div class="space-y-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Finances</h1>
          <p class="text-gray-500 mt-1">Manage your organisation wallet, track transactions, and download reports.</p>
        </div>

        <div class="grid xl:grid-cols-[2fr_1fr] gap-6">
          <!-- Wallet card -->
          <div class="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-8 text-white shadow-lg">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-5 h-5 text-teal-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                  <p class="text-teal-100 text-sm font-medium">Wallet Balance</p>
                </div>
                <h2 class="text-5xl font-bold">₦${fmt(state.walletBalance)}</h2>
              </div>
              <button onclick="ORG._showFundWallet()"
                class="px-5 py-2.5 bg-white text-teal-700 rounded-xl hover:bg-teal-50 font-bold shadow-sm transition-colors">
                Fund Wallet
              </button>
            </div>
            <div class="grid sm:grid-cols-3 gap-4 pt-5 border-t border-teal-500">
             ${(function() {
                const metrics = data.dashboardMetrics || {};
                const deployed = metrics.totalDonated || 0;
                const budget = (state.currentUser && state.currentUser.monthly_budget) ? Number(state.currentUser.monthly_budget) : 0;
                const rate = budget > 0 ? Math.min(100, Math.round((deployed / budget) * 100)) : 0;
                return `
                  <div><p class="text-teal-100 text-xs mb-1">Total Deployed</p><p class="text-2xl font-bold">₦${fmt(deployed)}</p></div>
                  <div><p class="text-teal-100 text-xs mb-1">Monthly Budget</p><p class="text-2xl font-bold">${budget > 0 ? "₦" + fmt(budget) : "Not set"}</p></div>
                  <div><p class="text-teal-100 text-xs mb-1">Deployment Rate</p><p class="text-2xl font-bold">${budget > 0 ? rate + "%" : "—"}</p></div>
                `;
              })()}
            </div>
          </div>

          <!-- Quick actions -->
          <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 class="font-bold text-gray-900 mb-4">Quick Actions</h3>
            <div class="space-y-3">
              <button onclick="ORG._showFundWallet()" class="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 px-4 shadow-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                Fund Wallet
              </button>
              <button class="w-full py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium flex items-center gap-2 px-4">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Export Statement
              </button>
              <button class="w-full py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium flex items-center gap-2 px-4">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Download ESG Report
              </button>
            </div>
          </div>
        </div>

        <!-- Transactions -->
        <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 class="text-xl font-bold text-gray-900">Recent Transactions</h2>
              <p class="text-sm text-gray-500">${data.transactions.length} transactions this period</p>
            </div>
            <button class="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Export CSV
            </button>
          </div>
          <div class="space-y-1">
            ${data.transactions.map((t, i) => `
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl hover:bg-gray-50 transition-colors ${i < data.transactions.length-1 ? "border-b border-gray-100" : ""}">
                <div class="flex items-center gap-4">
                  <div class="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${t.type==="credit" ? "bg-emerald-100" : "bg-red-50"}">
                    ${t.type === "credit"
                      ? `<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`
                      : `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>`}
                  </div>
                  <div>
                    <p class="font-semibold text-gray-900">${esc(t.description)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${esc(t.date)} at ${esc(t.time)}${t.facility ? ` · ${esc(t.facility)}` : ""}</p>
                  </div>
                </div>
                <p class="text-lg font-bold ${t.type==="credit" ? "text-emerald-600" : "text-red-600"} sm:text-right">
                  ${t.type==="credit" ? "+" : ""}₦${fmt(Math.abs(t.amount))}
                </p>
              </div>`).join("")}
          </div>
          <div class="text-center mt-5 pt-4 border-t border-gray-100">
            <button class="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm">Load more transactions</button>
          </div>
        </div>
      </div>`;
    return shell("finances", content, state.showFundWalletModal ? renderFundWalletModal() : "");
  }

  function renderFundWalletModal() {
    return `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" id="org-fund-modal" onclick="if(event.target===this)ORG._hideFundWallet()">
        <div class="bg-white rounded-2xl max-w-lg w-full p-8 relative shadow-2xl">
          <button onclick="ORG._hideFundWallet()" class="absolute top-5 right-5 text-gray-400 hover:text-gray-700 rounded-lg p-1 hover:bg-gray-100">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Fund Wallet</h2>
          <p class="text-gray-500 text-sm mb-6">Add funds to your ${esc(data.orgName)} wallet</p>
          <div class="space-y-5">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Select amount</label>
              <div class="grid grid-cols-2 gap-2 mb-3">
                ${[50000,100000,500000,1000000].map(a => `
                  <button onclick="ORG._selectWalletAmt(${a})" data-wallet-amt="${a}"
                    class="wallet-preset-btn py-3.5 rounded-xl border-2 font-bold text-sm transition-colors border-gray-200 text-gray-700 hover:border-teal-400">
                    ₦${fmt(a)}
                  </button>`).join("")}
              </div>
              <div class="relative">
                <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₦</span>
                <input type="number" id="org-wallet-input" placeholder="Enter custom amount" oninput="ORG._updateWalletSummary()"
                  class="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50" />
              </div>
              <p class="text-xs text-gray-400 mt-1.5">Minimum: ₦10,000</p>
            </div>
            <div id="org-wallet-summary" class="hidden bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200"></div>
            <div class="flex gap-3">
              <button onclick="ORG._hideFundWallet()" class="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold">Cancel</button>
              <button onclick="ORG._submitFundWallet()" class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">Fund Wallet</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════
     PAGE: PROFILE
  ═══════════════════════════════════════ */
  function renderProfile() {
    const content = `
      <div class="space-y-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">${esc(data.orgName)} Profile</h1>
          <p class="text-gray-500 mt-1">Manage settings, preferences, and reporting access.</p>
        </div>

        <div class="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">

          <!-- Org details -->
          <div class="space-y-5">
            <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div class="flex items-start gap-4 mb-6">
                <div class="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md">${esc(data.orgInitials)}</div>
                <div>
                  <h2 class="text-xl font-bold text-gray-900">${esc(data.orgName)}</h2>
                  <p class="text-gray-500 text-sm">${esc(data.orgEmail)}</p>
                  <span class="inline-block mt-1.5 px-3 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold rounded-full">CSR Partner · Verified</span>
                </div>
              </div>
              <div class="grid sm:grid-cols-2 gap-3">
              ${(function() {
                  const u = state.currentUser || {};
                  return [
                    ["Organisation", u.full_name || data.orgName],
                    ["Primary Contact", u.email || data.orgEmail],
                    ["Focus Areas", (u.categories && u.categories.length) ? u.categories.join(", ") : "Not set"],
                    ["Monthly Budget", u.monthly_budget ? "₦" + fmt(Number(u.monthly_budget)) : "Not set"],
                    ["Location", [u.city, u.state, u.country].filter(Boolean).join(", ") || "Not set"],
                    ["Role", u.role || "Organisation"],
                  ];
                })().map(([l,v]) => `
                  <div class="bg-gray-50 rounded-xl p-4">
                    <p class="text-xs text-gray-500 mb-0.5">${l}</p>
                    <p class="font-semibold text-gray-900">${esc(v)}</p>
                  </div>`).join("")}
              </div>
              <div class="mt-5 flex flex-wrap gap-3">
                <button class="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-sm">Edit Profile</button>
                <button class="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium">Manage Team Access</button>
              </div>
            </section>

            <section class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 class="font-bold text-gray-900 mb-4">Notification Preferences</h2>
              <div class="space-y-4">
                ${[
                  { label:"New matched need alerts", on:true },
                  { label:"Proof of delivery received", on:true },
                  { label:"Weekly portfolio digest", on:false },
                  { label:"Monthly ESG summary", on:true },
                ].map(pref => `
                  <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span class="text-sm text-gray-700">${pref.label}</span>
                    <label class="flex items-center cursor-pointer">
                      <input type="checkbox" ${pref.on?"checked":""} class="sr-only peer"/>
                      <div class="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal-600 transition-all relative">
                        <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                      </div>
                    </label>
                  </div>`).join("")}
              </div>
            </section>
          </div>

          <!-- Right: quick links + ESG -->
          <div class="space-y-5">
            <aside class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 class="font-bold text-gray-900 mb-4">Quick Links</h2>
              <div class="space-y-2">
                ${[
                  { href:"#/org/finances", label:"Wallet & Transactions",  icon:"💳" },
                  { href:"#/org/needs",    label:"Review Matching Needs",   icon:"📋" },
                  { href:"#/org/dashboard",label:"Return to Dashboard",     icon:"⊞" },
                ].map(link => `
                  <a href="${link.href}" class="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 hover:bg-teal-50 text-gray-700 hover:text-teal-700 transition-colors group">
                    <span class="text-lg">${link.icon}</span>
                    <span class="text-sm font-medium">${link.label}</span>
                    <svg class="w-4 h-4 ml-auto text-gray-400 group-hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                  </a>`).join("")}
              </div>
            </aside>

            <aside class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 class="font-bold text-gray-900 mb-4">ESG Reports</h2>
              <div class="space-y-3">
                ${[
                  { label:"Q1 2026 Impact Report", date:"Mar 31, 2026", ready:true },
                  { label:"Q4 2025 Impact Report", date:"Dec 31, 2025", ready:true },
                  { label:"Annual 2025 Summary",   date:"Jan 15, 2026", ready:true },
                ].map(r => `
                  <div class="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                    <div>
                      <p class="text-sm font-semibold text-gray-900">${r.label}</p>
                      <p class="text-xs text-gray-500 mt-0.5">${r.date}</p>
                    </div>
                    ${r.ready ? `<button class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm">Download</button>` : `<span class="text-xs text-gray-400">Generating…</span>`}
                  </div>`).join("")}
              </div>
            </aside>

            <aside class="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white shadow-md">
              <h2 class="font-bold mb-1">Support &amp; Helpdesk</h2>
              <p class="text-sm text-teal-100 mb-4">Your dedicated CareBridge CSR manager is available Mon–Fri, 9am–5pm.</p>
              <button class="w-full py-2.5 bg-white text-teal-700 rounded-xl font-bold hover:bg-teal-50 transition-colors text-sm">Contact Partnership Team</button>
            </aside>
          </div>
        </div>
      </div>`;
    return shell("profile", content);
  }

  /* ═══════════════════════════════════════
     HANDLERS — called from inline onclick
  ═══════════════════════════════════════ */
  function _rerender() {
    const hash = window.location.hash || "#/";
    const path = hash.replace("#","") || "/";
    const app  = document.getElementById("app");
    if (!app) return;
    if      (path === "/org" || path === "/org/dashboard") app.innerHTML = renderDashboard();
    else if (path === "/org/auth"     || path === "/org/signup") app.innerHTML = renderAuthPage();
    else if (path === "/org/needs")    app.innerHTML = renderNeeds();
    // else if (path.startsWith("/org/needs/")) app.innerHTML = renderNeedDetail(path.split("/org/needs/")[1]);
    else if (path.startsWith("/org/needs/")) {
      const needId = path.split("/org/needs/")[1];
      optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null).then(function(remote) {
        if (remote) {
          const normalized = normalizeNeed(remote);
          const idx = data.needs.findIndex(function(n) { return n.id === normalized.id; });
          if (idx >= 0) data.needs[idx] = normalized;
          else data.needs.push(normalized);
        }
        app.innerHTML = renderNeedDetail(needId);
      });
    }
    else if (path === "/org/finances") app.innerHTML = renderFinances();
    else if (path === "/org/profile")  app.innerHTML = renderProfile();
    window.scrollTo(0,0);
  }

  function _setAuthMode(mode) {
    state.authMode = mode;
    window.location.hash = mode === "login" ? "#/org/auth" : "#/org/signup";
    _rerender();
  }

  async function _loginSubmit(e) {
    e.preventDefault();

    try {
      const form = e.target;
      const email = form.querySelector('input[type="email"]').value;
      const password = form.querySelector('input[type="password"]').value;

      const response = await apiFetch(API_ENDPOINTS.auth.login, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!response?.token) {
        throw new Error("Authentication response did not include a token.");
      }

      setToken(response.token);
      const normalizedUser = normalizeUser(response.user || { email });
      saveStoredUser(normalizedUser);
      state.currentUser = normalizedUser;
      state.apiStatus.user = "live";
      window.location.hash = "#/org/dashboard";
    } catch (error) {
      state.apiStatus.user = "error";
      state.lastSyncError = error?.message || "Unable to sign in right now.";
      alert(state.lastSyncError);
    }
  }

  function _signupField(key, val)     { state.signup[key] = val; }
  function _toggleCategory(catId)     {
    const idx = state.signup.categories.indexOf(catId);
    idx === -1 ? state.signup.categories.push(catId) : state.signup.categories.splice(idx,1);
  }
  // function _signupNext() {
  //   if (state.signup.step < 3) { state.signup.step++; _rerender(); }
  //   else window.location.hash = "#/org/dashboard";
  // }
  async function _signupNext() {
    if (state.signup.step < 3) {
      state.signup.step++;
      _rerender();
      return;
    }

    try {
const payload = {
        full_name: state.signup.orgName,
        email: state.signup.email,
        password: state.signup.password,
        monthly_budget: state.signup.budget,
        categories: state.signup.categories,
        country: state.signup.country,
        state: state.signup.state_,
        city: state.signup.city || state.signup.customLocation,
      };

      const response = await apiFetch(API_ENDPOINTS.auth.signup, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response?.token) {
        throw new Error("Registration response did not include a token.");
      }

      setToken(response.token);
      const normalizedUser = normalizeUser(response.user || payload);
      saveStoredUser(normalizedUser);
      state.currentUser = normalizedUser;
      state.apiStatus.auth = "live";
      window.location.hash = "#/org/dashboard";
    } catch (error) {
      state.apiStatus.auth = "error";
      state.lastSyncError = error?.message || "Unable to register your organisation right now.";
      alert(state.lastSyncError);
    }
  }

  function _signupBack() { if (state.signup.step > 0) { state.signup.step--; _rerender(); } }

  function _setFilter(key, val)       { state.needsFilter[key] = val; _rerender(); }
  function _toggleShowMore(val)       { state.showMoreNeeds = val; _rerender(); }
  function _toggleAutoFund(val)       { state.autoFundSimilar = val; _rerender(); }
  function _hidePortfolio(id)         { state.hiddenPortfolioIds.push(id); _rerender(); }

  function _setNeedAction(needId, mode) {
    setNeedAction(needId, mode);
    _rerender();
  }
  function _setCustomAmount(needId, val) {
    if (val === undefined || val === null || val === "") {
      delete state.customAmounts[needId];
      return;
    }
    state.customAmounts[needId] = String(val);
  }
  // function _fund(needId, amount) {
  //   if (amount > state.walletBalance) return;
  //   const need = data.needs.find(n => n.id === needId);
  //   if (!need) return;

  //   state.walletBalance -= amount;
  //   addTransaction(`Funded: ${need.orphanageName} – ${need.category} Need`, -amount, need.orphanageName);
  //   state.commitments[needId] = {
  //     ...getCommitment(needId),
  //     mode:"fund",
  //     funded:true,
  //     fulfilled:true,
  //     fundedAmount:amount,
  //     committed:false,
  //     inTransit:false,
  //     delivered:false,
  //   };
  //   _rerender();
  // }
  async function _fund(needId, amount) {
    const need = data.needs.find((item) => item.id === needId);

    if (!need) {
      alert("That need is no longer available.");
      return;
    }

    const donationPayload = {
      need_id: Number(needId),
      amount,
      payment_method: "card",
    };

    const backendResponse = await optionalRequest(
      API_ENDPOINTS.donations.create,
      {
        method: "POST",
        body: JSON.stringify(donationPayload),
      },
      null
    );

    state.apiStatus.donations = backendResponse ? "live" : "fallback";

    state.walletBalance -= amount;
    state.commitments[needId] = {
      ...getCommitment(needId),
      funded: true,
      fundedAmount: amount,
    };

    addTransaction(
      need?.orphanageName
        ? `Funded: ${need.orphanageName} – ${need.category} Need`
        : `Funded need #${needId}`,
      -amount,
      need?.orphanageName
    );

    _rerender();

    if (!backendResponse) {
      alert("Donation applied locally. The backend endpoint is not available yet, so the action is queued for later sync.");
      return;
    }

    alert("Donation successful");
  }

  function _commit(needId) {
    state.commitments[needId] = {
      ...getCommitment(needId),
      mode:"delivery",
      funded:false,
      fulfilled:false,
      fundedAmount:0,
      committed:true,
      inTransit:false,
      delivered:false,
    };
    _rerender();
  }
  function _advance(needId, stage) {
    const c = getCommitment(needId);
    state.commitments[needId] = {
      ...c,
      mode:"delivery",
      funded:false,
      fulfilled:false,
      fundedAmount:0,
      inTransit: stage === "inTransit" || c.inTransit,
      delivered: stage === "delivered" || c.delivered,
    };
    _rerender();
  }

  function _showFundWallet()  { state.showFundWalletModal = true;  _rerender(); }
  function _hideFundWallet()  { state.showFundWalletModal = false; _rerender(); }
  function _selectWalletAmt(amt) {
    const input = document.getElementById("org-wallet-input");
    if (input) { input.value = amt; _updateWalletSummary(); }
    document.querySelectorAll(".wallet-preset-btn").forEach(btn => {
      const selected = parseInt(btn.dataset.walletAmt) === amt;
      btn.classList.toggle("border-teal-600", selected);
      btn.classList.toggle("bg-teal-50",      selected);
      btn.classList.toggle("text-teal-700",   selected);
    });
  }
  function _updateWalletSummary() {
    const input   = document.getElementById("org-wallet-input");
    const summary = document.getElementById("org-wallet-summary");
    if (!input || !summary) return;
    const amt = parseFloat(input.value) || 0;
    if (amt > 0) {
      const fee   = Math.round(amt * 0.015);
      const total = amt + fee;
      summary.classList.remove("hidden");
      summary.innerHTML = `
        <div class="flex justify-between text-sm"><span class="text-gray-600">Amount</span><span class="font-bold text-gray-900">₦${fmt(amt)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-600">Transaction fee (1.5%)</span><span class="font-bold text-gray-900">₦${fmt(fee)}</span></div>
        <div class="border-t border-gray-200 pt-2 flex justify-between">
          <span class="font-bold text-gray-900">Total to pay</span>
          <span class="text-lg font-bold text-teal-600">₦${fmt(total)}</span>
        </div>`;
    } else {
      summary.classList.add("hidden");
    }
  }
  function _submitFundWallet() {
    const input = document.getElementById("org-wallet-input");
    if (!input) return;

    const amt = parseFloat(input.value);

    if (!amt || amt < 10000) {
      alert("Minimum wallet funding is ₦10,000");
      return;
    }

    state.walletBalance += amt;
    addTransaction("Wallet funding via Mobile Money", amt);
    state.showFundWalletModal = false;
    _rerender();
  }

  function signOut() {
    removeToken();
    clearStoredUser();
    state.currentUser = null;
    state.authMode = "login";
    state.signup = JSON.parse(JSON.stringify(DEFAULT_SIGNUP_STATE));
    state.walletBalance = DEFAULT_WALLET_BALANCE;
    state.commitments = {};
    state.customAmounts = {};
    state.hiddenPortfolioIds = [];
    state.showFundWalletModal = false;
    state.lastSyncError = null;
    state.bootstrapped = false;
    state.apiStatus = {
      auth: "idle",
      needs: "idle",
      donations: "idle",
      facilities: "idle",
      user: "idle",
    };
    window.location.hash = "#/org/auth";
  }

  /* ═══════════════════════════════════════
     ROUTER — intercepts #/org/* routes
  ═══════════════════════════════════════ */
  function handleRoute() {
    const hash = window.location.hash || "#/";
    const path = hash.replace("#","") || "/";
    if (!path.startsWith("/org")) return false;  // not our route
    if (!getToken() && path !== "/org/auth" && path !== "/org/signup") {
      window.location.hash = "#/org/auth";
      return true;
    }

    const app = document.getElementById("app");
    if (!app) return true;
    document.querySelectorAll(".dropdown-menu").forEach(d => d.classList.add("hidden"));

    if (path === "/org/auth") {
      state.authMode = "login";
      app.innerHTML = renderAuthPage();
    } else if (path === "/org/signup") {
      state.authMode = "signup";
      app.innerHTML = renderAuthPage();
    } else if (path === "/org" || path === "/org/dashboard") {
      app.innerHTML = renderDashboard();
    } else if (path === "/org/needs") {
      app.innerHTML = renderNeeds();
    // } else if (path.startsWith("/org/needs/")) {
    //   app.innerHTML = renderNeedDetail(path.split("/org/needs/")[1]);
    } else if (path.startsWith("/org/needs/")) {
      const needId = path.split("/org/needs/")[1];
      app.innerHTML = `<div class="p-10 text-center text-gray-400">Loading…</div>`;
      optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null).then(function(remote) {
        if (remote) {
          const normalized = normalizeNeed(remote);
          const idx = data.needs.findIndex(function(n) { return n.id === normalized.id; });
          if (idx >= 0) data.needs[idx] = normalized;
          else data.needs.push(normalized);
        }
        app.innerHTML = renderNeedDetail(needId);
        window.scrollTo(0, 0);
      });
    } else if (path === "/org/finances") {
      app.innerHTML = renderFinances();
    } else if (path === "/org/profile") {
      app.innerHTML = renderProfile();
    } else {
      app.innerHTML = renderDashboard();
    }

    window.scrollTo(0,0);
    return true;
  }

  /* ═══════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════ */
  return {
    handleRoute,
    signOut,
    _rerender,
    _setAuthMode, _loginSubmit,
    _signupField, _toggleCategory, _signupNext, _signupBack,
    _setFilter, _toggleShowMore, _toggleAutoFund, _hidePortfolio,
    _setNeedAction, _setCustomAmount, _fund, _commit, _advance,
    _showFundWallet, _hideFundWallet, _selectWalletAmt, _updateWalletSummary, _submitFundWallet,
    _refreshNeed,
  };
})();

window.ORG = ORG;

/* ═══════════════════════════════════════
   ROUTER INTEGRATION
   Wraps the existing renderCurrentPage from script.js.
   ORG gets first pick of every route change.
   Non-org routes fall through to the original router.
═══════════════════════════════════════ */
(function() {
  /* Single route handler: org routes handled by ORG module,
     everything else falls through to script.js's _legacyRenderCurrentPage */
  function routeHandler() {
    if (!ORG.handleRoute()) {
      /* Public site routes — handled by script.js */
      if (typeof _legacyRenderCurrentPage === "function") {
        _legacyRenderCurrentPage();
      }
    }
  }

  /* Expose as window.renderCurrentPage so rerenderPage() in script.js works */
  window.renderCurrentPage = routeHandler;

  /* Single set of listeners — script.js has been stripped of its own */
  window.addEventListener("hashchange", routeHandler);
  // window.addEventListener("DOMContentLoaded", routeHandler);
//   window.addEventListener("DOMContentLoaded", async () => {
//   await loadNeeds();
//   routeHandler();
// });
window.addEventListener(
  "DOMContentLoaded",
  async () => {
    await bootstrapRemoteData();
    routeHandler();
  }
);
})();
