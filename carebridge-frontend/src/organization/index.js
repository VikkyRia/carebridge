import {
  DEFAULT_SIGNUP_STATE,
  DEFAULT_WALLET_BALANCE,
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
} from "./state/org-state.js";
import {
  API_ENDPOINTS,
  apiFetch,
  optionalRequest,
  login,
  signup,
  setToken,
  removeToken,
  saveStoredUser,
  clearStoredUser,
} from "./api/org-api.js";
import { esc, fmt, normalizeUser, normalizeNeed } from "./utils/org-utils.js";
import { renderAuthPage } from "./pages/org-auth.js";
import { renderDashboard } from "./pages/org-dashboard.js";
import { renderNeeds, renderNeedDetail } from "./pages/org-needs.js";
import { renderFinances } from "./pages/org-finance.js";
import { renderProfile } from "./pages/org-profile.js";

function getPath() {
  const hash = window.location.hash || "#/";
  return hash.replace("#", "") || "/";
}

function renderApp(appHtml) {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = appHtml;
}

async function handleRoute() {
  const path = getPath();
  if (!path.startsWith("/org")) return false;
  if (!localStorage.getItem("carebridge_token") && path !== "/org/auth" && path !== "/org/signup") {
    window.location.hash = "#/org/auth";
    return true;
  }

  const app = document.getElementById("app");
  if (!app) return true;
  document.querySelectorAll(".dropdown-menu").forEach((d) => d.classList.add("hidden"));

  if (path === "/org/auth") {
    state.authMode = "login";
    renderApp(renderAuthPage());
  } else if (path === "/org/signup") {
    state.authMode = "signup";
    renderApp(renderAuthPage());
  } else if (path === "/org" || path === "/org/dashboard") {
    renderApp(renderDashboard());
  } else if (path === "/org/needs") {
    renderApp(renderNeeds());
  } else if (path.startsWith("/org/needs/")) {
    const needId = path.split("/org/needs/")[1];
    renderApp(`<div class="p-10 text-center text-gray-400">Loading…</div>`);
    optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null).then((remote) => {
      if (remote) {
        const normalized = normalizeNeed(remote);
        const idx = data.needs.findIndex((n) => n.id === normalized.id);
        if (idx >= 0) data.needs[idx] = normalized;
        else data.needs.push(normalized);
      }
      renderApp(renderNeedDetail(needId));
      window.scrollTo(0, 0);
    });
  } else if (path === "/org/finances") {
    renderApp(renderFinances());
  } else if (path === "/org/profile") {
    renderApp(renderProfile());
  } else {
    renderApp(renderDashboard());
  }

  window.scrollTo(0, 0);
  return true;
}

function _rerender() {
  const path = getPath();
  const app = document.getElementById("app");
  if (!app) return;
  if (path === "/org" || path === "/org/dashboard") {
    renderApp(renderDashboard());
  } else if (path === "/org/auth" || path === "/org/signup") {
    renderApp(renderAuthPage());
  } else if (path === "/org/needs") {
    renderApp(renderNeeds());
  } else if (path.startsWith("/org/needs/")) {
    const needId = path.split("/org/needs/")[1];
    optionalRequest(API_ENDPOINTS.needs.byId(needId), { method: "GET" }, null).then((remote) => {
      if (remote) {
        const normalized = normalizeNeed(remote);
        const idx = data.needs.findIndex((n) => n.id === normalized.id);
        if (idx >= 0) data.needs[idx] = normalized;
        else data.needs.push(normalized);
      }
      renderApp(renderNeedDetail(needId));
    });
  } else if (path === "/org/finances") {
    renderApp(renderFinances());
  } else if (path === "/org/profile") {
    renderApp(renderProfile());
  }
  window.scrollTo(0, 0);
}

function _setAuthMode(mode) {
  state.authMode = mode;
  window.location.hash = mode === "login" ? "#/org/auth" : "#/org/signup";
  _rerender();
}

async function _loginSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;

  try {
    const response = await login(email, password);
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

function _signupField(key, value) {
  state.signup[key] = value;
}

function _toggleCategory(catId) {
  const index = state.signup.categories.indexOf(catId);
  if (index === -1) {
    state.signup.categories.push(catId);
  } else {
    state.signup.categories.splice(index, 1);
  }
}

async function _signupNext() {
  if (state.signup.step < 3) {
    state.signup.step += 1;
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

    const response = await signup(payload);
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

function _signupBack() {
  if (state.signup.step > 0) {
    state.signup.step -= 1;
    _rerender();
  }
}

function _setFilter(key, value) {
  state.needsFilter[key] = value;
  _rerender();
}

function _toggleShowMore(value) {
  state.showMoreNeeds = value;
  _rerender();
}

function _toggleAutoFund(value) {
  state.autoFundSimilar = value;
  _rerender();
}

function _hidePortfolio(id) {
  state.hiddenPortfolioIds.push(id);
  _rerender();
}

function _setNeedAction(needId, mode) {
  setNeedAction(needId, mode);
  _rerender();
}

function _setCustomAmount(needId, value) {
  if (value === undefined || value === null || value === "") {
    delete state.customAmounts[needId];
    return;
  }
  state.customAmounts[needId] = String(value);
}

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

  const backendResponse = await optionalRequest(API_ENDPOINTS.donations.create, {
    method: "POST",
    body: JSON.stringify(donationPayload),
  }, null);

  state.apiStatus.donations = backendResponse ? "live" : "fallback";
  state.walletBalance -= amount;
  state.commitments[needId] = {
    ...getCommitment(needId),
    funded: true,
    fundedAmount: amount,
  };
  addTransaction(
    need?.orphanageName ? `Funded: ${need.orphanageName} – ${need.category} Need` : `Funded need #${needId}`,
    -amount,
    need?.orphanageName,
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
    mode: "delivery",
    funded: false,
    fulfilled: false,
    fundedAmount: 0,
    committed: true,
    inTransit: false,
    delivered: false,
  };
  _rerender();
}

function _advance(needId, stage) {
  const commitment = getCommitment(needId);
  state.commitments[needId] = {
    ...commitment,
    mode: "delivery",
    funded: false,
    fulfilled: false,
    fundedAmount: 0,
    inTransit: stage === "inTransit" || commitment.inTransit,
    delivered: stage === "delivered" || commitment.delivered,
  };
  _rerender();
}

function _showFundWallet() {
  state.showFundWalletModal = true;
  _rerender();
}

function _hideFundWallet() {
  state.showFundWalletModal = false;
  _rerender();
}

function _selectWalletAmt(amount) {
  const input = document.getElementById("org-wallet-input");
  if (input) {
    input.value = amount;
    _updateWalletSummary();
  }
  document.querySelectorAll(".wallet-preset-btn").forEach((button) => {
    const selected = parseInt(button.dataset.walletAmt, 10) === amount;
    button.classList.toggle("border-teal-600", selected);
    button.classList.toggle("bg-teal-50", selected);
    button.classList.toggle("text-teal-700", selected);
  });
}

function _updateWalletSummary() {
  const input = document.getElementById("org-wallet-input");
  const summary = document.getElementById("org-wallet-summary");
  if (!input || !summary) return;
  const amount = parseFloat(input.value) || 0;
  if (amount > 0) {
    const fee = Math.round(amount * 0.015);
    const total = amount + fee;
    summary.classList.remove("hidden");
    summary.innerHTML = `
      <div class="flex justify-between text-sm"><span class="text-gray-600">Amount</span><span class="font-bold text-gray-900">₦${fmt(amount)}</span></div>
      <div class="flex justify-between text-sm"><span class="text-gray-600">Transaction fee (1.5%)</span><span class="font-bold text-gray-900">₦${fmt(fee)}</span></div>
      <div class="border-t border-gray-200 pt-2 flex justify-between"><span class="font-bold text-gray-900">Total to pay</span><span class="text-lg font-bold text-teal-600">₦${fmt(total)}</span></div>`;
  } else {
    summary.classList.add("hidden");
  }
}

function _submitFundWallet() {
  const input = document.getElementById("org-wallet-input");
  if (!input) return;
  const amount = parseFloat(input.value);
  if (!amount || amount < 10000) {
    alert("Minimum wallet funding is ₦10,000");
    return;
  }
  state.walletBalance += amount;
  addTransaction("Wallet funding via Mobile Money", amount);
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

const ORG = {
  handleRoute,
  signOut,
  _rerender,
  _setAuthMode,
  _loginSubmit,
  _signupField,
  _toggleCategory,
  _signupNext,
  _signupBack,
  _setFilter,
  _toggleShowMore,
  _toggleAutoFund,
  _hidePortfolio,
  _setNeedAction,
  _setCustomAmount,
  _fund,
  _commit,
  _advance,
  _showFundWallet,
  _hideFundWallet,
  _selectWalletAmt,
  _updateWalletSummary,
  _submitFundWallet,
  _refresh: refreshNeed,
  _refreshNeed: refreshNeed,
};

function routeHandler() {
  if (!handleRoute()) {
    if (typeof _legacyRenderCurrentPage === "function") {
      _legacyRenderCurrentPage();
    }
  }
}

export async function initializeOrg() {
  window.ORG = ORG;
  window.renderCurrentPage = routeHandler;
  window.addEventListener("hashchange", routeHandler);

  async function bootstrapAndLaunch() {
    await bootstrapRemoteData();
    routeHandler();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bootstrapAndLaunch);
  } else {
    bootstrapAndLaunch();
  }
}

initializeOrg();
