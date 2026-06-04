const API_BASE = "https://carebridge-dxrd.onrender.com/api";
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

async function parseJSONResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
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

async function login(email, password) {
  return apiFetch(API_ENDPOINTS.auth.login, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

async function signup(payload) {
  return apiFetch(API_ENDPOINTS.auth.signup, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function fetchCurrentUser() {
  return apiFetch(API_ENDPOINTS.auth.me, { method: "GET" });
}

async function fetchUrgentNeeds() {
  return apiFetch(API_ENDPOINTS.needs.urgent, { method: "GET" });
}

async function fetchAllNeeds() {
  return apiFetch(API_ENDPOINTS.needs.all, { method: "GET" });
}

async function fetchNeedById(id) {
  return apiFetch(API_ENDPOINTS.needs.byId(id), { method: "GET" });
}

async function fetchMyDonations() {
  return apiFetch(API_ENDPOINTS.donations.my, { method: "GET" });
}

async function createDonation(payload) {
  return apiFetch(API_ENDPOINTS.donations.create, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function fetchFacilities() {
  return apiFetch(API_ENDPOINTS.facilities.all, { method: "GET" });
}

async function fetchFulfillments() {
  return apiFetch(API_ENDPOINTS.fulfillments.all, { method: "GET" });
}

export {
  API_BASE,
  API_ENDPOINTS,
  getToken,
  setToken,
  removeToken,
  getStoredUser,
  saveStoredUser,
  clearStoredUser,
  isPlainObject,
  parseJSONResponse,
  apiFetch,
  safeRequest,
  optionalRequest,
  login,
  signup,
  fetchCurrentUser,
  fetchUrgentNeeds,
  fetchAllNeeds,
  fetchNeedById,
  fetchMyDonations,
  createDonation,
  fetchFacilities,
  fetchFulfillments,
};