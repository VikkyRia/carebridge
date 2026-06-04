import {
  API_ENDPOINTS,
  getStoredUser,
  saveStoredUser,
  optionalRequest,
} from "../api/org-api.js";
import {
  fmt,
  normalizeUser,
  normalizeNeed,
  normalizeDonation,
  normalizeFulfillment,
  normalizeFacility,
} from "../utils/org-utils.js";

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

const data = {
  orgName: "GTCo Foundation",
  orgInitials: "GT",
  orgEmail: "csr@gtco.org",
  dashboardMetrics: {},
  needDetails: {},
  needs: [],
  portfolio: [],
  transactions: [],
  spendByCategory: [],
  recentActivity: [],
  countries: ["Nigeria", "Kenya", "Ghana", "South Africa", "Uganda"],
  statesByCountry: {
    Nigeria: ["Lagos", "Abuja", "Kano", "Rivers", "Oyo"],
    Kenya: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"],
    Ghana: ["Accra", "Kumasi", "Tamale"],
    "South Africa": ["Gauteng", "Cape Town", "KwaZulu-Natal"],
    Uganda: ["Kampala", "Entebbe", "Jinja"],
  },
  citiesByState: {
    Lagos: ["Ikeja", "Victoria Island", "Lekki", "Surulere", "Yaba"],
    Nairobi: ["Westlands", "Parklands", "Karen", "Kibera"],
    Accra: ["Osu", "Labone", "Madina", "Tema"],
  },
  categories: [
    { id: "food", label: "Food & Nutrition" },
    { id: "medical", label: "Medical & Healthcare" },
    { id: "education", label: "Education & Books" },
    { id: "shelter", label: "Shelter & Infrastructure" },
    { id: "clothing", label: "Clothing & Essentials" },
    { id: "recreation", label: "Recreation & Activities" },
  ],
};

const state = {
  authMode: "login",
  signup: JSON.parse(JSON.stringify(DEFAULT_SIGNUP_STATE)),
  currentUser: getStoredUser() ? normalizeUser(getStoredUser()) : null,
  walletBalance: DEFAULT_WALLET_BALANCE,
  activeTab: "dashboard",
  needsFilter: { category: "All", urgency: "All", search: "" },
  showMoreNeeds: false,
  autoFundSimilar: false,
  hiddenPortfolioIds: [],
  pendingNeedId: null,
  needFetchFailedId: null,
  customAmounts: {},
  commitments: {},
  showFundWalletModal: false,
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

function setApiStatus(key, value) {
  state.apiStatus[key] = value;
}

function getCommitment(needId) {
  return state.commitments[needId] || {
    mode: "fund",
    funded: false,
    committed: false,
    inTransit: false,
    delivered: false,
    fulfilled: false,
    fundedAmount: 0,
  };
}

function getSelectedAmount(needId, fallback) {
  const raw = state.customAmounts[needId];
  const parsed = raw === undefined || raw === null || raw === "" ? fallback : parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addTransaction(description, amount, facility) {
  data.transactions.unshift({
    id: `tx-${Date.now()}`,
    type: amount >= 0 ? "credit" : "debit",
    description,
    amount,
    date: new Date().toLocaleDateString("en-CA"),
    time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
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

async function loadCurrentUser() {
  const storedUser = getStoredUser();
  state.currentUser = storedUser ? normalizeUser(storedUser) : null;

  if (!state.currentUser) {
    state.apiStatus.user = "fallback";
  }

  const remoteUser = await optionalRequest(API_ENDPOINTS.auth.me, { method: "GET" }, null);
  if (!remoteUser) {
    state.apiStatus.user = "fallback";
    return;
  }

  const normalized = normalizeUser(remoteUser);
  state.currentUser = normalized;
  if (typeof remoteUser.walletBalance === "number" || typeof remoteUser.wallet_balance === "number") {
    state.walletBalance = Number(remoteUser.walletBalance ?? remoteUser.wallet_balance) || state.walletBalance;
  }
  saveStoredUser(normalized);
  state.apiStatus.user = "live";
}

async function loadNeeds() {
  const urgent = await optionalRequest(API_ENDPOINTS.needs.urgent, { method: "GET" }, null);
  const remoteNeeds = Array.isArray(urgent)
    ? urgent
    : await optionalRequest(API_ENDPOINTS.needs.all, { method: "GET" }, null);

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
  if (!needId) return null;
  if (data.needDetails?.[needId]) return data.needDetails[needId];

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
  if (!Array.isArray(data.portfolio) || !Array.isArray(data.needs)) return;
  const toFetch = [];
  for (const item of data.portfolio) {
    const matched = data.needs.find((n) => n.category === item.category) || data.needs[0];
    if (matched && matched.id && !data.needDetails[matched.id]) {
      toFetch.push(matched.id);
    }
    if (toFetch.length >= limit) break;
  }
  await Promise.all(toFetch.map((id) => loadNeedDetail(id)));
}

async function refreshNeed(needId) {
  if (!needId) return false;
  try {
    state.pendingNeedId = needId;
    const remoteNeed = await optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null);
    if (remoteNeed) {
      data.needDetails = data.needDetails || {};
      data.needDetails[needId] = normalizeNeed(remoteNeed);
      deriveDashboardMetrics();
      state.pendingNeedId = null;
      return true;
    }
  } catch (error) {
    console.warn("[ORG] refresh need failed", error?.message || error);
  }
  state.pendingNeedId = null;
  state.needFetchFailedId = needId;
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
  await Promise.allSettled([
    loadCurrentUser(),
    loadNeeds(),
    loadDonationHistory(),
    loadFacilities(),
    loadFulfillments(),
  ]);
  deriveDashboardMetrics();
  await prefetchPortfolioNeedDetails(5);
  state.bootstrapped = true;
}

export {
  DEFAULT_WALLET_BALANCE,
  DEFAULT_SIGNUP_STATE,
  data,
  state,
  setApiStatus,
  getCommitment,
  getSelectedAmount,
  addTransaction,
  setNeedAction,
  loadCurrentUser,
  loadNeeds,
  loadDonationHistory,
  loadFulfillments,
  loadNeedDetail,
  refreshNeed,
  deriveDashboardMetrics,
  loadFacilities,
  bootstrapRemoteData,
};